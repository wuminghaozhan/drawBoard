import type { DrawAction } from '../DrawTool';
import type { Point } from '../../core/CanvasEngine';
import type { AnchorPoint, AnchorType, Bounds } from './AnchorTypes';
import { BaseAnchorHandler } from './BaseAnchorHandler';
import { AnchorUtils } from '../../utils/AnchorUtils';

/**
 * 折线锚点处理器
 * 实现折线图形的锚点生成和拖拽处理
 * 
 * 折线特点：
 * - 开放的，不闭合
 * - 每个顶点都可以独立移动
 * - 中心点用于移动整个折线
 */
export class PolylineAnchorHandler extends BaseAnchorHandler {
  
  /**
   * 生成折线锚点
   * 为每个顶点生成一个锚点 + 1个中心点
   */
  public generateAnchors(action: DrawAction, bounds: Bounds): AnchorPoint[] {
    // 折线至少需要 2 个点
    if (action.points.length < 2) {
      return [];
    }
    
    const anchors: AnchorPoint[] = [];
    const halfSize = AnchorUtils.DEFAULT_ANCHOR_SIZE / 2;
    
    // 为每个顶点生成锚点
    for (let i = 0; i < action.points.length; i++) {
      const vertex = action.points[i];
      anchors.push({
        x: vertex.x - halfSize,
        y: vertex.y - halfSize,
        type: 'vertex',
        cursor: 'move',
        shapeType: 'polyline',
        isCenter: false
      });
    }
    
    // 生成中心点（用于移动整个折线）
    const center = this.calculateCenterPoint(action, bounds);
    anchors.push({
      x: center.x - halfSize,
      y: center.y - halfSize,
      type: 'center',
      cursor: 'move',
      shapeType: 'polyline',
      isCenter: true
    });
    
    return anchors;
  }
  
  /**
   * 处理折线锚点拖拽
   * 中心点：移动整个折线
   * 顶点：移动单个顶点，其他顶点保持不变
   */
  public handleAnchorDrag(
    action: DrawAction,
    anchorType: AnchorType,
    startPoint: Point,
    currentPoint: Point,
    _dragStartBounds: Bounds,
    dragStartAction?: DrawAction
  ): DrawAction | null {
    if (action.points.length < 2) {
      return null;
    }
    
    // 中心点拖拽：移动整个折线
    if (anchorType === 'center') {
      const deltaX = currentPoint.x - startPoint.x;
      const deltaY = currentPoint.y - startPoint.y;
      return this.handleMove(action, deltaX, deltaY);
    }
    
    // 顶点拖拽：移动单个顶点
    if (anchorType === 'vertex') {
      return this.handleVertexDrag(action, startPoint, currentPoint, dragStartAction);
    }
    
    return null;
  }
  
  /**
   * 处理顶点拖拽
   * 移动单个顶点，其他顶点保持不变
   */
  private handleVertexDrag(
    action: DrawAction,
    startPoint: Point,
    currentPoint: Point,
    dragStartAction?: DrawAction
  ): DrawAction | null {
    // 获取拖拽开始时的顶点列表
    const startVertices = dragStartAction 
      ? dragStartAction.points
      : action.points;
    
    if (startVertices.length < 2) {
      return null;
    }
    
    // 找到最接近 startPoint 的顶点索引
    let closestVertexIndex = -1;
    let minDistance = Infinity;
    
    for (let i = 0; i < startVertices.length; i++) {
      const vertex = startVertices[i];
      const distance = Math.sqrt(
        Math.pow(startPoint.x - vertex.x, 2) + Math.pow(startPoint.y - vertex.y, 2)
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        closestVertexIndex = i;
      }
    }
    
    if (closestVertexIndex === -1) {
      return null;
    }
    
    // 计算顶点移动距离
    const deltaX = currentPoint.x - startPoint.x;
    const deltaY = currentPoint.y - startPoint.y;
    
    // 检查移动距离是否有效
    if (!isFinite(deltaX) || !isFinite(deltaY)) {
      return null;
    }
    
    // 更新顶点位置
    const movedVertex = startVertices[closestVertexIndex];
    const newX = movedVertex.x + deltaX;
    const newY = movedVertex.y + deltaY;
    
    // 检查新坐标是否有效
    if (!isFinite(newX) || !isFinite(newY)) {
      return null;
    }
    
    // 直接更新对应顶点
    const newPoints = startVertices.map((point, index) => {
      if (index === closestVertexIndex) {
        return { ...point, x: newX, y: newY };
      }
      return { ...point };
    });
    
    return {
      ...action,
      points: newPoints
    };
  }

  /**
   * 计算折线中心点（所有顶点的平均位置）
   */
  public calculateCenterPoint(action: DrawAction, bounds?: Bounds): Point {
    if (action.points.length === 0) {
      return { x: 0, y: 0 };
    }
    
    // 使用边界框中心或点集中心
    if (bounds && bounds.width > 0 && bounds.height > 0) {
      return {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2
      };
    }
    
    // 计算所有顶点的平均位置
    let sumX = 0;
    let sumY = 0;
    
    for (const point of action.points) {
      sumX += point.x;
      sumY += point.y;
    }
    
    return {
      x: sumX / action.points.length,
      y: sumY / action.points.length
    };
  }
}

