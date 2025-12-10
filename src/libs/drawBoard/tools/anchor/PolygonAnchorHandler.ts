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
   * 
   * 多边形有两种数据格式：
   * 1. 中心+边缘点格式（绘制时产生）：points[0] = 中心点，points[last] = 边缘点
   *    需要根据中心和半径计算实际顶点
   * 2. 顶点列表格式（变换后产生）：points 包含所有顶点坐标
   *    通过 isVertexList 标记区分
   */
  private getPolygonVertices(action: DrawAction): Point[] {
    if (action.points.length < 2) {
      return [];
    }
    
    // 检查是否是顶点列表格式（变换后的多边形）
    const polygonAction = action as DrawAction & {
      isVertexList?: boolean;
      polygonType?: string;
      sides?: number;
    };
    
    if (polygonAction.isVertexList === true) {
      // 已标记为顶点列表，直接使用
      return action.points;
    }
    
    // 默认认为是中心+边缘点格式，计算实际顶点
    // 这是绘制多边形时的标准格式
    return this.calculateVerticesFromCenterAndRadius(action);
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
    _dragStartBounds: Bounds,
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
    // 保留类型断言用于将来扩展
    const _polygonAction = action as DrawAction & {
      polygonType?: 'triangle' | 'pentagon' | 'hexagon' | 'star' | 'custom';
      sides?: number;
    };
    void _polygonAction; // 避免 lint 警告
    
    // 检查原始 action.points 的结构
    const originalVertices = this.getPolygonVertices(action);
    
    // 检查是否已经是顶点列表格式
    const polygonAction = action as DrawAction & { isVertexList?: boolean };
    
    if (polygonAction.isVertexList === true) {
      // 已经是顶点列表格式，直接更新对应顶点
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
      // 中心+边缘格式，转换为顶点列表格式
      // 标记为顶点列表，以便后续正确处理
      return {
        ...action,
        points: newVertices,
        isVertexList: true
      } as DrawAction;
    }
  }
  
  
  
  /**
   * 计算多边形中心点
   * 对于中心+边缘格式：直接使用第一个点（中心）
   * 对于顶点列表格式：使用边界框中心
   */
  public calculateCenterPoint(action: DrawAction, bounds?: Bounds): Point {
    if (action.points.length < 2) {
      return { x: 0, y: 0 };
    }
    
    // 检查是否是顶点列表格式
    const polygonAction = action as DrawAction & { isVertexList?: boolean };
    
    if (polygonAction.isVertexList === true) {
      // 顶点列表格式：使用边界框中心或点集中心
      if (bounds && bounds.width > 0 && bounds.height > 0) {
        return ShapeUtils.getBoundsCenter(bounds);
      }
      return super.calculateCenterPoint(action);
    }
    
    // 中心+边缘格式：直接使用第一个点作为中心
    return action.points[0];
  }
}

