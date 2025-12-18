import type { DrawAction } from '../DrawTool';
import type { Point } from '../../core/CanvasEngine';
import { logger } from '../../infrastructure/logging/Logger';

/**
 * 变换结果
 */
export interface TransformResult {
  success: boolean;
  action?: DrawAction;
  error?: string;
}

/**
 * 批量变换结果
 */
export interface BatchTransformResult {
  success: boolean;
  actions: DrawAction[];
  errors: string[];
}

/**
 * 变换操作类
 * 
 * 提取自 SelectTool 的缩放、旋转、移动等变换操作。
 * 这些操作是纯函数，不依赖于 SelectTool 的状态。
 */
export class TransformOperations {
  /** 文本默认宽度（像素） */
  public static readonly DEFAULT_TEXT_WIDTH = 100;
  /**
   * 缩放单个 Action
   */
  static scaleAction(
    action: DrawAction,
    scaleX: number,
    scaleY: number,
    centerX: number,
    centerY: number,
    canvasBounds?: { width: number; height: number }
  ): TransformResult {
    // 检查参数有效性
    if (!isFinite(scaleX) || !isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
      return {
        success: false,
        error: `无效的缩放参数: scaleX=${scaleX}, scaleY=${scaleY}`
      };
    }

    let newPoints: Point[];

    // 根据 action 类型使用不同的缩放逻辑
    switch (action.type) {
      case 'circle':
        newPoints = this.scaleCircle(action, Math.min(scaleX, scaleY));
        break;
      case 'text':
        newPoints = this.scaleText(action, scaleX, scaleY, centerX, centerY);
        break;
      case 'rect':
        newPoints = this.scaleRect(action, scaleX, scaleY, centerX, centerY);
        break;
      case 'line':
        newPoints = this.scaleLine(action, scaleX, scaleY, centerX, centerY);
        break;
      case 'polygon':
        newPoints = this.scalePolygon(action, scaleX, scaleY, centerX, centerY);
        break;
      case 'pen':
      case 'brush':
      case 'eraser':
        newPoints = this.scalePath(action, scaleX, scaleY, centerX, centerY);
        break;
      default:
        newPoints = this.scaleGeneric(action, scaleX, scaleY, centerX, centerY);
        break;
    }

    // 🔧 智能边界约束：检查缩放后是否超出画布，如果超出则将形状推回边界内
    if (canvasBounds) {
      newPoints = this.constrainShapeToCanvas(newPoints, canvasBounds);
    }

    // 构建更新后的 action
    let updatedAction: DrawAction;
    if (action.type === 'text') {
      const textAction = action as DrawAction & { fontSize?: number; width?: number; height?: number };
      const originalFontSize = textAction.fontSize || 16;
      const uniformScale = Math.min(scaleX, scaleY);
      const newFontSize = Math.max(8, Math.min(72, originalFontSize * uniformScale));
      
      // 📝 缩放文本时，如果 width/height 存在，按比例缩放；否则清除让系统重新计算
      const updatedTextAction: DrawAction & { width?: number; height?: number } = {
        ...action,
        points: newPoints,
        fontSize: newFontSize
      } as DrawAction;
      
      if (textAction.width && textAction.height) {
        // 如果存在 width/height，按比例缩放
        updatedTextAction.width = textAction.width * uniformScale;
        updatedTextAction.height = textAction.height * uniformScale;
      } else {
        // 否则清除，让边界计算器根据新的 fontSize 重新计算
        updatedTextAction.width = undefined;
        updatedTextAction.height = undefined;
      }
      
      updatedAction = updatedTextAction as DrawAction;
    } else {
      updatedAction = {
        ...action,
        points: newPoints
      };
    }

    logger.debug('TransformOperations: 缩放完成', {
      actionType: action.type,
      scaleX,
      scaleY
    });

    return { success: true, action: updatedAction };
  }

  /**
   * 批量缩放多个 Actions
   */
  static scaleActions(
    actions: DrawAction[],
    scaleX: number,
    scaleY: number,
    centerX: number,
    centerY: number,
    canvasBounds?: { width: number; height: number }
  ): BatchTransformResult {
    const results: DrawAction[] = [];
    const errors: string[] = [];

    for (const action of actions) {
      const result = this.scaleAction(action, scaleX, scaleY, centerX, centerY, canvasBounds);
      if (result.success && result.action) {
        results.push(result.action);
      } else {
        errors.push(result.error || `缩放 ${action.id} 失败`);
      }
    }

    return {
      success: errors.length === 0,
      actions: results,
      errors
    };
  }

  /**
   * 调整文本框宽度（用于边中点拖拽）
   * 📝 左右锚点拖拽都能实时改变文本宽度
   * - 拖拽右边：保持左边不动，只改变宽度
   * - 拖拽左边：保持右边不动，改变宽度和起始位置
   * 
   * 宽度变化会导致文本换行改变，高度会自动重新计算
   * 
   * @param action 文本 action
   * @param newWidth 新的宽度
   * @param anchorType 锚点类型（'left' 或 'right'）
   * @param newStartX 新的起始 X 坐标（拖拽左边时必须提供，拖拽右边时忽略）
   */
  static resizeTextWidth(
    action: DrawAction,
    newWidth: number,
    anchorType: 'left' | 'right',
    newStartX?: number
  ): TransformResult {
    if (action.type !== 'text') {
      return { success: false, error: '只有文本类型支持宽度调整' };
    }

    const textAction = action as DrawAction & { width?: number; fontSize?: number };
    const minWidth = 20; // 最小宽度
    const clampedWidth = Math.max(minWidth, newWidth);

    // 📝 根据锚点类型调整位置和宽度
    let newPoints = [...(action.points || [])];
    if (newPoints.length > 0) {
      if (anchorType === 'left') {
        // 📝 拖拽左边锚点：保持右边不动，左边跟随鼠标
        // 必须提供 newStartX（鼠标位置）
        if (newStartX !== undefined) {
          newPoints[0] = {
            x: newStartX,
            y: newPoints[0].y
          };
        } else {
          // 如果没有提供 newStartX，根据宽度变化计算（向后兼容）
          const currentWidth = textAction.width ?? TransformOperations.DEFAULT_TEXT_WIDTH;
          const deltaWidth = clampedWidth - currentWidth;
          newPoints[0] = {
            x: newPoints[0].x - deltaWidth,
            y: newPoints[0].y
          };
        }
      } else {
        // 📝 拖拽右边锚点：保持左边不动，只改变宽度
        // newPoints[0] 保持不变，只更新 width
      }
    }

    // 📝 清除 height，让边界计算器根据新的 width 重新计算高度
    // 因为宽度变化会导致文本换行改变，高度也会变化
    const updatedAction: DrawAction = {
      ...action,
      points: newPoints,
      width: clampedWidth,
      height: undefined // 清除旧的高度，强制重新计算
    } as DrawAction;

    logger.debug('TransformOperations: 调整文本宽度', {
      actionId: action.id,
      oldWidth: textAction.width,
      newWidth: clampedWidth,
      anchorType
    });

    return { success: true, action: updatedAction };
  }

  /**
   * 判断锚点类型是否为边中点（用于文本宽度调整）
   */
  static isEdgeAnchor(anchorType: string): boolean {
    return ['left', 'right', 'top', 'bottom', 'resize-w', 'resize-e', 'resize-n', 'resize-s'].includes(anchorType);
  }

  /**
   * 判断锚点类型是否为水平边中点（左/右）
   */
  static isHorizontalEdgeAnchor(anchorType: string): boolean {
    return ['left', 'right', 'resize-w', 'resize-e'].includes(anchorType);
  }

  /**
   * 旋转单个 Action
   * 矩形统一使用4顶点格式，无需特殊处理
   */
  static rotateAction(
    action: DrawAction,
    angle: number,
    centerX: number,
    centerY: number,
    canvasBounds?: { width: number; height: number }
  ): TransformResult {
    if (!action.points || action.points.length === 0) {
      return { success: false, error: '无效的 action: 没有点' };
    }

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    let newPoints = action.points.map(point => ({
      ...point,
      x: centerX + (point.x - centerX) * cos - (point.y - centerY) * sin,
      y: centerY + (point.x - centerX) * sin + (point.y - centerY) * cos
    }));

    // 🔧 智能边界约束：旋转后如果超出画布，将形状推回边界内
    if (canvasBounds) {
      newPoints = this.constrainShapeToCanvas(newPoints, canvasBounds);
    }

    const updatedAction: DrawAction & { rotation?: number } = {
      ...action,
      points: newPoints,
      // 保存累计旋转角度
      rotation: ((action as DrawAction & { rotation?: number }).rotation || 0) + angle
    };

    logger.debug('TransformOperations: 旋转完成', {
      actionType: action.type,
      angle: angle * (180 / Math.PI),
      totalRotation: updatedAction.rotation
    });

    return { success: true, action: updatedAction };
  }

  /**
   * 计算旋转角度（基于拖拽点相对于中心点）
   * @param centerX 旋转中心 X
   * @param centerY 旋转中心 Y
   * @param startX 起始点 X
   * @param startY 起始点 Y
   * @param currentX 当前点 X
   * @param currentY 当前点 Y
   * @returns 旋转角度（弧度）
   */
  static calculateRotationAngle(
    centerX: number,
    centerY: number,
    startX: number,
    startY: number,
    currentX: number,
    currentY: number
  ): number {
    const startAngle = Math.atan2(startY - centerY, startX - centerX);
    const currentAngle = Math.atan2(currentY - centerY, currentX - centerX);
    return currentAngle - startAngle;
  }

  /**
   * 判断是否为旋转锚点类型
   */
  static isRotateAnchor(anchorType: string): boolean {
    return anchorType === 'rotate';
  }

  /**
   * 批量旋转多个 Actions
   */
  static rotateActions(
    actions: DrawAction[],
    angle: number,
    centerX: number,
    centerY: number,
    canvasBounds?: { width: number; height: number }
  ): BatchTransformResult {
    const results: DrawAction[] = [];
    const errors: string[] = [];

    for (const action of actions) {
      const result = this.rotateAction(action, angle, centerX, centerY, canvasBounds);
      if (result.success && result.action) {
        results.push(result.action);
      } else {
        errors.push(result.error || `旋转 ${action.id} 失败`);
      }
    }

    return {
      success: errors.length === 0,
      actions: results,
      errors
    };
  }

  /**
   * 移动单个 Action
   * 
   * 【重要】边界约束逻辑：
   * - 不再单独约束每个点（会导致形状变形/消失）
   * - 而是限制移动距离，保持形状完整性
   */
  static moveAction(
    action: DrawAction,
    deltaX: number,
    deltaY: number,
    canvasBounds?: { width: number; height: number }
  ): TransformResult {
    if (!action.points || action.points.length === 0) {
      return { success: false, error: '无效的 action: 没有点' };
    }

    let adjustedDeltaX = deltaX;
    let adjustedDeltaY = deltaY;

    // 🔧 智能边界约束：限制移动距离而不是约束每个点
    if (canvasBounds) {
      // 计算当前形状的边界框
      const bounds = this.getActionBounds(action.points);
      
      // 计算移动后的边界框位置
      const newMinX = bounds.minX + deltaX;
      const newMaxX = bounds.maxX + deltaX;
      const newMinY = bounds.minY + deltaY;
      const newMaxY = bounds.maxY + deltaY;
      
      // 调整 deltaX：如果超出左边界，限制向左移动
      if (newMinX < 0) {
        adjustedDeltaX = deltaX - newMinX; // 将 minX 推回到 0
      }
      // 如果超出右边界，限制向右移动
      else if (newMaxX > canvasBounds.width) {
        adjustedDeltaX = deltaX - (newMaxX - canvasBounds.width);
      }
      
      // 调整 deltaY：如果超出上边界，限制向上移动
      if (newMinY < 0) {
        adjustedDeltaY = deltaY - newMinY;
      }
      // 如果超出下边界，限制向下移动
      else if (newMaxY > canvasBounds.height) {
        adjustedDeltaY = deltaY - (newMaxY - canvasBounds.height);
      }
    }

    const newPoints = action.points.map(point => ({
      ...point,
      x: point.x + adjustedDeltaX,
      y: point.y + adjustedDeltaY
    }));

    const updatedAction = {
      ...action,
      points: newPoints
    };

    return { success: true, action: updatedAction };
  }
  
  /**
   * 计算点集的边界框
   */
  private static getActionBounds(points: Point[]): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    for (const point of points) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
    
    return { minX, maxX, minY, maxY };
  }

  /**
   * 批量移动多个 Actions
   */
  static moveActions(
    actions: DrawAction[],
    deltaX: number,
    deltaY: number,
    canvasBounds?: { width: number; height: number }
  ): BatchTransformResult {
    const results: DrawAction[] = [];
    const errors: string[] = [];

    for (const action of actions) {
      const result = this.moveAction(action, deltaX, deltaY, canvasBounds);
      if (result.success && result.action) {
        results.push(result.action);
      } else {
        errors.push(result.error || `移动 ${action.id} 失败`);
      }
    }

    return {
      success: errors.length === 0,
      actions: results,
      errors
    };
  }

  /**
   * 应用自定义变换函数
   */
  static applyTransform(
    action: DrawAction,
    transformFn: (point: Point) => Point
  ): TransformResult {
    if (!action.points || action.points.length === 0) {
      return { success: false, error: '无效的 action: 没有点' };
    }

    const newPoints = action.points.map(point => ({
      ...point,
      ...transformFn(point)
    }));

    const updatedAction = {
      ...action,
      points: newPoints
    };

    return { success: true, action: updatedAction };
  }

  // ============================================
  // 私有方法：形状特定的缩放逻辑
  // ============================================

  /**
   * 缩放圆形
   */
  private static scaleCircle(action: DrawAction, scale: number): Point[] {
    if (!action.points || action.points.length < 2) {
      return action.points || [];
    }

    const center = action.points[0];
    const radiusPoint = action.points[1];

    // 计算原始半径
    const originalRadius = Math.sqrt(
      Math.pow(radiusPoint.x - center.x, 2) + 
      Math.pow(radiusPoint.y - center.y, 2)
    );

    // 新半径
    const newRadius = originalRadius * scale;

    // 保持圆心不变，缩放半径点
    const angle = Math.atan2(radiusPoint.y - center.y, radiusPoint.x - center.x);
    const newRadiusPoint: Point = {
      x: center.x + newRadius * Math.cos(angle),
      y: center.y + newRadius * Math.sin(angle)
    };

    return [center, newRadiusPoint];
  }

  /**
   * 缩放文字
   */
  private static scaleText(
    action: DrawAction,
    scaleX: number,
    scaleY: number,
    centerX: number,
    centerY: number
  ): Point[] {
    return this.scalePointsByCenter(action.points || [], scaleX, scaleY, centerX, centerY);
  }

  /**
   * 缩放矩形
   */
  private static scaleRect(
    action: DrawAction,
    scaleX: number,
    scaleY: number,
    centerX: number,
    centerY: number
  ): Point[] {
    return this.scalePointsByCenter(action.points || [], scaleX, scaleY, centerX, centerY);
  }

  /**
   * 缩放直线
   */
  private static scaleLine(
    action: DrawAction,
    scaleX: number,
    scaleY: number,
    centerX: number,
    centerY: number
  ): Point[] {
    return this.scalePointsByCenter(action.points || [], scaleX, scaleY, centerX, centerY);
  }

  /**
   * 缩放多边形
   */
  private static scalePolygon(
    action: DrawAction,
    scaleX: number,
    scaleY: number,
    centerX: number,
    centerY: number
  ): Point[] {
    return this.scalePointsByCenter(action.points || [], scaleX, scaleY, centerX, centerY);
  }

  /**
   * 缩放路径
   */
  private static scalePath(
    action: DrawAction,
    scaleX: number,
    scaleY: number,
    centerX: number,
    centerY: number
  ): Point[] {
    return this.scalePointsByCenter(action.points || [], scaleX, scaleY, centerX, centerY);
  }

  /**
   * 缩放通用图形
   */
  private static scaleGeneric(
    action: DrawAction,
    scaleX: number,
    scaleY: number,
    centerX: number,
    centerY: number
  ): Point[] {
    return this.scalePointsByCenter(action.points || [], scaleX, scaleY, centerX, centerY);
  }

  /**
   * 基于中心点缩放所有点
   */
  private static scalePointsByCenter(
    points: Point[],
    scaleX: number,
    scaleY: number,
    centerX: number,
    centerY: number
  ): Point[] {
    return points.map(point => {
      const newX = centerX + (point.x - centerX) * scaleX;
      const newY = centerY + (point.y - centerY) * scaleY;

      if (!isFinite(newX) || !isFinite(newY)) {
        logger.warn('TransformOperations: 缩放产生无效坐标', {
          originalPoint: point,
          scaleX,
          scaleY
        });
        return point;
      }

      return { ...point, x: newX, y: newY };
    });
  }

  /**
   * 将点限制在画布范围内
   */
  private static clampPointsToCanvas(
    points: Point[],
    canvasBounds: { width: number; height: number }
  ): Point[] {
    return points.map(point => ({
      ...point,
      x: Math.max(0, Math.min(canvasBounds.width, point.x)),
      y: Math.max(0, Math.min(canvasBounds.height, point.y))
    }));
  }
  
  /**
   * 🔧 智能边界约束：保持形状完整性
   * 
   * 与 clampPointsToCanvas 不同，此方法不会单独约束每个点，
   * 而是计算整体偏移量，将形状推回画布内，保持形状完整性。
   * 
   * @param points 形状的点集
   * @param canvasBounds 画布边界
   * @returns 约束后的点集（形状保持完整）
   */
  private static constrainShapeToCanvas(
    points: Point[],
    canvasBounds: { width: number; height: number }
  ): Point[] {
    if (points.length === 0) {
      return points;
    }
    
    // 计算形状的边界框
    const bounds = this.getActionBounds(points);
    
    // 计算需要的偏移量
    let offsetX = 0;
    let offsetY = 0;
    
    // 如果超出左边界
    if (bounds.minX < 0) {
      offsetX = -bounds.minX;
    }
    // 如果超出右边界
    else if (bounds.maxX > canvasBounds.width) {
      offsetX = canvasBounds.width - bounds.maxX;
    }
    
    // 如果超出上边界
    if (bounds.minY < 0) {
      offsetY = -bounds.minY;
    }
    // 如果超出下边界
    else if (bounds.maxY > canvasBounds.height) {
      offsetY = canvasBounds.height - bounds.maxY;
    }
    
    // 如果不需要调整，直接返回原点集
    if (offsetX === 0 && offsetY === 0) {
      return points;
    }
    
    // 应用偏移量
    return points.map(point => ({
      ...point,
      x: point.x + offsetX,
      y: point.y + offsetY
    }));
  }

  // ============================================
  // 工具方法
  // ============================================

  /**
   * 计算 Actions 的中心点
   */
  static calculateCenter(actions: DrawAction[]): { x: number; y: number } | null {
    if (actions.length === 0) {
      return null;
    }

    let sumX = 0;
    let sumY = 0;
    let count = 0;

    for (const action of actions) {
      if (action.points) {
        for (const point of action.points) {
          sumX += point.x;
          sumY += point.y;
          count++;
        }
      }
    }

    if (count === 0) {
      return null;
    }

    return {
      x: sumX / count,
      y: sumY / count
    };
  }

  /**
   * 计算 Actions 的边界框
   */
  static calculateBounds(
    actions: DrawAction[]
  ): { x: number; y: number; width: number; height: number } | null {
    if (actions.length === 0) {
      return null;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const action of actions) {
      if (action.points) {
        for (const point of action.points) {
          minX = Math.min(minX, point.x);
          minY = Math.min(minY, point.y);
          maxX = Math.max(maxX, point.x);
          maxY = Math.max(maxY, point.y);
        }
      }
    }

    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      return null;
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  /**
   * 创建移动变换函数
   */
  static createMoveTransform(
    deltaX: number,
    deltaY: number
  ): (point: Point) => Point {
    return (point: Point) => ({
      x: point.x + deltaX,
      y: point.y + deltaY
    });
  }

  /**
   * 创建缩放变换函数
   */
  static createScaleTransform(
    scaleX: number,
    scaleY: number,
    centerX: number,
    centerY: number
  ): (point: Point) => Point {
    return (point: Point) => ({
      x: centerX + (point.x - centerX) * scaleX,
      y: centerY + (point.y - centerY) * scaleY
    });
  }

  /**
   * 创建旋转变换函数
   */
  static createRotateTransform(
    angle: number,
    centerX: number,
    centerY: number
  ): (point: Point) => Point {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    
    return (point: Point) => ({
      x: centerX + (point.x - centerX) * cos - (point.y - centerY) * sin,
      y: centerY + (point.x - centerX) * sin + (point.y - centerY) * cos
    });
  }

  /**
   * 根据锚点类型和鼠标移动计算新的边界框
   */
  static calculateNewBoundsForAnchor(
    bounds: { x: number; y: number; width: number; height: number },
    anchorType: string,
    deltaX: number,
    deltaY: number
  ): { x: number; y: number; width: number; height: number } | null {
    const newBounds = { ...bounds };

    switch (anchorType) {
      case 'top-left':
        newBounds.x = bounds.x + deltaX;
        newBounds.y = bounds.y + deltaY;
        newBounds.width = bounds.width - deltaX;
        newBounds.height = bounds.height - deltaY;
        break;
      case 'top-right':
        newBounds.y = bounds.y + deltaY;
        newBounds.width = bounds.width + deltaX;
        newBounds.height = bounds.height - deltaY;
        break;
      case 'bottom-right':
        newBounds.width = bounds.width + deltaX;
        newBounds.height = bounds.height + deltaY;
        break;
      case 'bottom-left':
        newBounds.x = bounds.x + deltaX;
        newBounds.width = bounds.width - deltaX;
        newBounds.height = bounds.height + deltaY;
        break;
      case 'top':
        newBounds.y = bounds.y + deltaY;
        newBounds.height = bounds.height - deltaY;
        break;
      case 'right':
        newBounds.width = bounds.width + deltaX;
        break;
      case 'bottom':
        newBounds.height = bounds.height + deltaY;
        break;
      case 'left':
        newBounds.x = bounds.x + deltaX;
        newBounds.width = bounds.width - deltaX;
        break;
      default:
        return null;
    }

    // 检查最小尺寸
    if (newBounds.width < 10 || newBounds.height < 10) {
      return null;
    }

    return newBounds;
  }

  /**
   * 计算边界框变换的缩放参数
   */
  static calculateBoundsTransformScale(
    newBounds: { x: number; y: number; width: number; height: number },
    oldBounds: { x: number; y: number; width: number; height: number }
  ): { scaleX: number; scaleY: number; centerX: number; centerY: number } | null {
    // 检查边界框是否有效
    if (oldBounds.width <= 0 || oldBounds.height <= 0) {
      return null;
    }
    
    if (newBounds.width <= 0 || newBounds.height <= 0) {
      return null;
    }
    
    let scaleX = newBounds.width / oldBounds.width;
    let scaleY = newBounds.height / oldBounds.height;
    
    // 检查缩放比例是否有效
    if (!isFinite(scaleX) || !isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
      return null;
    }
    
    // 限制缩放比例范围
    const MIN_SCALE = 0.1;
    const MAX_SCALE = 10;
    scaleX = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scaleX));
    scaleY = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scaleY));
    
    // 使用边界框的中心点作为缩放中心
    const centerX = oldBounds.x + oldBounds.width / 2;
    const centerY = oldBounds.y + oldBounds.height / 2;
    
    return { scaleX, scaleY, centerX, centerY };
  }
}

