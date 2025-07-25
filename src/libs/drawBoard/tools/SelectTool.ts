import { DrawTool, type DrawAction } from './DrawTool';
import { TransformToolRefactored } from './TransformToolRefactored';
import type { ControlPoint } from './transform/TransformTypes';
import type { Point } from '../core/CanvasEngine';
import { logger } from '../utils/Logger';

/**
 * 选择动作接口
 * 继承自DrawAction，添加选择相关的属性
 */
export interface SelectAction extends DrawAction {
  /** 选中的动作ID列表 */
  selectedActionIds?: string[];
  /** 选中的动作列表 */
  selectedActions?: DrawAction[];
  /** 选择框的边界 */
  selectionBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** 选择模式 */
  selectionMode?: 'single' | 'multiple' | 'box';
}

// 现代化选择框样式配置
interface SelectionBoxStyle {
  strokeColor: string;
  strokeWidth: number;
  strokeDashArray: number[];
  fillColor: string;
  fillOpacity: number;
  cornerRadius: number;
  animationSpeed: number;
}

const modernSelectionStyle: SelectionBoxStyle = {
  strokeColor: '#007AFF',
  strokeWidth: 2,
  strokeDashArray: [8, 4],
  fillColor: '#007AFF',
  fillOpacity: 0.08,
  cornerRadius: 4,
  animationSpeed: 500
};

export class SelectTool extends DrawTool {
  private animationOffset: number = 0;
  private lastAnimationTime: number = 0;
  
  // 变换功能
  private transformTool: TransformToolRefactored;
  private isTransformMode: boolean = false;
  private selectedActionForTransform: DrawAction | null = null;
  private isDragging: boolean = false;
  private currentHoverControlPoint: ControlPoint | null = null;
  private dragStartPoint: Point | null = null;

  // 选择功能增强
  private allActions: DrawAction[] = []; // 当前图层的所有actions
  private selectedActions: DrawAction[] = []; // 当前选中的actions
  private isSelecting: boolean = false; // 是否正在选择
  private selectionStartPoint: Point | null = null; // 选择开始点
  private currentSelectionBounds: { x: number; y: number; width: number; height: number } | null = null;

  // 8个锚点相关
  private anchorPoints: Array<{ x: number; y: number; type: string; cursor: string }> = [];
  private isDraggingAnchor: boolean = false;
  private draggedAnchorIndex: number = -1;
  private anchorSize: number = 8; // 锚点大小
  private anchorTolerance: number = 6; // 锚点点击容差

  // 性能优化：边界框缓存
  private boundsCache: Map<string, { x: number; y: number; width: number; height: number }> = new Map();
  private lastAnchorUpdateTime: number = 0;
  private anchorUpdateInterval: number = 100; // 100ms更新间隔

  constructor() {
    super('选择', 'select');
    this.transformTool = new TransformToolRefactored();
  }

  /**
   * 设置当前图层的所有actions
   */
  public setLayerActions(actions: DrawAction[]): void {
    this.allActions = actions;
    
    // 清理不在当前图层中的选中actions
    this.selectedActions = this.selectedActions.filter(selectedAction => 
      actions.some(action => action.id === selectedAction.id)
    );
    
    // 如果选中的actions发生变化，更新变换模式
    if (this.selectedActions.length === 1) {
      this.enterTransformMode(this.selectedActions[0]);
    } else if (this.selectedActions.length === 0) {
      this.exitTransformMode();
    }
    
    // 清除缓存
    this.clearBoundsCache();
    
    logger.debug(`SelectTool: 设置图层actions，共${actions.length}个，当前选中${this.selectedActions.length}个`);
  }

  /**
   * 点击选择单个action
   */
  public selectActionAtPoint(point: Point, tolerance: number = 5): DrawAction | null {
    try {
      // 参数验证
      if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') {
        logger.warn('SelectTool: 无效的点坐标');
        return null;
      }

      if (tolerance < 0 || tolerance > 50) {
        tolerance = 5; // 使用默认值
        logger.warn('SelectTool: 容差值超出范围，使用默认值');
      }

      // 从后往前检查（后绘制的在上层）
      for (let i = this.allActions.length - 1; i >= 0; i--) {
        const action = this.allActions[i];
        if (action && this.isPointInAction(point, action, tolerance)) {
          this.selectSingleAction(action);
          return action;
        }
      }
      
      // 如果没有选中任何action，清空选择
      this.clearSelection();
      return null;
    } catch (error) {
      logger.error('SelectTool: 选择action时发生错误', error);
      return null;
    }
  }

  /**
   * 检查点是否在action内
   */
  private isPointInAction(point: Point, action: DrawAction, tolerance: number): boolean {
    try {
      if (!action || !action.points || action.points.length === 0) return false;

      // 根据action类型进行不同的碰撞检测
      switch (action.type) {
        case 'text':
          return this.isPointInTextAction(point, action, tolerance);
        case 'rect':
        case 'circle':
        case 'polygon':
          return this.isPointInShapeAction(point, action, tolerance);
        case 'line':
        case 'pen':
          return this.isPointInLineAction(point, action, tolerance);
        default:
          return this.isPointInBoundingBox(point, action, tolerance);
      }
    } catch (error) {
      logger.error('SelectTool: 检查点是否在action内时发生错误', error);
      return false;
    }
  }

  /**
   * 检查点是否在文字action内
   */
  private isPointInTextAction(point: Point, action: DrawAction, tolerance: number): boolean {
    if (action.points.length === 0) return false;
    
    const textPoint = action.points[0];
    const textAction = action as DrawAction & { text?: string; fontSize?: number };
    const text = textAction.text || '文字';
    const fontSize = textAction.fontSize || 16;
    
    // 简单的边界框检测
    const width = text.length * fontSize * 0.6; // 估算文字宽度
    const height = fontSize;
    
    return point.x >= textPoint.x - tolerance &&
           point.x <= textPoint.x + width + tolerance &&
           point.y >= textPoint.y - tolerance &&
           point.y <= textPoint.y + height + tolerance;
  }

  /**
   * 检查点是否在形状action内
   */
  private isPointInShapeAction(point: Point, action: DrawAction, tolerance: number): boolean {
    const bounds = this.getActionBoundingBox(action);
    return point.x >= bounds.x - tolerance &&
           point.x <= bounds.x + bounds.width + tolerance &&
           point.y >= bounds.y - tolerance &&
           point.y <= bounds.y + bounds.height + tolerance;
  }

  /**
   * 检查点是否在线条action内
   */
  private isPointInLineAction(point: Point, action: DrawAction, tolerance: number): boolean {
    if (action.points.length < 2) return false;
    
    // 检查点到线段的距离
    for (let i = 0; i < action.points.length - 1; i++) {
      const p1 = action.points[i];
      const p2 = action.points[i + 1];
      
      if (this.distanceToLineSegment(point, p1, p2) <= tolerance) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 计算点到线段的距离
   */
  private distanceToLineSegment(point: Point, lineStart: Point, lineEnd: Point): number {
    const A = point.x - lineStart.x;
    const B = point.y - lineStart.y;
    const C = lineEnd.x - lineStart.x;
    const D = lineEnd.y - lineStart.y;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    
    if (lenSq === 0) {
      return Math.sqrt(A * A + B * B);
    }
    
    let param = dot / lenSq;
    param = Math.max(0, Math.min(1, param));
    
    const x = lineStart.x + param * C;
    const y = lineStart.y + param * D;
    
    const dx = point.x - x;
    const dy = point.y - y;
    
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * 检查点是否在边界框内
   */
  private isPointInBoundingBox(point: Point, action: DrawAction, tolerance: number): boolean {
    const bounds = this.getActionBoundingBox(action);
    return point.x >= bounds.x - tolerance &&
           point.x <= bounds.x + bounds.width + tolerance &&
           point.y >= bounds.y - tolerance &&
           point.y <= bounds.y + bounds.height + tolerance;
  }

  /**
   * 获取action的边界框
   */
  private getActionBoundingBox(action: DrawAction): { x: number; y: number; width: number; height: number } {
    if (action.points.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    // 检查缓存
    const cacheKey = `${action.id}_${action.points.length}`;
    if (this.boundsCache.has(cacheKey)) {
      return this.boundsCache.get(cacheKey)!;
    }

    let minX = action.points[0].x;
    let minY = action.points[0].y;
    let maxX = action.points[0].x;
    let maxY = action.points[0].y;

    for (const point of action.points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }

    const bounds = {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };

    // 缓存结果
    this.boundsCache.set(cacheKey, bounds);
    return bounds;
  }

  /**
   * 清除边界框缓存
   */
  private clearBoundsCache(): void {
    this.boundsCache.clear();
  }

  /**
   * 清除特定action的边界框缓存
   */
  private clearActionBoundsCache(actionId: string): void {
    for (const key of this.boundsCache.keys()) {
      if (key.startsWith(actionId)) {
        this.boundsCache.delete(key);
      }
    }
  }

  /**
   * 选择单个action
   */
  private selectSingleAction(action: DrawAction): void {
    this.selectedActions = [action];
    this.enterTransformMode(action);
    logger.debug(`SelectTool: 选中单个action，ID: ${action.id}`);
  }

  /**
   * 框选多个actions
   */
  public selectActionsInBox(bounds: { x: number; y: number; width: number; height: number }): DrawAction[] {
    const selected: DrawAction[] = [];
    
    for (const action of this.allActions) {
      const actionBounds = this.getActionBoundingBox(action);
      
      // 检查边界框是否相交
      if (this.isBoundingBoxIntersect(bounds, actionBounds)) {
        selected.push(action);
      }
    }
    
    this.selectedActions = selected;
    logger.debug(`SelectTool: 框选到${selected.length}个actions`);
    return selected;
  }

  /**
   * 检查两个边界框是否相交
   */
  private isBoundingBoxIntersect(box1: { x: number; y: number; width: number; height: number }, 
                                box2: { x: number; y: number; width: number; height: number }): boolean {
    return box1.x < box2.x + box2.width &&
           box1.x + box1.width > box2.x &&
           box1.y < box2.y + box2.height &&
           box1.y + box1.height > box2.y;
  }

  /**
   * 清空选择
   */
  public clearSelection(): void {
    this.selectedActions = [];
    this.anchorPoints = [];
    this.isDraggingAnchor = false;
    this.draggedAnchorIndex = -1;
    this.clearBoundsCache(); // 清除边界框缓存
    this.exitTransformMode();
    logger.debug('SelectTool: 清空选择');
  }

  /**
   * 获取当前选中的actions
   */
  public getSelectedActions(): DrawAction[] {
    return [...this.selectedActions];
  }

  /**
   * 生成8个锚点
   */
  private generateAnchorPoints(): void {
    // 检查是否需要更新
    const currentTime = Date.now();
    if (currentTime - this.lastAnchorUpdateTime < this.anchorUpdateInterval) {
      return; // 跳过更新
    }

    const bounds = this.getSelectedActionsBounds();
    if (!bounds) {
      this.anchorPoints = [];
      return;
    }

    const { x, y, width, height } = bounds;
    const halfSize = this.anchorSize / 2;

    this.anchorPoints = [
      // 四个角点
      { x: x - halfSize, y: y - halfSize, type: 'top-left', cursor: 'nw-resize' },
      { x: x + width - halfSize, y: y - halfSize, type: 'top-right', cursor: 'ne-resize' },
      { x: x + width - halfSize, y: y + height - halfSize, type: 'bottom-right', cursor: 'se-resize' },
      { x: x - halfSize, y: y + height - halfSize, type: 'bottom-left', cursor: 'sw-resize' },
      
      // 四个边中点
      { x: x + width / 2 - halfSize, y: y - halfSize, type: 'top', cursor: 'n-resize' },
      { x: x + width - halfSize, y: y + height / 2 - halfSize, type: 'right', cursor: 'e-resize' },
      { x: x + width / 2 - halfSize, y: y + height - halfSize, type: 'bottom', cursor: 's-resize' },
      { x: x - halfSize, y: y + height / 2 - halfSize, type: 'left', cursor: 'w-resize' }
    ];

    this.lastAnchorUpdateTime = currentTime;
  }

  /**
   * 绘制8个锚点
   */
  private drawAnchorPoints(ctx: CanvasRenderingContext2D): void {
    if (this.anchorPoints.length === 0) return;

    ctx.save();
    
    // 锚点样式
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#007AFF';
    ctx.lineWidth = 2;

    for (let i = 0; i < this.anchorPoints.length; i++) {
      const anchor = this.anchorPoints[i];
      
      // 绘制锚点
      ctx.beginPath();
      ctx.rect(anchor.x, anchor.y, this.anchorSize, this.anchorSize);
      ctx.fill();
      ctx.stroke();
      
      // 如果是拖拽中的锚点，添加高亮效果
      if (i === this.draggedAnchorIndex) {
        ctx.strokeStyle = '#FF6B35';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }
    
    ctx.restore();
  }

  /**
   * 检查点是否在锚点内
   */
  private getAnchorPointAt(point: Point): number {
    for (let i = 0; i < this.anchorPoints.length; i++) {
      const anchor = this.anchorPoints[i];
      if (point.x >= anchor.x - this.anchorTolerance &&
          point.x <= anchor.x + this.anchorSize + this.anchorTolerance &&
          point.y >= anchor.y - this.anchorTolerance &&
          point.y <= anchor.y + this.anchorSize + this.anchorTolerance) {
        return i;
      }
    }
    return -1;
  }

  /**
   * 处理锚点拖拽
   */
  private handleAnchorDrag(point: Point): DrawAction | DrawAction[] | null {
    if (this.draggedAnchorIndex === -1 || !this.dragStartPoint) return null;

    const bounds = this.getSelectedActionsBounds();
    if (!bounds) return null;

    const anchor = this.anchorPoints[this.draggedAnchorIndex];
    const deltaX = point.x - this.dragStartPoint.x;
    const deltaY = point.y - this.dragStartPoint.y;

    // 计算新的边界框
    const newBounds = { ...bounds };
    
    switch (anchor.type) {
      case 'top-left':
        newBounds.x += deltaX;
        newBounds.y += deltaY;
        newBounds.width -= deltaX;
        newBounds.height -= deltaY;
        break;
      case 'top-right':
        newBounds.y += deltaY;
        newBounds.width += deltaX;
        newBounds.height -= deltaY;
        break;
      case 'bottom-right':
        newBounds.width += deltaX;
        newBounds.height += deltaY;
        break;
      case 'bottom-left':
        newBounds.x += deltaX;
        newBounds.width -= deltaX;
        newBounds.height += deltaY;
        break;
      case 'top':
        newBounds.y += deltaY;
        newBounds.height -= deltaY;
        break;
      case 'right':
        newBounds.width += deltaX;
        break;
      case 'bottom':
        newBounds.height += deltaY;
        break;
      case 'left':
        newBounds.x += deltaX;
        newBounds.width -= deltaX;
        break;
    }

    // 确保最小尺寸
    if (newBounds.width < 10 || newBounds.height < 10) return null;

    // 应用变换
    return this.applyBoundsTransform(newBounds, bounds);
  }

  /**
   * 应用边界框变换
   */
  private applyBoundsTransform(newBounds: { x: number; y: number; width: number; height: number }, 
                              oldBounds: { x: number; y: number; width: number; height: number }): DrawAction | DrawAction[] | null {
    const scaleX = newBounds.width / oldBounds.width;
    const scaleY = newBounds.height / oldBounds.height;

    if (this.selectedActions.length === 1) {
      return this.scaleSelectedAction(scaleX, scaleY, oldBounds.x, oldBounds.y);
    } else {
      return this.scaleSelectedActions(scaleX, scaleY, oldBounds.x, oldBounds.y);
    }
  }

  public draw(ctx: CanvasRenderingContext2D, action: SelectAction): void {
    // 如果处于变换模式且有选中的图形，绘制控制点
    if (this.isTransformMode && this.selectedActionForTransform) {
      this.transformTool.draw(ctx);
      return;
    }

    // 如果有选中的actions，生成并绘制锚点
    if (this.selectedActions.length > 0) {
      this.generateAnchorPoints();
      this.drawAnchorPoints(ctx);
    }

    // 否则绘制选择框
    if (action.points.length < 2) return;

    const originalContext = this.saveContext(ctx);
    
    // 计算选择框区域
    const start = action.points[0];
    const end = action.points[action.points.length - 1];
    
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);

    // 只有当选择框有一定大小时才绘制
    if (width < 5 || height < 5) {
      this.restoreContext(ctx, originalContext);
      return;
    }

    // 绘制选择框背景
    this.drawSelectionBackground(ctx, left, top, width, height, action);
    
    // 绘制选择框边框
    this.drawSelectionBorder(ctx, left, top, width, height, action);
    
    // 绘制选择框角标
    this.drawCornerIndicators(ctx, left, top, width, height);
    
    this.restoreContext(ctx, originalContext);
  }

  private drawSelectionBackground(
    ctx: CanvasRenderingContext2D, 
    left: number, 
    top: number, 
    width: number, 
    height: number,
    action: SelectAction
  ): void {
    // 如果有选中内容，使用高亮背景
    if (action.selectedActions && action.selectedActions.length > 0) {
      ctx.fillStyle = `rgba(0, 122, 255, ${modernSelectionStyle.fillOpacity * 1.5})`;
    } else {
      ctx.fillStyle = `rgba(0, 122, 255, ${modernSelectionStyle.fillOpacity})`;
    }
    
    // 绘制圆角矩形背景
    this.drawRoundedRect(ctx, left, top, width, height, modernSelectionStyle.cornerRadius, true);
  }

  private drawSelectionBorder(
    ctx: CanvasRenderingContext2D, 
    left: number, 
    top: number, 
    width: number, 
    height: number,
    action: SelectAction
  ): void {
    // 设置边框样式
    ctx.strokeStyle = modernSelectionStyle.strokeColor;
    ctx.lineWidth = modernSelectionStyle.strokeWidth;
    
    // 动画虚线效果
    const currentTime = Date.now();
    if (currentTime - this.lastAnimationTime > 50) { // 50ms更新间隔
      this.animationOffset += 1;
      this.lastAnimationTime = currentTime;
    }
    
    const dashArray = [...modernSelectionStyle.strokeDashArray];
    ctx.setLineDash(dashArray);
    ctx.lineDashOffset = -this.animationOffset;

    // 绘制圆角矩形边框
    this.drawRoundedRect(ctx, left, top, width, height, modernSelectionStyle.cornerRadius, false);
    
    // 如果有选中内容，绘制额外的强调边框
    if (action.selectedActions && action.selectedActions.length > 0) {
      ctx.strokeStyle = '#FF6B35'; // 橙色强调色
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 2]);
      ctx.lineDashOffset = this.animationOffset; // 反向动画
      this.drawRoundedRect(ctx, left - 1, top - 1, width + 2, height + 2, modernSelectionStyle.cornerRadius + 1, false);
    }
    
    // 重置虚线
    ctx.setLineDash([]);
  }

  private drawCornerIndicators(
    ctx: CanvasRenderingContext2D, 
    left: number, 
    top: number, 
    width: number, 
    height: number
  ): void {
    const cornerLength = 16;
    
    ctx.strokeStyle = modernSelectionStyle.strokeColor;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    
    // 四个角的指示器
    const corners = [
      { x: left, y: top }, // 左上
      { x: left + width, y: top }, // 右上
      { x: left + width, y: top + height }, // 右下
      { x: left, y: top + height }, // 左下
    ];
    
    corners.forEach((corner, index) => {
      ctx.beginPath();
      
      switch (index) {
        case 0: // 左上角
          ctx.moveTo(corner.x, corner.y + cornerLength);
          ctx.lineTo(corner.x, corner.y);
          ctx.lineTo(corner.x + cornerLength, corner.y);
          break;
        case 1: // 右上角
          ctx.moveTo(corner.x - cornerLength, corner.y);
          ctx.lineTo(corner.x, corner.y);
          ctx.lineTo(corner.x, corner.y + cornerLength);
          break;
        case 2: // 右下角
          ctx.moveTo(corner.x, corner.y - cornerLength);
          ctx.lineTo(corner.x, corner.y);
          ctx.lineTo(corner.x - cornerLength, corner.y);
          break;
        case 3: // 左下角
          ctx.moveTo(corner.x + cornerLength, corner.y);
          ctx.lineTo(corner.x, corner.y);
          ctx.lineTo(corner.x, corner.y - cornerLength);
          break;
      }
      
      ctx.stroke();
    });
  }

  private drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    fill: boolean = false
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    
    if (fill) {
      ctx.fill();
    } else {
      ctx.stroke();
    }
  }

  // ============================================
  // 变换功能接口
  // ============================================

  /**
   * 切换到变换模式
   */
  public enterTransformMode(selectedAction: DrawAction): void {
    this.isTransformMode = true;
    this.selectedActionForTransform = selectedAction;
    this.transformTool.setSelectedAction(selectedAction);
  }

  /**
   * 退出变换模式
   */
  public exitTransformMode(): void {
    this.isTransformMode = false;
    this.selectedActionForTransform = null;
    this.isDragging = false;
    this.dragStartPoint = null;
    this.currentHoverControlPoint = null;
  }

  /**
   * 处理鼠标按下事件
   */
  public handleMouseDown(point: Point): 'select' | 'transform' | 'move' | 'box-select' | 'anchor-drag' | null {
    // 检查是否点击了锚点
    const anchorIndex = this.getAnchorPointAt(point);
    if (anchorIndex !== -1) {
      this.isDraggingAnchor = true;
      this.draggedAnchorIndex = anchorIndex;
      this.dragStartPoint = point;
      return 'anchor-drag';
    }

    // 如果处于变换模式，检查是否点击了控制点或选中的图形
    if (this.isTransformMode && this.selectedActionForTransform) {
      // 检查是否点击了控制点
      const controlPoint = this.transformTool.getControlPointAt(point);
      if (controlPoint) {
        this.currentHoverControlPoint = controlPoint;
        this.isDragging = true;
        this.dragStartPoint = point;
        return 'transform';
      }

      // 检查是否点击了选中的图形
      if (this.isPointInAction(point, this.selectedActionForTransform, 5)) {
        this.isDragging = true;
        this.dragStartPoint = point;
        return 'move';
      }

      // 如果点击了选区外，取消选择
      if (!this.isPointInSelectionArea(point)) {
        this.clearSelection();
        // 检查是否点击了其他action
        const clickedAction = this.selectActionAtPoint(point);
        if (clickedAction) {
          return 'transform';
        }
        
        // 开始新的框选
        this.isSelecting = true;
        this.selectionStartPoint = point;
        return 'box-select';
      }

      return 'select';
    }

    // 普通选择模式
    // 检查是否点击了已选中的action
    const clickedAction = this.selectActionAtPoint(point);
    if (clickedAction) {
      return 'transform';
    }
    
    // 如果点击了选区外，清空选择
    if (this.selectedActions.length > 0 && !this.isPointInSelectionArea(point)) {
      this.clearSelection();
    }
    
    // 开始框选
    this.isSelecting = true;
    this.selectionStartPoint = point;
    return 'box-select';
  }

  /**
   * 检查点是否在选择区域内
   */
  private isPointInSelectionArea(point: Point): boolean {
    // 检查是否在选中actions的边界框内
    const bounds = this.getSelectedActionsBounds();
    if (bounds) {
      return point.x >= bounds.x - 10 &&
             point.x <= bounds.x + bounds.width + 10 &&
             point.y >= bounds.y - 10 &&
             point.y <= bounds.y + bounds.height + 10;
    }

    // 检查是否在控制点附近
    if (this.transformTool) {
      const controlPoint = this.transformTool.getControlPointAt(point);
      if (controlPoint) {
        return true;
      }
    }

    return false;
  }

  /**
   * 处理鼠标移动事件
   */
  public handleMouseMove(point: Point): DrawAction | DrawAction[] | null {
    // 处理锚点拖拽
    if (this.isDraggingAnchor) {
      return this.handleAnchorDrag(point);
    }

    // 处理框选
    if (this.isSelecting && this.selectionStartPoint) {
      const bounds = {
        x: Math.min(this.selectionStartPoint.x, point.x),
        y: Math.min(this.selectionStartPoint.y, point.y),
        width: Math.abs(point.x - this.selectionStartPoint.x),
        height: Math.abs(point.y - this.selectionStartPoint.y)
      };
      
      this.currentSelectionBounds = bounds;
      return null; // 框选不需要返回action
    }

    // 处理变换模式
    if (!this.isTransformMode || !this.selectedActionForTransform) {
      return null;
    }

    // 处理控制点拖拽
    if (this.isDragging && this.currentHoverControlPoint && this.dragStartPoint) {
      return this.handleControlPointDrag(point);
    }

    // 处理移动
    if (this.isDragging && this.dragStartPoint) {
      const deltaX = point.x - this.dragStartPoint.x;
      const deltaY = point.y - this.dragStartPoint.y;
      
      if (this.selectedActions.length > 1) {
        return this.moveSelectedActions(deltaX, deltaY);
      } else {
        return this.moveSelectedAction(deltaX, deltaY);
      }
    }

    return null;
  }

  /**
   * 处理控制点拖拽
   */
  private handleControlPointDrag(point: Point): DrawAction | null {
    if (!this.currentHoverControlPoint || !this.dragStartPoint || !this.selectedActionForTransform) {
      return null;
    }

    const controlPoint = this.currentHoverControlPoint;
    const bounds = this.getActionBoundingBox(this.selectedActionForTransform);
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;

    // 根据控制点类型执行不同的变换
    if (controlPoint.type.includes('CORNER') || controlPoint.type.includes('EDGE')) {
      const scaleX = Math.abs(point.x - centerX) / (bounds.width / 2);
      const scaleY = Math.abs(point.y - centerY) / (bounds.height / 2);
      return this.scaleSelectedAction(scaleX, scaleY, centerX, centerY);
    } else if (controlPoint.type === 'MOVE') {
      const deltaX = point.x - this.dragStartPoint!.x;
      const deltaY = point.y - this.dragStartPoint!.y;
      return this.moveSelectedAction(deltaX, deltaY);
    }

    return null;
  }

  /**
   * 处理鼠标抬起事件
   */
  public handleMouseUp(): DrawAction | DrawAction[] | null {
    // 处理锚点拖拽结束
    if (this.isDraggingAnchor) {
      this.isDraggingAnchor = false;
      this.draggedAnchorIndex = -1;
      this.dragStartPoint = null;
      
      if (this.selectedActions.length > 1) {
        return this.selectedActions;
      } else {
        return this.selectedActionForTransform;
      }
    }

    // 处理框选结束
    if (this.isSelecting && this.currentSelectionBounds) {
      const selectedActions = this.selectActionsInBox(this.currentSelectionBounds);
      this.isSelecting = false;
      this.selectionStartPoint = null;
      this.currentSelectionBounds = null;
      
      if (selectedActions.length === 1) {
        this.enterTransformMode(selectedActions[0]);
        return selectedActions[0];
      } else if (selectedActions.length > 1) {
        return selectedActions;
      }
      
      return null;
    }

    // 处理变换模式
    if (!this.isTransformMode || !this.isDragging) {
      return null;
    }

    this.isDragging = false;
    this.dragStartPoint = null;
    this.currentHoverControlPoint = null;
    
    if (this.selectedActions.length > 1) {
      return this.selectedActions;
    } else {
      return this.selectedActionForTransform;
    }
  }

  /**
   * 获取当前鼠标样式
   */
  public getCurrentCursor(): string {
    // 如果正在拖拽锚点，返回对应的鼠标样式
    if (this.isDraggingAnchor && this.draggedAnchorIndex !== -1) {
      return this.anchorPoints[this.draggedAnchorIndex]?.cursor || 'default';
    }

    if (!this.isTransformMode) {
      return 'default';
    }

    if (this.isDragging) {
      return 'grabbing';
    }

    if (this.currentHoverControlPoint) {
      return this.currentHoverControlPoint.cursor;
    }

    if (this.selectedActionForTransform && this.transformTool.isPointInSelectedShape({ x: 0, y: 0 })) {
      return 'grab';
    }

    return 'default';
  }

  /**
   * 检查是否处于变换模式
   */
  public isInTransformMode(): boolean {
    return this.isTransformMode;
  }

  /**
   * 获取选中的变换动作
   */
  public getSelectedTransformAction(): DrawAction | null {
    return this.selectedActionForTransform;
  }

  /**
   * 使用键盘移动选中的图形
   */
  public moveSelectedAction(deltaX: number, deltaY: number): DrawAction | null {
    if (!this.isTransformMode || !this.selectedActionForTransform) {
      return null;
    }

    const transformFn = this.createMoveTransform(deltaX, deltaY);
    const updatedAction = this.applyTransformToAction(this.selectedActionForTransform, transformFn);
    
    this.selectedActionForTransform = updatedAction;
    this.transformTool.setSelectedAction(updatedAction);

    return updatedAction;
  }

  /**
   * 移动所有选中的actions
   */
  public moveSelectedActions(deltaX: number, deltaY: number): DrawAction[] {
    const transformFn = this.createMoveTransform(deltaX, deltaY);
    const updatedActions = this.applyTransformToActions(this.selectedActions, transformFn);
    
    logger.debug(`SelectTool: 移动${updatedActions.length}个actions，偏移量: (${deltaX}, ${deltaY})`);
    return updatedActions;
  }

  /**
   * 缩放选中的action
   */
  public scaleSelectedAction(scaleX: number, scaleY: number, centerX: number, centerY: number): DrawAction | null {
    if (!this.isTransformMode || !this.selectedActionForTransform) {
      return null;
    }

    const newPoints = this.selectedActionForTransform.points.map(point => ({
      ...point,
      x: centerX + (point.x - centerX) * scaleX,
      y: centerY + (point.y - centerY) * scaleY
    }));

    const updatedAction = {
      ...this.selectedActionForTransform,
      points: newPoints
    };

    this.selectedActionForTransform = updatedAction;
    this.transformTool.setSelectedAction(updatedAction);

    return updatedAction;
  }

  /**
   * 缩放所有选中的actions
   */
  public scaleSelectedActions(scaleX: number, scaleY: number, centerX: number, centerY: number): DrawAction[] {
    const updatedActions: DrawAction[] = [];
    
    for (const action of this.selectedActions) {
      const newPoints = action.points.map(point => ({
        ...point,
        x: centerX + (point.x - centerX) * scaleX,
        y: centerY + (point.y - centerY) * scaleY
      }));

      const updatedAction = {
        ...action,
        points: newPoints
      };

      updatedActions.push(updatedAction);
    }
    
    this.selectedActions = updatedActions;
    
    // 如果只有一个选中的action，更新变换模式
    if (updatedActions.length === 1) {
      this.selectedActionForTransform = updatedActions[0];
      this.transformTool.setSelectedAction(updatedActions[0]);
    }
    
    logger.debug(`SelectTool: 缩放${updatedActions.length}个actions，缩放比例: (${scaleX}, ${scaleY})`);
    return updatedActions;
  }

  /**
   * 获取所有选中actions的边界框
   */
  public getSelectedActionsBounds(): { x: number; y: number; width: number; height: number } | null {
    if (this.selectedActions.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const action of this.selectedActions) {
      const bounds = this.getActionBoundingBox(action);
      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
      maxX = Math.max(maxX, bounds.x + bounds.width);
      maxY = Math.max(maxY, bounds.y + bounds.height);
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  /**
   * 旋转选中的action
   */
  public rotateSelectedAction(angle: number, centerX: number, centerY: number): DrawAction | null {
    if (!this.isTransformMode || !this.selectedActionForTransform) {
      return null;
    }

    const radians = (angle * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    const newPoints = this.selectedActionForTransform.points.map(point => {
      const dx = point.x - centerX;
      const dy = point.y - centerY;
      
      return {
        ...point,
        x: centerX + dx * cos - dy * sin,
        y: centerY + dx * sin + dy * cos
      };
    });

    const updatedAction = {
      ...this.selectedActionForTransform,
      points: newPoints
    };

    this.selectedActionForTransform = updatedAction;
    this.transformTool.setSelectedAction(updatedAction);

    return updatedAction;
  }

  /**
   * 旋转所有选中的actions
   */
  public rotateSelectedActions(angle: number, centerX: number, centerY: number): DrawAction[] {
    const updatedActions: DrawAction[] = [];
    const radians = (angle * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    
    for (const action of this.selectedActions) {
      const newPoints = action.points.map(point => {
        const dx = point.x - centerX;
        const dy = point.y - centerY;
        
        return {
          ...point,
          x: centerX + dx * cos - dy * sin,
          y: centerY + dx * sin + dy * cos
        };
      });

      const updatedAction = {
        ...action,
        points: newPoints
      };

      updatedActions.push(updatedAction);
    }
    
    this.selectedActions = updatedActions;
    
    // 如果只有一个选中的action，更新变换模式
    if (updatedActions.length === 1) {
      this.selectedActionForTransform = updatedActions[0];
      this.transformTool.setSelectedAction(updatedActions[0]);
    }
    
    logger.debug(`SelectTool: 旋转${updatedActions.length}个actions，角度: ${angle}°`);
    return updatedActions;
  }

  /**
   * 获取控制点信息（用于调试或外部访问）
   */
  public getControlPoints(): ControlPoint[] {
    return this.transformTool.getControlPoints();
  }

  public getActionType(): string {
    return 'select';
  }

  // 重置动画状态
  public resetAnimation(): void {
    this.animationOffset = 0;
    this.lastAnimationTime = 0;
  }

  /**
   * 清理资源
   */
  public dispose(): void {
    this.exitTransformMode();
  }

  /**
   * 获取选择工具状态信息
   */
  public getSelectionInfo(): {
    selectedCount: number;
    bounds: { x: number; y: number; width: number; height: number } | null;
    isSelecting: boolean;
    isTransformMode: boolean;
  } {
    return {
      selectedCount: this.selectedActions.length,
      bounds: this.getSelectedActionsBounds(),
      isSelecting: this.isSelecting,
      isTransformMode: this.isTransformMode
    };
  }

  /**
   * 获取选择工具状态信息（用于调试）
   */
  public getDebugInfo(): {
    allActionsCount: number;
    selectedActionsCount: number;
    isTransformMode: boolean;
    isSelecting: boolean;
    isDraggingAnchor: boolean;
    anchorPointsCount: number;
    boundsCacheSize: number;
  } {
    return {
      allActionsCount: this.allActions.length,
      selectedActionsCount: this.selectedActions.length,
      isTransformMode: this.isTransformMode,
      isSelecting: this.isSelecting,
      isDraggingAnchor: this.isDraggingAnchor,
      anchorPointsCount: this.anchorPoints.length,
      boundsCacheSize: this.boundsCache.size
    };
  }

  /**
   * 强制更新选择工具状态
   */
  public forceUpdate(): void {
    // 重新生成锚点
    if (this.selectedActions.length > 0) {
      this.generateAnchorPoints();
    }
    
    // 清除缓存
    this.clearBoundsCache();
    
    logger.debug('SelectTool: 强制更新状态', this.getDebugInfo());
  }

  /**
   * 键盘快捷键支持
   */
  public handleKeyboardEvent(event: KeyboardEvent): boolean {
    if (!this.isTransformMode || this.selectedActions.length === 0) {
      return false;
    }

    const step = 1; // 移动步长
    let handled = false;

    switch (event.key) {
      case 'ArrowLeft':
        this.moveSelectedActions(-step, 0);
        handled = true;
        break;
      case 'ArrowRight':
        this.moveSelectedActions(step, 0);
        handled = true;
        break;
      case 'ArrowUp':
        this.moveSelectedActions(0, -step);
        handled = true;
        break;
      case 'ArrowDown':
        this.moveSelectedActions(0, step);
        handled = true;
        break;
      case 'Delete':
      case 'Backspace':
        this.clearSelection();
        handled = true;
        break;
      case 'Escape':
        this.exitTransformMode();
        handled = true;
        break;
    }

    if (handled) {
      event.preventDefault();
    }

    return handled;
  }

  /**
   * 复制选中的actions
   */
  public copySelectedActions(): DrawAction[] {
    return this.selectedActions.map(action => ({
      ...action,
      id: `${action.id}_copy_${Date.now()}`,
      points: action.points.map(point => ({ ...point }))
    }));
  }

  /**
   * 粘贴actions（偏移一定距离）
   */
  public pasteActions(actions: DrawAction[], offsetX: number = 10, offsetY: number = 10): DrawAction[] {
    const pastedActions = actions.map(action => ({
      ...action,
      id: `${action.id}_paste_${Date.now()}`,
      points: action.points.map(point => ({
        ...point,
        x: point.x + offsetX,
        y: point.y + offsetY
      }))
    }));

    this.selectedActions = pastedActions;
    if (pastedActions.length === 1) {
      this.enterTransformMode(pastedActions[0]);
    }

    return pastedActions;
  }

  /**
   * 对齐选中的actions
   */
  public alignSelectedActions(alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): void {
    if (this.selectedActions.length < 2) return;

    const bounds = this.getSelectedActionsBounds();
    if (!bounds) return;

    const updatedActions: DrawAction[] = [];

    for (const action of this.selectedActions) {
      const actionBounds = this.getActionBoundingBox(action);
      let deltaX = 0;
      let deltaY = 0;

      switch (alignment) {
        case 'left':
          deltaX = bounds.x - actionBounds.x;
          break;
        case 'center':
          deltaX = (bounds.x + bounds.width / 2) - (actionBounds.x + actionBounds.width / 2);
          break;
        case 'right':
          deltaX = (bounds.x + bounds.width) - (actionBounds.x + actionBounds.width);
          break;
        case 'top':
          deltaY = bounds.y - actionBounds.y;
          break;
        case 'middle':
          deltaY = (bounds.y + bounds.height / 2) - (actionBounds.y + actionBounds.height / 2);
          break;
        case 'bottom':
          deltaY = (bounds.y + bounds.height) - (actionBounds.y + actionBounds.height);
          break;
      }

      const newPoints = action.points.map(point => ({
        ...point,
        x: point.x + deltaX,
        y: point.y + deltaY
      }));

      updatedActions.push({
        ...action,
        points: newPoints
      });
    }

    this.selectedActions = updatedActions;
    logger.debug(`SelectTool: 对齐${updatedActions.length}个actions，对齐方式: ${alignment}`);
  }

  /**
   * 重置选择工具状态
   */
  public reset(): void {
    this.clearSelection();
    this.isSelecting = false;
    this.selectionStartPoint = null;
    this.currentSelectionBounds = null;
    this.resetAnimation();
    logger.debug('SelectTool: 重置状态');
  }

  /**
   * 获取锚点信息
   */
  public getAnchorPoints(): Array<{ x: number; y: number; type: string; cursor: string }> {
    return [...this.anchorPoints];
  }

  /**
   * 检查是否正在拖拽锚点
   */
  public isDraggingAnchorPoint(): boolean {
    return this.isDraggingAnchor;
  }

  /**
   * 设置锚点大小
   */
  public setAnchorSize(size: number): void {
    this.anchorSize = Math.max(4, Math.min(20, size));
    if (this.selectedActions.length > 0) {
      this.generateAnchorPoints();
    }
  }

  /**
   * 设置锚点容差
   */
  public setAnchorTolerance(tolerance: number): void {
    this.anchorTolerance = Math.max(2, Math.min(15, tolerance));
  }

  /**
   * 强制更新锚点位置
   */
  public updateAnchorPoints(): void {
    if (this.selectedActions.length > 0) {
      this.generateAnchorPoints();
    }
  }

  /**
   * 应用变换到单个action
   */
  private applyTransformToAction(action: DrawAction, transformFn: (point: Point) => Point): DrawAction {
    const newPoints = action.points.map(transformFn);
    const updatedAction = {
      ...action,
      points: newPoints
    };

    // 清除缓存
    this.clearActionBoundsCache(action.id);
    return updatedAction;
  }

  /**
   * 应用变换到多个actions
   */
  private applyTransformToActions(actions: DrawAction[], transformFn: (point: Point) => Point): DrawAction[] {
    const updatedActions = actions.map(action => this.applyTransformToAction(action, transformFn));
    
    // 更新选中actions
    this.selectedActions = updatedActions;
    
    // 如果只有一个选中的action，更新变换模式
    if (updatedActions.length === 1) {
      this.selectedActionForTransform = updatedActions[0];
      this.transformTool.setSelectedAction(updatedActions[0]);
    }
    
    return updatedActions;
  }

  /**
   * 移动变换函数
   */
  private createMoveTransform(deltaX: number, deltaY: number): (point: Point) => Point {
    return (point: Point) => ({
      ...point,
      x: point.x + deltaX,
      y: point.y + deltaY
    });
  }

  /**
   * 缩放变换函数
   */
  private createScaleTransform(scaleX: number, scaleY: number, centerX: number, centerY: number): (point: Point) => Point {
    return (point: Point) => ({
      ...point,
      x: centerX + (point.x - centerX) * scaleX,
      y: centerY + (point.y - centerY) * scaleY
    });
  }

  /**
   * 旋转变换函数
   */
  private createRotateTransform(angle: number, centerX: number, centerY: number): (point: Point) => Point {
    const radians = (angle * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    
    return (point: Point) => {
      const dx = point.x - centerX;
      const dy = point.y - centerY;
      
      return {
        ...point,
        x: centerX + dx * cos - dy * sin,
        y: centerY + dx * sin + dy * cos
      };
    };
  }
} 