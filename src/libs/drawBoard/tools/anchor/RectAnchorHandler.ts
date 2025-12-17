import type { DrawAction } from '../DrawTool';
import type { Point } from '../../core/CanvasEngine';
import type { AnchorPoint, AnchorType, Bounds } from './AnchorTypes';
import { BaseAnchorHandler } from './BaseAnchorHandler';
import { ShapeUtils } from '../../utils/ShapeUtils';

/**
 * 矩形锚点处理器
 * 实现矩形图形的锚点生成和拖拽处理
 */
export class RectAnchorHandler extends BaseAnchorHandler {
  
  /**
   * 生成矩形锚点
   */
  public generateAnchors(_action: DrawAction, bounds: Bounds): AnchorPoint[] {
    const anchors: AnchorPoint[] = [];
    
    // 生成中心点
    anchors.push(this.generateCenterAnchor(bounds, 'rect'));
    
    // 生成8个标准锚点
    anchors.push(...this.generateStandardAnchors(bounds, 'rect'));
    
    return anchors;
  }
  
  /**
   * 处理矩形锚点拖拽
   * 中心点：移动整个矩形
   * 边中点：只改变对应边的位置和尺寸
   * 角点：同时改变两个相邻边的位置和尺寸
   * 旋转锚点：由 AnchorDragHandler.handleRotateDrag 处理，这里不做处理
   */
  public handleAnchorDrag(
    action: DrawAction,
    anchorType: AnchorType,
    startPoint: Point,
    currentPoint: Point,
    dragStartBounds: Bounds,
    _dragStartAction?: DrawAction
  ): DrawAction | null {
    // 🔄 旋转锚点：由 AnchorDragHandler 处理，这里不应该被调用
    // 但为了安全起见，返回 null 让上层处理
    if (anchorType === 'rotate') {
      return null;
    }
    
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
    
    // 验证边界框（使用公共方法）
    const validatedBounds = this.validateAndClampBounds(newBounds);
    if (!validatedBounds) {
      return null;
    }
    
    // 计算缩放比例
    const scaleX = validatedBounds.width / dragStartBounds.width;
    const scaleY = validatedBounds.height / dragStartBounds.height;
    
    // 计算缩放中心（使用公共方法）
    const scaleCenter = this.getEdgeDragScaleCenter(edgeType, dragStartBounds);
    
    // 应用缩放变换
    return this.scaleAction(action, scaleX, scaleY, scaleCenter.x, scaleCenter.y);
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
    
    // 验证边界框（使用公共方法）
    const validatedBounds = this.validateAndClampBounds(newBounds);
    if (!validatedBounds) {
      return null;
    }
    
    // 计算缩放比例
    const scaleX = validatedBounds.width / dragStartBounds.width;
    const scaleY = validatedBounds.height / dragStartBounds.height;
    
    // 计算缩放中心（使用公共方法）
    const scaleCenter = this.getCornerDragScaleCenter(cornerType, dragStartBounds);
    
    // 应用缩放变换
    return this.scaleAction(action, scaleX, scaleY, scaleCenter.x, scaleCenter.y);
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

