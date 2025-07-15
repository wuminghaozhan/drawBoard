import type { DrawAction } from '../tools/DrawTool';
import type { TextAction } from '../tools/TextTool';
import type { DrawEvent } from '../events/EventManager';
import type { SelectionBox } from '../core/SelectionManager';
import type { ToolManager, ToolType } from '../tools/ToolManager';
import type { CanvasEngine } from '../core/CanvasEngine';
import type { HistoryManager } from '../history/HistoryManager';
import type { SelectionManager } from '../core/SelectionManager';

/**
 * 绘制处理器 - 负责处理绘制相关的逻辑
 */
export class DrawingHandler {
  private currentAction: DrawAction | null = null;
  private isDrawing: boolean = false;
  private isSelecting: boolean = false;
  private needsRedraw: boolean = false;

  constructor(
    private canvasEngine: CanvasEngine,
    private toolManager: ToolManager,
    private historyManager: HistoryManager,
    private selectionManager: SelectionManager,
    private onStateChange?: () => void
  ) {}

  // 开始绘制
  public handleDrawStart(event: DrawEvent): void {
    this.isDrawing = true;
    this.startAction(event.point);
  }

  // 绘制移动
  public handleDrawMove(event: DrawEvent): void {
    if (!this.isDrawing) return;
    
    const toolType = this.toolManager.getCurrentToolType();
    
    // 文字工具不需要移动事件
    if (toolType === 'text') return;
    
    this.updateAction(event.point);
    this.scheduleRedraw();
  }

  // 结束绘制
  public handleDrawEnd(): void {
    if (this.isDrawing && this.currentAction) {
      this.finishAction();
    }
    this.isDrawing = false;
  }

  // 开始动作
  private startAction(point: { x: number; y: number }): void {
    const currentTool = this.toolManager.getCurrentTool();
    if (!currentTool) {
      console.warn('当前工具未找到');
      return;
    }

    const toolType = this.toolManager.getCurrentToolType();
    console.log('开始绘制动作:', toolType, point);
    
    // 选择工具特殊处理
    if (toolType === 'select') {
      this.isSelecting = true;
      this.selectionManager.clearSelection();
      this.performRedraw();
    }
    
    // 文字工具需要特殊处理
    if (toolType === 'text') {
      this.handleTextInput(point);
      return;
    }
    
    // 创建动作，添加时间戳
    const timestamp = Date.now();
    this.currentAction = {
      id: timestamp.toString(),
      type: toolType,
      points: [{ ...point, timestamp }],
      context: this.canvasEngine.getContext(),
      timestamp
    };
    
    console.log('创建动作:', this.currentAction);
  }

  // 处理文字输入
  private handleTextInput(point: { x: number; y: number }): void {
    const text = prompt('请输入文字：', '文字');
    if (text !== null) {
      this.currentAction = {
        id: Date.now().toString(),
        type: 'text',
        points: [point],
        context: this.canvasEngine.getContext(),
        timestamp: Date.now(),
        text: text,
        fontSize: 16,
        fontFamily: 'Arial',
        textAlign: 'left' as CanvasTextAlign,
        textBaseline: 'top' as CanvasTextBaseline
      } as TextAction;
      this.finishAction();
    }
  }

  // 更新动作
  private updateAction(point: { x: number; y: number }): void {
    if (this.currentAction) {
      const toolType = this.toolManager.getCurrentToolType();
      
      if (toolType === 'text') {
        return;
      } else if (toolType === 'select') {
        if (this.currentAction.points.length === 1) {
          this.currentAction.points.push({ ...point, timestamp: Date.now() });
        } else {
          this.currentAction.points[this.currentAction.points.length - 1] = { ...point, timestamp: Date.now() };
        }
      } else {
        this.currentAction.points.push({ ...point, timestamp: Date.now() });
      }
      
      this.updateInteractionLayer();
    }
  }

  // 更新交互层
  private updateInteractionLayer(): void {
    if (this.currentAction) {
      this.canvasEngine.clear('interaction');
      this.drawAction(this.currentAction, 'interaction');
    }
  }

  // 完成动作
  private finishAction(): void {
    if (this.currentAction) {
      const toolType = this.toolManager.getCurrentToolType();
      
      if (toolType === 'select' && this.isSelecting) {
        this.handleSelectionFinish();
        return;
      }
      
      console.log('=== 完成绘制动作 ===', this.currentAction);
      this.historyManager.addAction(this.currentAction);
      this.currentAction = null;
      
      this.canvasEngine.clear('interaction');
      
      console.log('=== 强制重绘 ===');
      this.needsRedraw = true;
      this.performRedraw();
      
      this.onStateChange?.();
    }
  }

  // 处理选择完成
  private handleSelectionFinish(): void {
    if (!this.currentAction || this.currentAction.points.length < 2) {
      this.isSelecting = false;
      this.currentAction = null;
      this.canvasEngine.clear('interaction');
      return;
    }

    const start = this.currentAction.points[0];
    const end = this.currentAction.points[this.currentAction.points.length - 1];
    const selectionBox: SelectionBox = {
      left: Math.min(start.x, end.x),
      top: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y)
    };

    const history = this.historyManager.getHistory();
    const selectedIds = this.selectionManager.detectSelection(selectionBox, history);
    
    console.log('选择检测结果:', selectedIds.length, '个动作被选中');
    
    this.currentAction.selected = selectedIds.length > 0;
    this.currentAction.selectedActions = selectedIds;
    this.currentAction.selectionBox = selectionBox;
    
    this.selectionManager.setSelectionBox(selectionBox);
    
    this.isSelecting = false;
    this.currentAction = null;
    
    this.performRedraw();
  }

  // 调度重绘
  private scheduleRedraw(): void {
    if (!this.needsRedraw) {
      this.needsRedraw = true;
      requestAnimationFrame(() => {
        this.performRedraw();
      });
    }
  }

  // 执行重绘
  public performRedraw(): void {
    if (!this.needsRedraw) return;
    console.log('=== 执行重绘 ===');
    
    this.canvasEngine.clear('interaction');
    this.canvasEngine.clear('draw');
    
    const history = this.historyManager.getHistory();
    console.log('=== 重绘历史记录 ===', history.length, '个动作');
    history.forEach(action => {
      this.drawAction(action, 'draw');
    });
    
    if (this.currentAction) {
      console.log('=== 绘制当前操作到交互层 ===');
      this.drawAction(this.currentAction, 'interaction');
    }
    
    this.drawSelectionHandles();
    
    this.needsRedraw = false;
  }

  // 绘制选择手柄
  private drawSelectionHandles(): void {
    if (!this.selectionManager.hasSelection()) return;
    
    const ctx = this.canvasEngine.getInteractionLayer();
    this.selectionManager.drawHandles(ctx);
  }

  // 绘制动作
  private drawAction(action: DrawAction, layerName: string = 'draw'): void {
    try {
      let ctx: CanvasRenderingContext2D;
      if (layerName === 'draw') {
        ctx = this.canvasEngine.getDrawLayer();
      } else if (layerName === 'interaction') {
        ctx = this.canvasEngine.getInteractionLayer();
      } else {
        ctx = this.canvasEngine.getContext2D();
      }
      
      const canvas = ctx.canvas;
      console.log(`绘制到${layerName}层, canvas尺寸:`, canvas.width, 'x', canvas.height);
      
      if (action.points.length > 0) {
        const firstPoint = action.points[0];
        console.log(`第一个点坐标:`, firstPoint.x, firstPoint.y);
      }
      
      const toolType = action.type as ToolType;
      const currentTool = this.toolManager.getTool(toolType);
      if (currentTool) {
        console.log('绘制动作:', toolType, action.points.length, '个点');
        currentTool.draw(ctx, action);
      } else {
        console.warn('未找到工具:', toolType);
      }
    } catch (error) {
      console.error('绘制动作失败:', error);
    }
  }

  // 获取状态
  public getState() {
    return {
      isDrawing: this.isDrawing,
      isSelecting: this.isSelecting,
      hasCurrentAction: !!this.currentAction,
      needsRedraw: this.needsRedraw
    };
  }

  // 强制重绘
  public forceRedraw(): void {
    this.needsRedraw = true;
    this.performRedraw();
  }

  // 清理
  public cleanup(): void {
    this.currentAction = null;
    this.isDrawing = false;
    this.isSelecting = false;
    this.needsRedraw = false;
  }
} 