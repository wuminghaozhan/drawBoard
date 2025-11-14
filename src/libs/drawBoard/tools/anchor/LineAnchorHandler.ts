import type { DrawAction } from '../DrawTool';
import type { Point } from '../../core/CanvasEngine';
import type { AnchorPoint, AnchorType, Bounds, ShapeAnchorHandler } from './AnchorTypes';
import { logger } from '../../utils/Logger';
import { BoundsValidator } from '../../utils/BoundsValidator';

/**
 * 直线锚点处理器
 * 实现直线图形的锚点生成和拖拽处理
 */
export class LineAnchorHandler implements ShapeAnchorHandler {
  private readonly anchorSize: number = 8;
  
  /**
   * 生成直线锚点
   */
  public generateAnchors(action: DrawAction, bounds: Bounds): AnchorPoint[] {
    if (action.points.length < 2) {
      return [];
    }
    
    const anchors: AnchorPoint[] = [];
    const halfSize = this.anchorSize / 2;
    
    const start = action.points[0];
    const end = action.points[1];
    
    // 计算中心点（线段中点）
    const centerX = (start.x + end.x) / 2;
    const centerY = (start.y + end.y) / 2;
    
    // 生成中心点
    anchors.push({
      x: centerX - halfSize,
      y: centerY - halfSize,
      type: 'center',
      cursor: 'move',
      shapeType: 'line',
      isCenter: true
    });
    
    // 生成起点锚点
    anchors.push({
      x: start.x - halfSize,
      y: start.y - halfSize,
      type: 'start',
      cursor: 'crosshair',
      shapeType: 'line'
    });
    
    // 生成终点锚点
    anchors.push({
      x: end.x - halfSize,
      y: end.y - halfSize,
      type: 'end',
      cursor: 'crosshair',
      shapeType: 'line'
    });
    
    return anchors;
  }
  
  /**
   * 处理直线锚点拖拽
   * 中心点：移动整条直线
   * 起点/终点：改变对应端点位置
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
    
    const start = action.points[0];
    const end = action.points[1];
    
    // 中心点拖拽：移动整条直线
    if (anchorType === 'center') {
      const deltaX = currentPoint.x - startPoint.x;
      const deltaY = currentPoint.y - startPoint.y;
      return this.handleMove(action, deltaX, deltaY);
    }
    
    // 起点/终点拖拽：改变对应端点位置
    const deltaX = currentPoint.x - startPoint.x;
    const deltaY = currentPoint.y - startPoint.y;
    
    if (anchorType === 'start') {
      // 改变起点位置
      const newStartX = start.x + deltaX;
      const newStartY = start.y + deltaY;
      
      // 检查有效性
      if (!isFinite(newStartX) || !isFinite(newStartY)) {
        return null;
      }
      
      // 限制点在画布范围内
      const canvasBounds = this.getCanvasBounds();
      const clampedStartX = canvasBounds ? 
        Math.max(0, Math.min(canvasBounds.width, newStartX)) : newStartX;
      const clampedStartY = canvasBounds ? 
        Math.max(0, Math.min(canvasBounds.height, newStartY)) : newStartY;
      
      return {
        ...action,
        points: [
          { ...start, x: clampedStartX, y: clampedStartY },
          end // 终点不变
        ]
      };
    } else if (anchorType === 'end') {
      // 改变终点位置
      const newEndX = end.x + deltaX;
      const newEndY = end.y + deltaY;
      
      // 检查有效性
      if (!isFinite(newEndX) || !isFinite(newEndY)) {
        return null;
      }
      
      // 限制点在画布范围内
      const canvasBounds = this.getCanvasBounds();
      const clampedEndX = canvasBounds ? 
        Math.max(0, Math.min(canvasBounds.width, newEndX)) : newEndX;
      const clampedEndY = canvasBounds ? 
        Math.max(0, Math.min(canvasBounds.height, newEndY)) : newEndY;
      
      return {
        ...action,
        points: [
          start, // 起点不变
          { ...end, x: clampedEndX, y: clampedEndY }
        ]
      };
    }
    
    return null;
  }
  
  /**
   * 处理直线移动
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
   * 计算直线中心点（线段中点）
   */
  public calculateCenterPoint(action: DrawAction, bounds?: Bounds): Point {
    if (action.points.length >= 2) {
      const start = action.points[0];
      const end = action.points[1];
      return {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2
      };
    }
    return { x: 0, y: 0 };
  }
  
  /**
   * 获取画布边界（用于限制点坐标）
   */
  private getCanvasBounds(): { width: number; height: number } | null {
    // 这个方法需要从外部传入，暂时返回null
    // 实际实现时应该从CanvasEngine获取
    return null;
  }
}

