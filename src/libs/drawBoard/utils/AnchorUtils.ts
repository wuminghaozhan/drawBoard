import type { Point } from '../core/CanvasEngine';
import type { AnchorPoint } from '../tools/anchor/AnchorTypes';

/**
 * 锚点工具类
 * 提供锚点相关的通用功能，提高代码复用性
 */
export class AnchorUtils {
  /** 默认锚点大小 */
  static readonly DEFAULT_ANCHOR_SIZE = 8;
  
  /** 最小锚点大小 */
  static readonly MIN_ANCHOR_SIZE = 4;
  
  /** 最大锚点大小 */
  static readonly MAX_ANCHOR_SIZE = 20;
  
  /** 默认锚点容差 */
  static readonly DEFAULT_ANCHOR_TOLERANCE = 6;
  
  /** 最小锚点容差 */
  static readonly MIN_ANCHOR_TOLERANCE = 2;
  
  /** 最大锚点容差 */
  static readonly MAX_ANCHOR_TOLERANCE = 15;
  
  /**
   * 计算中心点
   * @param points 点数组
   * @returns 中心点坐标
   */
  static calculateCenterPoint(points: Point[]): Point {
    if (points.length === 0) {
      return { x: 0, y: 0 };
    }
    
    const sum = points.reduce(
      (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
      { x: 0, y: 0 }
    );
    
    return {
      x: sum.x / points.length,
      y: sum.y / points.length
    };
  }
  
  /**
   * 检查点是否在锚点范围内
   * @param point 检查的点
   * @param anchor 锚点
   * @param tolerance 容差（可选，默认使用 DEFAULT_ANCHOR_TOLERANCE）
   * @returns 是否在范围内
   */
  static isPointInAnchor(
    point: Point,
    anchor: AnchorPoint,
    tolerance: number = AnchorUtils.DEFAULT_ANCHOR_TOLERANCE
  ): boolean {
    const anchorCenterX = anchor.x + AnchorUtils.DEFAULT_ANCHOR_SIZE / 2;
    const anchorCenterY = anchor.y + AnchorUtils.DEFAULT_ANCHOR_SIZE / 2;
    
    const dx = point.x - anchorCenterX;
    const dy = point.y - anchorCenterY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    return distance <= tolerance;
  }
  
  /**
   * 限制锚点大小在有效范围内
   * @param size 原始大小
   * @returns 限制后的大小
   */
  static clampAnchorSize(size: number): number {
    return Math.max(AnchorUtils.MIN_ANCHOR_SIZE, Math.min(AnchorUtils.MAX_ANCHOR_SIZE, size));
  }
  
  /**
   * 限制锚点容差在有效范围内
   * @param tolerance 原始容差
   * @returns 限制后的容差
   */
  static clampAnchorTolerance(tolerance: number): number {
    return Math.max(
      AnchorUtils.MIN_ANCHOR_TOLERANCE,
      Math.min(AnchorUtils.MAX_ANCHOR_TOLERANCE, tolerance)
    );
  }
  
  /**
   * 计算锚点的中心坐标
   * @param anchor 锚点
   * @returns 中心点坐标
   */
  static getAnchorCenter(anchor: AnchorPoint): Point {
    return {
      x: anchor.x + AnchorUtils.DEFAULT_ANCHOR_SIZE / 2,
      y: anchor.y + AnchorUtils.DEFAULT_ANCHOR_SIZE / 2
    };
  }
  
  /**
   * 计算两个锚点之间的距离
   * @param anchor1 锚点1
   * @param anchor2 锚点2
   * @returns 距离
   */
  static getAnchorDistance(anchor1: AnchorPoint, anchor2: AnchorPoint): number {
    const center1 = AnchorUtils.getAnchorCenter(anchor1);
    const center2 = AnchorUtils.getAnchorCenter(anchor2);
    const dx = center2.x - center1.x;
    const dy = center2.y - center1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}

