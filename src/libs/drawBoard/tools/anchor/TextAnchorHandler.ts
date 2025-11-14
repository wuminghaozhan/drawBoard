import type { DrawAction } from '../DrawTool';
import type { Point } from '../../core/CanvasEngine';
import type { AnchorPoint, AnchorType, Bounds, ShapeAnchorHandler } from './AnchorTypes';
import { logger } from '../../utils/Logger';
import { BoundsValidator } from '../../utils/BoundsValidator';

/**
 * 文字锚点处理器
 * 实现文字图形的锚点生成和拖拽处理
 */
export class TextAnchorHandler implements ShapeAnchorHandler {
  private readonly anchorSize: number = 8;
  
  /**
   * 生成文字锚点
   */
  public generateAnchors(action: DrawAction, bounds: Bounds): AnchorPoint[] {
    const anchors: AnchorPoint[] = [];
    const halfSize = this.anchorSize / 2;
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
      shapeType: 'text',
      isCenter: true
    });
    
    // 生成8个标准锚点
    anchors.push(
      // 四个角点
      { x: x - halfSize, y: y - halfSize, type: 'top-left', cursor: 'nw-resize', shapeType: 'text' },
      { x: x + width - halfSize, y: y - halfSize, type: 'top-right', cursor: 'ne-resize', shapeType: 'text' },
      { x: x + width - halfSize, y: y + height - halfSize, type: 'bottom-right', cursor: 'se-resize', shapeType: 'text' },
      { x: x - halfSize, y: y + height - halfSize, type: 'bottom-left', cursor: 'sw-resize', shapeType: 'text' },
      
      // 四个边中点
      { x: x + width / 2 - halfSize, y: y - halfSize, type: 'top', cursor: 'n-resize', shapeType: 'text' },
      { x: x + width - halfSize, y: y + height / 2 - halfSize, type: 'right', cursor: 'e-resize', shapeType: 'text' },
      { x: x + width / 2 - halfSize, y: y + height - halfSize, type: 'bottom', cursor: 's-resize', shapeType: 'text' },
      { x: x - halfSize, y: y + height / 2 - halfSize, type: 'left', cursor: 'w-resize', shapeType: 'text' }
    );
    
    return anchors;
  }
  
  /**
   * 处理文字锚点拖拽
   * 中心点：移动文字位置
   * 边缘锚点：改变字体大小，位置固定
   */
  public handleAnchorDrag(
    action: DrawAction,
    anchorType: AnchorType,
    startPoint: Point,
    currentPoint: Point,
    dragStartBounds: Bounds,
    dragStartAction?: DrawAction
  ): DrawAction | null {
    const textAction = action as DrawAction & { 
      text?: string; 
      fontSize?: number;
      fontFamily?: string;
    };
    
    // 中心点拖拽：移动文字位置
    if (anchorType === 'center') {
      const deltaX = currentPoint.x - startPoint.x;
      const deltaY = currentPoint.y - startPoint.y;
      return this.handleMove(action, deltaX, deltaY);
    }
    
    // 边缘锚点拖拽：改变字体大小
    const originalFontSize = textAction.fontSize || 16;
    
    // 计算鼠标移动距离
    const mouseDeltaX = currentPoint.x - startPoint.x;
    const mouseDeltaY = currentPoint.y - startPoint.y;
    
    // 根据锚点类型计算新的边界框
    const newBounds = this.calculateNewBounds(dragStartBounds, anchorType, mouseDeltaX, mouseDeltaY);
    if (!newBounds) {
      return null;
    }
    
    // 计算缩放比例（使用等比例缩放，保持文字比例）
    const scaleX = newBounds.width / dragStartBounds.width;
    const scaleY = newBounds.height / dragStartBounds.height;
    const uniformScale = Math.min(scaleX, scaleY); // 使用较小的缩放比例
    
    // 计算新的字体大小
    let newFontSize = originalFontSize * uniformScale;
    
    // 限制字体大小范围
    const MIN_FONT_SIZE = 8;
    const MAX_FONT_SIZE = 72;
    newFontSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, newFontSize));
    
    // 文字位置保持不变（只更新字体大小）
    return {
      ...action,
      fontSize: newFontSize
    } as DrawAction;
  }
  
  /**
   * 处理文字移动
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
   * 计算文字中心点
   */
  public calculateCenterPoint(action: DrawAction, bounds?: Bounds): Point {
    if (bounds) {
      return {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2
      };
    }
    
    // 如果没有提供bounds，使用第一个点（文字位置点）
    if (action.points.length > 0) {
      return action.points[0];
    }
    
    return { x: 0, y: 0 };
  }
  
  /**
   * 计算新的边界框
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
        return null;
    }
    
    // 限制最小尺寸
    if (newBounds.width < 10 || newBounds.height < 10) {
      return null;
    }
    
    // 检查有效性
    if (!isFinite(newBounds.x) || !isFinite(newBounds.y) || 
        !isFinite(newBounds.width) || !isFinite(newBounds.height)) {
      return null;
    }
    
    return newBounds;
  }
}

