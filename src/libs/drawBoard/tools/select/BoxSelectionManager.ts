/**
 * 框选检测管理器
 * 负责检测 DrawAction 是否在选择框内
 * 
 * 从 SelectTool 中提取，提高代码可维护性和可测试性
 */

import type { DrawAction } from '../DrawTool';
import type { Point } from '../../core/CanvasEngine';
import { HitTestManager } from './HitTestManager';

export interface SelectionBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 框选检测管理器
 * 提供各种图形的框选检测
 */
export class BoxSelectionManager {
  private hitTestManager: HitTestManager;

  constructor(hitTestManager?: HitTestManager) {
    this.hitTestManager = hitTestManager || new HitTestManager();
  }

  /**
   * 检查 action 是否在选择框内
   */
  public isActionInBox(bounds: SelectionBox, action: DrawAction): boolean {
    if (!action || !action.points || action.points.length === 0) {
      return false;
    }
    
    switch (action.type) {
      case 'rect':
        return this.isRectInBox(bounds, action);
      case 'circle':
        return this.isCircleInBox(bounds, action);
      case 'polygon':
        return this.isPolygonInBox(bounds, action);
      case 'line':
      case 'pen':
      case 'brush':
        return this.isPathInBox(bounds, action);
      case 'text':
        return this.isBoundingBoxIntersect(bounds, this.hitTestManager.getActionBoundingBox(action));
      default:
        return this.isBoundingBoxIntersect(bounds, this.hitTestManager.getActionBoundingBox(action));
    }
  }

  /**
   * 在选择框内选择所有 actions
   */
  public selectActionsInBox(bounds: SelectionBox, actions: DrawAction[]): DrawAction[] {
    const selected: DrawAction[] = [];
    
    for (const action of actions) {
      if (this.isActionInBox(bounds, action)) {
        selected.push(action);
      }
    }
    
    return selected;
  }

  /**
   * 检查矩形是否在选择框内
   */
  public isRectInBox(bounds: SelectionBox, action: DrawAction): boolean {
    if (action.points.length < 2) return false;
    
    const p1 = action.points[0];
    const p2 = action.points[action.points.length - 1];
    
    const rectMinX = Math.min(p1.x, p2.x);
    const rectMaxX = Math.max(p1.x, p2.x);
    const rectMinY = Math.min(p1.y, p2.y);
    const rectMaxY = Math.max(p1.y, p2.y);
    
    const boxRight = bounds.x + bounds.width;
    const boxBottom = bounds.y + bounds.height;
    
    return rectMinX < boxRight &&
           rectMaxX > bounds.x &&
           rectMinY < boxBottom &&
           rectMaxY > bounds.y;
  }

  /**
   * 检查圆形是否在选择框内
   */
  public isCircleInBox(bounds: SelectionBox, action: DrawAction): boolean {
    if (action.points.length < 2) return false;
    
    const center = action.points[0];
    const edge = action.points[action.points.length - 1];
    
    const radius = Math.sqrt(
      Math.pow(edge.x - center.x, 2) + Math.pow(edge.y - center.y, 2)
    );
    
    if (!isFinite(radius) || radius <= 0) return false;
    
    const boxRight = bounds.x + bounds.width;
    const boxBottom = bounds.y + bounds.height;
    
    // 找到选择框上离圆心最近的点
    const closestX = Math.max(bounds.x, Math.min(center.x, boxRight));
    const closestY = Math.max(bounds.y, Math.min(center.y, boxBottom));
    
    const distance = Math.sqrt(
      Math.pow(center.x - closestX, 2) + Math.pow(center.y - closestY, 2)
    );
    
    return distance <= radius;
  }

  /**
   * 检查多边形是否在选择框内
   * 
   * 注意：多边形有两种数据格式
   * 1. 中心+半径格式：action.points 包含拖拽点，不是实际顶点
   * 2. 顶点列表格式：action.points 包含实际顶点（isVertexList = true）
   * 
   * 对于中心+半径格式，使用边界框检测
   */
  public isPolygonInBox(bounds: SelectionBox, action: DrawAction): boolean {
    if (action.points.length < 2) {
      return false;
    }
    
    // 检查是否是顶点列表格式
    const polygonAction = action as DrawAction & { isVertexList?: boolean };
    
    if (polygonAction.isVertexList !== true) {
      // 中心+半径格式：使用边界框检测
      // 边界框已经在 HitTestManager 中正确计算（基于中心+半径）
      return this.isBoundingBoxIntersect(bounds, this.hitTestManager.getActionBoundingBox(action));
    }
    
    // 顶点列表格式：使用精确的顶点检测
    if (action.points.length < 3) {
      return this.isBoundingBoxIntersect(bounds, this.hitTestManager.getActionBoundingBox(action));
    }
    
    const boxRight = bounds.x + bounds.width;
    const boxBottom = bounds.y + bounds.height;
    
    // 检查是否有任何顶点在框内
    for (const point of action.points) {
      if (point.x >= bounds.x && point.x <= boxRight &&
          point.y >= bounds.y && point.y <= boxBottom) {
        return true;
      }
    }
    
    // 检查是否有任何边与选择框相交
    for (let i = 0; i < action.points.length; i++) {
      const p1 = action.points[i];
      const p2 = action.points[(i + 1) % action.points.length];
      
      if (this.isLineSegmentIntersectBox(p1, p2, bounds)) {
        return true;
      }
    }
    
    // 检查选择框的角是否在多边形内
    const corners = [
      { x: bounds.x, y: bounds.y },
      { x: boxRight, y: bounds.y },
      { x: boxRight, y: boxBottom },
      { x: bounds.x, y: boxBottom }
    ];
    
    for (const corner of corners) {
      if (this.hitTestManager.isPointInPolygonAction(corner, action, 0)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 检查路径是否在选择框内
   */
  public isPathInBox(bounds: SelectionBox, action: DrawAction): boolean {
    if (action.points.length === 0) return false;
    
    const boxRight = bounds.x + bounds.width;
    const boxBottom = bounds.y + bounds.height;
    
    // 检查是否有任何点在框内
    for (const point of action.points) {
      if (point.x >= bounds.x && point.x <= boxRight &&
          point.y >= bounds.y && point.y <= boxBottom) {
        return true;
      }
    }
    
    // 检查是否有任何线段与选择框相交
    for (let i = 0; i < action.points.length - 1; i++) {
      const p1 = action.points[i];
      const p2 = action.points[i + 1];
      
      if (this.isLineSegmentIntersectBox(p1, p2, bounds)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 检查线段是否与选择框相交
   */
  public isLineSegmentIntersectBox(p1: Point, p2: Point, box: SelectionBox): boolean {
    const boxRight = box.x + box.width;
    const boxBottom = box.y + box.height;
    
    // 快速拒绝
    if ((p1.x < box.x && p2.x < box.x) ||
        (p1.x > boxRight && p2.x > boxRight) ||
        (p1.y < box.y && p2.y < box.y) ||
        (p1.y > boxBottom && p2.y > boxBottom)) {
      return false;
    }
    
    // 如果线段的一个端点在框内
    if ((p1.x >= box.x && p1.x <= boxRight && p1.y >= box.y && p1.y <= boxBottom) ||
        (p2.x >= box.x && p2.x <= boxRight && p2.y >= box.y && p2.y <= boxBottom)) {
      return true;
    }
    
    // 检查线段是否与框的边相交
    const boxEdges = [
      [{ x: box.x, y: box.y }, { x: boxRight, y: box.y }],
      [{ x: boxRight, y: box.y }, { x: boxRight, y: boxBottom }],
      [{ x: boxRight, y: boxBottom }, { x: box.x, y: boxBottom }],
      [{ x: box.x, y: boxBottom }, { x: box.x, y: box.y }]
    ];
    
    for (const edge of boxEdges) {
      if (this.doLineSegmentsIntersect(p1, p2, edge[0], edge[1])) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 检查两条线段是否相交
   */
  public doLineSegmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
    const ccw = (A: Point, B: Point, C: Point): number => {
      return (C.y - A.y) * (B.x - A.x) - (B.y - A.y) * (C.x - A.x);
    };
    
    return (ccw(p1, p3, p4) * ccw(p2, p3, p4) <= 0) &&
           (ccw(p3, p1, p2) * ccw(p4, p1, p2) <= 0);
  }

  /**
   * 检查两个边界框是否相交
   */
  public isBoundingBoxIntersect(box1: SelectionBox, box2: SelectionBox): boolean {
    return box1.x < box2.x + box2.width &&
           box1.x + box1.width > box2.x &&
           box1.y < box2.y + box2.height &&
           box1.y + box1.height > box2.y;
  }
}

