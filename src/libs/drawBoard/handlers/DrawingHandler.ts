import type { ToolManager } from '../tools/ToolManager';
import type { CanvasEngine } from '../core/CanvasEngine';
import type { HistoryManager } from '../history/HistoryManager';
import type { DrawAction } from '../tools/DrawTool';
import type { VirtualLayerManager } from '../core/VirtualLayerManager';
import type { VirtualLayer } from '../core/VirtualLayerManager';
import type { DrawEvent } from '../events/EventManager';
import type { Point } from '../core/CanvasEngine';
import { logger } from '../utils/Logger';
import { MemoryMonitor } from '../utils/MemoryMonitor';

/**
 * 绘制处理器配置接口
 */
interface DrawingHandlerConfig {
  enableIncrementalRedraw?: boolean;
  redrawThrottleMs?: number;
  maxPointsPerAction?: number;
  enableErrorRecovery?: boolean;
  geometricTools?: string[]; // 需要全量重绘的几何图形工具
  enableGeometricOptimization?: boolean; // 是否启用几何图形优化
}

/**
 * 绘制处理器 - 处理绘制相关的逻辑
 * 
 * 职责：
 * - 处理绘制事件（开始、移动、结束）
 * - 管理绘制状态和当前动作
 * - 协调工具管理器、历史记录和虚拟图层
 * - 优化重绘性能
 */
export class DrawingHandler {
  private toolManager: ToolManager;
  private canvasEngine: CanvasEngine;
  private historyManager: HistoryManager;
  private virtualLayerManager?: VirtualLayerManager;
  private onStateChange: () => void;

  // 配置选项
  private config: Required<DrawingHandlerConfig>;

  // 交互状态
  private isDrawing: boolean = false;
  private currentAction: DrawAction | null = null;

  // 重绘调度标志
  private redrawScheduled: boolean = false;
  private lastRedrawTime: number = 0;
  
  // 初始化draw层的锁（防止并发初始化）
  private initializingDrawLayers: boolean = false;
  private layersInitializationPromise: Promise<void> | null = null; // 图层初始化Promise
  
  // 统一超时时间常量
  private readonly LAYER_INITIALIZATION_TIMEOUT = 2000; // 图层初始化超时时间（毫秒）

  // 性能优化：缓存已绘制的动作
  private cachedActions: Set<string> = new Set();
  private lastCachedActionCount: number = 0;
  
  // 性能优化：离屏Canvas缓存（用于几何图形重绘）
  private offscreenCanvas?: HTMLCanvasElement;
  private offscreenCtx?: CanvasRenderingContext2D;
  private offscreenCacheDirty: boolean = true;
  private readonly OFFSCREEN_CACHE_THRESHOLD = 100; // 历史动作超过100个时使用离屏缓存
  
  // 智能内存管理
  private memoryMonitor: MemoryMonitor;
  private readonly MAX_MEMORY_USAGE = 0.8; // 80%内存使用率阈值

  constructor(
    canvasEngine: CanvasEngine,
    toolManager: ToolManager,
    historyManager: HistoryManager,
    onStateChange: () => void,
    virtualLayerManager?: VirtualLayerManager,
    config: DrawingHandlerConfig = {}
  ) {
    this.canvasEngine = canvasEngine;
    this.toolManager = toolManager;
    this.historyManager = historyManager;
    this.virtualLayerManager = virtualLayerManager;
    this.onStateChange = onStateChange;

    // 设置默认配置
    this.config = {
      enableIncrementalRedraw: true,
      redrawThrottleMs: 16, // 约60fps
      maxPointsPerAction: 1000, // 最大点数限制
      enableErrorRecovery: true, // 启用错误恢复
      geometricTools: ['rect', 'circle', 'line', 'polygon', 'select'], // 需要全量重绘的几何图形工具
      enableGeometricOptimization: true, // 是否启用几何图形优化
      ...config
    };

    // 初始化内存监控器
    this.memoryMonitor = new MemoryMonitor();
    this.memoryMonitor.setMaxMemoryUsage(this.MAX_MEMORY_USAGE);

    logger.debug('DrawingHandler初始化完成', this.config);
  }

  /**
   * 标记离屏缓存过期（当历史动作发生变化时调用）
   */
  public invalidateOffscreenCache(): void {
    this.offscreenCacheDirty = true;
    logger.debug('离屏缓存已标记为过期');
  }

  /**
   * 处理绘制开始事件
   */
  public async handleDrawStart(event: DrawEvent): Promise<void> {
    try {
      // 选择工具不通过DrawingHandler处理，直接返回
      if (this.toolManager.getCurrentTool() === 'select') {
        logger.debug('选择工具跳过DrawingHandler处理');
        return;
      }

      if (this.isDrawing) {
        logger.warn('绘制已在进行中，忽略新的绘制开始事件');
        return;
      }
      
      // 检查事件有效性
      if (!event || !event.point) {
        logger.warn('DrawingHandler: 无效的绘制开始事件', event);
        return;
      }

      const point = this.getEventPoint(event);
      const tool = await this.toolManager.getTool(); // 统一使用异步方法获取工具
      
      if (!tool) {
        logger.error('无法获取当前工具实例，绘制开始失败');
        return;
      }

      this.isDrawing = true;
      this.currentAction = this.createDrawAction(point);
      
      logger.debug('开始绘制', { 
        toolType: this.toolManager.getCurrentTool(), 
        point,
        actionId: this.currentAction.id 
      });
      
      this.onStateChange();
    } catch (error) {
      logger.error('绘制开始事件处理失败', error);
      // 尝试恢复状态
      this.isDrawing = false;
      this.currentAction = null;
      this.handleError(error);
      // 重新抛出，让上层知道处理失败
      throw error;
    }
  }

  /**
   * 处理绘制移动事件
   */
  public async handleDrawMove(event: DrawEvent): Promise<void> {
    try {
      if (!this.isDrawing || !this.currentAction) {
        return;
      }

      const point = this.getEventPoint(event);
      
      // 检查点数限制
      if (this.currentAction.points.length >= this.config.maxPointsPerAction) {
        logger.warn('达到最大点数限制，停止添加新点', {
          actionId: this.currentAction.id,
          maxPoints: this.config.maxPointsPerAction
        });
        return;
      }
      
      // 添加点到当前动作
      this.currentAction.points.push(point);
      
      // 根据配置选择重绘策略
      if (this.config.enableIncrementalRedraw) {
        this.scheduleIncrementalRedraw();
      } else {
        this.scheduleFullRedraw();
      }
    } catch (error) {
      logger.error('绘制移动事件处理失败', error);
      this.handleError(error);
    }
  }

  /**
   * 处理绘制结束事件
   */
  public async handleDrawEnd(event: DrawEvent): Promise<void> {
    try {
      // 选择工具不通过DrawingHandler处理，直接返回
      if (this.toolManager.getCurrentTool() === 'select') {
        logger.debug('选择工具跳过DrawingHandler处理');
        return;
      }
      
      if (!this.isDrawing || !this.currentAction) {
        // 降级为debug，因为可能是正常的边界情况（如快速点击、状态已清除等）
        logger.debug('绘制结束事件：未在绘制状态或无当前动作（可能是正常情况）');
        return;
      }

      const point = this.getEventPoint(event);
      
      // 添加最后一个点
      this.currentAction.points.push(point);
      
      // 处理虚拟图层分配
      if (this.virtualLayerManager) {
        this.virtualLayerManager.handleNewAction(this.currentAction);
      }
      
      // 保存到历史记录
      this.historyManager.addAction(this.currentAction);
      
      // 将当前动作添加到缓存
      this.cachedActions.add(this.currentAction.id);
      
      // 标记离屏缓存过期（新动作已添加到历史记录）
      this.offscreenCacheDirty = true;
      
      logger.debug('结束绘制', {
        actionId: this.currentAction.id,
        pointsCount: this.currentAction.points.length
      });
      
    } catch (error) {
      logger.error('绘制结束事件处理失败', error);
      this.handleError(error);
    } finally {
      // 确保状态被正确清理
      this.isDrawing = false;
      this.currentAction = null;
      this.onStateChange();
    }
  }

  /**
   * 创建绘制动作
   */
  private createDrawAction(startPoint: Point): DrawAction {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substr(2, 9);
    
    const canvas = this.canvasEngine.getCanvas();
    const ctx = canvas.getContext('2d');
    
    return {
      id: `${timestamp}-${randomSuffix}`, // 更安全的ID生成
      type: this.toolManager.getCurrentTool(),
      points: [startPoint],
      context: {
        strokeStyle: (ctx?.strokeStyle as string) || '#000000',
        lineWidth: ctx?.lineWidth || 2,
        fillStyle: (ctx?.fillStyle as string) || '#000000'
      },
      timestamp: timestamp
    };
  }

  /**
   * 处理键盘事件
   */
  public handleKeyboardEvent(): boolean {
    // 简化的键盘处理
    return false;
  }

  /**
   * 从事件获取坐标点（改进错误处理）
   */
  private getEventPoint(event: DrawEvent): Point {
    if (!event.point) {
      throw new Error('事件坐标点缺失，无法进行绘制操作');
    }
    
    if (typeof event.point.x !== 'number' || typeof event.point.y !== 'number') {
      throw new Error('事件坐标点格式无效，x和y必须是数字类型');
    }
    
    return {
      x: event.point.x,
      y: event.point.y
    };
  }

  /**
   * 调度增量重绘（性能优化）
   */
  private scheduleIncrementalRedraw(): void {
    const now = performance.now();
    
    // 检查节流
    if (now - this.lastRedrawTime < this.config.redrawThrottleMs) {
      if (!this.redrawScheduled) {
        this.redrawScheduled = true;
        setTimeout(() => {
          this.performIncrementalRedraw();
          this.redrawScheduled = false;
        }, this.config.redrawThrottleMs);
      }
      return;
    }
    
    this.performIncrementalRedraw();
    this.lastRedrawTime = now;
  }

  /**
   * 执行增量重绘
   */
  private async performIncrementalRedraw(): Promise<void> {
    if (!this.currentAction || this.currentAction.points.length === 0) {
      return;
    }

    try {
      // 【修复】在增量重绘前检查是否需要清除选区UI
      // 这修复了从select工具切换到其他工具后，选区未被清除的问题
      if (this.needsClearSelectionUI) {
        this.clearSelectionUI();
        this.needsClearSelectionUI = false;
        this.needsClearSelectionUITime = 0;
        logger.debug('performIncrementalRedraw: 已清除选区UI');
      }
      
      const canvas = this.canvasEngine.getCanvas();
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('无法获取Canvas上下文');
      }
      
      // 根据工具类型选择重绘策略
      const toolType = this.currentAction.type;
      if (this.requiresFullRedrawForCurrentAction(toolType)) {
        // 几何图形工具需要重绘历史动作来清空之前的内容
        await this.performGeometricRedraw(ctx);
      } else {
        // 路径工具只需要绘制当前动作
        await this.drawAction(ctx, this.currentAction);
      }
      
      logger.debug('增量重绘完成', {
        actionId: this.currentAction.id,
        pointsCount: this.currentAction.points.length,
        toolType: toolType,
        redrawStrategy: this.requiresFullRedrawForCurrentAction(toolType) ? 'geometric' : 'path'
      });
    } catch (error) {
      logger.error('增量重绘失败', error);
      // 增量重绘失败时，回退到全量重绘
      this.offscreenCacheDirty = true; // 标记缓存过期
      this.scheduleFullRedraw();
    }
  }

  /**
   * 判断当前动作是否需要全量重绘（几何图形工具）
   */
  private requiresFullRedrawForCurrentAction(toolType: string): boolean {
    // 检查是否启用几何图形优化
    if (!this.config.enableGeometricOptimization) {
      return false;
    }
    
    // 几何图形工具需要重绘历史动作来清空之前的内容
    return this.config.geometricTools.includes(toolType);
  }

  /**
   * 执行几何图形重绘（重绘历史动作 + 当前动作）
   * 性能优化：如果历史动作很多，使用离屏Canvas缓存
   */
  private async performGeometricRedraw(ctx: CanvasRenderingContext2D): Promise<void> {
    try {
      const allActions = this.historyManager.getAllActions();
      const historyCount = allActions.length;
      const canvas = this.canvasEngine.getCanvas();
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      
      // 检查是否应该使用离屏缓存（智能内存管理）
      const shouldUseCache = this.shouldUseOffscreenCache(historyCount);
      
      // 如果历史动作很多，使用离屏Canvas缓存优化性能
      if (shouldUseCache) {
        // 初始化离屏Canvas
        if (!this.offscreenCanvas || this.offscreenCacheDirty) {
          this.initializeOffscreenCanvas(canvasWidth, canvasHeight);
        }
        
        // 如果缓存过期，重新绘制历史动作到离屏Canvas
        if (this.offscreenCacheDirty) {
          await this.drawAllHistoryActionsToOffscreen();
          this.offscreenCacheDirty = false;
        }
        
        // 清空主画布
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        
        // 将离屏Canvas绘制到主Canvas
        ctx.drawImage(this.offscreenCanvas!, 0, 0);
        
        // 绘制当前动作到主Canvas
        if (this.currentAction && this.currentAction.points.length > 0) {
          await this.drawAction(ctx, this.currentAction);
        }
        
        logger.debug('几何图形重绘完成（使用离屏缓存）', {
          historyActions: historyCount,
          currentAction: this.currentAction?.id,
          offscreenCacheUsed: true
        });
      } else {
        // 历史动作较少，直接绘制（原有逻辑）
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        
        // 按虚拟图层分组绘制历史动作
        if (this.virtualLayerManager) {
          await this.drawActionsByVirtualLayers(ctx, allActions);
        } else {
          // 兼容模式：直接绘制所有历史动作
          for (const action of allActions) {
            await this.drawAction(ctx, action);
          }
        }

        // 绘制当前动作
        if (this.currentAction && this.currentAction.points.length > 0) {
          await this.drawAction(ctx, this.currentAction);
        }
        
        logger.debug('几何图形重绘完成', {
          historyActions: historyCount,
          currentAction: this.currentAction?.id,
          offscreenCacheUsed: false
        });
      }
    } catch (error) {
      logger.error('几何图形重绘失败', error);
      throw error;
    }
  }

  /**
   * 检查是否应该使用离屏缓存（智能内存管理）
   */
  private shouldUseOffscreenCache(historyCount: number): boolean {
    // 检查内存使用率
    if (this.memoryMonitor.isMemoryUsageHigh()) {
      // 内存紧张，禁用缓存
      if (this.offscreenCanvas) {
        this.cleanupOffscreenCanvas();
      }
      return false;
    }
    
    // 检查历史动作数量
    if (historyCount < this.OFFSCREEN_CACHE_THRESHOLD) {
      return false;
    }
    
    // 检查是否启用几何图形优化
    return this.config.enableGeometricOptimization;
  }

  /**
   * 清理离屏Canvas（内存紧张时调用）
   * 改进：显式释放 GPU 资源，通过设置 canvas 尺寸为 0 来释放显存
   */
  private cleanupOffscreenCanvas(): void {
    if (this.offscreenCanvas) {
      // 1. 先清除内容
      if (this.offscreenCtx) {
        this.offscreenCtx.clearRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
      }
      
      // 2. 显式释放 GPU 资源
      // 设置 canvas 尺寸为 0 可以触发浏览器释放底层的显存
      // 这是防止 Canvas 内存泄漏的关键步骤
      this.offscreenCanvas.width = 0;
      this.offscreenCanvas.height = 0;
      
      // 3. 清除引用
      this.offscreenCanvas = undefined;
      this.offscreenCtx = undefined;
      this.offscreenCacheDirty = true;
      
      logger.debug('离屏Canvas已清理（内存紧张），GPU资源已释放');
    }
  }

  /**
   * 初始化离屏Canvas
   */
  private initializeOffscreenCanvas(width: number, height: number): void {
    if (!this.offscreenCanvas) {
      this.offscreenCanvas = document.createElement('canvas');
      this.offscreenCtx = this.offscreenCanvas.getContext('2d')!;
    }
    
    // 如果尺寸变化，更新离屏Canvas尺寸
    if (this.offscreenCanvas.width !== width || this.offscreenCanvas.height !== height) {
      this.offscreenCanvas.width = width;
      this.offscreenCanvas.height = height;
      this.offscreenCacheDirty = true; // 尺寸变化，需要重新绘制
    }
  }

  /**
   * 将所有历史动作绘制到离屏Canvas
   */
  private async drawAllHistoryActionsToOffscreen(): Promise<void> {
    if (!this.offscreenCtx) return;
    
    const allActions = this.historyManager.getAllActions();
    const canvas = this.offscreenCanvas!;
    
    // 清空离屏Canvas
    this.offscreenCtx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 按虚拟图层分组绘制历史动作
    if (this.virtualLayerManager) {
      await this.drawActionsByVirtualLayers(this.offscreenCtx, allActions);
    } else {
      // 兼容模式：直接绘制所有历史动作
      for (const action of allActions) {
        await this.drawAction(this.offscreenCtx, action);
      }
    }
  }

  /**
   * 调度全量重绘（兼容模式）
   */
  private scheduleFullRedraw(): void {
    if (!this.redrawScheduled) {
      this.redrawScheduled = true;
      requestAnimationFrame(async () => {
        await this.redrawCanvas();
        this.redrawScheduled = false;
      });
    }
  }

  /**
   * 重绘Canvas（全量重绘或只重绘选中图层）
   */
  private async redrawCanvas(): Promise<void> {
    try {
      // 检查draw层是否已拆分
      if (this.canvasEngine.isDrawLayerSplit() && this.virtualLayerManager) {
        const selectedLayerZIndex = this.canvasEngine.getSelectedLayerZIndex();
        if (selectedLayerZIndex !== null) {
          // 统一使用ensureLayersInitialized确保图层初始化完成
          try {
            await this.ensureLayersInitialized();
          } catch (error) {
            logger.error('redrawCanvas: 图层初始化失败，回退到全量重绘', error);
            // 初始化失败，回退到全量重绘
            await this.redrawCanvasFull();
            return;
          }
          
          // 只重绘选中图层
          await this.redrawSelectedLayerOnly(selectedLayerZIndex);
          return;
        }
      }

      // 未拆分或无法获取选中图层，使用全量重绘
      await this.redrawCanvasFull();
    } catch (error) {
      logger.error('重绘Canvas失败', error);
      this.handleError(error);
    }
  }
  
  /**
   * 初始化拆分后的draw层（绘制bottom和top层的内容）
   * @param selectedLayerZIndex 选中图层的zIndex
   */
  private async initializeSplitDrawLayers(selectedLayerZIndex: number): Promise<void> {
    if (!this.virtualLayerManager) return;
    
    const allLayers = this.virtualLayerManager.getAllVirtualLayers();
    const allActions = this.historyManager.getAllActions();
    
    // 创建动作ID到动作的映射
    const actionMap = new Map<string, DrawAction>();
    for (const action of allActions) {
      actionMap.set(action.id, action);
    }
    
    // 绘制bottom层（如果有）
    const bottomCtx = this.canvasEngine.getBottomLayersDrawContext();
    if (bottomCtx) {
      // 标记正在使用
      this.canvasEngine.markDrawLayerInUse('draw-bottom');
      try {
        const bottomLayers = allLayers.filter(l => l.zIndex < selectedLayerZIndex);
        bottomCtx.clearRect(0, 0, bottomCtx.canvas.width, bottomCtx.canvas.height);
      
      for (const layer of bottomLayers) {
        // 边界检查：图层可能在使用过程中被删除
        if (!layer || !layer.visible || layer.locked) continue;
        
        // 验证图层是否仍然存在（防止在绘制过程中被删除）
        if (this.virtualLayerManager && !this.virtualLayerManager.getVirtualLayer(layer.id)) {
          logger.warn(`图层在绘制过程中被删除，跳过: ${layer.id}`);
          continue;
        }
        
        const originalGlobalAlpha = bottomCtx.globalAlpha;
        bottomCtx.globalAlpha = layer.opacity;
        
        // 使用缓存渲染
        const cacheCanvas = this.virtualLayerManager?.getLayerCache(layer.id);
        if (cacheCanvas && !layer.cacheDirty) {
          bottomCtx.drawImage(cacheCanvas, 0, 0);
        } else {
          // 重新渲染到缓存
          const layerCache = this.virtualLayerManager?.getLayerCache(layer.id);
          if (layerCache && layer.cacheCtx) {
            layer.cacheCtx.clearRect(0, 0, layerCache.width, layerCache.height);
            for (const actionId of layer.actionIds) {
              const action = actionMap.get(actionId);
              if (action) {
                await this.drawAction(layer.cacheCtx, action);
              }
            }
            this.virtualLayerManager?.markLayerCacheValid(layer.id);
            bottomCtx.drawImage(layerCache, 0, 0);
          }
        }
        
        bottomCtx.globalAlpha = originalGlobalAlpha;
      }
      } finally {
        // 取消标记
        this.canvasEngine.unmarkDrawLayerInUse('draw-bottom');
      }
    }
    
    // 绘制top层（如果有）
    const topCtx = this.canvasEngine.getTopLayersDrawContext();
    if (topCtx) {
      // 标记正在使用
      this.canvasEngine.markDrawLayerInUse('draw-top');
      try {
        const topLayers = allLayers.filter(l => l.zIndex > selectedLayerZIndex);
        topCtx.clearRect(0, 0, topCtx.canvas.width, topCtx.canvas.height);
      
      for (const layer of topLayers) {
        // 边界检查：图层可能在使用过程中被删除
        if (!layer || !layer.visible || layer.locked) continue;
        
        // 验证图层是否仍然存在（防止在绘制过程中被删除）
        if (this.virtualLayerManager && !this.virtualLayerManager.getVirtualLayer(layer.id)) {
          logger.warn(`图层在绘制过程中被删除，跳过: ${layer.id}`);
          continue;
        }
        
        const originalGlobalAlpha = topCtx.globalAlpha;
        topCtx.globalAlpha = layer.opacity;
        
        // 使用缓存渲染
        const cacheCanvas = this.virtualLayerManager?.getLayerCache(layer.id);
        if (cacheCanvas && !layer.cacheDirty) {
          topCtx.drawImage(cacheCanvas, 0, 0);
        } else {
          // 重新渲染到缓存
          const layerCache = this.virtualLayerManager?.getLayerCache(layer.id);
          if (layerCache && layer.cacheCtx) {
            layer.cacheCtx.clearRect(0, 0, layerCache.width, layerCache.height);
            for (const actionId of layer.actionIds) {
              const action = actionMap.get(actionId);
              if (action) {
                await this.drawAction(layer.cacheCtx, action);
              }
            }
            this.virtualLayerManager?.markLayerCacheValid(layer.id);
            topCtx.drawImage(layerCache, 0, 0);
          }
        }
        
        topCtx.globalAlpha = originalGlobalAlpha;
      }
      } finally {
        // 取消标记
        this.canvasEngine.unmarkDrawLayerInUse('draw-top');
      }
    }
  }

  /**
   * 全量重绘Canvas（所有图层）
   */
  private async redrawCanvasFull(): Promise<void> {
    try {
      const canvas = this.canvasEngine.getCanvas();
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('无法获取Canvas上下文');
      }

      // individual模式：如果图层已拆分但未初始化，先完成初始化
      if (this.canvasEngine.isDrawLayerSplit() && this.virtualLayerManager) {
        await this.ensureLayersInitialized();
      }

      // 清空画布
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 获取所有历史动作
      const allActions = this.historyManager.getAllActions();
      
      // 检查是否需要更新缓存
      if (allActions.length !== this.lastCachedActionCount) {
        this.updateActionCache(allActions);
        this.lastCachedActionCount = allActions.length;
        // 历史动作数量变化，标记离屏缓存过期
        this.offscreenCacheDirty = true;
      }
      
      // 按虚拟图层分组绘制
      if (this.virtualLayerManager) {
        await this.drawActionsByVirtualLayers(ctx, allActions);
      } else {
        // 兼容模式：直接绘制所有动作
        for (const action of allActions) {
          await this.drawAction(ctx, action);
        }
      }

      // 绘制当前动作
      if (this.currentAction && this.currentAction.points.length > 0) {
        await this.drawAction(ctx, this.currentAction);
      }

      // 优化：只在必要时调用drawSelectToolUI
      // 1. 当前工具是select - 需要绘制选择UI
      // 2. 需要清除选择UI（从select切换到其他工具）- 需要清除选择UI
      const currentTool = this.toolManager.getCurrentTool();
      
      // 检查是否需要强制清除（超时）
      if (this.needsClearSelectionUI) {
        const timeSinceMark = Date.now() - this.needsClearSelectionUITime;
        if (timeSinceMark > this.CLEAR_SELECTION_UI_TIMEOUT) {
          logger.warn('redrawCanvasFull: 清除选择UI标记超时，强制清除', {
            timeSinceMark,
            timeout: this.CLEAR_SELECTION_UI_TIMEOUT
          });
          // 直接清除UI，不调用drawSelectToolUI
          this.clearSelectionUI();
          this.needsClearSelectionUI = false;
        }
      }
      
      const shouldCallDrawSelectToolUI = 
        currentTool === 'select' || 
        this.needsClearSelectionUI;
      
      if (shouldCallDrawSelectToolUI) {
        logger.info('redrawCanvasFull: 调用drawSelectToolUI', {
          currentTool,
          needsClearSelectionUI: this.needsClearSelectionUI
        });
        await this.drawSelectToolUI();
        // 清除标志
        this.needsClearSelectionUI = false;
        this.needsClearSelectionUITime = 0;
        logger.info('redrawCanvasFull: drawSelectToolUI完成');
      } else {
        logger.debug('redrawCanvasFull: 跳过drawSelectToolUI', {
          currentTool,
          previousTool: this.previousTool
        });
      }
      
      // 更新工具状态（检查是否同步）
      if (this.previousTool !== currentTool) {
        logger.debug('redrawCanvasFull: 工具状态更新', {
          previousTool: this.previousTool,
          currentTool
        });
      }
      this.previousTool = currentTool;

      logger.debug('全量重绘完成', {
        totalActions: allActions.length,
        currentAction: this.currentAction?.id
      });
    } catch (error) {
      logger.error('全量重绘失败', error);
      this.handleError(error);
    }
  }

  /**
   * 在指定上下文中重绘图层列表（公共逻辑）
   * @param ctx Canvas上下文（可能为null）
   * @param layers 要绘制的图层列表
   * @param allActions 所有动作
   * @param layerType 图层类型（用于日志）
   */
  private async redrawLayersInContext(
    ctx: CanvasRenderingContext2D | null,
    layers: VirtualLayer[],
    allActions: DrawAction[],
    layerType: 'bottom' | 'top'
  ): Promise<void> {
    if (!ctx) {
      // 如果没有上下文，说明不需要重绘
      return;
    }

    if (!this.virtualLayerManager) {
      await this.redrawCanvasFull();
      return;
    }

    // 标记draw层正在使用
    const layerId = layerType === 'bottom' ? 'draw-bottom' : 'draw-top';
    this.canvasEngine.markDrawLayerInUse(layerId);
    
    try {

    // 创建动作ID到动作的映射
    const actionMap = new Map<string, DrawAction>();
    for (const action of allActions) {
      actionMap.set(action.id, action);
    }

    // 清空层
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // 绘制所有图层
    for (const layer of layers) {
      // 边界检查：图层可能在使用过程中被删除
      if (!layer || !layer.visible || layer.locked) continue;

      // 验证图层是否仍然存在（防止在绘制过程中被删除）
      if (this.virtualLayerManager && !this.virtualLayerManager.getVirtualLayer(layer.id)) {
        logger.warn(`图层在绘制过程中被删除，跳过: ${layer.id}`);
        continue;
      }

      const originalGlobalAlpha = ctx.globalAlpha;
      ctx.globalAlpha = layer.opacity;

      // 使用缓存渲染
      const cacheCanvas = this.virtualLayerManager?.getLayerCache(layer.id);
      if (cacheCanvas && !layer.cacheDirty) {
        ctx.drawImage(cacheCanvas, 0, 0);
      } else {
        // 重新渲染到缓存
        const layerCache = this.virtualLayerManager?.getLayerCache(layer.id);
        if (layerCache && layer.cacheCtx) {
          layer.cacheCtx.clearRect(0, 0, layerCache.width, layerCache.height);
          for (const actionId of layer.actionIds) {
            const action = actionMap.get(actionId);
            if (action) {
              await this.drawAction(layer.cacheCtx, action);
            }
          }
          this.virtualLayerManager?.markLayerCacheValid(layer.id);
          ctx.drawImage(layerCache, 0, 0);
        }
      }

      ctx.globalAlpha = originalGlobalAlpha;
    }

    logger.debug(`重绘${layerType}层完成`, { layerCount: layers.length });
    } finally {
      // 取消标记
      this.canvasEngine.unmarkDrawLayerInUse(layerId);
    }
  }

  /**
   * 重绘bottom层（下层图层）
   * @param selectedLayerZIndex 选中图层的zIndex（用于确定哪些图层属于bottom层）
   */
  public async redrawBottomLayers(selectedLayerZIndex: number): Promise<void> {
    if (!this.virtualLayerManager) {
      await this.redrawCanvasFull();
      return;
    }

    try {
      const allLayers = this.virtualLayerManager.getAllVirtualLayers();
      const bottomLayers = allLayers.filter(l => l.zIndex < selectedLayerZIndex);
      const allActions = this.historyManager.getAllActions();
      const bottomCtx = this.canvasEngine.getBottomLayersDrawContext();

      await this.redrawLayersInContext(bottomCtx, bottomLayers, allActions, 'bottom');
    } catch (error) {
      logger.error('重绘bottom层失败', error);
      await this.redrawCanvasFull();
    }
  }

  /**
   * 重绘top层（上层图层）
   * @param selectedLayerZIndex 选中图层的zIndex（用于确定哪些图层属于top层）
   */
  public async redrawTopLayers(selectedLayerZIndex: number): Promise<void> {
    if (!this.virtualLayerManager) {
      await this.redrawCanvasFull();
      return;
    }

    try {
      const allLayers = this.virtualLayerManager.getAllVirtualLayers();
      const topLayers = allLayers.filter(l => l.zIndex > selectedLayerZIndex);
      const allActions = this.historyManager.getAllActions();
      const topCtx = this.canvasEngine.getTopLayersDrawContext();

      await this.redrawLayersInContext(topCtx, topLayers, allActions, 'top');
    } catch (error) {
      logger.error('重绘top层失败', error);
      await this.redrawCanvasFull();
    }
  }

  /**
   * 只重绘选中的图层（性能优化）
   * @param selectedLayerZIndex 选中图层的zIndex
   */
  private async redrawSelectedLayerOnly(selectedLayerZIndex: number): Promise<void> {
    if (!this.virtualLayerManager) {
      // 没有虚拟图层管理器，回退到全量重绘
      await this.redrawCanvasFull();
      return;
    }

    try {
      // 获取选中图层的draw层上下文
      const selectedCtx = this.canvasEngine.getSelectedLayerDrawContext();
      if (!selectedCtx) {
        // 如果没有动态draw层，回退到全量重绘
        logger.warn('无法获取选中图层的draw层上下文，回退到全量重绘');
        await this.redrawCanvasFull();
        return;
      }

      // 标记draw层正在使用
      this.canvasEngine.markDrawLayerInUse('draw-selected');
      
      try {
        // 获取选中图层
      const allLayers = this.virtualLayerManager.getAllVirtualLayers();
      const selectedLayer = allLayers.find(layer => layer.zIndex === selectedLayerZIndex);
      
      if (!selectedLayer) {
        logger.warn('未找到选中图层，可能已被删除，回退到全量重绘', {
          selectedLayerZIndex,
          availableLayers: allLayers.map(l => ({ id: l.id, zIndex: l.zIndex }))
        });
        // 如果选中图层不存在，可能需要合并draw层
        if (this.canvasEngine.isDrawLayerSplit()) {
          this.canvasEngine.mergeDrawLayers();
        }
        await this.redrawCanvasFull();
        return;
      }
      
      // 验证图层是否仍然存在（防止在绘制过程中被删除）
      if (!this.virtualLayerManager.getVirtualLayer(selectedLayer.id)) {
        logger.warn('选中图层在绘制过程中被删除，回退到全量重绘', {
          layerId: selectedLayer.id,
          zIndex: selectedLayerZIndex
        });
        await this.redrawCanvasFull();
        return;
      }

      // 清空选中图层的draw层
      const canvas = selectedCtx.canvas;
      selectedCtx.clearRect(0, 0, canvas.width, canvas.height);

      // 只绘制选中图层的内容
      const actionMap = new Map<string, DrawAction>();
      const allActions = this.historyManager.getAllActions();
      for (const action of allActions) {
        if (action.virtualLayerId === selectedLayer.id) {
          actionMap.set(action.id, action);
        }
      }

      // 设置图层透明度
      const originalGlobalAlpha = selectedCtx.globalAlpha;
      selectedCtx.globalAlpha = selectedLayer.opacity;

      // 使用缓存渲染
      const cacheCanvas = this.virtualLayerManager.getLayerCache(selectedLayer.id);
      
      if (cacheCanvas && !selectedLayer.cacheDirty) {
        // 缓存有效，直接使用缓存
        selectedCtx.drawImage(cacheCanvas, 0, 0);
      } else {
        // 缓存无效或不存在，需要重新渲染
        const layerCache = this.virtualLayerManager.getLayerCache(selectedLayer.id);
        if (layerCache) {
          const cacheCtx = selectedLayer.cacheCtx;
          if (cacheCtx) {
            // 清空缓存Canvas
            cacheCtx.clearRect(0, 0, layerCache.width, layerCache.height);
            
            // 在缓存Canvas上绘制该图层的所有动作
            for (const actionId of selectedLayer.actionIds) {
              const action = actionMap.get(actionId);
              if (action) {
                await this.drawAction(cacheCtx, action);
              }
            }
            
            // 标记缓存为有效
            this.virtualLayerManager.markLayerCacheValid(selectedLayer.id);
            
            // 将缓存绘制到选中图层的draw层
            selectedCtx.drawImage(layerCache, 0, 0);
          }
        } else {
          // 如果无法创建缓存，回退到直接绘制
          for (const actionId of selectedLayer.actionIds) {
            const action = actionMap.get(actionId);
            if (action) {
              await this.drawAction(selectedCtx, action);
            }
          }
        }
      }
      
      // 恢复透明度
      selectedCtx.globalAlpha = originalGlobalAlpha;

      // 绘制当前动作（如果属于选中图层）
      if (this.currentAction && 
          this.currentAction.virtualLayerId === selectedLayer.id &&
          this.currentAction.points.length > 0) {
        await this.drawAction(selectedCtx, this.currentAction);
      }

        logger.debug('只重绘选中图层完成', {
          layerId: selectedLayer.id,
          layerName: selectedLayer.name,
          actionCount: selectedLayer.actionIds.length
        });
        
        // 【重要修复】绘制选择工具UI（选区框和锚点）或清除选区UI
        const currentTool = this.toolManager.getCurrentTool();
        if (currentTool === 'select') {
          logger.debug('redrawSelectedLayerOnly: 调用drawSelectToolUI绘制选择UI');
          await this.drawSelectToolUI();
        } else if (this.needsClearSelectionUI) {
          // 【修复】当从select切换到其他工具时，需要清除选区UI
          logger.debug('redrawSelectedLayerOnly: 清除选区UI（工具已切换）');
          this.clearSelectionUI();
          this.needsClearSelectionUI = false;
          this.needsClearSelectionUITime = 0;
        }
      } catch (error) {
        logger.error('只重绘选中图层失败', error);
        // 出错时回退到全量重绘
        await this.redrawCanvasFull();
      } finally {
        // 取消标记
        this.canvasEngine.unmarkDrawLayerInUse('draw-selected');
      }
    } catch (error) {
      logger.error('重绘选中图层失败', error);
      await this.redrawCanvasFull();
    }
  }

  /**
   * 确保图层已初始化（使用Promise确保异步操作完成）
   * 改进：使用事件驱动模式替代轮询，避免竞态条件和UI阻塞
   * @returns Promise，在图层初始化完成后resolve
   */
  private async ensureLayersInitialized(): Promise<void> {
    if (!this.canvasEngine.isDrawLayerSplit() || !this.virtualLayerManager) {
      return; // 未拆分，无需初始化
    }

    const selectedLayerZIndex = this.canvasEngine.getSelectedLayerZIndex();
    if (selectedLayerZIndex === null) {
      return; // 无法获取选中图层zIndex
    }

    if (this.canvasEngine.isDrawLayersInitialized()) {
      return; // 已初始化，直接返回
    }

    // 如果已有初始化Promise，等待它完成
    if (this.layersInitializationPromise) {
      logger.debug('ensureLayersInitialized: 等待现有初始化Promise完成');
      try {
        await this.layersInitializationPromise;
        // 再次检查是否已初始化（Promise可能失败）
        if (this.canvasEngine.isDrawLayersInitialized()) {
          return;
        }
        // Promise完成但未初始化，清除Promise并继续
        logger.warn('ensureLayersInitialized: Promise完成但未初始化，重新初始化');
        this.layersInitializationPromise = null;
      } catch (error) {
        logger.error('ensureLayersInitialized: 等待初始化Promise失败', error);
        // Promise失败，清除并继续尝试初始化
        this.layersInitializationPromise = null;
      }
    }

    // 如果正在初始化，使用 Promise 等待而不是轮询
    // 改进：避免 while 循环轮询，使用带超时的 Promise
    if (this.initializingDrawLayers) {
      logger.debug('ensureLayersInitialized: 检测到正在初始化，等待完成');
      
      // 创建一个等待 Promise，带超时机制
      const waitForInitialization = new Promise<void>((resolve, reject) => {
      const startTime = Date.now();
        const checkInterval = 50; // 检查间隔 50ms（比原来的 10ms 更高效）
        const maxChecks = Math.ceil(this.LAYER_INITIALIZATION_TIMEOUT / checkInterval);
        let checkCount = 0;
        
        const checkInitialized = () => {
          checkCount++;
          
          // 检查是否已初始化
          if (this.canvasEngine.isDrawLayersInitialized()) {
            resolve();
            return;
          }
          
          // 检查是否不再处于初始化状态（可能已失败或取消）
          if (!this.initializingDrawLayers) {
      if (this.canvasEngine.isDrawLayersInitialized()) {
              resolve();
            } else {
              // 初始化被取消但未完成，需要重新初始化
              resolve(); // 让后续代码重新初始化
            }
            return;
          }
          
          // 检查是否超时
          if (checkCount >= maxChecks) {
            const elapsed = Date.now() - startTime;
        logger.warn('ensureLayersInitialized: 等待初始化超时', {
              timeout: this.LAYER_INITIALIZATION_TIMEOUT,
              elapsed,
              checkCount
            });
            reject(new Error(`图层初始化超时 (${elapsed}ms)`));
            return;
          }
          
          // 继续等待（使用 requestAnimationFrame 或 setTimeout）
          // 优先使用 requestAnimationFrame 以避免阻塞渲染
          if (typeof requestAnimationFrame !== 'undefined') {
            requestAnimationFrame(() => setTimeout(checkInitialized, checkInterval - 16));
          } else {
            setTimeout(checkInitialized, checkInterval);
          }
        };
        
        // 开始检查
        checkInitialized();
      });
      
      try {
        await waitForInitialization;
        // 等待完成后再次检查
        if (this.canvasEngine.isDrawLayersInitialized()) {
          return;
        }
        // 如果仍未初始化且不在初始化中，继续下面的初始化逻辑
      } catch (error) {
        logger.error('ensureLayersInitialized: 等待初始化失败', error);
        throw error;
      }
    }

    // 🔒 防止竞态条件：在创建 Promise 前先设置标志
    // 这样其他并发调用会进入上面的等待逻辑
    if (this.initializingDrawLayers) {
      // 双重检查：如果在上面的等待后，另一个调用已经开始初始化
      // 则递归调用自己以进入等待逻辑
      logger.debug('ensureLayersInitialized: 检测到并发初始化，递归等待');
      return this.ensureLayersInitialized();
    }
    
    // 先设置标志，再创建 Promise（原子性保护）
      this.initializingDrawLayers = true;

    // 创建新的初始化Promise（注意：initializingDrawLayers 已在上面设置为 true）
    this.layersInitializationPromise = (async () => {
      try {
        logger.info('ensureLayersInitialized: 开始初始化图层', {
          selectedLayerZIndex
        });
        // 拆分draw层时，需要初始化绘制bottom和top层（如果存在）
        await this.initializeSplitDrawLayers(selectedLayerZIndex);
        // 标记已初始化
        this.canvasEngine.markDrawLayersInitialized();
        logger.info('ensureLayersInitialized: 图层初始化完成');
      } catch (error) {
        logger.error('ensureLayersInitialized: 初始化draw层失败', error);
        // 初始化失败，合并draw层
        this.canvasEngine.mergeDrawLayers();
        throw error; // 重新抛出错误
      } finally {
        this.initializingDrawLayers = false;
        this.layersInitializationPromise = null; // 清除Promise
      }
    })();

    // 等待初始化完成
    await this.layersInitializationPromise;
  }

  /**
   * 获取图层的交互上下文（辅助方法，避免重复代码）
   * @param layer 虚拟图层，如果为null则使用interaction层
   * @returns Canvas上下文
   */
  private getInteractionContextForLayer(layer: { zIndex: number } | null): CanvasRenderingContext2D {
    if (layer && this.canvasEngine) {
      try {
        return this.canvasEngine.getSelectionLayerForVirtualLayer(layer.zIndex);
      } catch {
        return this.canvasEngine.getInteractionLayer();
      }
    }
    return this.canvasEngine?.getInteractionLayer() || ({} as CanvasRenderingContext2D);
  }

  // 防止drawSelectToolUI无限循环调用的标志
  private isDrawingSelectToolUI: boolean = false;
  private lastDrawSelectToolUITime: number = 0;
  private drawingSelectToolUIStartTime: number = 0; // 开始绘制时间，用于超时检测
  private readonly DRAW_SELECT_TOOL_UI_INTERVAL = 16; // 约60fps，防止过于频繁调用
  private readonly DRAW_SELECT_TOOL_UI_MAX_DURATION = 1000; // 最多1秒，防止永久锁定
  
  // 工具切换状态跟踪（用于优化drawSelectToolUI调用）
  private previousTool: string | null = null;
  private needsClearSelectionUI: boolean = false; // 是否需要清除选择UI
  private needsClearSelectionUITime: number = 0; // 标记时间，用于超时检测
  private readonly CLEAR_SELECTION_UI_TIMEOUT = 100; // 100ms后强制清除

  /**
   * 绘制选择工具的UI（选择框、锚点等）
   */
  private async drawSelectToolUI(): Promise<void> {
    // 防止无限循环调用
    if (this.isDrawingSelectToolUI) {
      // 检查是否超时，如果超时则强制重置
      const duration = Date.now() - this.drawingSelectToolUIStartTime;
      if (duration > this.DRAW_SELECT_TOOL_UI_MAX_DURATION) {
        logger.warn('drawSelectToolUI: 执行超时，强制重置', {
          duration,
          maxDuration: this.DRAW_SELECT_TOOL_UI_MAX_DURATION
        });
        this.isDrawingSelectToolUI = false;
      } else {
        logger.debug('drawSelectToolUI: 正在绘制中，跳过重复调用', {
          duration
        });
        return;
      }
    }

    // 节流：防止过于频繁调用
    const now = Date.now();
    if (now - this.lastDrawSelectToolUITime < this.DRAW_SELECT_TOOL_UI_INTERVAL) {
      logger.debug('drawSelectToolUI: 调用过于频繁，跳过', {
        timeSinceLastCall: now - this.lastDrawSelectToolUITime
      });
      return;
    }

    this.isDrawingSelectToolUI = true;
    this.drawingSelectToolUIStartTime = now;
    this.lastDrawSelectToolUITime = now;

    try {
      logger.info('drawSelectToolUI: 开始绘制选择工具UI');
      const currentTool = this.toolManager.getCurrentToolInstance();
      const currentToolType = this.toolManager.getCurrentTool();
      
      if (!currentTool || currentToolType !== 'select') {
        logger.info('drawSelectToolUI: 当前工具不是select工具，清除选择UI', {
          currentToolType,
          hasCurrentTool: !!currentTool
        });
        
        // 清除所有动态图层中的选择UI（选区和锚点）
        this.clearSelectionUI();
        
        // 注意：此时工具已经切换，currentTool已经不是select工具了
        // 选择状态应该在setTool时已经清除，这里只需要清除UI即可
        // 如果确实需要清除select工具的状态，应该通过ToolManager获取select工具实例
        // 但通常不需要，因为setTool时已经清除了
        
        return;
      }

      const selectTool = currentTool as unknown as {
        getCurrentSelectionBounds: () => { x: number; y: number; width: number; height: number } | null;
        getSelectedActions: () => DrawAction[];
        setSelectedActions?: (actions: DrawAction[]) => void;
        isSelecting: boolean;
        selectionStartPoint: Point | null;
        draw: (ctx: CanvasRenderingContext2D, action: DrawAction) => void;
      };
      
      // 在开始时就获取选中的actions，避免在后续处理中被清空
      const selectedActionsAtStart = selectTool.getSelectedActions();
      logger.info('drawSelectToolUI: 开始时获取选中的actions', {
        selectedActionsCount: selectedActionsAtStart.length,
        selectedActionIds: selectedActionsAtStart.map(a => a.id)
      });

      // 获取模式（在作用域外定义，以便后续使用）
      const mode = this.virtualLayerManager?.getMode();

      // 获取交互层上下文（使用动态图层或interaction层）
      let interactionCtx: CanvasRenderingContext2D;
      try {
        // 尝试获取动态图层（如果选中了图层）
        if (this.virtualLayerManager) {
          const activeLayer = this.virtualLayerManager.getActiveVirtualLayer();
          
          // individual模式：如果有选中的actions，使用它们的图层来获取动态图层
          if (mode === 'individual') {
            const selectedActions = selectTool.getSelectedActions();
            if (selectedActions.length > 0) {
          // individual模式：必须保证先动态划分图层完毕，再绘制选区和锚点
          // 使用Promise确保图层初始化完成
          if (this.canvasEngine && this.canvasEngine.isDrawLayerSplit() && !this.canvasEngine.isDrawLayersInitialized()) {
            logger.info('drawSelectToolUI: individual模式，图层已拆分但未初始化，等待初始化完成', {
              selectedActionsCount: selectedActions.length
            });
            try {
              // 等待图层初始化完成
              await this.ensureLayersInitialized();
              logger.info('drawSelectToolUI: 图层初始化完成，继续绘制');
            } catch (error) {
              logger.error('drawSelectToolUI: 等待图层初始化失败', error);
              // 初始化失败，不绘制选择UI
              return;
            }
          }
              
              // 收集所有被选中的虚拟图层ID
              const selectedLayerIds = new Set<string>();
              for (const action of selectedActions) {
                if (action.virtualLayerId) {
                  selectedLayerIds.add(action.virtualLayerId);
                }
              }
              
              if (selectedLayerIds.size > 0) {
                // 找到zIndex最小的选中图层来获取动态图层
                const allLayers = this.virtualLayerManager.getAllVirtualLayers();
                const selectedLayers = allLayers.filter(layer => selectedLayerIds.has(layer.id));
                
                if (selectedLayers.length > 0) {
                  const minZIndexLayer = selectedLayers.reduce((min, layer) => 
                    layer.zIndex < min.zIndex ? layer : min
                  );
                  
                  logger.debug('drawSelectToolUI: individual模式，使用选中图层的最小zIndex', {
                    minZIndexLayerId: minZIndexLayer.id,
                    minZIndex: minZIndexLayer.zIndex,
                    selectedLayerIds: Array.from(selectedLayerIds),
                    isDrawLayerSplit: this.canvasEngine?.isDrawLayerSplit(),
                    isDrawLayersInitialized: this.canvasEngine?.isDrawLayersInitialized()
                  });
                  
                    try {
                      interactionCtx = this.canvasEngine.getSelectionLayerForVirtualLayer(minZIndexLayer.zIndex);
                      logger.debug('drawSelectToolUI: 成功获取动态图层', {
                        zIndex: minZIndexLayer.zIndex,
                        canvasWidth: interactionCtx.canvas.width,
                        canvasHeight: interactionCtx.canvas.height
                      });
                    } catch (error) {
                      logger.error('drawSelectToolUI: 获取动态图层失败，回退到interaction层', error);
                    interactionCtx = this.canvasEngine.getInteractionLayer();
                  }
                } else {
                  // 如果找不到图层，回退到活动图层或interaction层
                  interactionCtx = this.getInteractionContextForLayer(activeLayer);
                }
              } else {
                // 没有选中的图层，回退到活动图层或interaction层
                interactionCtx = this.getInteractionContextForLayer(activeLayer);
              }
            } else {
              // 没有选中的actions，回退到活动图层或interaction层
              interactionCtx = this.getInteractionContextForLayer(activeLayer);
            }
          } else {
            // grouped模式：使用活动图层
            logger.debug('drawSelectToolUI: grouped模式，使用活动图层', {
              hasActiveLayer: !!activeLayer,
              activeLayerId: activeLayer?.id,
              activeLayerZIndex: activeLayer?.zIndex
            });
            interactionCtx = this.getInteractionContextForLayer(activeLayer);
            if (activeLayer) {
              logger.debug('drawSelectToolUI: 成功获取动态图层', {
                zIndex: activeLayer.zIndex,
                canvasWidth: interactionCtx.canvas.width,
                canvasHeight: interactionCtx.canvas.height
              });
            }
          }
        } else {
          logger.debug('drawSelectToolUI: 没有virtualLayerManager，使用interaction层');
          interactionCtx = this.canvasEngine.getInteractionLayer();
        }
      } catch (error) {
        logger.error('drawSelectToolUI: 获取交互层上下文失败', error);
        interactionCtx = this.canvasEngine.getInteractionLayer();
      }
      
      // 清空交互层
      interactionCtx.clearRect(0, 0, interactionCtx.canvas.width, interactionCtx.canvas.height);
      logger.debug('drawSelectToolUI: 已清空交互层', {
        canvasWidth: interactionCtx.canvas.width,
        canvasHeight: interactionCtx.canvas.height
      });

      // 使用开始时获取的selectedActions，避免在后续处理中被清空
      // 如果有选中的actions，绘制锚点（通过draw方法）
      let selectedActions = selectedActionsAtStart.length > 0 ? selectedActionsAtStart : selectTool.getSelectedActions();
      
      // individual模式：如果选择被清空，可能是图层切换导致的异步清空，等待选择恢复
      // 【修复】只有当之前确实有选择（selectedActionsAtStart.length > 0）但当前被清空时才需要等待
      // 如果一开始就没有选择，不需要等待恢复，直接跳过等待逻辑
      const hadSelectionBefore = selectedActionsAtStart.length > 0;
      if (selectedActions.length === 0 && hadSelectionBefore && mode === 'individual' && this.virtualLayerManager) {
        const maxWaitTime = 50; // 最大等待时间：50ms
        const checkInterval = 5; // 检查间隔：5ms
        const maxIterations = Math.ceil(maxWaitTime / checkInterval); // 最多检查次数
        
        let waitIterations = 0;
        for (let i = 0; i < maxIterations; i++) {
          // 等待一个事件循环，让Promise.resolve().then()中的恢复选择逻辑执行
          await new Promise(resolve => setTimeout(resolve, checkInterval));
          selectedActions = selectTool.getSelectedActions();
          waitIterations = i + 1;
          
          if (selectedActions.length > 0) {
            logger.info('drawSelectToolUI: individual模式，等待后选择已恢复', {
              selectedActionsCount: selectedActions.length,
              selectedActionIds: selectedActions.map(a => a.id),
              waitIterations,
              waitTime: waitIterations * checkInterval
            });
            break;
          }
        }
        
        if (selectedActions.length === 0) {
          logger.warn('drawSelectToolUI: individual模式，等待后选择仍未恢复', {
            selectedActionsAtStartCount: selectedActionsAtStart.length,
            selectedActionsAtStartIds: selectedActionsAtStart.map(a => a.id),
            waitIterations,
            maxWaitTime
          });
        }
      }
      
      logger.info('drawSelectToolUI: 准备绘制锚点', {
        selectedActionsCount: selectedActions.length,
        selectedActionIds: selectedActions.map(a => a.id)
      });
      
      if (selectedActions.length > 0) {
        // 创建一个临时的SelectAction用于绘制锚点
        const tempAction: DrawAction = {
          id: 'temp-selection',
          type: 'select',
          points: [],
          context: {
            strokeStyle: '#000000',
            lineWidth: 1,
            fillStyle: '#000000'
          },
          timestamp: Date.now()
        };
        // 验证选中的actions是否仍然存在，如果被清空则尝试恢复
        const currentSelectedActions = selectTool.getSelectedActions();
        if (currentSelectedActions.length === 0 && selectedActions.length > 0) {
          logger.warn('drawSelectToolUI: 选中的actions在绘制前被清空，尝试恢复', {
            selectedActionIds: selectedActions.map(a => a.id)
          });
          // 尝试恢复选中的actions
          if (selectTool.setSelectedActions) {
            selectTool.setSelectedActions(selectedActions);
          }
        }
        
        // 使用开始时获取的selectedActions绘制，确保在重绘过程中即使选择被临时清空，也能正确绘制
        selectTool.draw(interactionCtx, tempAction as any);
        logger.info('drawSelectToolUI: selectTool.draw完成');
      } else {
        logger.info('drawSelectToolUI: 没有选中的actions，跳过绘制');
      }

      // 如果正在框选，绘制选择框
      if (selectTool.isSelecting && selectTool.selectionStartPoint) {
        const bounds = selectTool.getCurrentSelectionBounds();
        if (bounds && bounds.width > 5 && bounds.height > 5) {
          // 创建一个临时的SelectAction用于绘制选择框
          const tempAction: DrawAction = {
            id: 'temp-selection-box',
            type: 'select',
            points: [
              { x: bounds.x, y: bounds.y },
              { x: bounds.x + bounds.width, y: bounds.y + bounds.height }
            ],
            context: {
              strokeStyle: '#000000',
              lineWidth: 1,
              fillStyle: '#000000'
            },
            timestamp: Date.now()
          };
          selectTool.draw(interactionCtx, tempAction as any);
        }
      }
    } catch (error) {
      logger.error('绘制选择工具UI失败', error);
    } finally {
      // 重置标志，允许下次调用
      this.isDrawingSelectToolUI = false;
    }
  }

  /**
   * 更新动作缓存
   */
  private updateActionCache(actions: DrawAction[]): void {
    this.cachedActions.clear();
    for (const action of actions) {
      this.cachedActions.add(action.id);
    }
    logger.debug('动作缓存已更新', { cachedCount: this.cachedActions.size });
  }

  /**
   * 按虚拟图层绘制动作（使用缓存优化）
   */
  private async drawActionsByVirtualLayers(ctx: CanvasRenderingContext2D, actions: DrawAction[]): Promise<void> {
    if (!this.virtualLayerManager) return;

    // 性能优化：创建动作ID到动作的映射
    const actionMap = new Map<string, DrawAction>();
    for (const action of actions) {
      actionMap.set(action.id, action);
    }

    // 获取Canvas尺寸（用于创建缓存）
    const canvas = ctx.canvas;
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    
    // 更新虚拟图层管理器的Canvas尺寸
    this.virtualLayerManager.setCanvasSize(canvasWidth, canvasHeight);

    // 获取所有虚拟图层（已按zIndex排序）
    const virtualLayers = this.virtualLayerManager.getAllVirtualLayers();
    
    for (const layer of virtualLayers) {
      // 跳过不可见图层
      if (!layer.visible) continue;
      
      // 跳过锁定图层（可选，取决于业务需求）
      if (layer.locked) continue;
      
      // 设置图层透明度
      const originalGlobalAlpha = ctx.globalAlpha;
      ctx.globalAlpha = layer.opacity;
      
      // 使用缓存渲染
      const cacheCanvas = this.virtualLayerManager.getLayerCache(layer.id);
      
      if (cacheCanvas && !layer.cacheDirty) {
        // 缓存有效，直接使用缓存
        ctx.drawImage(cacheCanvas, 0, 0);
      } else {
        // 缓存无效或不存在，需要重新渲染
        const layerCache = this.virtualLayerManager.getLayerCache(layer.id);
        if (layerCache) {
          const cacheCtx = layer.cacheCtx;
          if (cacheCtx) {
            // 清空缓存Canvas
            cacheCtx.clearRect(0, 0, layerCache.width, layerCache.height);
            
            // 在缓存Canvas上绘制该图层的所有动作
            for (const actionId of layer.actionIds) {
              const action = actionMap.get(actionId);
              if (action) {
                await this.drawAction(cacheCtx, action);
              }
            }
            
            // 标记缓存为有效
            this.virtualLayerManager.markLayerCacheValid(layer.id);
            
            // 将缓存绘制到主Canvas
            ctx.drawImage(layerCache, 0, 0);
          }
        } else {
          // 如果无法创建缓存，回退到直接绘制
          for (const actionId of layer.actionIds) {
            const action = actionMap.get(actionId);
            if (action) {
              await this.drawAction(ctx, action);
            }
          }
        }
      }
      
      // 恢复透明度
      ctx.globalAlpha = originalGlobalAlpha;
    }
    
    // 优化：未分配的动作应该已经自动分配到默认图层，这里不再单独处理
    // 如果仍有未分配的动作，说明是旧数据，需要根据模式处理
    const unassignedActions = actions.filter(action => !action.virtualLayerId);
    if (unassignedActions.length > 0) {
      logger.warn(`发现 ${unassignedActions.length} 个未分配的动作，将根据模式自动分配`);
      // 根据模式处理未分配的动作
      const mode = this.virtualLayerManager.getMode();
      if (mode === 'individual') {
        // individual模式：为每个动作创建新图层
        for (const action of unassignedActions) {
          this.virtualLayerManager.handleNewAction(action);
        }
      } else {
        // grouped模式：分配到默认图层
        const defaultLayer = this.virtualLayerManager.getActiveVirtualLayer();
        if (defaultLayer) {
          for (const action of unassignedActions) {
            this.virtualLayerManager.assignActionToLayer(action.id, defaultLayer.id);
            action.virtualLayerId = defaultLayer.id;
          }
        }
      }
    }
  }

  /**
   * 绘制单个动作（统一工具获取方式）
   */
  private async drawAction(ctx: CanvasRenderingContext2D, action: DrawAction): Promise<void> {
    try {
      // 统一使用异步方法获取工具，确保工具已正确加载
      const tool = await this.toolManager.getTool(action.type);
      if (!tool) {
        logger.error(`无法获取工具实例: ${action.type}`);
        return;
      }
      
      if (tool.draw) {
        tool.draw(ctx, action);
      } else {
        logger.warn(`工具 ${action.type} 缺少draw方法`);
      }
    } catch (error) {
      logger.error(`绘制动作失败，工具类型: ${action.type}`, error);
      
      // 如果启用了错误恢复，尝试使用默认工具
      if (this.config.enableErrorRecovery) {
        await this.fallbackDrawAction(ctx, action);
      }
    }
  }

  /**
   * 错误恢复：使用默认工具绘制
   */
  private async fallbackDrawAction(ctx: CanvasRenderingContext2D, action: DrawAction): Promise<void> {
    try {
      logger.info(`尝试使用默认工具恢复绘制: ${action.type}`);
      
      // 使用pen工具作为默认恢复工具
      const fallbackTool = await this.toolManager.getTool('pen');
      if (fallbackTool && fallbackTool.draw) {
        fallbackTool.draw(ctx, action);
        logger.info('错误恢复绘制成功');
      }
    } catch (error) {
      logger.error('错误恢复绘制失败', error);
    }
  }

  /**
   * 统一错误处理
   */
  private handleError(error: unknown): void {
    if (!this.config.enableErrorRecovery) {
      return;
    }

    // 重置绘制状态
    this.isDrawing = false;
    this.currentAction = null;
    
    // 记录错误
    logger.error('DrawingHandler错误处理', error);
    
    // 通知状态变化
    this.onStateChange();
  }

  /**
   * 获取绘制状态（用于StateHandler）
   */
  public getDrawingState() {
    return {
      isDrawing: this.isDrawing,
      isSelecting: false, // 当前简化版本不支持选择
      hasCurrentAction: this.currentAction !== null,
      currentToolType: this.toolManager.getCurrentTool(),
      currentActionId: this.currentAction?.id || null,
      cachedActionsCount: this.cachedActions.size
    };
  }

  /**
   * 获取是否正在绘制的状态
   */
  public getIsDrawing(): boolean {
    return this.isDrawing;
  }

  /**
   * 标记需要清除选择UI（用于工具切换时）
   */
  public markNeedsClearSelectionUI(): void {
    this.needsClearSelectionUI = true;
    this.needsClearSelectionUITime = Date.now();
    logger.debug('DrawingHandler: 标记需要清除选择UI', {
      timestamp: this.needsClearSelectionUITime
    });
  }

  /**
   * 清除选择UI（辅助方法，避免重复代码）
   * 同时合并拆分的 draw 层，为新的绘制操作做准备
   */
  private clearSelectionUI(): void {
    if (!this.canvasEngine) {
      return;
    }

    try {
      // 清除interaction层
      const interactionLayer = this.canvasEngine.getInteractionLayer();
      interactionLayer.clearRect(0, 0, interactionLayer.canvas.width, interactionLayer.canvas.height);
      logger.debug('clearSelectionUI: 已清除interaction层');
    } catch (error) {
      logger.error('clearSelectionUI: 清除interaction层失败', error);
    }

    try {
      // 清除所有动态选择图层
      const allDynamicLayers = this.canvasEngine.getAllDynamicLayers();
      let clearedCount = 0;
      for (const [layerId, layer] of allDynamicLayers) {
        if (layerId.startsWith('selection-')) {
          layer.ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
          clearedCount++;
        }
      }
      logger.debug('clearSelectionUI: 已清除动态选择图层', {
        clearedCount,
        totalDynamicLayers: allDynamicLayers.size
      });
    } catch (error) {
      logger.error('clearSelectionUI: 清除动态选择图层失败', error);
    }

    // 【修复】合并拆分的 draw 层，为新的绘制操作做准备
    try {
      if (this.canvasEngine.isDrawLayerSplit()) {
        logger.debug('clearSelectionUI: 合并拆分的draw层');
        this.canvasEngine.mergeDrawLayers();
      }
    } catch (error) {
      logger.error('clearSelectionUI: 合并draw层失败', error);
    }
  }

  /**
   * 强制重绘（用于外部调用）
   */
  // 防止重绘任务堆积
  private isRedrawing: boolean = false;
  private pendingRedraw: boolean = false;

  public async forceRedraw(): Promise<void> {
    // 如果正在重绘，标记为待重绘，避免重复调用
    if (this.isRedrawing) {
      this.pendingRedraw = true;
      return;
    }

    this.isRedrawing = true;
    this.pendingRedraw = false;

    try {
      await this.redrawCanvas();
      
      // 循环处理所有待重绘请求，确保不丢失
      while (this.pendingRedraw) {
        this.pendingRedraw = false;
        await this.redrawCanvas();
      }
    } catch (error) {
      logger.error('强制重绘失败', error);
      this.pendingRedraw = false; // 出错时清除标志
    } finally {
      this.isRedrawing = false;
    }
  }

  /**
   * 获取性能统计
   */
  public getPerformanceStats() {
    return {
      cachedActionsCount: this.cachedActions.size,
      lastRedrawTime: this.lastRedrawTime,
      redrawScheduled: this.redrawScheduled,
      config: { ...this.config }
    };
  }

  /**
   * 更新配置
   */
  public updateConfig(newConfig: Partial<DrawingHandlerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.debug('DrawingHandler配置已更新', this.config);
  }

  /**
   * 清理缓存
   */
  public clearCache(): void {
    this.cachedActions.clear();
    this.lastCachedActionCount = 0;
    logger.debug('DrawingHandler缓存已清理');
  }

  /**
   * 重置绘制状态（用于工具切换时清理状态）
   */
  public resetDrawingState(): void {
    if (this.isDrawing) {
      logger.debug('重置绘制状态', {
        wasDrawing: this.isDrawing,
        hadCurrentAction: !!this.currentAction
      });
    }
    this.isDrawing = false;
    this.currentAction = null;
    this.redrawScheduled = false;
  }

  /**
   * 销毁处理器
   * 改进：正确清理离屏 Canvas 以防止内存泄漏
   */
  public destroy(): void {
    this.isDrawing = false;
    this.currentAction = null;
    this.cachedActions.clear();
    this.redrawScheduled = false;
    
    // 清理离屏 Canvas（防止内存泄漏）
    this.cleanupOffscreenCanvas();
    
    // 清理其他状态
    this.pendingRedraw = false;
    this.isRedrawing = false;
    this.isDrawingSelectToolUI = false;
    this.needsClearSelectionUI = false;
    this.layersInitializationPromise = null;
    this.initializingDrawLayers = false;
    
    logger.debug('DrawingHandler已销毁，所有资源已清理');
  }
} 