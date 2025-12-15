/**
 * 几何计算工具类
 * 
 * 提供通用的几何计算方法，用于路径分割、碰撞检测等场景
 */

import type { Point } from '../core/CanvasEngine';

/**
 * 边界框
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 线段
 */
export interface LineSegment {
  start: Point;
  end: Point;
}

/**
 * Bezier 曲线控制点
 */
export interface BezierControlPoints {
  p0: Point;  // 起点
  p1: Point;  // 控制点1
  p2: Point;  // 控制点2
  p3: Point;  // 终点
}

/**
 * 几何工具类
 */
export class GeometryUtils {
  
  // ==================== 距离计算 ====================
  
  /**
   * 计算两点间距离
   */
  static distance(p1: Point, p2: Point): number {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  /**
   * 计算两点间距离的平方（性能优化，避免开方）
   */
  static distanceSquared(p1: Point, p2: Point): number {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return dx * dx + dy * dy;
  }
  
  /**
   * 计算点到线段的距离
   */
  static pointToSegmentDistance(point: Point, segStart: Point, segEnd: Point): number {
    const dx = segEnd.x - segStart.x;
    const dy = segEnd.y - segStart.y;
    const lengthSquared = dx * dx + dy * dy;
    
    if (lengthSquared === 0) {
      return this.distance(point, segStart);
    }
    
    // 计算投影参数 t
    let t = ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
    
    // 计算投影点
    const projX = segStart.x + t * dx;
    const projY = segStart.y + t * dy;
    
    return this.distance(point, { x: projX, y: projY });
  }
  
  /**
   * 计算点到路径的最小距离
   */
  static pointToPathDistance(point: Point, pathPoints: Point[]): number {
    if (pathPoints.length === 0) return Infinity;
    if (pathPoints.length === 1) return this.distance(point, pathPoints[0]);
    
    let minDist = Infinity;
    for (let i = 0; i < pathPoints.length - 1; i++) {
      const dist = this.pointToSegmentDistance(point, pathPoints[i], pathPoints[i + 1]);
      if (dist < minDist) {
        minDist = dist;
      }
    }
    return minDist;
  }
  
  /**
   * 计算两条线段之间的最小距离
   */
  static segmentToSegmentDistance(
    a1: Point, a2: Point,
    b1: Point, b2: Point
  ): number {
    return Math.min(
      this.pointToSegmentDistance(a1, b1, b2),
      this.pointToSegmentDistance(a2, b1, b2),
      this.pointToSegmentDistance(b1, a1, a2),
      this.pointToSegmentDistance(b2, a1, a2)
    );
  }
  
  // ==================== 相交检测 ====================
  
  /**
   * 计算叉积 (p3-p1) × (p2-p1)
   */
  static crossProduct(p1: Point, p2: Point, p3: Point): number {
    return (p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x);
  }
  
  /**
   * 检查点 p 是否在线段 (a, b) 上
   */
  static isPointOnSegment(a: Point, b: Point, p: Point): boolean {
    return Math.min(a.x, b.x) <= p.x && p.x <= Math.max(a.x, b.x) &&
           Math.min(a.y, b.y) <= p.y && p.y <= Math.max(a.y, b.y);
  }
  
  /**
   * 检测两条线段是否精确相交
   */
  static segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
    const d1 = this.crossProduct(b2, b1, a1);
    const d2 = this.crossProduct(b2, b1, a2);
    const d3 = this.crossProduct(a2, a1, b1);
    const d4 = this.crossProduct(a2, a1, b2);
    
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
      return true;
    }
    
    // 检查共线情况
    if (d1 === 0 && this.isPointOnSegment(b1, b2, a1)) return true;
    if (d2 === 0 && this.isPointOnSegment(b1, b2, a2)) return true;
    if (d3 === 0 && this.isPointOnSegment(a1, a2, b1)) return true;
    if (d4 === 0 && this.isPointOnSegment(a1, a2, b2)) return true;
    
    return false;
  }
  
  /**
   * 检测两条线段是否相交（考虑半径/粗细）
   */
  static segmentsIntersectWithRadius(
    a1: Point, a2: Point,
    b1: Point, b2: Point,
    radius: number
  ): boolean {
    if (this.segmentsIntersect(a1, a2, b1, b2)) {
      return true;
    }
    return this.segmentToSegmentDistance(a1, a2, b1, b2) <= radius;
  }
  
  /**
   * 计算两条线段的交点（如果存在）
   */
  static getSegmentIntersection(
    a1: Point, a2: Point,
    b1: Point, b2: Point
  ): Point | null {
    const d1 = this.crossProduct(b2, b1, a1);
    const d2 = this.crossProduct(b2, b1, a2);
    
    if ((d1 > 0 && d2 > 0) || (d1 < 0 && d2 < 0)) {
      return null;
    }
    
    const d3 = this.crossProduct(a2, a1, b1);
    const d4 = this.crossProduct(a2, a1, b2);
    
    if ((d3 > 0 && d4 > 0) || (d3 < 0 && d4 < 0)) {
      return null;
    }
    
    // 计算交点
    const t = d1 / (d1 - d2);
    return {
      x: a1.x + t * (a2.x - a1.x),
      y: a1.y + t * (a2.y - a1.y)
    };
  }
  
  // ==================== 边界框 ====================
  
  /**
   * 计算点集的边界框
   */
  static calculateBoundingBox(points: Point[], padding: number = 0): BoundingBox {
    if (points.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
    
    let minX = points[0].x;
    let maxX = points[0].x;
    let minY = points[0].y;
    let maxY = points[0].y;
    
    for (const point of points) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
    
    return {
      x: minX - padding,
      y: minY - padding,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2
    };
  }
  
  /**
   * 检测两个边界框是否相交
   */
  static boundingBoxesIntersect(a: BoundingBox, b: BoundingBox): boolean {
    return !(
      a.x + a.width < b.x ||
      b.x + b.width < a.x ||
      a.y + a.height < b.y ||
      b.y + b.height < a.y
    );
  }
  
  /**
   * 检测点是否在边界框内
   */
  static isPointInBoundingBox(point: Point, box: BoundingBox): boolean {
    return point.x >= box.x &&
           point.x <= box.x + box.width &&
           point.y >= box.y &&
           point.y <= box.y + box.height;
  }
  
  /**
   * 合并多个边界框
   */
  static mergeBoundingBoxes(boxes: BoundingBox[]): BoundingBox {
    if (boxes.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
    
    let minX = boxes[0].x;
    let minY = boxes[0].y;
    let maxX = boxes[0].x + boxes[0].width;
    let maxY = boxes[0].y + boxes[0].height;
    
    for (const box of boxes) {
      minX = Math.min(minX, box.x);
      minY = Math.min(minY, box.y);
      maxX = Math.max(maxX, box.x + box.width);
      maxY = Math.max(maxY, box.y + box.height);
    }
    
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }
  
  // ==================== Bezier 曲线 ====================
  
  /**
   * 计算三次 Bezier 曲线上的点
   * @param t 参数 [0, 1]
   */
  static cubicBezierPoint(t: number, p0: Point, p1: Point, p2: Point, p3: Point): Point {
    const t2 = t * t;
    const t3 = t2 * t;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;
    
    return {
      x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
      y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y
    };
  }
  
  /**
   * 计算二次 Bezier 曲线上的点
   * @param t 参数 [0, 1]
   */
  static quadraticBezierPoint(t: number, p0: Point, p1: Point, p2: Point): Point {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;
    
    return {
      x: mt2 * p0.x + 2 * mt * t * p1.x + t2 * p2.x,
      y: mt2 * p0.y + 2 * mt * t * p1.y + t2 * p2.y
    };
  }
  
  /**
   * 生成 Bezier 曲线的采样点
   */
  static sampleBezierCurve(
    controlPoints: BezierControlPoints,
    samples: number = 10
  ): Point[] {
    const points: Point[] = [];
    const { p0, p1, p2, p3 } = controlPoints;
    
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      points.push(this.cubicBezierPoint(t, p0, p1, p2, p3));
    }
    
    return points;
  }
  
  /**
   * 根据相邻点计算 Bezier 控制点（Catmull-Rom 风格）
   */
  static calculateBezierControlPoints(
    prev: Point | null,
    current: Point,
    next: Point,
    nextNext: Point | null,
    tension: number = 0.5
  ): BezierControlPoints {
    const p0 = current;
    const p3 = next;
    
    // 计算控制点
    const d1 = prev ? this.distance(prev, current) : 0;
    const d2 = this.distance(current, next);
    const d3 = nextNext ? this.distance(next, nextNext) : 0;
    
    // 使用 Catmull-Rom 算法计算控制点
    let p1: Point;
    let p2: Point;
    
    if (prev) {
      const scale1 = tension * d2 / (d1 + d2);
      p1 = {
        x: current.x + scale1 * (next.x - prev.x),
        y: current.y + scale1 * (next.y - prev.y)
      };
    } else {
      p1 = {
        x: current.x + (next.x - current.x) * tension,
        y: current.y + (next.y - current.y) * tension
      };
    }
    
    if (nextNext) {
      const scale2 = tension * d2 / (d2 + d3);
      p2 = {
        x: next.x - scale2 * (nextNext.x - current.x),
        y: next.y - scale2 * (nextNext.y - current.y)
      };
    } else {
      p2 = {
        x: next.x - (next.x - current.x) * tension,
        y: next.y - (next.y - current.y) * tension
      };
    }
    
    return { p0, p1, p2, p3 };
  }
  
  // ==================== 路径操作 ====================
  
  /**
   * 在两点之间进行线性插值
   */
  static lerp(p1: Point, p2: Point, t: number): Point {
    return {
      x: p1.x + (p2.x - p1.x) * t,
      y: p1.y + (p2.y - p1.y) * t
    };
  }
  
  /**
   * 细分路径（在长线段上插入中间点）
   */
  static subdividePath(points: Point[], maxSegmentLength: number): Point[] {
    if (points.length < 2) return [...points];
    
    const result: Point[] = [points[0]];
    
    for (let i = 0; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      const dist = this.distance(current, next);
      
      if (dist > maxSegmentLength) {
        const numSubdivisions = Math.ceil(dist / maxSegmentLength);
        for (let j = 1; j < numSubdivisions; j++) {
          const t = j / numSubdivisions;
          result.push(this.lerp(current, next, t));
        }
      }
      
      result.push(next);
    }
    
    return result;
  }
  
  /**
   * 简化路径（Douglas-Peucker 算法）
   */
  static simplifyPath(points: Point[], epsilon: number): Point[] {
    if (points.length < 3) return [...points];
    
    // 找到距离最远的点
    let maxDist = 0;
    let maxIndex = 0;
    
    const start = points[0];
    const end = points[points.length - 1];
    
    for (let i = 1; i < points.length - 1; i++) {
      const dist = this.pointToSegmentDistance(points[i], start, end);
      if (dist > maxDist) {
        maxDist = dist;
        maxIndex = i;
      }
    }
    
    // 如果最大距离大于阈值，递归简化
    if (maxDist > epsilon) {
      const left = this.simplifyPath(points.slice(0, maxIndex + 1), epsilon);
      const right = this.simplifyPath(points.slice(maxIndex), epsilon);
      return [...left.slice(0, -1), ...right];
    }
    
    return [start, end];
  }
  
  /**
   * 计算路径的总长度
   */
  static pathLength(points: Point[]): number {
    if (points.length < 2) return 0;
    
    let length = 0;
    for (let i = 0; i < points.length - 1; i++) {
      length += this.distance(points[i], points[i + 1]);
    }
    return length;
  }
  
  // ==================== 缓动函数 ====================
  
  /**
   * 缓入（二次）
   */
  static easeInQuad(t: number): number {
    return t * t;
  }
  
  /**
   * 缓出（二次）
   */
  static easeOutQuad(t: number): number {
    return t * (2 - t);
  }
  
  /**
   * 缓入缓出（二次）
   */
  static easeInOutQuad(t: number): number {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }
  
  /**
   * 缓入（三次）
   */
  static easeInCubic(t: number): number {
    return t * t * t;
  }
  
  /**
   * 缓出（三次）
   */
  static easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }
  
  /**
   * 缓入缓出（三次）
   */
  static easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
}

export default GeometryUtils;

