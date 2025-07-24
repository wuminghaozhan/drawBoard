import { DrawTool } from './DrawTool';
import type { DrawAction } from './DrawTool';
import type { Point } from '../core/CanvasEngine';
import { ControlPointGenerator } from './transform/ControlPointGenerator';
import { 
  ControlPointType, 
  type ControlPoint, 
  type TransformOperation, 
  type BoundingBox,
  CONTROL_POINT_CONFIG 
} from './transform/TransformTypes';

/**
 * 变换工具 - 重构版本
 * 
 * 使用模块化设计，将复杂的变换逻辑分离到专门的模块中：
 * - ControlPointGenerator: 控制点生成和管理
 * - TransformTypes: 类型定义和配置
 * 
 * 重构后的优势：
 * - 单一职责：专注于变换协调逻辑
 * - 模块化：控制点生成和类型定义分离
 * - 易于维护：功能修改影响范围小
 * - 可复用性：模块可被其他工具复用
 * 
 * @example
 * ```typescript
 * const transformTool = new TransformToolRefactored();
 * transformTool.setSelectedAction(action);
 * transformTool.generateControlPoints();
 * ```
 */
export class TransformToolRefactored extends DrawTool {
  private selectedAction: DrawAction | null = null;
  private controlPoints: ControlPoint[] = [];
  private activeOperation: TransformOperation | null = null;
  private keyboardListenerAdded: boolean = false;
  
  // 使用模块化组件
  private controlPointGenerator: ControlPointGenerator;

  constructor() {
    super('变换', 'transform');
    
    // 初始化模块化组件
    this.controlPointGenerator = new ControlPointGenerator({
      controlPointSize: 8,
      controlPointColor: '#007AFF',
      controlPointBorderColor: '#FFFFFF',
      controlPointHoverColor: '#0056CC',
      selectionBoxColor: 'rgba(0, 122, 255, 0.2)',
      selectionBoxLineWidth: 2,
      keyboardMoveStep: 1,
      showBoundingBox: true,
      enableKeyboardControl: true
    });
    
    this.setupKeyboardListeners();
  }

  /**
   * 获取动作类型
   */
  public getActionType(): string {
    return 'transform';
  }

  // ============================================
  // 公共接口方法
  // ============================================

  /**
   * 设置要变换的图形
   */
  public setSelectedAction(action: DrawAction): void {
    this.selectedAction = action;
    this.generateControlPoints();
  }

  /**
   * 获取当前选中的图形
   */
  public getSelectedAction(): DrawAction | null {
    return this.selectedAction;
  }

  /**
   * 获取控制点列表
   */
  public getControlPoints(): ControlPoint[] {
    return [...this.controlPoints];
  }

  /**
   * 根据点位置获取控制点
   */
  public getControlPointAt(point: Point): ControlPoint | null {
    return this.findControlPointAt(point);
  }

  /**
   * 检查点是否在选中图形内
   */
  public isPointInSelectedShape(point: Point): boolean {
    return this.isPointInside(point);
  }

  /**
   * 开始移动操作
   */
  public startMove(point: Point): void {
    if (this.selectedAction) {
      this.activeOperation = {
        type: 'move',
        actionId: this.selectedAction.id,
        startPoints: [...this.selectedAction.points],
        controlPoint: this.controlPoints[0], // 使用第一个控制点作为移动控制点
        startBounds: this.calculateBounds(this.selectedAction.points),
        startPoint: point,
        currentPoint: point
      };
    }
  }



  /**
   * 检查是否有选中的图形
   */
  public hasSelection(): boolean {
    return this.selectedAction !== null;
  }

  /**
   * 清除选择
   */
  public clearSelection(): void {
    this.selectedAction = null;
    this.controlPoints = [];
    this.activeOperation = null;
  }

  // ============================================
  // 控制点管理
  // ============================================

  /**
   * 生成控制点
   */
  private generateControlPoints(): void {
    if (!this.selectedAction) {
      this.controlPoints = [];
      return;
    }

    this.controlPoints = this.controlPointGenerator.generateControlPoints(
      this.selectedAction
    );
  }

  /**
   * 根据位置查找控制点
   */
  public findControlPointAt(point: Point): ControlPoint | null {
    const tolerance = CONTROL_POINT_CONFIG.SIZE + 2;
    
    return this.controlPoints.find(cp => 
      Math.abs(cp.x - point.x) <= tolerance && 
      Math.abs(cp.y - point.y) <= tolerance
    ) || null;
  }

  /**
   * 检查点是否在选中图形内部
   */
  public isPointInside(point: Point): boolean {
    if (!this.selectedAction) return false;
    
    const bounds = this.calculateBounds(this.selectedAction.points);
    return point.x >= bounds.x && 
           point.x <= bounds.x + bounds.width &&
           point.y >= bounds.y && 
           point.y <= bounds.y + bounds.height;
  }

  // ============================================
  // 变换操作
  // ============================================

  /**
   * 开始变换操作
   */
  public startTransform(controlPoint: ControlPoint, startPoint: Point): void {
    if (!this.selectedAction) return;

    this.activeOperation = {
      type: this.getOperationType(controlPoint.type),
      actionId: this.selectedAction.id,
      startPoints: [...this.selectedAction.points],
      controlPoint,
      startBounds: this.calculateBounds(this.selectedAction.points),
      startPoint,
      currentPoint: startPoint,

    };
  }

  /**
   * 更新变换操作
   */
  public updateTransform(currentPoint: Point): DrawAction | null {
    if (!this.activeOperation || !this.selectedAction) return null;

    this.activeOperation.currentPoint = currentPoint;
    
    // 计算新的点位置
    const newPoints = this.calculateTransformedPoints(
      this.activeOperation,
      currentPoint
    );

    if (newPoints) {
      // 更新图形点
      this.selectedAction.points = newPoints;
      
      // 重新生成控制点
      this.generateControlPoints();
      
      return this.selectedAction;
    }

    return null;
  }

  /**
   * 完成变换操作
   */
  public finishTransform(): DrawAction | null {
    if (!this.activeOperation || !this.selectedAction) return null;

    const result = { ...this.selectedAction };
    this.activeOperation = null;
    
    return result;
  }

  // ============================================
  // 键盘控制
  // ============================================

  /**
   * 处理键盘移动
   */
  public handleKeyboardMove(direction: 'up' | 'down' | 'left' | 'right', step: number = 1): DrawAction | null {
    if (!this.selectedAction) return null;

    const delta = { x: 0, y: 0 };
    
    switch (direction) {
      case 'up':    delta.y = -step; break;
      case 'down':  delta.y = step; break;
      case 'left':  delta.x = -step; break;
      case 'right': delta.x = step; break;
    }

    // 移动所有点
    this.selectedAction.points = this.selectedAction.points.map(point => ({
      ...point,
      x: point.x + delta.x,
      y: point.y + delta.y
    }));

    // 重新生成控制点
    this.generateControlPoints();

    return this.selectedAction;
  }

  // ============================================
  // 绘制方法
  // ============================================

  /**
   * 绘制变换控制界面
   */
  public draw(ctx: CanvasRenderingContext2D): void {
    if (!this.selectedAction) return;

    // 绘制选择高亮
    this.drawSelectionHighlight(ctx);
    
    // 绘制控制点
    this.drawControlPoints(ctx);
  }

  /**
   * 绘制选择高亮边框
   */
  private drawSelectionHighlight(ctx: CanvasRenderingContext2D): void {
    if (!this.selectedAction) return;

    const bounds = this.calculateBounds(this.selectedAction.points);
    
    ctx.save();
    ctx.strokeStyle = CONTROL_POINT_CONFIG.HIGHLIGHT_COLOR;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    
    ctx.strokeRect(bounds.x - 2, bounds.y - 2, bounds.width + 4, bounds.height + 4);
    
    ctx.restore();
  }

  /**
   * 绘制控制点
   */
  private drawControlPoints(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    
    this.controlPoints.forEach(cp => {
      const size = CONTROL_POINT_CONFIG.SIZE;
      const halfSize = size / 2;
      
      // 绘制控制点背景
      ctx.fillStyle = CONTROL_POINT_CONFIG.BACKGROUND_COLOR;
      ctx.fillRect(cp.x - halfSize, cp.y - halfSize, size, size);
      
      // 绘制控制点边框
      ctx.strokeStyle = CONTROL_POINT_CONFIG.BORDER_COLOR;
      ctx.lineWidth = 1;
      ctx.strokeRect(cp.x - halfSize, cp.y - halfSize, size, size);
    });
    
    ctx.restore();
  }

  // ============================================
  // 辅助方法
  // ============================================

  /**
   * 根据控制点类型确定操作类型
   */
  private getOperationType(controlPointType: string): 'move' | 'resize' | 'reshape' {
    if (controlPointType === ControlPointType.MOVE) {
      return 'move';
    } else if (controlPointType.startsWith('LINE_')) {
      return 'reshape';
    } else {
      return 'resize';
    }
  }

  /**
   * 计算变换后的点位置
   */
  private calculateTransformedPoints(operation: TransformOperation, currentPoint: Point): Point[] | null {
    const { type, startPoints, controlPoint, startBounds } = operation;
    
    switch (type) {
      case 'move':
        return this.calculateMovePoints(startPoints, operation.startPoint, currentPoint);
      case 'resize':
        return this.calculateResizePoints(startPoints, controlPoint, startBounds, currentPoint);
      case 'reshape':
        return this.calculateReshapePoints(startPoints, controlPoint, currentPoint);
      default:
        return null;
    }
  }

  /**
   * 计算移动后的点位置
   */
  private calculateMovePoints(startPoints: Point[], startPoint: Point, currentPoint: Point): Point[] {
    const deltaX = currentPoint.x - startPoint.x;
    const deltaY = currentPoint.y - startPoint.y;
    
    return startPoints.map(point => ({
      ...point,
      x: point.x + deltaX,
      y: point.y + deltaY
    }));
  }

  /**
   * 计算缩放后的点位置
   */
  private calculateResizePoints(
    startPoints: Point[], 
    controlPoint: ControlPoint, 
    startBounds: BoundingBox, 
    currentPoint: Point
  ): Point[] {
    // 委托给控制点生成器处理复杂的缩放逻辑
    return this.controlPointGenerator.calculateResizePoints(
      startPoints,
      controlPoint,
      startBounds,
      currentPoint
    );
  }

  /**
   * 计算重塑后的点位置
   */
  private calculateReshapePoints(startPoints: Point[], controlPoint: ControlPoint, currentPoint: Point): Point[] {
    // 委托给控制点生成器处理重塑逻辑
    return this.controlPointGenerator.calculateReshapePoints(
      startPoints,
      controlPoint,
      currentPoint
    );
  }

  /**
   * 计算边界框
   */
  private calculateBounds(points: Point[]): BoundingBox {
    if (points.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0, centerX: 0, centerY: 0 };
    }

    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2
    };
  }

  /**
   * 设置键盘监听器
   */
  private setupKeyboardListeners(): void {
    if (this.keyboardListenerAdded) return;
    
    document.addEventListener('keydown', this.handleKeydown.bind(this));
    this.keyboardListenerAdded = true;
  }

  /**
   * 处理键盘事件
   */
  private handleKeydown(event: KeyboardEvent): void {
    if (!this.selectedAction) return;

    const step = event.shiftKey ? 10 : 1;
    let handled = false;

    switch (event.key) {
      case 'ArrowUp':
        this.handleKeyboardMove('up', step);
        handled = true;
        break;
      case 'ArrowDown':
        this.handleKeyboardMove('down', step);
        handled = true;
        break;
      case 'ArrowLeft':
        this.handleKeyboardMove('left', step);
        handled = true;
        break;
      case 'ArrowRight':
        this.handleKeyboardMove('right', step);
        handled = true;
        break;
      case 'Escape':
        this.clearSelection();
        handled = true;
        break;
    }

    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  /**
   * 销毁资源
   */
  public destroy(): void {
    if (this.keyboardListenerAdded) {
      document.removeEventListener('keydown', this.handleKeydown.bind(this));
      this.keyboardListenerAdded = false;
    }
    
    this.clearSelection();
  }
}

// 导出重构版本
export { TransformToolRefactored as TransformTool }; 

// 导出需要的类型
export type { ControlPoint } from './transform/TransformTypes'; 