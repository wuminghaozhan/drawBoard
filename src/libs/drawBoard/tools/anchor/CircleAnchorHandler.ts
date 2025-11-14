import type { DrawAction } from '../DrawTool';
import type { Point } from '../../core/CanvasEngine';
import type { AnchorPoint, AnchorType, Bounds, ShapeAnchorHandler } from './AnchorTypes';
import { logger } from '../../utils/Logger';
import { BoundsValidator } from '../../utils/BoundsValidator';

/**
 * 圆形锚点处理器
 * 实现圆形图形的锚点生成和拖拽处理
 */
export class CircleAnchorHandler implements ShapeAnchorHandler {
  private readonly anchorSize: number = 8;
  
  /**
   * 生成圆形锚点
   */
  public generateAnchors(action: DrawAction, bounds: Bounds): AnchorPoint[] {
    if (action.points.length < 2) {
      return [];
    }
    
    const center = action.points[0];
    const anchors: AnchorPoint[] = [];
    const halfSize = this.anchorSize / 2;
    
    // 生成中心点（圆心位置）
    anchors.push({
      x: center.x - halfSize,
      y: center.y - halfSize,
      type: 'center',
      cursor: 'move',
      shapeType: 'circle',
      isCenter: true
    });
    
    // 生成8个边界框锚点
    const { x, y, width, height } = bounds;
    
    anchors.push(
      // 四个角点
      { x: x - halfSize, y: y - halfSize, type: 'top-left', cursor: 'nw-resize', shapeType: 'circle' },
      { x: x + width - halfSize, y: y - halfSize, type: 'top-right', cursor: 'ne-resize', shapeType: 'circle' },
      { x: x + width - halfSize, y: y + height - halfSize, type: 'bottom-right', cursor: 'se-resize', shapeType: 'circle' },
      { x: x - halfSize, y: y + height - halfSize, type: 'bottom-left', cursor: 'sw-resize', shapeType: 'circle' },
      
      // 四个边中点
      { x: x + width / 2 - halfSize, y: y - halfSize, type: 'top', cursor: 'n-resize', shapeType: 'circle' },
      { x: x + width - halfSize, y: y + height / 2 - halfSize, type: 'right', cursor: 'e-resize', shapeType: 'circle' },
      { x: x + width / 2 - halfSize, y: y + height - halfSize, type: 'bottom', cursor: 's-resize', shapeType: 'circle' },
      { x: x - halfSize, y: y + height / 2 - halfSize, type: 'left', cursor: 'w-resize', shapeType: 'circle' }
    );
    
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
    const edge = action.points[1];
    
    // 中心点拖拽：移动整个圆（此情况应该由SelectTool的移动逻辑处理）
    // 这里保留作为备用，但正常情况下不应该进入这里
    if (anchorType === 'center') {
      const deltaX = currentPoint.x - startPoint.x;
      const deltaY = currentPoint.y - startPoint.y;
      return this.handleMove(action, deltaX, deltaY);
    }
    
    // 边缘锚点拖拽：鼠标距离圆心的距离，就是圆形半径的大小
    // 拖拽过程中，直接使用鼠标到圆心的距离作为新半径
    
    // 计算鼠标到圆心的距离（这就是新半径）
    const mouseToCenterDistance = Math.sqrt(
      Math.pow(currentPoint.x - center.x, 2) + 
      Math.pow(currentPoint.y - center.y, 2)
    );
    
    // 新半径 = 鼠标到圆心的距离
    const newRadius = mouseToCenterDistance;
    
    // 限制半径范围
    const MIN_RADIUS = 5;
    const MAX_RADIUS = 10000; // 实际限制由画布尺寸决定
    const clampedRadius = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, newRadius));
    
    // 如果半径太小，返回null（无效操作）
    if (clampedRadius < MIN_RADIUS) {
      return null;
    }
    
    // 计算边缘点位置：跟随鼠标方向（而不是保持原始角度）
    // 这样拖拽时边缘点会跟随鼠标，提供更直观的体验
    const angle = Math.atan2(currentPoint.y - center.y, currentPoint.x - center.x);
    const newEdgeX = center.x + clampedRadius * Math.cos(angle);
    const newEdgeY = center.y + clampedRadius * Math.sin(angle);
    
    return {
      ...action,
      points: [
        { ...center, x: center.x, y: center.y }, // 圆心位置不变
        { ...edge, x: newEdgeX, y: newEdgeY, timestamp: Date.now() } // 更新边缘点，跟随鼠标方向
      ]
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

