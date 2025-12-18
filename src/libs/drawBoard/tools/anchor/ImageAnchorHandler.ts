import type { DrawAction } from '../DrawTool';
import type { Point } from '../../core/CanvasEngine';
import type { AnchorPoint, AnchorType, Bounds } from './AnchorTypes';
import { BaseAnchorHandler } from './BaseAnchorHandler';
import { ShapeUtils } from '../../utils/ShapeUtils';

/**
 * 图片锚点处理器
 * 实现图片图形的锚点生成和拖拽处理
 * 📝 图片类似于矩形，支持缩放和移动
 */
export class ImageAnchorHandler extends BaseAnchorHandler {
  
  /**
   * 生成图片锚点
   * 图片支持8个标准锚点（4个角点 + 4个边中点）+ 中心点 + 旋转锚点
   */
  public generateAnchors(_action: DrawAction, bounds: Bounds): AnchorPoint[] {
    const anchors: AnchorPoint[] = [];
    const halfSize = this.anchorSize / 2;
    const { x, y, width, height } = bounds;
    
    // 生成中心点（用于移动）
    anchors.push(this.generateCenterAnchor(bounds, 'image'));
    
    // 生成8个标准锚点
    // 角点
    anchors.push({
      x: x - halfSize,
      y: y - halfSize,
      type: 'top-left',
      cursor: 'nw-resize',
      shapeType: 'image'
    });
    
    anchors.push({
      x: x + width - halfSize,
      y: y - halfSize,
      type: 'top-right',
      cursor: 'ne-resize',
      shapeType: 'image'
    });
    
    anchors.push({
      x: x + width - halfSize,
      y: y + height - halfSize,
      type: 'bottom-right',
      cursor: 'se-resize',
      shapeType: 'image'
    });
    
    anchors.push({
      x: x - halfSize,
      y: y + height - halfSize,
      type: 'bottom-left',
      cursor: 'sw-resize',
      shapeType: 'image'
    });
    
    // 边中点
    anchors.push({
      x: x + width / 2 - halfSize,
      y: y - halfSize,
      type: 'top',
      cursor: 'n-resize',
      shapeType: 'image'
    });
    
    anchors.push({
      x: x + width - halfSize,
      y: y + height / 2 - halfSize,
      type: 'right',
      cursor: 'e-resize',
      shapeType: 'image'
    });
    
    anchors.push({
      x: x + width / 2 - halfSize,
      y: y + height - halfSize,
      type: 'bottom',
      cursor: 's-resize',
      shapeType: 'image'
    });
    
    anchors.push({
      x: x - halfSize,
      y: y + height / 2 - halfSize,
      type: 'left',
      cursor: 'w-resize',
      shapeType: 'image'
    });
    
    return anchors;
  }
  
  /**
   * 处理图片锚点拖拽
   * 中心点：移动整个图片
   * 边中点：只改变对应边的位置和尺寸
   * 角点：同时改变两个相邻边的位置和尺寸
   */
  public handleAnchorDrag(
    action: DrawAction,
    anchorType: AnchorType,
    startPoint: Point,
    currentPoint: Point,
    dragStartBounds: Bounds,
    _dragStartAction?: DrawAction
  ): DrawAction | null {
    // 旋转锚点：由 AnchorDragHandler 处理，这里不应该被调用
    if (anchorType === 'rotate') {
      return null;
    }
    
    // 中心点拖拽：移动整个图片
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
   * 处理图片边中点拖拽
   */
  private handleEdgeDrag(
    action: DrawAction,
    edgeType: 'top' | 'right' | 'bottom' | 'left',
    dragStartBounds: Bounds,
    mouseDeltaX: number,
    mouseDeltaY: number
  ): DrawAction | null {
    const imageAction = action as any;
    const newAction = { ...action } as any;
    
    let newX = dragStartBounds.x;
    let newY = dragStartBounds.y;
    let newWidth = dragStartBounds.width;
    let newHeight = dragStartBounds.height;
    
    switch (edgeType) {
      case 'top':
        newY = dragStartBounds.y + mouseDeltaY;
        newHeight = dragStartBounds.height - mouseDeltaY;
        break;
      case 'right':
        newWidth = dragStartBounds.width + mouseDeltaX;
        break;
      case 'bottom':
        newHeight = dragStartBounds.height + mouseDeltaY;
        break;
      case 'left':
        newX = dragStartBounds.x + mouseDeltaX;
        newWidth = dragStartBounds.width - mouseDeltaX;
        break;
    }
    
    // 确保最小尺寸
    const minSize = 10;
    if (newWidth < minSize || newHeight < minSize) {
      return null;
    }
    
    // 更新图片位置和尺寸
    newAction.points = [{ x: newX, y: newY }];
    newAction.imageWidth = newWidth;
    newAction.imageHeight = newHeight;
    
    return newAction;
  }
  
  /**
   * 处理图片角点拖拽
   */
  private handleCornerDrag(
    action: DrawAction,
    cornerType: 'top-left' | 'top-right' | 'bottom-right' | 'bottom-left',
    dragStartBounds: Bounds,
    mouseDeltaX: number,
    mouseDeltaY: number
  ): DrawAction | null {
    const imageAction = action as any;
    const newAction = { ...action } as any;
    
    let newX = dragStartBounds.x;
    let newY = dragStartBounds.y;
    let newWidth = dragStartBounds.width;
    let newHeight = dragStartBounds.height;
    
    switch (cornerType) {
      case 'top-left':
        newX = dragStartBounds.x + mouseDeltaX;
        newY = dragStartBounds.y + mouseDeltaY;
        newWidth = dragStartBounds.width - mouseDeltaX;
        newHeight = dragStartBounds.height - mouseDeltaY;
        break;
      case 'top-right':
        newY = dragStartBounds.y + mouseDeltaY;
        newWidth = dragStartBounds.width + mouseDeltaX;
        newHeight = dragStartBounds.height - mouseDeltaY;
        break;
      case 'bottom-right':
        newWidth = dragStartBounds.width + mouseDeltaX;
        newHeight = dragStartBounds.height + mouseDeltaY;
        break;
      case 'bottom-left':
        newX = dragStartBounds.x + mouseDeltaX;
        newWidth = dragStartBounds.width - mouseDeltaX;
        newHeight = dragStartBounds.height + mouseDeltaY;
        break;
    }
    
    // 确保最小尺寸
    const minSize = 10;
    if (newWidth < minSize || newHeight < minSize) {
      return null;
    }
    
    // 更新图片位置和尺寸
    newAction.points = [{ x: newX, y: newY }];
    newAction.imageWidth = newWidth;
    newAction.imageHeight = newHeight;
    
    return newAction;
  }
  
  /**
   * 计算图片中心点
   */
  public calculateCenterPoint(action: DrawAction, bounds?: Bounds): Point {
    const imageAction = action as any;
    
    if (bounds) {
      return {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2
      };
    }
    
    const point = action.points[0];
    const width = imageAction.imageWidth || 200;
    const height = imageAction.imageHeight || 200;
    
    return {
      x: point.x + width / 2,
      y: point.y + height / 2
    };
  }
}

