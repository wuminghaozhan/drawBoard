import type { Point } from '../core/CanvasEngine';
import { logger } from './Logger';

/**
 * 边界框接口
 */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 边界验证器 - 统一的边界检查和约束工具
 * 
 * 提供统一的边界检查方法，确保所有操作都符合画布边界和最小尺寸限制
 */
export class BoundsValidator {
  /**
   * 限制点在画布范围内
   * @param point 要限制的点
   * @param canvasBounds 画布边界
   * @returns 限制后的点
   */
  static clampPointToCanvas(
    point: Point,
    canvasBounds: Bounds
  ): Point {
    return {
      ...point,
      x: Math.max(0, Math.min(canvasBounds.width, point.x)),
      y: Math.max(0, Math.min(canvasBounds.height, point.y))
    };
  }

  /**
   * 限制边界框在画布范围内
   * @param bounds 要限制的边界框
   * @param canvasBounds 画布边界
   * @returns 限制后的边界框
   */
  static clampBoundsToCanvas(
    bounds: Bounds,
    canvasBounds: Bounds
  ): Bounds {
    const clampedX = Math.max(0, Math.min(canvasBounds.width - bounds.width, bounds.x));
    const clampedY = Math.max(0, Math.min(canvasBounds.height - bounds.height, bounds.y));
    const clampedWidth = Math.min(bounds.width, canvasBounds.width - clampedX);
    const clampedHeight = Math.min(bounds.height, canvasBounds.height - clampedY);

    return {
      x: clampedX,
      y: clampedY,
      width: Math.max(0, clampedWidth),
      height: Math.max(0, clampedHeight)
    };
  }

  /**
   * 确保边界框满足最小尺寸要求
   * @param bounds 边界框
   * @param minSize 最小尺寸（宽度和高度）
   * @returns 调整后的边界框
   */
  static ensureMinSize(
    bounds: Bounds,
    minSize: number = 1
  ): Bounds {
    return {
      ...bounds,
      width: Math.max(minSize, bounds.width),
      height: Math.max(minSize, bounds.height)
    };
  }

  /**
   * 确保边界框满足最小和最大尺寸要求
   * @param bounds 边界框
   * @param minSize 最小尺寸
   * @param maxSize 最大尺寸（可选）
   * @returns 调整后的边界框
   */
  static clampSize(
    bounds: Bounds,
    minSize: number = 1,
    maxSize?: number
  ): Bounds {
    let width = Math.max(minSize, bounds.width);
    let height = Math.max(minSize, bounds.height);

    if (maxSize !== undefined) {
      width = Math.min(maxSize, width);
      height = Math.min(maxSize, height);
    }

    return {
      ...bounds,
      width,
      height
    };
  }

  /**
   * 检查点是否在画布范围内
   * @param point 要检查的点
   * @param canvasBounds 画布边界
   * @returns 是否在范围内
   */
  static isPointInCanvas(
    point: Point,
    canvasBounds: Bounds
  ): boolean {
    return (
      point.x >= 0 &&
      point.x <= canvasBounds.width &&
      point.y >= 0 &&
      point.y <= canvasBounds.height
    );
  }

  /**
   * 检查边界框是否在画布范围内
   * @param bounds 要检查的边界框
   * @param canvasBounds 画布边界
   * @returns 是否在范围内
   */
  static isBoundsInCanvas(
    bounds: Bounds,
    canvasBounds: Bounds
  ): boolean {
    return (
      bounds.x >= 0 &&
      bounds.y >= 0 &&
      bounds.x + bounds.width <= canvasBounds.width &&
      bounds.y + bounds.height <= canvasBounds.height
    );
  }

  /**
   * 检查边界框是否与画布相交
   * @param bounds 要检查的边界框
   * @param canvasBounds 画布边界
   * @returns 是否相交
   */
  static isBoundsIntersectingCanvas(
    bounds: Bounds,
    canvasBounds: Bounds
  ): boolean {
    return !(
      bounds.x + bounds.width < 0 ||
      bounds.x > canvasBounds.width ||
      bounds.y + bounds.height < 0 ||
      bounds.y > canvasBounds.height
    );
  }

  /**
   * 限制移动后的边界框在画布范围内
   * @param bounds 原始边界框
   * @param deltaX 水平移动距离
   * @param deltaY 垂直移动距离
   * @param canvasBounds 画布边界
   * @returns 限制后的边界框
   */
  static clampMoveBounds(
    bounds: Bounds,
    deltaX: number,
    deltaY: number,
    canvasBounds: Bounds
  ): Bounds {
    const newBounds = {
      ...bounds,
      x: bounds.x + deltaX,
      y: bounds.y + deltaY
    };

    return this.clampBoundsToCanvas(newBounds, canvasBounds);
  }

  /**
   * 限制缩放后的边界框
   * @param bounds 原始边界框
   * @param scaleX 水平缩放比例
   * @param scaleY 垂直缩放比例
   * @param minSize 最小尺寸
   * @param canvasBounds 画布边界（可选）
   * @returns 限制后的边界框
   */
  static clampScaleBounds(
    bounds: Bounds,
    scaleX: number,
    scaleY: number,
    minSize: number = 1,
    canvasBounds?: Bounds
  ): Bounds {
    let newBounds = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width * scaleX,
      height: bounds.height * scaleY
    };

    // 确保最小尺寸
    newBounds = this.ensureMinSize(newBounds, minSize);

    // 如果提供了画布边界，限制在画布内
    if (canvasBounds) {
      newBounds = this.clampBoundsToCanvas(newBounds, canvasBounds);
    }

    return newBounds;
  }

  /**
   * 计算边界框的中心点
   * @param bounds 边界框
   * @returns 中心点
   */
  static getBoundsCenter(bounds: Bounds): Point {
    return {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2
    };
  }

  /**
   * 验证边界框的有效性
   * @param bounds 边界框
   * @returns 是否有效
   */
  static isValidBounds(bounds: Bounds): boolean {
    return (
      isFinite(bounds.x) &&
      isFinite(bounds.y) &&
      isFinite(bounds.width) &&
      isFinite(bounds.height) &&
      bounds.width > 0 &&
      bounds.height > 0
    );
  }

  /**
   * 规范化边界框（确保所有值都是有效的数字）
   * @param bounds 边界框
   * @returns 规范化后的边界框
   */
  static normalizeBounds(bounds: Partial<Bounds>): Bounds {
    return {
      x: isFinite(bounds.x) ? bounds.x! : 0,
      y: isFinite(bounds.y) ? bounds.y! : 0,
      width: isFinite(bounds.width) && bounds.width! > 0 ? bounds.width! : 1,
      height: isFinite(bounds.height) && bounds.height! > 0 ? bounds.height! : 1
    };
  }
}

