import type { DrawAction } from '../DrawTool';
import type { Point } from '../../core/CanvasEngine';
import type { AnchorPoint, AnchorType, Bounds } from './AnchorTypes';
import { BaseAnchorHandler } from './BaseAnchorHandler';
import { ShapeUtils } from '../../utils/ShapeUtils';
import { AnchorUtils } from '../../utils/AnchorUtils';

/**
 * 多边形锚点处理器
 * 实现多边形图形的锚点生成和拖拽处理
 * 
 * 采用流行的设计方案（参考 Photoshop、Figma）：
 * - 每个顶点生成一个锚点（vertex），支持独立移动
 * - 中心点用于移动整个多边形
 * - 支持直接编辑顶点位置，提供更直观的编辑体验
 */
export class PolygonAnchorHandler extends BaseAnchorHandler {
  
  /**
   * 生成多边形锚点
   * 为每个顶点生成一个锚点 + 1个中心点
   */
  public generateAnchors(action: DrawAction, bounds: Bounds): AnchorPoint[] {
    if (action.points.length === 0) {
      return [];
    }
    
    const anchors: AnchorPoint[] = [];
    const halfSize = this.anchorSize / 2;
    
    // 获取多边形的实际顶点
    const vertices = this.getPolygonVertices(action);
    
    if (vertices.length === 0) {
      return [];
    }
    
    // 为每个顶点生成锚点
    for (let i = 0; i < vertices.length; i++) {
      const vertex = vertices[i];
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
   * 获取多边形的实际顶点
   * 如果 action.points 包含所有顶点，直接使用
   * 否则根据多边形类型计算顶点（基于中心点和半径）
   */
  private getPolygonVertices(action: DrawAction): Point[] {
    // 如果 points 包含3个或更多点，且不是中心+边缘的结构，则认为是顶点列表
    if (action.points.length >= 3) {
      // 检查是否是顶点列表（通过检查是否形成闭合多边形）
      // 简单判断：如果第一个点和最后一个点距离较远，可能是顶点列表
      const first = action.points[0];
      const last = action.points[action.points.length - 1];
      const distance = Math.sqrt(
        Math.pow(last.x - first.x, 2) + Math.pow(last.y - first.y, 2)
      );
      
      // 如果第一个点和最后一个点距离较远（不是闭合的），认为是顶点列表
      if (distance > 10) {
        return action.points;
      }
      
      // 否则，检查是否是中心+边缘的结构（只有2个有效点）
      // 如果 points.length === 3 且前两个点距离很近，可能是中心+边缘+某个点
      // 这里简化处理：如果 points.length >= 3，尝试作为顶点列表
      return action.points;
    }
    
    // 如果只有2个点（中心点和边缘点），需要计算顶点
    if (action.points.length === 2) {
      return this.calculateVerticesFromCenterAndRadius(action);
    }
    
    return [];
  }
  
  /**
   * 根据中心点和半径计算多边形顶点
   * 用于处理基于中心点和半径绘制的正多边形
   */
  private calculateVerticesFromCenterAndRadius(action: DrawAction): Point[] {
    const polygonAction = action as DrawAction & {
      polygonType?: 'triangle' | 'pentagon' | 'hexagon' | 'star' | 'custom';
      sides?: number;
    };
    
    const center = action.points[0];
    const edge = action.points[action.points.length - 1];
    const radius = Math.sqrt(
      Math.pow(edge.x - center.x, 2) + Math.pow(edge.y - center.y, 2)
    );
    
    // 确定边数
    let sides: number;
    switch (polygonAction.polygonType) {
      case 'triangle':
        sides = 3;
        break;
      case 'pentagon':
        sides = 5;
        break;
      case 'hexagon':
        sides = 6;
        break;
      case 'star':
        sides = 5; // 星形有5个外顶点
        break;
      case 'custom':
        sides = polygonAction.sides || 6;
        break;
      default:
        sides = 6;
    }
    
    // 计算顶点
    const vertices: Point[] = [];
    const angleStep = (2 * Math.PI) / sides;
    
    for (let i = 0; i < sides; i++) {
      const angle = i * angleStep - Math.PI / 2; // 从顶部开始
      vertices.push({
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle),
        timestamp: Date.now()
      });
    }
    
    return vertices;
  }
  
  /**
   * 处理多边形锚点拖拽
   * 中心点：移动整个多边形
   * 顶点：移动单个顶点，其他顶点保持不变
   */
  public handleAnchorDrag(
    action: DrawAction,
    anchorType: AnchorType,
    startPoint: Point,
    currentPoint: Point,
    dragStartBounds: Bounds,
    dragStartAction?: DrawAction
  ): DrawAction | null {
    if (action.points.length === 0) {
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
      ? this.getPolygonVertices(dragStartAction)
      : this.getPolygonVertices(action);
    
    if (startVertices.length === 0) {
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
    const newVertices = [...startVertices];
    const movedVertex = newVertices[closestVertexIndex];
    const newX = movedVertex.x + deltaX;
    const newY = movedVertex.y + deltaY;
    
    // 检查新坐标是否有效
    if (!isFinite(newX) || !isFinite(newY)) {
      return null;
    }
    
    newVertices[closestVertexIndex] = {
      ...movedVertex,
      x: newX,
      y: newY
    };
    
    // 更新 action.points
    // 如果原始 action.points 是顶点列表，直接更新
    // 否则需要转换为顶点列表格式
    const polygonAction = action as DrawAction & {
      polygonType?: 'triangle' | 'pentagon' | 'hexagon' | 'star' | 'custom';
      sides?: number;
    };
    
    // 检查原始 action.points 的结构
    const originalVertices = this.getPolygonVertices(action);
    
    // 如果原始是顶点列表结构，直接更新 points
    if (action.points.length >= 3 && originalVertices.length === action.points.length) {
      const newPoints = action.points.map((point, index) => {
        if (index === closestVertexIndex) {
          return { ...point, x: newX, y: newY };
        }
        return point;
      });
      
      return {
        ...action,
        points: newPoints
      };
    } else {
      // 如果原始是中心+边缘结构，转换为顶点列表
      // 保留多边形类型信息
      return {
        ...action,
        points: newVertices,
        // 标记为已转换为顶点列表
        polygonType: polygonAction.polygonType || 'custom'
      };
    }
  }
  
  
  
  /**
   * 计算多边形中心点（边界框中心或点集中心）
   */
  public calculateCenterPoint(action: DrawAction, bounds?: Bounds): Point {
    // 先尝试从边界框计算（如果有的话）
    if (bounds && bounds.width > 0 && bounds.height > 0) {
      return ShapeUtils.getBoundsCenter(bounds);
    }
    
    // 否则使用基类的通用实现（点集中心）
    return super.calculateCenterPoint(action);
  }
}

