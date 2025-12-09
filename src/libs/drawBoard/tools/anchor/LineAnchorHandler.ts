import type { DrawAction } from '../DrawTool';
import type { Point } from '../../core/CanvasEngine';
import type { AnchorPoint, AnchorType, Bounds } from './AnchorTypes';
import { BaseAnchorHandler } from './BaseAnchorHandler';
import { AnchorUtils } from '../../utils/AnchorUtils';

/**
 * 直线锚点处理器
 * 实现直线图形的锚点生成和拖拽处理
 */
export class LineAnchorHandler extends BaseAnchorHandler {
  
  /**
   * 生成直线锚点
   */
  public generateAnchors(action: DrawAction, _bounds: Bounds): AnchorPoint[] {
    if (action.points.length < 2) {
      return [];
    }
    
    const anchors: AnchorPoint[] = [];
    const halfSize = AnchorUtils.DEFAULT_ANCHOR_SIZE / 2;
    
    // 注意：LineTool 使用 points[0] 作为起点，points[points.length - 1] 作为终点
    const start = action.points[0];
    const end = action.points[action.points.length - 1];
    
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
    _dragStartBounds: Bounds,
    _dragStartAction?: DrawAction
  ): DrawAction | null {
    if (action.points.length < 2) {
      return null;
    }
    
    // 注意：LineTool 使用 points[0] 作为起点，points[points.length - 1] 作为终点
    const start = action.points[0];
    const end = action.points[action.points.length - 1];
    
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
      
      // 注意：边界限制由 SelectTool 统一处理（在调用 handleAnchorDrag 后）
      // 更新起点，保持其他点不变（如果有中间点的话）
      const newPoints = action.points.map((point, index) => {
        if (index === 0) {
          return { ...point, x: newStartX, y: newStartY };
        }
        return point;
      });
      
      return {
        ...action,
        points: newPoints
      };
    } else if (anchorType === 'end') {
      // 改变终点位置
      const newEndX = end.x + deltaX;
      const newEndY = end.y + deltaY;
      
      // 检查有效性
      if (!isFinite(newEndX) || !isFinite(newEndY)) {
        return null;
      }
      
      // 注意：边界限制由 SelectTool 统一处理（在调用 handleAnchorDrag 后）
      // 更新终点（最后一个点），保持其他点不变
      const newPoints = action.points.map((point, index) => {
        if (index === action.points.length - 1) {
          return { ...point, x: newEndX, y: newEndY };
        }
        return point;
      });
      
      return {
        ...action,
        points: newPoints
      };
    }
    
    return null;
  }
  
  /**
   * 计算直线中心点（线段中点）
   */
  public calculateCenterPoint(action: DrawAction): Point {
    if (action.points.length >= 2) {
      // 注意：LineTool 使用 points[0] 作为起点，points[points.length - 1] 作为终点
      const start = action.points[0];
      const end = action.points[action.points.length - 1];
      return {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2
      };
    }
    return { x: 0, y: 0 };
  }
  
}

