import type { DrawAction } from '../tools/DrawTool';
import type { TextAction } from '../tools/TextTool';
import type { DrawEvent } from '../events/EventManager';
import type { SelectionBox } from '../core/SelectionManager';
import type { ToolManager, ToolType } from '../tools/ToolManager';
import type { CanvasEngine } from '../core/CanvasEngine';
import type { HistoryManager } from '../history/HistoryManager';
import type { SelectionManager } from '../core/SelectionManager';
import type { PerformanceManager } from '../core/PerformanceManager';

/**
 * 绘制处理器 - 负责处理绘制相关的逻辑
 * 
 * 职责：
 * - 处理绘制事件（开始、移动、结束）
 * - 管理当前绘制动作
 * - 处理重绘逻辑
 * - 处理特殊工具逻辑（文字、选择）
 * - 管理绘制状态
 */
export class DrawingHandler {
  // ============================================
  // 状态管理
  // ============================================
  private currentAction: DrawAction | null = null;
  private isDrawing: boolean = false;
  private isSelecting: boolean = false;
  private needsRedraw: boolean = false;

  // 依赖的管理器
  private canvasEngine: CanvasEngine;
  private toolManager: ToolManager;
  private historyManager: HistoryManager;
  private selectionManager: SelectionManager;
  private performanceManager: PerformanceManager;
  private onStateChange?: () => void;

  constructor(
    canvasEngine: CanvasEngine,
    toolManager: ToolManager,
    historyManager: HistoryManager,
    selectionManager: SelectionManager,
    performanceManager: PerformanceManager,
    onStateChange?: () => void
  ) {
    this.canvasEngine = canvasEngine;
    this.toolManager = toolManager;
    this.historyManager = historyManager;
    this.selectionManager = selectionManager;
    this.performanceManager = performanceManager;
    this.onStateChange = onStateChange;
  }

  // ============================================
  // 公共接口 - 绘制事件处理
  // ============================================

  /**
   * 处理绘制开始事件
   */
  public handleDrawStart(event: DrawEvent): void {
    this.isDrawing = true;
    this.startAction(event.point);
  }

  /**
   * 处理绘制移动事件
   */
  public handleDrawMove(event: DrawEvent): void {
    if (!this.isDrawing) return;
    
    const toolType = this.toolManager.getCurrentToolType();
    
    // 文字工具不需要移动事件
    if (toolType === 'text') return;
    
    this.updateAction(event.point);
    this.scheduleRedraw();
  }

  /**
   * 处理绘制结束事件
   */
  public handleDrawEnd(): void {
    if (this.isDrawing && this.currentAction) {
      this.finishAction();
    }
    this.isDrawing = false;
  }

  // ============================================
  // 公共接口 - 状态管理
  // ============================================

  /**
   * 获取绘制状态
   */
  public getDrawingState(): {
    isDrawing: boolean;
    isSelecting: boolean;
    hasCurrentAction: boolean;
    currentToolType: ToolType;
  } {
    return {
      isDrawing: this.isDrawing,
      isSelecting: this.isSelecting,
      hasCurrentAction: this.currentAction !== null,
      currentToolType: this.toolManager.getCurrentToolType()
    };
  }

  /**
   * 清除当前动作和交互层
   */
  public clearCurrentAction(): void {
    this.currentAction = null;
    this.canvasEngine.clear('interaction');
  }

  /**
   * 强制重绘
   */
  public forceRedraw(): void {
    this.needsRedraw = true;
    this.performRedraw();
  }

  /**
   * 调度重绘
   */
  public scheduleRedraw(): void {
    if (!this.needsRedraw) {
      this.needsRedraw = true;
      requestAnimationFrame(() => {
        this.performRedraw();
      });
    }
  }

  // ============================================
  // 内部方法 - 动作管理
  // ============================================

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
      this.startSelection(point);
      return;
    }
    
    // 文字工具特殊处理
    if (toolType === 'text') {
      this.handleTextInput(point);
      return;
    }
    
    // 创建普通绘制动作
    this.createDrawAction(point, toolType);
  }

  private startSelection(point: { x: number; y: number }): void {
    this.isSelecting = true;
    this.selectionManager.clearSelection();
    this.performRedraw();
    
    const timestamp = Date.now();
    this.currentAction = {
      id: timestamp.toString(),
      type: 'select',
      points: [{ ...point, timestamp }],
      context: this.canvasEngine.getContext(),
      timestamp
    };
  }

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

  private createDrawAction(point: { x: number; y: number }, toolType: ToolType): void {
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

  private updateAction(point: { x: number; y: number }): void {
    if (!this.currentAction) return;
    
    const toolType = this.toolManager.getCurrentToolType();
    
    if (toolType === 'text') {
      return; // 文字工具不收集移动点
    } else if (toolType === 'select') {
      this.updateSelectionAction(point);
    } else {
      // 其他工具正常收集点
      this.currentAction.points.push({ ...point, timestamp: Date.now() });
    }
    
    // 实时更新交互层显示
    this.updateInteractionLayer();
  }

  private updateSelectionAction(point: { x: number; y: number }): void {
    if (!this.currentAction) return;
    
    // 选择工具需要至少两个点
    if (this.currentAction.points.length === 1) {
      this.currentAction.points.push({ ...point, timestamp: Date.now() });
    } else {
      // 更新最后一个点
      this.currentAction.points[this.currentAction.points.length - 1] = { ...point, timestamp: Date.now() };
    }
  }

  private updateInteractionLayer(): void {
    if (this.currentAction) {
      // 清除交互层
      this.canvasEngine.clear('interaction');
      // 绘制当前操作到交互层
      this.drawAction(this.currentAction, 'interaction');
    }
  }

  private finishAction(): void {
    if (!this.currentAction) return;
    
    const toolType = this.toolManager.getCurrentToolType();
    
    // 选择工具特殊处理
    if (toolType === 'select' && this.isSelecting) {
      this.finishSelection();
      return;
    }
    
    console.log('=== 完成绘制动作 ===', this.currentAction);
    
    // 添加到历史记录
    this.historyManager.addAction(this.currentAction);
    this.currentAction = null;
    
    // 清除交互层并重绘
    this.canvasEngine.clear('interaction');
    this.needsRedraw = true;
    this.performRedraw();
    
    // 触发状态更新事件
    this.onStateChange?.();
  }

  private finishSelection(): void {
    if (!this.currentAction || this.currentAction.points.length < 2) {
      this.isSelecting = false;
      this.currentAction = null;
      this.canvasEngine.clear('interaction');
      return;
    }

    // 计算选择框
    const start = this.currentAction.points[0];
    const end = this.currentAction.points[this.currentAction.points.length - 1];
    const selectionBox: SelectionBox = {
      left: Math.min(start.x, end.x),
      top: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y)
    };

    // 检测选择
    const history = this.historyManager.getHistory();
    const selectedIds = this.selectionManager.detectSelection(selectionBox, history);
    
    console.log('选择检测结果:', selectedIds.length, '个动作被选中');
    
    // 更新选择状态
    this.currentAction.selected = selectedIds.length > 0;
    this.currentAction.selectedActions = selectedIds;
    this.currentAction.selectionBox = selectionBox;
    
    // 设置选择框到选择管理器
    this.selectionManager.setSelectionBox(selectionBox);
    
    this.isSelecting = false;
    this.currentAction = null;
    
    // 重绘显示选择结果
    this.performRedraw();
  }

  // ============================================
  // 内部方法 - 重绘逻辑
  // ============================================

  private performRedraw(): void {
    if (!this.needsRedraw) return;
    
    console.log('=== 执行重绘 ===');
    
    // 清理层
    this.canvasEngine.clear('interaction');
    this.canvasEngine.clear('draw');
    
    // 重绘历史记录
    this.redrawHistory();
    
    // 绘制当前操作到交互层
    if (this.currentAction) {
      console.log('=== 绘制当前操作到交互层 ===');
      this.drawAction(this.currentAction, 'interaction');
    }
    
    // 绘制选择手柄
    this.drawSelectionHandles();
    
    this.needsRedraw = false;
  }

  private redrawHistory(): void {
    const history = this.historyManager.getHistory();
    console.log('=== 重绘历史记录 ===', history.length, '个动作');
    
    const drawCtx = this.canvasEngine.getDrawLayer();
    const canvas = drawCtx.canvas;
    
    history.forEach(action => {
      // 尝试使用预渲染缓存
      if (this.performanceManager.shouldUseCache(action)) {
        console.log('使用缓存绘制:', action.id);
        this.performanceManager.drawFromCache(drawCtx, action);
      } else {
        console.log('实时绘制:', action.id);
        this.drawAction(action, 'draw');
        
        // 绘制完成后，检查是否应该创建缓存
        if (this.performanceManager.shouldCache(action)) {
          console.log('创建缓存:', action.id);
          const cache = this.performanceManager.createCache(action, canvas);
          if (cache) {
            action.preRenderedCache = cache;
          }
        }
      }
    });
  }

  private drawSelectionHandles(): void {
    if (!this.selectionManager.hasSelection()) return;
    
    const ctx = this.canvasEngine.getInteractionLayer();
    this.selectionManager.drawHandles(ctx);
  }

  // ============================================
  // 内部方法 - 绘制动作
  // ============================================

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
} 