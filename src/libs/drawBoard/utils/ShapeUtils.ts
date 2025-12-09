import type { Point } from '../core/CanvasEngine';
import type { DrawAction } from '../tools/DrawTool';
import type { Bounds } from '../tools/anchor/AnchorTypes';

/**
 * 图形工具类
 * 提供图形相关的通用功能，提高代码复用性
 */
export class ShapeUtils {
  /**
   * 计算边界框
   * @param points 点数组
   * @returns 边界框
   */
  static calculateBounds(points: Point[]): Bounds {
    if (points.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
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
      width: maxX - minX || 10, // 最小宽度为10
      height: maxY - minY || 10  // 最小高度为10
    };
  }
  
  /**
   * 移动图形
   * @param shape 图形动作
   * @param deltaX X方向偏移
   * @param deltaY Y方向偏移
   * @param canvasBounds 画布边界（可选，用于限制范围）
   * @returns 移动后的图形动作，如果 delta 无效则返回 null
   */
  static moveShape(
    shape: DrawAction,
    deltaX: number,
    deltaY: number,
    canvasBounds?: { width: number; height: number }
  ): DrawAction | null {
    // 验证 delta 值
    if (isNaN(deltaX) || isNaN(deltaY) || !isFinite(deltaX) || !isFinite(deltaY)) {
      return null;
    }
    
    const newPoints = shape.points.map(p => {
      let newX = p.x + deltaX;
      let newY = p.y + deltaY;
      
      // 限制在画布范围内
      if (canvasBounds) {
        newX = Math.max(0, Math.min(canvasBounds.width, newX));
        newY = Math.max(0, Math.min(canvasBounds.height, newY));
      }
      
      return { x: newX, y: newY };
    });
    
    return { ...shape, points: newPoints };
  }
  
  /**
   * 检查点是否在边界框内
   * @param point 检查的点
   * @param bounds 边界框
   * @param tolerance 容差（可选）
   * @returns 是否在边界框内
   */
  static isPointInBounds(
    point: Point,
    bounds: Bounds,
    tolerance: number = 0
  ): boolean {
    return (
      point.x >= bounds.x - tolerance &&
      point.x <= bounds.x + bounds.width + tolerance &&
      point.y >= bounds.y - tolerance &&
      point.y <= bounds.y + bounds.height + tolerance
    );
  }
  
  /**
   * 检查两个边界框是否相交
   * @param bounds1 边界框1
   * @param bounds2 边界框2
   * @returns 是否相交
   */
  static isBoundsIntersect(bounds1: Bounds, bounds2: Bounds): boolean {
    return (
      bounds1.x < bounds2.x + bounds2.width &&
      bounds1.x + bounds1.width > bounds2.x &&
      bounds1.y < bounds2.y + bounds2.height &&
      bounds1.y + bounds1.height > bounds2.y
    );
  }
  
  /**
   * 合并多个边界框
   * @param boundsArray 边界框数组
   * @returns 合并后的边界框
   */
  static mergeBounds(boundsArray: Bounds[]): Bounds {
    if (boundsArray.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
    
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    
    for (const bounds of boundsArray) {
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
   * 验证并修正边界框
   * @param bounds 边界框
   * @param canvasBounds 画布边界（可选）
   * @returns 修正后的边界框
   */
  static validateBounds(
    bounds: Bounds,
    canvasBounds?: { width: number; height: number }
  ): Bounds {
    // 确保宽度和高度为正数，坐标非负
    const validated: Bounds = {
      x: Math.max(0, bounds.x),
      y: Math.max(0, bounds.y),
      width: Math.max(0, bounds.width),
      height: Math.max(0, bounds.height)
    };
    
    if (canvasBounds) {
      // 限制在画布范围内
      validated.x = Math.max(0, Math.min(canvasBounds.width - validated.width, validated.x));
      validated.y = Math.max(0, Math.min(canvasBounds.height - validated.height, validated.y));
      validated.width = Math.min(validated.width, canvasBounds.width - validated.x);
      validated.height = Math.min(validated.height, canvasBounds.height - validated.y);
    }
    
    return validated;
  }
  
  /**
   * 计算边界框的中心点
   * @param bounds 边界框
   * @returns 中心点坐标
   */
  static getBoundsCenter(bounds: Bounds): Point {
    return {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2
    };
  }
  
  /**
   * 计算两点之间的距离
   * @param point1 点1
   * @param point2 点2
   * @returns 距离
   */
  static getDistance(point1: Point, point2: Point): number {
    const dx = point2.x - point1.x;
    const dy = point2.y - point1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  /**
   * 计算两点之间的角度（弧度）
   * @param point1 点1
   * @param point2 点2
   * @returns 角度（弧度）
   */
  static getAngle(point1: Point, point2: Point): number {
    return Math.atan2(point2.y - point1.y, point2.x - point1.x);
  }
}

