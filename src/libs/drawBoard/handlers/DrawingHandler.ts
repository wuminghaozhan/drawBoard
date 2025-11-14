import type { ToolManager } from '../tools/ToolManager';
import type { CanvasEngine } from '../core/CanvasEngine';
import type { HistoryManager } from '../history/HistoryManager';
import type { DrawAction } from '../tools/DrawTool';
import type { VirtualLayerManager } from '../core/VirtualLayerManager';
import type { VirtualLayer } from '../core/VirtualLayerManager';
import type { DrawEvent } from '../events/EventManager';
import type { Point } from '../core/CanvasEngine';
import { logger } from '../utils/Logger';

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

  // 性能优化：缓存已绘制的动作
  private cachedActions: Set<string> = new Set();
  private lastCachedActionCount: number = 0;
  
  // 性能优化：离屏Canvas缓存（用于几何图形重绘）
  private offscreenCanvas?: HTMLCanvasElement;
  private offscreenCtx?: CanvasRenderingContext2D;
  private offscreenCacheDirty: boolean = true;
  private readonly OFFSCREEN_CACHE_THRESHOLD = 100; // 历史动作超过100个时使用离屏缓存

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
      if (!this.isDrawing || !this.currentAction) {
        logger.warn('绘制结束事件处理失败：未在绘制状态或无当前动作');
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
      
      // 如果历史动作很多，使用离屏Canvas缓存优化性能
      if (historyCount > this.OFFSCREEN_CACHE_THRESHOLD && this.config.enableGeometricOptimization) {
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
          // 检查是否需要初始化bottom和top层（只在首次拆分时初始化）
          if (!this.canvasEngine.isDrawLayersInitialized()) {
            // 防止并发初始化：如果正在初始化，等待完成
            if (this.initializingDrawLayers) {
              // 等待初始化完成（最多等待1秒）
              const maxWait = 1000;
              const startTime = Date.now();
              while (this.initializingDrawLayers && (Date.now() - startTime) < maxWait) {
                await new Promise(resolve => setTimeout(resolve, 10));
              }
              // 如果超时或初始化失败，回退到全量重绘
              if (!this.canvasEngine.isDrawLayersInitialized()) {
                logger.warn('等待初始化超时或失败，回退到全量重绘');
                await this.redrawCanvasFull();
                return;
              }
            } else {
              // 开始初始化
              this.initializingDrawLayers = true;
              try {
                // 拆分draw层时，需要初始化绘制bottom和top层（如果存在）
                await this.initializeSplitDrawLayers(selectedLayerZIndex);
                // 标记已初始化
                this.canvasEngine.markDrawLayersInitialized();
              } catch (error) {
                logger.error('初始化draw层失败', error);
                // 初始化失败，合并draw层并回退到全量重绘
                this.canvasEngine.mergeDrawLayers();
                await this.redrawCanvasFull();
                return;
              } finally {
                this.initializingDrawLayers = false;
              }
            }
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

      // 如果是选择工具，绘制选择框和锚点
      if (this.toolManager.getCurrentTool() === 'select') {
        await this.drawSelectToolUI();
      }

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
   * 绘制选择工具的UI（选择框、锚点等）
   */
  private async drawSelectToolUI(): Promise<void> {
    try {
      const currentTool = this.toolManager.getCurrentToolInstance();
      if (!currentTool || currentTool.getActionType() !== 'select') {
        return;
      }

      const selectTool = currentTool as unknown as {
        getCurrentSelectionBounds: () => { x: number; y: number; width: number; height: number } | null;
        getSelectedActions: () => DrawAction[];
        isSelecting: boolean;
        selectionStartPoint: Point | null;
        draw: (ctx: CanvasRenderingContext2D, action: DrawAction) => void;
      };

      // 获取交互层上下文（使用动态图层或interaction层）
      let interactionCtx: CanvasRenderingContext2D;
      try {
        // 尝试获取动态图层（如果选中了图层）
        if (this.virtualLayerManager) {
          const activeLayer = this.virtualLayerManager.getActiveVirtualLayer();
          if (activeLayer && this.canvasEngine) {
            interactionCtx = this.canvasEngine.getSelectionLayerForVirtualLayer(activeLayer.zIndex);
          } else {
            interactionCtx = this.canvasEngine.getInteractionLayer();
          }
        } else {
          interactionCtx = this.canvasEngine.getInteractionLayer();
        }
      } catch {
        interactionCtx = this.canvasEngine.getInteractionLayer();
      }
      
      // 清空交互层
      interactionCtx.clearRect(0, 0, interactionCtx.canvas.width, interactionCtx.canvas.height);

      // 如果有选中的actions，绘制锚点（通过draw方法）
      const selectedActions = selectTool.getSelectedActions();
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
        selectTool.draw(interactionCtx, tempAction as any);
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
    // 如果仍有未分配的动作，说明是旧数据，直接绘制
    const unassignedActions = actions.filter(action => !action.virtualLayerId);
    if (unassignedActions.length > 0) {
      logger.warn(`发现 ${unassignedActions.length} 个未分配的动作，将自动分配到默认图层`);
      // 自动分配到默认图层
      const defaultLayer = this.virtualLayerManager.getActiveVirtualLayer();
      if (defaultLayer) {
        for (const action of unassignedActions) {
          this.virtualLayerManager.assignActionToLayer(action.id, defaultLayer.id);
          action.virtualLayerId = defaultLayer.id;
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
   * 销毁处理器
   */
  public destroy(): void {
    this.isDrawing = false;
    this.currentAction = null;
    this.cachedActions.clear();
    this.redrawScheduled = false;
    logger.debug('DrawingHandler已销毁');
  }
} 