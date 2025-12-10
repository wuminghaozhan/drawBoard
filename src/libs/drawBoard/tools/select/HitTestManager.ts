/**
 * 点击检测管理器
 * 负责检测鼠标点击是否命中 DrawAction
 * 
 * 从 SelectTool 中提取，提高代码可维护性和可测试性
 */

import type { DrawAction } from '../DrawTool';
import type { Point } from '../../core/CanvasEngine';
import { logger } from '../../utils/Logger';

/**
 * 点击检测管理器
 * 提供各种图形的精确点击检测
 */
export class HitTestManager {
  /**
   * 检查点是否在某个 action 内
   * @param point 检测点
   * @param action 目标 action
   * @param tolerance 容差（像素）
   * @returns 是否命中
   */
  public isPointInAction(point: Point, action: DrawAction, tolerance: number): boolean {
    try {
      if (!action || !action.points || action.points.length === 0) return false;

      // 根据 action 类型进行不同的碰撞检测
      switch (action.type) {
        case 'text':
          return this.isPointInTextAction(point, action, tolerance);
        case 'rect':
          return this.isPointInRectAction(point, action, tolerance);
        case 'circle':
          return this.isPointInCircleAction(point, action, tolerance);
        case 'polygon':
          return this.isPointInPolygonAction(point, action, tolerance);
        case 'line':
          return this.isPointInLineAction(point, action, tolerance);
        case 'pen':
        case 'brush':
          return this.isPointInPathAction(point, action, tolerance);
        case 'eraser':
          return this.isPointInPathAction(point, action, tolerance);
        default:
          return this.isPointInBoundingBox(point, action, tolerance);
      }
    } catch (error) {
      logger.error('HitTestManager: 检查点是否在 action 内时发生错误', error);
      return false;
    }
  }

  /**
   * 检查点是否在文字 action 内
   */
  public isPointInTextAction(point: Point, action: DrawAction, tolerance: number): boolean {
    if (action.points.length === 0) return false;
    
    const textPoint = action.points[0];
    const textAction = action as DrawAction & { 
      text?: string; 
      fontSize?: number;
      fontFamily?: string;
      textAlign?: CanvasTextAlign;
      textBaseline?: CanvasTextBaseline;
    };
    const text = textAction.text || '文字';
    const fontSize = textAction.fontSize || 16;
    const fontFamily = textAction.fontFamily || 'Arial';
    
    // 尝试使用 Canvas 精确测量文字宽度
    let width: number;
    let height: number;
    
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.font = `${fontSize}px ${fontFamily}`;
        const metrics = ctx.measureText(text);
        width = metrics.width;
        height = (metrics.actualBoundingBoxAscent || fontSize * 0.8) + 
                 (metrics.actualBoundingBoxDescent || fontSize * 0.2);
      } else {
        width = text.length * fontSize * 0.6;
        height = fontSize;
      }
    } catch {
      width = text.length * fontSize * 0.6;
      height = fontSize;
    }
    
    // 考虑文字对齐方式
    let x = textPoint.x;
    const textAlign = textAction.textAlign || 'left';
    if (textAlign === 'center') {
      x = textPoint.x - width / 2;
    } else if (textAlign === 'right') {
      x = textPoint.x - width;
    }
    
    // 考虑文字基线
    let y = textPoint.y;
    const textBaseline = textAction.textBaseline || 'top';
    if (textBaseline === 'middle') {
      y = textPoint.y - height / 2;
    } else if (textBaseline === 'bottom') {
      y = textPoint.y - height;
    }
    
    return point.x >= x - tolerance &&
           point.x <= x + width + tolerance &&
           point.y >= y - tolerance &&
           point.y <= y + height + tolerance;
  }

  /**
   * 检查点是否在矩形 action 内
   */
  public isPointInRectAction(point: Point, action: DrawAction, tolerance: number): boolean {
    if (action.points.length < 2) return false;
    
    const p1 = action.points[0];
    const p2 = action.points[action.points.length - 1];
    
    if (!isFinite(p1.x) || !isFinite(p1.y) || !isFinite(p2.x) || !isFinite(p2.y)) {
      return false;
    }
    
    const minX = Math.min(p1.x, p2.x);
    const maxX = Math.max(p1.x, p2.x);
    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);
    
    const lineWidth = action.context?.lineWidth || 2;
    const effectiveTolerance = tolerance + Math.max(lineWidth / 2, 1);
    
    return point.x >= minX - effectiveTolerance &&
           point.x <= maxX + effectiveTolerance &&
           point.y >= minY - effectiveTolerance &&
           point.y <= maxY + effectiveTolerance;
  }

  /**
   * 检查点是否在圆形 action 内
   */
  public isPointInCircleAction(point: Point, action: DrawAction, tolerance: number): boolean {
    if (action.points.length < 2) return false;
    
    const center = action.points[0];
    const edge = action.points[action.points.length - 1];
    
    if (!isFinite(center.x) || !isFinite(center.y) || 
        !isFinite(edge.x) || !isFinite(edge.y)) {
      return false;
    }
    
    const radius = Math.sqrt(
      Math.pow(edge.x - center.x, 2) + Math.pow(edge.y - center.y, 2)
    );
    
    if (!isFinite(radius) || radius <= 0) return false;
    
    const distance = Math.sqrt(
      Math.pow(point.x - center.x, 2) + Math.pow(point.y - center.y, 2)
    );
    
    const lineWidth = action.context?.lineWidth || 2;
    const effectiveTolerance = tolerance + Math.max(lineWidth / 2, 1);
    
    return distance <= radius + effectiveTolerance;
  }

  /**
   * 检查点是否在多边形 action 内（使用射线法）
   */
  public isPointInPolygonAction(point: Point, action: DrawAction, tolerance: number): boolean {
    if (action.points.length < 3) {
      return this.isPointInBoundingBox(point, action, tolerance);
    }
    
    let inside = false;
    const points = action.points;
    
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i].x;
      const yi = points[i].y;
      const xj = points[j].x;
      const yj = points[j].y;
      
      // 检查点是否在多边形边界上
      const distToEdge = this.distanceToLineSegment(point, points[j], points[i]);
      if (distToEdge <= tolerance) {
        return true;
      }
      
      // 射线法
      const intersect = ((yi > point.y) !== (yj > point.y)) &&
                       (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
      if (intersect) {
        inside = !inside;
      }
    }
    
    return inside;
  }

  /**
   * 检查点是否在路径 action 内（pen/brush/eraser）
   */
  public isPointInPathAction(point: Point, action: DrawAction, tolerance: number): boolean {
    if (action.points.length === 0) return false;
    
    const lineWidth = action.context?.lineWidth || 2;
    const effectiveTolerance = tolerance + Math.max(lineWidth / 2, 3);
    
    // 单点路径
    if (action.points.length === 1) {
      const p = action.points[0];
      if (!isFinite(p.x) || !isFinite(p.y)) return false;
      
      const distance = Math.sqrt(
        Math.pow(point.x - p.x, 2) + Math.pow(point.y - p.y, 2)
      );
      return distance <= effectiveTolerance;
    }
    
    // 检查点到所有线段的距离
    for (let i = 0; i < action.points.length - 1; i++) {
      const p1 = action.points[i];
      const p2 = action.points[i + 1];
      
      if (!isFinite(p1.x) || !isFinite(p1.y) || !isFinite(p2.x) || !isFinite(p2.y)) {
        continue;
      }
      
      if (this.distanceToLineSegment(point, p1, p2) <= effectiveTolerance) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 检查点是否在线条 action 内
   */
  public isPointInLineAction(point: Point, action: DrawAction, tolerance: number): boolean {
    if (action.points.length < 2) return false;
    
    const lineWidth = action.context?.lineWidth || 2;
    const effectiveTolerance = tolerance + Math.max(lineWidth / 2, 2);
    
    for (let i = 0; i < action.points.length - 1; i++) {
      const p1 = action.points[i];
      const p2 = action.points[i + 1];
      
      if (!isFinite(p1.x) || !isFinite(p1.y) || !isFinite(p2.x) || !isFinite(p2.y)) {
        continue;
      }
      
      if (this.distanceToLineSegment(point, p1, p2) <= effectiveTolerance) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 计算点到线段的距离
   */
  public distanceToLineSegment(point: Point, lineStart: Point, lineEnd: Point): number {
    if (!isFinite(point.x) || !isFinite(point.y) ||
        !isFinite(lineStart.x) || !isFinite(lineStart.y) ||
        !isFinite(lineEnd.x) || !isFinite(lineEnd.y)) {
      return Infinity;
    }
    
    const A = point.x - lineStart.x;
    const B = point.y - lineStart.y;
    const C = lineEnd.x - lineStart.x;
    const D = lineEnd.y - lineStart.y;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    
    if (lenSq === 0 || !isFinite(lenSq)) {
      return Math.sqrt(A * A + B * B);
    }
    
    let param = dot / lenSq;
    param = Math.max(0, Math.min(1, param));
    
    const x = lineStart.x + param * C;
    const y = lineStart.y + param * D;
    
    const dx = point.x - x;
    const dy = point.y - y;
    
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    return isFinite(distance) ? distance : Infinity;
  }

  /**
   * 检查点是否在边界框内
   */
  public isPointInBoundingBox(point: Point, action: DrawAction, tolerance: number): boolean {
    const bounds = this.getActionBoundingBox(action);
    return point.x >= bounds.x - tolerance &&
           point.x <= bounds.x + bounds.width + tolerance &&
           point.y >= bounds.y - tolerance &&
           point.y <= bounds.y + bounds.height + tolerance;
  }

  /**
   * 获取 action 的边界框
   * 对于圆形、矩形、直线：只使用起点和终点计算（与实际绘制一致）
   */
  public getActionBoundingBox(action: DrawAction): { x: number; y: number; width: number; height: number } {
    if (action.points.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    // 【圆形】特殊处理
    if (action.type === 'circle' && action.points.length >= 2) {
      const center = action.points[0];
      const edge = action.points[action.points.length - 1];
      const radius = Math.sqrt(
        Math.pow(edge.x - center.x, 2) + Math.pow(edge.y - center.y, 2)
      );
      
      const MIN_VISIBLE_RADIUS = 8;
      const validRadius = Math.max(MIN_VISIBLE_RADIUS, radius);
      
      if (!isFinite(center.x) || !isFinite(center.y) || !isFinite(validRadius) || validRadius <= 0) {
        return {
          x: (isFinite(center.x) ? center.x : 0) - 50,
          y: (isFinite(center.y) ? center.y : 0) - 50,
          width: 100,
          height: 100
        };
      }
      
      return {
        x: center.x - validRadius,
        y: center.y - validRadius,
        width: validRadius * 2,
        height: validRadius * 2
      };
    }

    // 【矩形】特殊处理：只使用起点和终点
    if (action.type === 'rect' && action.points.length >= 2) {
      const start = action.points[0];
      const end = action.points[action.points.length - 1];
      
      if (!isFinite(start.x) || !isFinite(start.y) || !isFinite(end.x) || !isFinite(end.y)) {
        return { x: 0, y: 0, width: 0, height: 0 };
      }
      
      const minX = Math.min(start.x, end.x);
      const minY = Math.min(start.y, end.y);
      const maxX = Math.max(start.x, end.x);
      const maxY = Math.max(start.y, end.y);
      
      return {
        x: minX,
        y: minY,
        width: Math.max(maxX - minX, 1),
        height: Math.max(maxY - minY, 1)
      };
    }

    // 【直线】特殊处理：只使用起点和终点
    if (action.type === 'line' && action.points.length >= 2) {
      const start = action.points[0];
      const end = action.points[action.points.length - 1];
      
      if (!isFinite(start.x) || !isFinite(start.y) || !isFinite(end.x) || !isFinite(end.y)) {
        return { x: 0, y: 0, width: 0, height: 0 };
      }
      
      const minX = Math.min(start.x, end.x);
      const minY = Math.min(start.y, end.y);
      const maxX = Math.max(start.x, end.x);
      const maxY = Math.max(start.y, end.y);
      
      return {
        x: minX,
        y: minY,
        width: Math.max(maxX - minX, 1),
        height: Math.max(maxY - minY, 1)
      };
    }

    // 【多边形】特殊处理：使用中心+半径计算实际顶点的边界框
    if (action.type === 'polygon' && action.points.length >= 2) {
      const center = action.points[0];
      const edge = action.points[action.points.length - 1];
      const radius = Math.sqrt(
        Math.pow(edge.x - center.x, 2) + Math.pow(edge.y - center.y, 2)
      );
      
      if (!isFinite(center.x) || !isFinite(center.y) || !isFinite(radius) || radius <= 0) {
        return { x: 0, y: 0, width: 0, height: 0 };
      }
      
      // 多边形的边界框是以中心为圆心、半径为radius的正方形
      return {
        x: center.x - radius,
        y: center.y - radius,
        width: radius * 2,
        height: radius * 2
      };
    }

    // 【其他图形】使用所有点计算边界框
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const point of action.points) {
      if (!isFinite(point.x) || !isFinite(point.y)) continue;
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }

    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    return {
      x: minX,
      y: minY,
      width: Math.max(maxX - minX, 1),
      height: Math.max(maxY - minY, 1)
    };
  }
}

