import type { ToolManager } from '../tools/ToolManager';
import type { CanvasEngine } from '../core/CanvasEngine';
import type { HistoryManager } from '../history/HistoryManager';
import type { DrawAction } from '../tools/DrawTool';
import type { PerformanceManager } from '../core/PerformanceManager';
import type { SelectionManager } from '../core/SelectionManager';
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
  private onStateChange: () => void;

  // 交互状态
  private isDrawing: boolean = false;
  private currentAction: DrawAction | null = null;

  constructor(
    canvasEngine: CanvasEngine,
    toolManager: ToolManager,
    historyManager: HistoryManager,
    selectionManager: SelectionManager,
    performanceManager: PerformanceManager,
    onStateChange: () => void
  ) {
    this.canvasEngine = canvasEngine;
    this.toolManager = toolManager;
    this.historyManager = historyManager;
    this.selectionManager = selectionManager;
    this.performanceManager = performanceManager;
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
    // 使用Canvas引擎的绘制方法
    requestAnimationFrame(() => {
      this.redrawCanvas();
    });
  }

  /**
   * 重绘Canvas
   */
  private redrawCanvas(): void {
    const canvas = this.canvasEngine.getCanvas();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 绘制历史记录
    const actions = this.historyManager.getAllActions();
    for (const action of actions) {
      this.drawAction(ctx, action);
    }

    // 绘制当前动作
    if (this.currentAction && this.currentAction.points.length > 0) {
      this.drawAction(ctx, this.currentAction);
    }
  }

  /**
   * 绘制单个动作
   */
  private drawAction(ctx: CanvasRenderingContext2D, action: DrawAction): void {
    const tool = this.toolManager.getCurrentToolInstance();
    if (tool && tool.draw) {
      tool.draw(ctx, action);
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
   * 强制重绘
   */
  public forceRedraw(): void {
    this.redrawCanvas();
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