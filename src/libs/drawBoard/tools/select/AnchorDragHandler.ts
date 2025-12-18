import type { DrawAction } from '../DrawTool';
import type { Point } from '../../core/CanvasEngine';
import type { ShapeAnchorHandler, AnchorPoint, Bounds, AnchorType } from '../anchor/AnchorTypes';
import { TransformOperations } from './TransformOperations';
import { logger } from '../../infrastructure/logging/Logger';

/**
 * 拖拽配置
 */
export interface DragHandlerConfig {
  /** 最小拖拽距离（像素） */
  minDragDistance: number;
  /** 拖拽灵敏度（0-1） */
  dragSensitivity: number;
}

/**
 * 拖拽状态
 */
export interface DragHandlerState {
  /** 拖拽起始点 */
  startPoint: Point;
  /** 拖拽起始边界 */
  startBounds: Bounds;
  /** 拖拽起始 Action（单选） */
  startAction: DrawAction | null;
  /** 拖拽起始 Actions（多选） */
  startActions: DrawAction[] | null;
  /** 上次拖拽点 */
  lastPoint: Point;
  /** 上次结果（用于缓存） */
  lastResult: DrawAction | DrawAction[] | null;
}

/**
 * 拖拽结果
 */
export interface DragResult {
  success: boolean;
  action?: DrawAction;
  actions?: DrawAction[];
  error?: string;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: DragHandlerConfig = {
  minDragDistance: 2,
  dragSensitivity: 0.8
};

/**
 * 锚点拖拽处理器
 * 
 * 处理锚点拖拽相关的逻辑，支持单选和多选场景。
 */
export class AnchorDragHandler {
  private config: DragHandlerConfig;
  private shapeHandlers: Map<string, ShapeAnchorHandler>;
  private state: DragHandlerState | null = null;

  constructor(
    config: Partial<DragHandlerConfig> = {},
    shapeHandlers?: Map<string, ShapeAnchorHandler>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.shapeHandlers = shapeHandlers || new Map();
  }

  /**
   * 设置形状处理器
   */
  setShapeHandlers(handlers: Map<string, ShapeAnchorHandler>): void {
    this.shapeHandlers = handlers;
  }

  /**
   * 开始拖拽
   */
  startDrag(
    startPoint: Point,
    startBounds: Bounds,
    startAction: DrawAction | null = null,
    startActions: DrawAction[] | null = null
  ): void {
    this.state = {
      startPoint,
      startBounds,
      startAction,
      startActions,
      lastPoint: startPoint,
      lastResult: null
    };
  }

  /**
   * 结束拖拽
   */
  endDrag(): void {
    this.state = null;
  }

  /**
   * 是否正在拖拽
   */
  isDragging(): boolean {
    return this.state !== null;
  }

  /**
   * 获取拖拽状态
   */
  getState(): DragHandlerState | null {
    return this.state;
  }

  /**
   * 处理单选锚点拖拽
   */
  handleSingleSelectionDrag(
    action: DrawAction,
    anchor: AnchorPoint,
    currentPoint: Point,
    canvasBounds?: { width: number; height: number }
  ): DragResult {
    if (!this.state) {
      return { success: false, error: '未开始拖拽' };
    }

    // 检查移动距离
    const distance = Math.sqrt(
      Math.pow(currentPoint.x - this.state.lastPoint.x, 2) +
      Math.pow(currentPoint.y - this.state.lastPoint.y, 2)
    );

    // 如果移动距离很小，使用缓存结果
    if (distance < 1 && this.state.lastResult) {
      const result = this.state.lastResult;
      return {
        success: true,
        action: Array.isArray(result) ? result[0] : result
      };
    }

    // 检查移动距离是否足够
    const totalDistance = Math.sqrt(
      Math.pow(currentPoint.x - this.state.startPoint.x, 2) +
      Math.pow(currentPoint.y - this.state.startPoint.y, 2)
    );
    if (totalDistance < this.config.minDragDistance) {
      return { success: false, error: '移动距离太小' };
    }

    // ⭐ 文本框模式：拖拽水平边中点调整宽度
    if (action.type === 'text' && TransformOperations.isHorizontalEdgeAnchor(anchor.type)) {
      return this.handleTextWidthDrag(action, anchor, currentPoint);
    }

    // ⭐ 旋转锚点：处理旋转拖拽
    if (TransformOperations.isRotateAnchor(anchor.type)) {
      return this.handleRotateDrag(action, currentPoint, canvasBounds);
    }

    // 获取形状处理器
    const handler = this.shapeHandlers.get(action.type);
    
    if (handler) {
      // 使用形状特定的处理器
      const targetPoint = this.calculateTargetPoint(currentPoint, action.type === 'circle');
      
      const updatedAction = handler.handleAnchorDrag(
        this.state.startAction || action,
        anchor.type,
        this.state.startPoint,
        targetPoint,
        this.state.startBounds,
        this.state.startAction || undefined
      );

      if (!updatedAction) {
        return { success: false, error: '处理器返回空结果' };
      }

      // 限制点在画布范围内
      const clampedAction = canvasBounds 
        ? this.clampActionToCanvas(updatedAction, canvasBounds)
        : updatedAction;

      // 更新缓存
      this.state.lastPoint = currentPoint;
      this.state.lastResult = clampedAction;

      return { success: true, action: clampedAction };
    }

    // 没有形状处理器，使用默认处理（基于边界框变换）
    return this.handleDefaultDrag(action, anchor, currentPoint, canvasBounds);
  }
  
  /**
   * 处理文本宽度拖拽（文本框模式）
   * 拖拽左右边中点调整文本框宽度，文字自动换行
   */
  /**
   * 处理文本宽度拖拽（文本框模式）
   * 📝 左右锚点拖拽都能实时改变文本宽度
   * - 拖拽右边：保持左边不动，宽度 = 鼠标位置 - 起始位置
   * - 拖拽左边：保持右边不动，宽度 = 原始右边位置 - 鼠标位置，起始位置 = 鼠标位置
   * 宽度变化会导致文本换行改变，高度也会自动重新计算
   */
  private handleTextWidthDrag(
    action: DrawAction,
    anchor: AnchorPoint,
    currentPoint: Point
  ): DragResult {
    if (!this.state) {
      return { success: false, error: '未开始拖拽' };
    }

    const { startBounds, startAction } = this.state;
    
    // 📝 获取拖拽开始时的原始状态
    const originalAction = startAction || action;
    const originalTextAction = originalAction as DrawAction & { width?: number };
    
    // 原始文本的起始位置（points[0].x）
    const originalStartX = originalAction.points[0]?.x ?? startBounds.x;
    
    // 原始文本的宽度
    const originalWidth = originalTextAction.width ?? startBounds.width ?? TransformOperations.DEFAULT_TEXT_WIDTH;
    
    // 原始文本的右边界位置（用于拖拽左边时保持右边不动）
    const originalRightX = originalStartX + originalWidth;
    
    // 根据锚点类型确定是左边还是右边
    const isLeftAnchor = ['left', 'resize-w'].includes(anchor.type);
    const isRightAnchor = ['right', 'resize-e'].includes(anchor.type);
    
    let newWidth: number;
    let newStartX: number;
    let anchorSide: 'left' | 'right';
    
    if (isRightAnchor) {
      // 📝 拖拽右边锚点：保持左边不动，右边跟随鼠标
      // 新的宽度 = 鼠标位置 - 起始位置
      newStartX = originalStartX; // 保持左边不动
      newWidth = currentPoint.x - originalStartX;
      anchorSide = 'right';
    } else if (isLeftAnchor) {
      // 📝 拖拽左边锚点：保持右边不动，左边跟随鼠标
      // 新的宽度 = 原始右边位置 - 鼠标位置
      // 新的起始位置 = 鼠标位置
      newStartX = currentPoint.x; // 左边跟随鼠标
      newWidth = originalRightX - currentPoint.x;
      anchorSide = 'left';
    } else {
      return { success: false, error: '非水平边锚点' };
    }

    // 📝 调用 TransformOperations 调整宽度和位置
    // 宽度变化会自动清除 height，让边界计算器根据新的 width 重新计算高度
    const result = TransformOperations.resizeTextWidth(
      originalAction,
      newWidth,
      anchorSide,
      newStartX
    );

    if (result.success && result.action) {
      // 更新缓存
      this.state.lastPoint = currentPoint;
      this.state.lastResult = result.action;
      
      logger.debug('文本宽度拖拽', { 
        anchorSide, 
        oldWidth: originalWidth, 
        newWidth: result.action.width,
        originalStartX,
        newStartX: result.action.points[0]?.x
      });
      
      return { success: true, action: result.action };
    }

    return { success: false, error: result.error || '调整宽度失败' };
  }

  /**
   * 处理旋转拖拽
   * 根据鼠标位置计算旋转角度，并应用到 Action
   */
  private handleRotateDrag(
    action: DrawAction,
    currentPoint: Point,
    canvasBounds?: { width: number; height: number }
  ): DragResult {
    if (!this.state) {
      return { success: false, error: '未开始拖拽' };
    }

    const { startBounds, startPoint } = this.state;
    
    // 计算旋转中心（选区中心）
    const centerX = startBounds.x + startBounds.width / 2;
    const centerY = startBounds.y + startBounds.height / 2;
    
    // 计算旋转角度
    const angle = TransformOperations.calculateRotationAngle(
      centerX,
      centerY,
      startPoint.x,
      startPoint.y,
      currentPoint.x,
      currentPoint.y
    );

    // 应用旋转变换到原始 action
    const result = TransformOperations.rotateAction(
      this.state.startAction || action,
      angle,
      centerX,
      centerY,
      canvasBounds
    );

    if (result.success && result.action) {
      // 更新缓存
      this.state.lastPoint = currentPoint;
      this.state.lastResult = result.action;
      
      logger.debug('旋转拖拽', { 
        angleDegrees: angle * (180 / Math.PI),
        centerX,
        centerY
      });
      
      return { success: true, action: result.action };
    }

    return { success: false, error: result.error || '旋转失败' };
  }

  /**
   * 处理多选锚点拖拽
   */
  handleMultiSelectionDrag(
    actions: DrawAction[],
    anchor: AnchorPoint,
    currentPoint: Point,
    canvasBounds?: { width: number; height: number }
  ): DragResult {
    if (!this.state) {
      return { success: false, error: '未开始拖拽' };
    }

    // 🔄 旋转锚点：处理批量旋转
    if (TransformOperations.isRotateAnchor(anchor.type)) {
      return this.handleMultiSelectionRotateDrag(actions, currentPoint, canvasBounds);
    }

    // 计算缩放比例
    const { startBounds, startPoint } = this.state;
    
    // 计算原始边界框的尺寸
    const originalWidth = startBounds.width;
    const originalHeight = startBounds.height;
    
    if (originalWidth === 0 || originalHeight === 0) {
      return { success: false, error: '原始边界无效' };
    }

    // 计算新边界框
    const newBounds = this.calculateNewBoundsForAnchor(
      startBounds,
      anchor.type,
      currentPoint.x - startPoint.x,
      currentPoint.y - startPoint.y
    );

    // 计算缩放比例
    const scaleX = newBounds.width / originalWidth;
    const scaleY = newBounds.height / originalHeight;

    // 计算缩放中心
    const centerX = startBounds.x + startBounds.width / 2;
    const centerY = startBounds.y + startBounds.height / 2;

    // 使用 TransformOperations 进行批量缩放
    const result = TransformOperations.scaleActions(
      actions,
      scaleX,
      scaleY,
      centerX,
      centerY,
      canvasBounds
    );

    if (!result.success) {
      return { success: false, error: result.errors.join(', ') };
    }

    // 更新缓存
    this.state.lastPoint = currentPoint;
    this.state.lastResult = result.actions;

    return { success: true, actions: result.actions };
  }

  /**
   * 处理多选旋转拖拽
   * 所有选中的 actions 围绕共同的中心点旋转
   */
  private handleMultiSelectionRotateDrag(
    actions: DrawAction[],
    currentPoint: Point,
    canvasBounds?: { width: number; height: number }
  ): DragResult {
    if (!this.state) {
      return { success: false, error: '未开始拖拽' };
    }

    const { startBounds, startPoint, startActions } = this.state;
    
    // 计算旋转中心（选区中心）
    const centerX = startBounds.x + startBounds.width / 2;
    const centerY = startBounds.y + startBounds.height / 2;
    
    // 计算旋转角度
    const angle = TransformOperations.calculateRotationAngle(
      centerX,
      centerY,
      startPoint.x,
      startPoint.y,
      currentPoint.x,
      currentPoint.y
    );

    // 应用旋转变换到所有原始 actions
    const result = TransformOperations.rotateActions(
      startActions || actions,
      angle,
      centerX,
      centerY,
      canvasBounds
    );

    if (!result.success) {
      return { success: false, error: result.errors.join(', ') };
    }

    // 更新缓存
    this.state.lastPoint = currentPoint;
    this.state.lastResult = result.actions;
    
    logger.debug('多选旋转拖拽', { 
      angleDegrees: angle * (180 / Math.PI),
      centerX,
      centerY,
      actionsCount: actions.length
    });

    return { success: true, actions: result.actions };
  }

  /**
   * 处理移动拖拽（中心锚点）
   */
  handleMoveDrag(
    actions: DrawAction[],
    currentPoint: Point,
    canvasBounds?: { width: number; height: number }
  ): DragResult {
    if (!this.state) {
      return { success: false, error: '未开始拖拽' };
    }

    const deltaX = currentPoint.x - this.state.lastPoint.x;
    const deltaY = currentPoint.y - this.state.lastPoint.y;

    // 使用 TransformOperations 进行批量移动
    const result = TransformOperations.moveActions(
      actions,
      deltaX,
      deltaY,
      canvasBounds
    );

    if (!result.success) {
      return { success: false, error: result.errors.join(', ') };
    }

    // 更新状态
    this.state.lastPoint = currentPoint;
    this.state.lastResult = result.actions;

    return { success: true, actions: result.actions };
  }

  // ============================================
  // 私有方法
  // ============================================

  /**
   * 计算目标点（应用灵敏度）
   */
  private calculateTargetPoint(currentPoint: Point, isCircle: boolean): Point {
    if (!this.state) {
      return currentPoint;
    }

    // 圆形直接使用原始点，其他形状应用灵敏度
    if (isCircle) {
      return currentPoint;
    }

    const rawDeltaX = currentPoint.x - this.state.startPoint.x;
    const rawDeltaY = currentPoint.y - this.state.startPoint.y;

    return {
      x: this.state.startPoint.x + rawDeltaX * this.config.dragSensitivity,
      y: this.state.startPoint.y + rawDeltaY * this.config.dragSensitivity,
      timestamp: currentPoint.timestamp
    };
  }

  /**
   * 默认拖拽处理（基于边界框变换）
   */
  private handleDefaultDrag(
    action: DrawAction,
    anchor: AnchorPoint,
    currentPoint: Point,
    canvasBounds?: { width: number; height: number }
  ): DragResult {
    if (!this.state) {
      return { success: false, error: '未开始拖拽' };
    }

    const { startBounds, startPoint } = this.state;
    
    // 计算新边界
    const newBounds = this.calculateNewBoundsForAnchor(
      startBounds,
      anchor.type,
      currentPoint.x - startPoint.x,
      currentPoint.y - startPoint.y
    );

    // 计算缩放比例
    const scaleX = newBounds.width / startBounds.width;
    const scaleY = newBounds.height / startBounds.height;
    const centerX = startBounds.x + startBounds.width / 2;
    const centerY = startBounds.y + startBounds.height / 2;

    // 使用 TransformOperations 进行缩放
    const result = TransformOperations.scaleAction(
      this.state.startAction || action,
      scaleX,
      scaleY,
      centerX,
      centerY,
      canvasBounds
    );

    if (!result.success || !result.action) {
      return { success: false, error: result.error };
    }

    // 更新缓存
    this.state.lastPoint = currentPoint;
    this.state.lastResult = result.action;

    return { success: true, action: result.action };
  }

  /**
   * 根据锚点类型计算新边界
   */
  private calculateNewBoundsForAnchor(
    originalBounds: Bounds,
    anchorType: string,
    deltaX: number,
    deltaY: number
  ): Bounds {
    let { x, y, width, height } = originalBounds;
    const minSize = 10;

    switch (anchorType) {
      case 'resize-nw':
        x += deltaX;
        y += deltaY;
        width -= deltaX;
        height -= deltaY;
        break;
      case 'resize-ne':
        y += deltaY;
        width += deltaX;
        height -= deltaY;
        break;
      case 'resize-sw':
        x += deltaX;
        width -= deltaX;
        height += deltaY;
        break;
      case 'resize-se':
        width += deltaX;
        height += deltaY;
        break;
      case 'resize-n':
        y += deltaY;
        height -= deltaY;
        break;
      case 'resize-s':
        height += deltaY;
        break;
      case 'resize-w':
        x += deltaX;
        width -= deltaX;
        break;
      case 'resize-e':
        width += deltaX;
        break;
      default:
        break;
    }

    // 确保最小尺寸
    if (width < minSize) {
      if (anchorType.includes('w')) {
        x -= minSize - width;
      }
      width = minSize;
    }
    if (height < minSize) {
      if (anchorType.includes('n')) {
        y -= minSize - height;
      }
      height = minSize;
    }

    return { x, y, width, height };
  }

  /**
   * 🔧 智能边界约束：保持形状完整性
   * 
   * 与单独约束每个点不同，此方法计算整体偏移量，
   * 将形状推回画布内，保持形状完整性。
   */
  private clampActionToCanvas(
    action: DrawAction,
    canvasBounds: { width: number; height: number }
  ): DrawAction {
    if (!action.points || action.points.length === 0) {
      return action;
    }
    
    // 计算形状的边界框
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    for (const point of action.points) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
    
    // 计算需要的偏移量
    let offsetX = 0;
    let offsetY = 0;
    
    // 如果超出左边界
    if (minX < 0) {
      offsetX = -minX;
    }
    // 如果超出右边界
    else if (maxX > canvasBounds.width) {
      offsetX = canvasBounds.width - maxX;
    }
    
    // 如果超出上边界
    if (minY < 0) {
      offsetY = -minY;
    }
    // 如果超出下边界
    else if (maxY > canvasBounds.height) {
      offsetY = canvasBounds.height - maxY;
    }
    
    // 如果不需要调整，直接返回原 action
    if (offsetX === 0 && offsetY === 0) {
      return action;
    }
    
    // 应用偏移量，保持形状完整性
    return {
      ...action,
      points: action.points.map(p => ({
        ...p,
        x: p.x + offsetX,
        y: p.y + offsetY
      }))
    };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<DragHandlerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取配置
   */
  getConfig(): DragHandlerConfig {
    return { ...this.config };
  }
}

