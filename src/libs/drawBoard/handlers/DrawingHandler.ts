import type { ToolManager } from '../tools/ToolManager';
import type { CanvasEngine } from '../core/CanvasEngine';
import type { HistoryManager } from '../history/HistoryManager';
import type { DrawAction } from '../tools/DrawTool';
import type { VirtualLayerManager } from '../core/VirtualLayerManager';
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

  // 性能优化：缓存已绘制的动作
  private cachedActions: Set<string> = new Set();
  private lastCachedActionCount: number = 0;

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
      geometricTools: ['rect', 'circle', 'line', 'polygon'], // 需要全量重绘的几何图形工具
      enableGeometricOptimization: true, // 是否启用几何图形优化
      ...config
    };

    logger.debug('DrawingHandler初始化完成', this.config);
  }

  /**
   * 处理绘制开始事件
   */
  public async handleDrawStart(event: DrawEvent): Promise<void> {
    try {
      if (this.isDrawing) {
        logger.warn('绘制已在进行中，忽略新的绘制开始事件');
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
      this.handleError(error);
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
   */
  private async performGeometricRedraw(ctx: CanvasRenderingContext2D): Promise<void> {
    try {
      // 清空画布
      ctx.clearRect(0, 0, this.canvasEngine.getCanvas().width, this.canvasEngine.getCanvas().height);
      
      // 获取所有历史动作
      const allActions = this.historyManager.getAllActions();
      
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
        historyActions: allActions.length,
        currentAction: this.currentAction?.id
      });
    } catch (error) {
      logger.error('几何图形重绘失败', error);
      throw error;
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
   * 重绘Canvas（全量重绘）
   */
  private async redrawCanvas(): Promise<void> {
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
   * 按虚拟图层绘制动作
   */
  private async drawActionsByVirtualLayers(ctx: CanvasRenderingContext2D, actions: DrawAction[]): Promise<void> {
    if (!this.virtualLayerManager) return;

    // 性能优化：创建动作ID到动作的映射
    const actionMap = new Map<string, DrawAction>();
    for (const action of actions) {
      actionMap.set(action.id, action);
    }

    // 获取所有虚拟图层
    const virtualLayers = this.virtualLayerManager.getAllVirtualLayers();
    
    // 按图层顺序绘制（创建时间排序）
    const sortedLayers = virtualLayers.sort((a, b) => a.created - b.created);
    
    for (const layer of sortedLayers) {
      // 跳过不可见图层
      if (!layer.visible) continue;
      
      // 跳过锁定图层（可选，取决于业务需求）
      if (layer.locked) continue;
      
      // 设置图层透明度
      const originalGlobalAlpha = ctx.globalAlpha;
      ctx.globalAlpha = layer.opacity;
      
      // 绘制该图层的所有动作
      for (const actionId of layer.actionIds) {
        const action = actionMap.get(actionId); // 使用Map查找，O(1)复杂度
        if (action) {
          await this.drawAction(ctx, action);
        }
      }
      
      // 恢复透明度
      ctx.globalAlpha = originalGlobalAlpha;
    }
    
    // 绘制未分配到任何图层的动作
    const unassignedActions = actions.filter(action => !action.virtualLayerId);
    for (const action of unassignedActions) {
      await this.drawAction(ctx, action);
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
  public async forceRedraw(): Promise<void> {
    await this.redrawCanvas();
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