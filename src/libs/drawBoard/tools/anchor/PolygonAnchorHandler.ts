import type { DrawAction } from '../DrawTool';
import type { Point } from '../../core/CanvasEngine';
import type { AnchorPoint, AnchorType, Bounds } from './AnchorTypes';
import { BaseAnchorHandler } from './BaseAnchorHandler';
import { ShapeUtils } from '../../utils/ShapeUtils';

/**
 * 多边形锚点处理器
 * 实现多边形图形的锚点生成和拖拽处理
 * 
 * 采用流行的设计方案（参考 Photoshop、Figma）：
 * - 每个顶点生成一个锚点（vertex），支持独立移动
 * - 中心点用于移动整个多边形
 * - 支持直接编辑顶点位置，提供更直观的编辑体验
 * 
 * 数据格式统一为顶点列表格式：
 * - points: 所有顶点坐标数组
 * - 支持旋转、缩放等变换
 */
export class PolygonAnchorHandler extends BaseAnchorHandler {
  
  /**
   * 生成多边形锚点
   * 为每个顶点生成一个锚点 + 1个中心点
   */
  public generateAnchors(action: DrawAction, bounds: Bounds): AnchorPoint[] {
    // 多边形至少需要3个顶点
    if (action.points.length < 3) {
      return [];
    }
    
    const anchors: AnchorPoint[] = [];
    const halfSize = this.anchorSize / 2;
    
    // 为每个顶点生成锚点
    for (let i = 0; i < action.points.length; i++) {
      const vertex = action.points[i];
      anchors.push({
        x: vertex.x - halfSize,
        y: vertex.y - halfSize,
        type: 'vertex',
        cursor: 'move',
        shapeType: 'polygon',
        isCenter: false
      });
    }
    
    // 生成中心点（用于移动整个多边形）
    const center = this.calculateCenterPoint(action, bounds);
    anchors.push({
      x: center.x - halfSize,
      y: center.y - halfSize,
      type: 'center',
      cursor: 'move',
      shapeType: 'polygon',
      isCenter: true
    });
    
    return anchors;
  }
  
  /**
   * 处理多边形锚点拖拽
   * 中心点：移动整个多边形
   * 顶点：移动单个顶点，其他顶点保持不变
   * 旋转锚点：由 AnchorDragHandler.handleRotateDrag 处理
   */
  public handleAnchorDrag(
    action: DrawAction,
    anchorType: AnchorType,
    startPoint: Point,
    currentPoint: Point,
    _dragStartBounds: Bounds,
    dragStartAction?: DrawAction
  ): DrawAction | null {
    if (action.points.length === 0) {
      return null;
    }
    
    // 🔄 旋转锚点：由 AnchorDragHandler 处理，这里不应该被调用
    // 但为了安全起见，返回 null 让上层处理
    if (anchorType === 'rotate') {
      return null;
    }
    
    // 中心点拖拽：移动整个多边形
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
    
    if (startVertices.length < 3) {
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
   * 计算多边形中心点
   * 使用所有顶点的质心
   */
  public calculateCenterPoint(action: DrawAction, bounds?: Bounds): Point {
    if (action.points.length < 3) {
      return { x: 0, y: 0 };
    }
    
    // 使用边界框中心或点集中心
    if (bounds && bounds.width > 0 && bounds.height > 0) {
      return ShapeUtils.getBoundsCenter(bounds);
    }
    return super.calculateCenterPoint(action);
  }
}

