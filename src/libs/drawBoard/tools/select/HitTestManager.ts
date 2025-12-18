/**
 * 点击检测管理器
 * 负责检测鼠标点击是否命中 DrawAction
 * 
 * 从 SelectTool 中提取，提高代码可维护性和可测试性
 */

import type { DrawAction } from '../DrawTool';
import type { Point } from '../../core/CanvasEngine';
import type { TextAction } from '../../types/TextTypes';
import { logger } from '../../infrastructure/logging/Logger';

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
   * 📝 统一使用 points[0] + width/height 规范
   */
  public isPointInTextAction(point: Point, action: DrawAction, tolerance: number): boolean {
    if (action.points.length === 0) return false;
    
    const textAction = action as TextAction;
    const textPoint = action.points[0];
    
    if (!textPoint || !isFinite(textPoint.x) || !isFinite(textPoint.y)) {
      return false;
    }
    
    // 📝 统一使用 getActionBoundingBox 获取文本边界框
    const bounds = this.getActionBoundingBox(action);
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
      return false;
    }
    
    // 检查点是否在边界框内（考虑容差）
    return point.x >= bounds.x - tolerance &&
           point.x <= bounds.x + bounds.width + tolerance &&
           point.y >= bounds.y - tolerance &&
           point.y <= bounds.y + bounds.height + tolerance;
  }

  /**
   * 检查点是否在矩形 action 内
   * 矩形统一使用4顶点格式（左上、右上、右下、左下），支持旋转矩形
   */
  public isPointInRectAction(point: Point, action: DrawAction, tolerance: number): boolean {
    if (action.points.length < 4) return false;
    
    // 检验所有点是否有效
    for (const p of action.points) {
      if (!isFinite(p.x) || !isFinite(p.y)) {
        return false;
      }
    }
    
    const lineWidth = action.context?.lineWidth || 2;
    const effectiveTolerance = tolerance + Math.max(lineWidth / 2, 1);
    
    // 使用射线法检测点是否在多边形（4顶点矩形）内
    // 先检查是否在边界上
    for (let i = 0; i < 4; i++) {
      const p1 = action.points[i];
      const p2 = action.points[(i + 1) % 4];
      const distToEdge = this.distanceToLineSegment(point, p1, p2);
      if (distToEdge <= effectiveTolerance) {
        return true;
      }
    }
    
    // 再检查是否在矩形内部（使用射线法）
    return this.isPointInPolygon(point, action.points);
  }
  
  /**
   * 使用射线法检测点是否在多边形内部
   */
  private isPointInPolygon(point: Point, vertices: Point[]): boolean {
    let inside = false;
    const n = vertices.length;
    
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = vertices[i].x;
      const yi = vertices[i].y;
      const xj = vertices[j].x;
      const yj = vertices[j].y;
      
      const intersect = ((yi > point.y) !== (yj > point.y)) &&
                       (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
      if (intersect) {
        inside = !inside;
      }
    }
    
    return inside;
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
   * 多边形统一使用顶点列表格式，支持旋转
   */
  public isPointInPolygonAction(point: Point, action: DrawAction, tolerance: number): boolean {
    // 多边形至少需要3个顶点
    if (action.points.length < 3) {
      return this.isPointInBoundingBox(point, action, tolerance);
    }
    
    const lineWidth = action.context?.lineWidth || 2;
    const effectiveTolerance = tolerance + Math.max(lineWidth / 2, 3);
    
    // 检查点是否在多边形边界上
    for (let i = 0; i < action.points.length; i++) {
      const p1 = action.points[i];
      const p2 = action.points[(i + 1) % action.points.length];
      const distToEdge = this.distanceToLineSegment(point, p1, p2);
      if (distToEdge <= effectiveTolerance) {
        return true;
      }
    }
    
    // 射线法检测点是否在多边形内部
    return this.isPointInPolygon(point, action.points);
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
   * 
   * 优化：增加线段的有效检测区域
   * - 基础容差增加到 12px（细线也容易选中）
   * - 线条两端增加额外热区（端点半径）
   */
  public isPointInLineAction(point: Point, action: DrawAction, tolerance: number): boolean {
    if (action.points.length < 2) return false;
    
    const lineWidth = action.context?.lineWidth || 2;
    // 增加基础容差：至少 12 像素，或 lineWidth 的一半 + tolerance
    const baseTolerance = Math.max(12, tolerance);
    const effectiveTolerance = baseTolerance + Math.max(lineWidth / 2, 2);
    
    const start = action.points[0];
    const end = action.points[action.points.length - 1];
    
    // 检查是否在线段附近
    if (!isFinite(start.x) || !isFinite(start.y) || !isFinite(end.x) || !isFinite(end.y)) {
      return false;
    }
    
    // 主线段检测
    if (this.distanceToLineSegment(point, start, end) <= effectiveTolerance) {
      return true;
    }
    
    // 端点热区检测（更容易点击线条的两端）
    const endpointRadius = effectiveTolerance * 1.5;
    const distToStart = Math.sqrt(Math.pow(point.x - start.x, 2) + Math.pow(point.y - start.y, 2));
    const distToEnd = Math.sqrt(Math.pow(point.x - end.x, 2) + Math.pow(point.y - end.y, 2));
    
    if (distToStart <= endpointRadius || distToEnd <= endpointRadius) {
      return true;
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

    // 【矩形】特殊处理：使用4顶点计算边界框
    if (action.type === 'rect' && action.points.length >= 4) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      
      for (const p of action.points) {
        if (!isFinite(p.x) || !isFinite(p.y)) continue;
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
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

    // 【多边形】特殊处理：使用所有顶点计算边界框（支持旋转）
    if (action.type === 'polygon' && action.points.length >= 3) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      
      for (const p of action.points) {
        if (!isFinite(p.x) || !isFinite(p.y)) continue;
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
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

    // 【文本】特殊处理：使用文本属性计算边界框
    if (action.type === 'text') {
      const textAction = action as TextAction;
      const point = action.points[0];
      
      if (!point || !isFinite(point.x) || !isFinite(point.y)) {
        return { x: 0, y: 0, width: 0, height: 0 };
      }
      
      const text = textAction.text || '';
      const fontSize = textAction.fontSize || 16;
      const lineHeight = fontSize * (textAction.lineHeight ?? 1.2);
      
      // 📝 如果 width 存在，使用它（可能是调整后的宽度）
      const width = textAction.width || this.estimateTextWidth(text, fontSize);
      
      // 📝 如果 height 存在且 width 也存在，直接使用（两者都有效）
      if (textAction.width && textAction.height && textAction.width > 0 && textAction.height > 0) {
        return {
          x: point.x,
          y: point.y,
          width: textAction.width,
          height: textAction.height
        };
      }
      
      // 📝 如果 width 存在但 height 不存在，需要估算多行文本的高度
      if (textAction.width && textAction.width > 0) {
        const height = this.estimateMultilineTextHeight(text, fontSize, lineHeight, textAction.width);
        return {
          x: point.x,
          y: point.y,
          width: textAction.width,
          height
        };
      }
      
      // 📝 否则根据文本内容和字体大小估算单行文本
      const estimatedWidth = this.estimateTextWidth(text, fontSize);
      const height = lineHeight;
      
      return {
        x: point.x,
        y: point.y,
        width: Math.max(estimatedWidth, fontSize),
        height
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
  
  /**
   * 估算文本宽度（单行）
   */
  private estimateTextWidth(text: string, fontSize: number): number {
    let estimatedWidth = 0;
    for (const char of text) {
      // 判断是否是中文字符（或其他宽字符）
      if (/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(char)) {
        estimatedWidth += fontSize;
      } else {
        estimatedWidth += fontSize * 0.6;
      }
    }
    return Math.max(estimatedWidth, fontSize);
  }
  
  /**
   * 估算多行文本的高度
   * 根据文本宽度和内容估算行数
   */
  private estimateMultilineTextHeight(text: string, fontSize: number, lineHeight: number, maxWidth: number): number {
    if (!text || maxWidth <= 0) {
      return lineHeight;
    }
    
    // 按换行符分割段落
    const paragraphs = text.split('\n');
    let totalLines = 0;
    
    // 估算每行的字符数（中文字符宽度 = fontSize，英文字符宽度 = fontSize * 0.6）
    const avgCharWidth = fontSize * 0.8; // 平均字符宽度
    const charsPerLine = Math.max(1, Math.floor(maxWidth / avgCharWidth));
    
    for (const paragraph of paragraphs) {
      if (paragraph.length === 0) {
        totalLines += 1; // 空行
      } else {
        // 估算这个段落需要多少行
        const paragraphLines = Math.ceil(paragraph.length / charsPerLine);
        totalLines += Math.max(1, paragraphLines);
      }
    }
    
    return Math.max(lineHeight, totalLines * lineHeight);
  }
}

