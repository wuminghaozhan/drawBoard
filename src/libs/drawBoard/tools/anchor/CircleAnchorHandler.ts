import type { DrawAction } from '../DrawTool';
import type { Point } from '../../core/CanvasEngine';
import type { AnchorPoint, AnchorType, Bounds } from './AnchorTypes';
import { logger } from '../../utils/Logger';
import { BoundsValidator } from '../../utils/BoundsValidator';
import { BaseAnchorHandler } from './BaseAnchorHandler';
import { AnchorUtils } from '../../utils/AnchorUtils';

/**
 * 圆形锚点处理器
 * 实现圆形图形的锚点生成和拖拽处理
 */
export class CircleAnchorHandler extends BaseAnchorHandler {
  
  /**
   * 生成圆形锚点
   */
  public generateAnchors(action: DrawAction, bounds: Bounds): AnchorPoint[] {
    if (action.points.length < 2) {
      return [];
    }
    
    const center = action.points[0];
    const anchors: AnchorPoint[] = [];
    const halfSize = AnchorUtils.DEFAULT_ANCHOR_SIZE / 2;
    
    // 生成中心点（圆心位置）
    anchors.push({
      x: center.x - halfSize,
      y: center.y - halfSize,
      type: 'center',
      cursor: 'move',
      shapeType: 'circle',
      isCenter: true
    });
    
    // 生成4个边界锚点（上、下、左、右）- 根据文档要求
    // 对于圆形，需要基于圆心和半径计算锚点位置，而不是使用 bounds 的 x, y
    // 圆形边界框应该是以圆心为中心的正方形，但传入的 bounds 可能是基于两个点计算的矩形
    // 因此，我们直接基于圆心和半径计算锚点位置
    
    // 计算半径：直接使用圆心到边缘点的距离
    // 注意：CircleTool 使用 points[points.length - 1] 作为边缘点，而不是 points[1]
    let radius: number;
    if (action.points.length >= 2) {
      const edge = action.points[action.points.length - 1];
      const distance = Math.sqrt(
        Math.pow(edge.x - center.x, 2) + Math.pow(edge.y - center.y, 2)
      );
      // 对于圆形，bounds 应该是以圆心为中心的正方形，所以 width 和 height 应该相等
      // 但为了兼容性，我们使用实际计算的距离，或者 bounds 的宽度/高度的一半（取较大值）
      const boundsRadius = Math.max(bounds.width, bounds.height) / 2;
      // 使用实际计算的距离（这是最准确的）
      radius = distance > 0 ? distance : boundsRadius;
      
    } else {
      // 如果没有边缘点，使用 bounds 计算
      radius = Math.max(bounds.width, bounds.height) / 2;
    }
    
    // 确保半径有效
    if (!isFinite(radius) || radius <= 0) {
      radius = 10; // 默认半径
    }
    
    // 上、下、左、右四个方向的锚点（基于圆心和半径）
    // 锚点的 x, y 是锚点左上角的位置，绘制时会加上 halfSize 得到中心点
    const topAnchor = { x: center.x - halfSize, y: center.y - radius - halfSize, type: 'top', cursor: 'n-resize', shapeType: 'circle', isCenter: false };
    const bottomAnchor = { x: center.x - halfSize, y: center.y + radius - halfSize, type: 'bottom', cursor: 's-resize', shapeType: 'circle', isCenter: false };
    const leftAnchor = { x: center.x - radius - halfSize, y: center.y - halfSize, type: 'left', cursor: 'w-resize', shapeType: 'circle', isCenter: false };
    const rightAnchor = { x: center.x + radius - halfSize, y: center.y - halfSize, type: 'right', cursor: 'e-resize', shapeType: 'circle', isCenter: false };
    
    anchors.push(topAnchor, bottomAnchor, leftAnchor, rightAnchor);
    
    return anchors;
  }
  
  /**
   * 处理圆形锚点拖拽
   * 中心点：移动整个圆（此情况应该由SelectTool的移动逻辑处理，这里保留作为备用）
   * 边缘锚点：直接计算鼠标到圆心的距离作为新半径，边缘点跟随鼠标方向
   */
  public handleAnchorDrag(
    action: DrawAction,
    anchorType: AnchorType,
    startPoint: Point,
    currentPoint: Point,
    dragStartBounds: Bounds,
    dragStartAction?: DrawAction
  ): DrawAction | null {
    if (action.points.length < 2) {
      return null;
    }
    
    const center = action.points[0];
    // 注意：CircleTool 使用 points[points.length - 1] 作为边缘点，而不是 points[1]
    const oldEdge = action.points.length > 1 ? action.points[action.points.length - 1] : center;
    
    // 中心点拖拽：移动整个圆（此情况应该由SelectTool的移动逻辑处理）
    // 这里保留作为备用，但正常情况下不应该进入这里
    if (anchorType === 'center') {
      const deltaX = currentPoint.x - startPoint.x;
      const deltaY = currentPoint.y - startPoint.y;
      return this.handleMove(action, deltaX, deltaY);
    }
    
    // 边缘锚点拖拽：根据锚点类型（top/bottom/left/right）计算新半径
    // 拖拽任意一个边缘锚点，半径跟随鼠标到圆心的距离
    
    // 计算鼠标到圆心的距离（这就是新半径）
    const mouseToCenterDistance = Math.sqrt(
      Math.pow(currentPoint.x - center.x, 2) + 
      Math.pow(currentPoint.y - center.y, 2)
    );
    
    // 新半径 = 鼠标到圆心的距离（直接使用，精确控制）
    const newRadius = mouseToCenterDistance;
    
    // 限制半径范围
    const MIN_RADIUS = 5;
    const MAX_RADIUS = 10000; // 实际限制由画布尺寸决定
    const clampedRadius = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, newRadius));
    
    // 如果半径太小，返回null（无效操作）
    if (clampedRadius < MIN_RADIUS) {
      return null;
    }
    
    // 根据锚点类型计算边缘点位置
    // 上、下、左、右四个方向，边缘点跟随鼠标方向
    let newEdgeX: number;
    let newEdgeY: number;
    
    if (anchorType === 'top' || anchorType === 'bottom' || anchorType === 'left' || anchorType === 'right') {
      // 计算鼠标方向的角度
      const angle = Math.atan2(currentPoint.y - center.y, currentPoint.x - center.x);
      newEdgeX = center.x + clampedRadius * Math.cos(angle);
      newEdgeY = center.y + clampedRadius * Math.sin(angle);
    } else {
      // 兼容其他锚点类型（向后兼容）
      const angle = Math.atan2(currentPoint.y - center.y, currentPoint.x - center.x);
      newEdgeX = center.x + clampedRadius * Math.cos(angle);
      newEdgeY = center.y + clampedRadius * Math.sin(angle);
    }
    
    // 创建新的action，更新边缘点
    // 保持原有的 points 数组结构，只更新最后一个点（边缘点）
    const newPoints = [...action.points];
    const newEdge: Point = { x: newEdgeX, y: newEdgeY };
    if (newPoints.length > 1) {
      newPoints[newPoints.length - 1] = newEdge;
    } else {
      newPoints.push(newEdge);
    }
    
    return {
      ...action,
      points: newPoints
    };
  }
  
  /**
   * 处理圆形移动
   */
  public handleMove(
    action: DrawAction,
    deltaX: number,
    deltaY: number,
    canvasBounds?: { width: number; height: number }
  ): DrawAction | null {
    if (!isFinite(deltaX) || !isFinite(deltaY)) {
      return null;
    }
    
    const newPoints = action.points.map(point => {
      const newPoint = {
        x: point.x + deltaX,
        y: point.y + deltaY,
        timestamp: point.timestamp
      };
      
      // 使用统一的边界验证器限制点在画布范围内
      if (canvasBounds) {
        const canvasBoundsType = {
          x: 0,
          y: 0,
          width: canvasBounds.width,
          height: canvasBounds.height
        };
        return BoundsValidator.clampPointToCanvas(newPoint, canvasBoundsType);
      }
      
      return newPoint;
    });
    
    return {
      ...action,
      points: newPoints
    };
  }
  
  /**
   * 计算圆形中心点（圆心位置）
   */
  public calculateCenterPoint(action: DrawAction, bounds?: Bounds): Point {
    if (action.points.length > 0) {
      return action.points[0]; // 圆心位置
    }
    return { x: 0, y: 0 };
  }
  
  /**
   * 计算新的边界框（基于锚点类型和鼠标移动）
   */
  private calculateNewBounds(
    bounds: Bounds,
    anchorType: AnchorType,
    deltaX: number,
    deltaY: number
  ): Bounds | null {
    let newBounds = { ...bounds };
    
    switch (anchorType) {
      case 'top-left':
        newBounds.x = bounds.x + deltaX;
        newBounds.y = bounds.y + deltaY;
        newBounds.width = bounds.width - deltaX;
        newBounds.height = bounds.height - deltaY;
        break;
      case 'top-right':
        newBounds.y = bounds.y + deltaY;
        newBounds.width = bounds.width + deltaX;
        newBounds.height = bounds.height - deltaY;
        break;
      case 'bottom-right':
        newBounds.width = bounds.width + deltaX;
        newBounds.height = bounds.height + deltaY;
        break;
      case 'bottom-left':
        newBounds.x = bounds.x + deltaX;
        newBounds.width = bounds.width - deltaX;
        newBounds.height = bounds.height + deltaY;
        break;
      case 'top':
        newBounds.y = bounds.y + deltaY;
        newBounds.height = bounds.height - deltaY;
        break;
      case 'right':
        newBounds.width = bounds.width + deltaX;
        break;
      case 'bottom':
        newBounds.height = bounds.height + deltaY;
        break;
      case 'left':
        newBounds.x = bounds.x + deltaX;
        newBounds.width = bounds.width - deltaX;
        break;
      default:
        return null; // 不支持的类型
    }
    
    // 限制最小尺寸
    if (newBounds.width < 10 || newBounds.height < 10) {
      return null; // 返回null表示无效操作
    }
    
    // 检查有效性
    if (!isFinite(newBounds.x) || !isFinite(newBounds.y) || 
        !isFinite(newBounds.width) || !isFinite(newBounds.height)) {
      return null;
    }
    
    return newBounds;
  }
}

