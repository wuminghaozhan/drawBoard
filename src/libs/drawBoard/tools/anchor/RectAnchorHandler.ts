import type { DrawAction } from '../DrawTool';
import type { Point } from '../../core/CanvasEngine';
import type { AnchorPoint, AnchorType, Bounds } from './AnchorTypes';
import { logger } from '../../utils/Logger';
import { BoundsValidator } from '../../utils/BoundsValidator';
import { BaseAnchorHandler } from './BaseAnchorHandler';
import { AnchorUtils } from '../../utils/AnchorUtils';
import { ShapeUtils } from '../../utils/ShapeUtils';

/**
 * 矩形锚点处理器
 * 实现矩形图形的锚点生成和拖拽处理
 */
export class RectAnchorHandler extends BaseAnchorHandler {
  
  /**
   * 生成矩形锚点
   */
  public generateAnchors(action: DrawAction, bounds: Bounds): AnchorPoint[] {
    const anchors: AnchorPoint[] = [];
    const halfSize = AnchorUtils.DEFAULT_ANCHOR_SIZE / 2;
    const { x, y, width, height } = bounds;
    
    // 计算中心点
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    
    // 生成中心点
    anchors.push({
      x: centerX - halfSize,
      y: centerY - halfSize,
      type: 'center',
      cursor: 'move',
      shapeType: 'rect',
      isCenter: true
    });
    
    // 生成8个标准锚点
    anchors.push(
      // 四个角点
      { x: x - halfSize, y: y - halfSize, type: 'top-left', cursor: 'nw-resize', shapeType: 'rect' },
      { x: x + width - halfSize, y: y - halfSize, type: 'top-right', cursor: 'ne-resize', shapeType: 'rect' },
      { x: x + width - halfSize, y: y + height - halfSize, type: 'bottom-right', cursor: 'se-resize', shapeType: 'rect' },
      { x: x - halfSize, y: y + height - halfSize, type: 'bottom-left', cursor: 'sw-resize', shapeType: 'rect' },
      
      // 四个边中点
      { x: x + width / 2 - halfSize, y: y - halfSize, type: 'top', cursor: 'n-resize', shapeType: 'rect' },
      { x: x + width - halfSize, y: y + height / 2 - halfSize, type: 'right', cursor: 'e-resize', shapeType: 'rect' },
      { x: x + width / 2 - halfSize, y: y + height - halfSize, type: 'bottom', cursor: 's-resize', shapeType: 'rect' },
      { x: x - halfSize, y: y + height / 2 - halfSize, type: 'left', cursor: 'w-resize', shapeType: 'rect' }
    );
    
    return anchors;
  }
  
  /**
   * 处理矩形锚点拖拽
   * 中心点：移动整个矩形
   * 边中点：只改变对应边的位置和尺寸
   * 角点：同时改变两个相邻边的位置和尺寸
   */
  public handleAnchorDrag(
    action: DrawAction,
    anchorType: AnchorType,
    startPoint: Point,
    currentPoint: Point,
    dragStartBounds: Bounds,
    dragStartAction?: DrawAction
  ): DrawAction | null {
    // 中心点拖拽：移动整个矩形
    if (anchorType === 'center') {
      const deltaX = currentPoint.x - startPoint.x;
      const deltaY = currentPoint.y - startPoint.y;
      return this.handleMove(action, deltaX, deltaY);
    }
    
    // 计算鼠标移动距离
    const mouseDeltaX = currentPoint.x - startPoint.x;
    const mouseDeltaY = currentPoint.y - startPoint.y;
    
    // 判断是边中点还是角点
    const isEdge = ['top', 'right', 'bottom', 'left'].includes(anchorType);
    const isCorner = ['top-left', 'top-right', 'bottom-right', 'bottom-left'].includes(anchorType);
    
    if (isEdge) {
      return this.handleEdgeDrag(action, anchorType as 'top' | 'right' | 'bottom' | 'left', 
                                 dragStartBounds, mouseDeltaX, mouseDeltaY);
    } else if (isCorner) {
      return this.handleCornerDrag(action, anchorType as 'top-left' | 'top-right' | 'bottom-right' | 'bottom-left',
                                   dragStartBounds, mouseDeltaX, mouseDeltaY);
    }
    
    return null;
  }
  
  /**
   * 处理矩形边中点拖拽
   */
  private handleEdgeDrag(
    action: DrawAction,
    edgeType: 'top' | 'right' | 'bottom' | 'left',
    dragStartBounds: Bounds,
    mouseDeltaX: number,
    mouseDeltaY: number
  ): DrawAction | null {
    let newBounds = { ...dragStartBounds };
    
    switch (edgeType) {
      case 'top':
        newBounds.y = dragStartBounds.y + mouseDeltaY;
        newBounds.height = dragStartBounds.height - mouseDeltaY;
        break;
      case 'right':
        newBounds.width = dragStartBounds.width + mouseDeltaX;
        break;
      case 'bottom':
        newBounds.height = dragStartBounds.height + mouseDeltaY;
        break;
      case 'left':
        newBounds.x = dragStartBounds.x + mouseDeltaX;
        newBounds.width = dragStartBounds.width - mouseDeltaX;
        break;
    }
    
    // 限制最小尺寸
    if (newBounds.width < 10 || newBounds.height < 10) {
      return null;
    }
    
    // 计算缩放比例
    const scaleX = newBounds.width / dragStartBounds.width;
    const scaleY = newBounds.height / dragStartBounds.height;
    
    // 计算缩放中心（根据边类型）
    let centerX: number, centerY: number;
    switch (edgeType) {
      case 'top':
        centerX = dragStartBounds.x + dragStartBounds.width / 2;
        centerY = dragStartBounds.y + dragStartBounds.height; // 下边中点
        break;
      case 'right':
        centerX = dragStartBounds.x; // 左边中点
        centerY = dragStartBounds.y + dragStartBounds.height / 2;
        break;
      case 'bottom':
        centerX = dragStartBounds.x + dragStartBounds.width / 2;
        centerY = dragStartBounds.y; // 上边中点
        break;
      case 'left':
        centerX = dragStartBounds.x + dragStartBounds.width; // 右边中点
        centerY = dragStartBounds.y + dragStartBounds.height / 2;
        break;
      default:
        centerX = dragStartBounds.x + dragStartBounds.width / 2;
        centerY = dragStartBounds.y + dragStartBounds.height / 2;
    }
    
    // 应用缩放变换
    return this.scaleRectAction(action, scaleX, scaleY, centerX, centerY);
  }
  
  /**
   * 处理矩形角点拖拽
   */
  private handleCornerDrag(
    action: DrawAction,
    cornerType: 'top-left' | 'top-right' | 'bottom-right' | 'bottom-left',
    dragStartBounds: Bounds,
    mouseDeltaX: number,
    mouseDeltaY: number
  ): DrawAction | null {
    let newBounds = { ...dragStartBounds };
    
    switch (cornerType) {
      case 'top-left':
        newBounds.x = dragStartBounds.x + mouseDeltaX;
        newBounds.y = dragStartBounds.y + mouseDeltaY;
        newBounds.width = dragStartBounds.width - mouseDeltaX;
        newBounds.height = dragStartBounds.height - mouseDeltaY;
        break;
      case 'top-right':
        newBounds.y = dragStartBounds.y + mouseDeltaY;
        newBounds.width = dragStartBounds.width + mouseDeltaX;
        newBounds.height = dragStartBounds.height - mouseDeltaY;
        break;
      case 'bottom-right':
        newBounds.width = dragStartBounds.width + mouseDeltaX;
        newBounds.height = dragStartBounds.height + mouseDeltaY;
        break;
      case 'bottom-left':
        newBounds.x = dragStartBounds.x + mouseDeltaX;
        newBounds.width = dragStartBounds.width - mouseDeltaX;
        newBounds.height = dragStartBounds.height + mouseDeltaY;
        break;
    }
    
    // 限制最小尺寸
    if (newBounds.width < 10 || newBounds.height < 10) {
      return null;
    }
    
    // 计算缩放比例
    const scaleX = newBounds.width / dragStartBounds.width;
    const scaleY = newBounds.height / dragStartBounds.height;
    
    // 缩放中心是对角点（固定点）
    let centerX: number, centerY: number;
    switch (cornerType) {
      case 'top-left':
        centerX = dragStartBounds.x + dragStartBounds.width;  // 右下角
        centerY = dragStartBounds.y + dragStartBounds.height;
        break;
      case 'top-right':
        centerX = dragStartBounds.x;  // 左下角
        centerY = dragStartBounds.y + dragStartBounds.height;
        break;
      case 'bottom-right':
        centerX = dragStartBounds.x;  // 左上角
        centerY = dragStartBounds.y;
        break;
      case 'bottom-left':
        centerX = dragStartBounds.x + dragStartBounds.width;  // 右上角
        centerY = dragStartBounds.y;
        break;
      default:
        centerX = dragStartBounds.x + dragStartBounds.width / 2;
        centerY = dragStartBounds.y + dragStartBounds.height / 2;
    }
    
    // 应用缩放变换
    return this.scaleRectAction(action, scaleX, scaleY, centerX, centerY);
  }
  
  /**
   * 缩放矩形action
   */
  private scaleRectAction(
    action: DrawAction,
    scaleX: number,
    scaleY: number,
    centerX: number,
    centerY: number
  ): DrawAction | null {
    if (!isFinite(scaleX) || !isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
      return null;
    }
    
    const newPoints = action.points.map(point => {
      const newX = centerX + (point.x - centerX) * scaleX;
      const newY = centerY + (point.y - centerY) * scaleY;
      
      if (!isFinite(newX) || !isFinite(newY)) {
        return point;
      }
      
      return {
        ...point,
        x: newX,
        y: newY
      };
    });
    
    return {
      ...action,
      points: newPoints
    };
  }
  
  /**
   * 计算矩形中心点（矩形特殊实现：使用边界框中心或点集中心）
   */
  public calculateCenterPoint(action: DrawAction): Point {
    // 先尝试从边界框计算（如果有的话）
    const bounds = this.calculateBounds(action);
    if (bounds.width > 0 && bounds.height > 0) {
      return ShapeUtils.getBoundsCenter(bounds);
    }
    
    // 否则使用基类的通用实现
    return super.calculateCenterPoint(action);
  }
}

