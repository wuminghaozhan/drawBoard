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
  /** 拖拽起始 Action */
  startAction: DrawAction | null;
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
    startAction: DrawAction | null = null
  ): void {
    this.state = {
      startPoint,
      startBounds,
      startAction,
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
   * 限制 Action 的点在画布范围内
   */
  private clampActionToCanvas(
    action: DrawAction,
    canvasBounds: { width: number; height: number }
  ): DrawAction {
    return {
      ...action,
      points: action.points.map(p => ({
        ...p,
        x: Math.max(0, Math.min(canvasBounds.width, p.x)),
        y: Math.max(0, Math.min(canvasBounds.height, p.y))
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

