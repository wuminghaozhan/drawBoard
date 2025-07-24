import type { ToolManager } from '../tools/ToolManager';
import type { CanvasEngine } from '../core/CanvasEngine';
import type { HistoryManager } from '../history/HistoryManager';
import type { DrawAction } from '../tools/DrawTool';
import type { PerformanceManager } from '../core/PerformanceManager';
import type { SelectionManager } from '../core/SelectionManager';
import type { VirtualLayerManager } from '../core/VirtualLayerManager';
import type { DrawEvent } from '../events/EventManager';
import { logger } from '../utils/Logger';

// 定义必要的接口
interface Point {
  x: number;
  y: number;
}

/**
 * 绘制处理器 - 处理绘制相关的逻辑
 */
export class DrawingHandler {
  private toolManager: ToolManager;
  private canvasEngine: CanvasEngine;
  private historyManager: HistoryManager;
  private performanceManager: PerformanceManager;
  private selectionManager: SelectionManager;
  private virtualLayerManager?: VirtualLayerManager;
  private onStateChange: () => void;

  // 交互状态
  private isDrawing: boolean = false;
  private currentAction: DrawAction | null = null;

  // 重绘调度标志
  private redrawScheduled: boolean = false;

  constructor(
    canvasEngine: CanvasEngine,
    toolManager: ToolManager,
    historyManager: HistoryManager,
    selectionManager: SelectionManager,
    performanceManager: PerformanceManager,
    onStateChange: () => void,
    virtualLayerManager?: VirtualLayerManager
  ) {
    this.canvasEngine = canvasEngine;
    this.toolManager = toolManager;
    this.historyManager = historyManager;
    this.selectionManager = selectionManager;
    this.performanceManager = performanceManager;
    this.virtualLayerManager = virtualLayerManager;
    this.onStateChange = onStateChange;
  }

  /**
   * 处理绘制开始事件
   */
  public handleDrawStart(event: DrawEvent): void {
    if (this.isDrawing) return;
    const point = this.getEventPoint(event);
    const tool = this.toolManager.getCurrentToolInstance();
    
    if (!tool) return;

    this.isDrawing = true;
    // 创建新的绘制动作
    this.currentAction = this.createDrawAction(point);
    
    logger.debug('开始绘制', { toolType: this.toolManager.getCurrentTool(), point });
    this.onStateChange();
  }

  /**
   * 处理绘制移动事件
   */
  public handleDrawMove(event: DrawEvent): void {
    if (!this.isDrawing || !this.currentAction) return;

    const point = this.getEventPoint(event);
    
    // 添加点到当前动作
    this.currentAction.points.push(point);
    this.scheduleRedraw();
  }

  /**
   * 处理绘制结束事件
   */
  public handleDrawEnd(event: DrawEvent): void {
    if (!this.isDrawing || !this.currentAction) return;

    const point = this.getEventPoint(event);
    
    // 添加最后一个点
    this.currentAction.points.push(point);
    
    // 处理虚拟图层分配
    if (this.virtualLayerManager) {
      this.virtualLayerManager.handleNewAction(this.currentAction);
    }
    
    // 保存到历史记录
    this.historyManager.addAction(this.currentAction);
    
    this.isDrawing = false;
    this.currentAction = null;
    
    logger.debug('结束绘制');
    this.onStateChange();
  }

  /**
   * 创建绘制动作
   */
  private createDrawAction(startPoint: Point): DrawAction {
    return {
      id: Date.now().toString(),
      type: this.toolManager.getCurrentTool(),
      points: [startPoint],
      context: {
        strokeStyle: this.canvasEngine.getContext().strokeStyle,
        lineWidth: this.canvasEngine.getContext().lineWidth,
        fillStyle: this.canvasEngine.getContext().fillStyle
      },
      timestamp: Date.now()
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
   * 从事件获取坐标点
   */
  private getEventPoint(event: DrawEvent): Point {
    return {
      x: (event.point?.x || 0),
      y: (event.point?.y || 0)
    };
  }

  /**
   * 调度重绘
   */
  private scheduleRedraw(): void {
    // 使用 requestAnimationFrame 进行节流
    if (!this.redrawScheduled) {
      this.redrawScheduled = true;
      requestAnimationFrame(async () => {
        await this.redrawCanvas();
        this.redrawScheduled = false;
      });
    }
  }

  /**
   * 重绘Canvas
   */
  private async redrawCanvas(): Promise<void> {
    const canvas = this.canvasEngine.getCanvas();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 获取所有历史动作
    const allActions = this.historyManager.getAllActions();
    
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
   * 绘制单个动作
   */
  private async drawAction(ctx: CanvasRenderingContext2D, action: DrawAction): Promise<void> {
    try {
      // 使用动作自己的工具类型，而不是当前选中的工具
      const tool = await this.toolManager.getTool(action.type);
      if (tool && tool.draw) {
        tool.draw(ctx, action);
      }
    } catch (error) {
      logger.error(`绘制动作失败，工具类型: ${action.type}`, error);
    }
  }

  /**
   * 获取绘制状态（用于StateHandler）
   */
  public getDrawingState() {
    return {
      isDrawing: this.isDrawing,
      isSelecting: false, // 当前简化版本不支持选择
      hasCurrentAction: this.currentAction !== null,
      currentToolType: this.toolManager.getCurrentTool()
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
   * 销毁处理器
   */
  public destroy(): void {
    this.isDrawing = false;
    this.currentAction = null;
    logger.debug('DrawingHandler已销毁');
  }
} 