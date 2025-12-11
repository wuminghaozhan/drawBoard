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

    // 限制点在画布范围内
    if (canvasBounds) {
      newPoints = this.clampPointsToCanvas(newPoints, canvasBounds);
    }

    // 构建更新后的 action
    let updatedAction: DrawAction;
    if (action.type === 'text') {
      const textAction = action as DrawAction & { fontSize?: number };
      const originalFontSize = textAction.fontSize || 16;
      const uniformScale = Math.min(scaleX, scaleY);
      const newFontSize = Math.max(8, Math.min(72, originalFontSize * uniformScale));
      
      updatedAction = {
        ...action,
        points: newPoints,
        fontSize: newFontSize
      } as DrawAction;
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
   * 旋转单个 Action
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

    // 限制点在画布范围内
    if (canvasBounds) {
      newPoints = this.clampPointsToCanvas(newPoints, canvasBounds);
    }

    const updatedAction = {
      ...action,
      points: newPoints
    };

    logger.debug('TransformOperations: 旋转完成', {
      actionType: action.type,
      angle: angle * (180 / Math.PI)
    });

    return { success: true, action: updatedAction };
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

    let newPoints = action.points.map(point => ({
      ...point,
      x: point.x + deltaX,
      y: point.y + deltaY
    }));

    // 限制点在画布范围内
    if (canvasBounds) {
      newPoints = this.clampPointsToCanvas(newPoints, canvasBounds);
    }

    const updatedAction = {
      ...action,
      points: newPoints
    };

    return { success: true, action: updatedAction };
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

