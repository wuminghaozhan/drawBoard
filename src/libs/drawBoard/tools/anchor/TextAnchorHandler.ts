import type { DrawAction } from '../DrawTool';
import type { Point } from '../../core/CanvasEngine';
import type { AnchorPoint, AnchorType, Bounds } from './AnchorTypes';
import { BaseAnchorHandler } from './BaseAnchorHandler';
import { ShapeUtils } from '../../utils/ShapeUtils';

/**
 * 文字锚点处理器
 * 实现文字图形的锚点生成和拖拽处理
 */
export class TextAnchorHandler extends BaseAnchorHandler {
  
  /**
   * 生成文字锚点
   */
  public generateAnchors(_action: DrawAction, bounds: Bounds): AnchorPoint[] {
    const anchors: AnchorPoint[] = [];
    
    // 生成中心点
    anchors.push(this.generateCenterAnchor(bounds, 'text'));
    
    // 生成8个标准锚点
    anchors.push(...this.generateStandardAnchors(bounds, 'text'));
    
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
    _dragStartAction?: DrawAction
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
    
    // 根据锚点类型计算新的边界框（使用公共方法）
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
   * 计算文字中心点（文字特殊实现：使用边界框中心或第一个点）
   */
  public calculateCenterPoint(action: DrawAction): Point {
    // 先尝试从边界框计算（如果有的话）
    const bounds = this.calculateBounds(action);
    if (bounds.width > 0 && bounds.height > 0) {
      return ShapeUtils.getBoundsCenter(bounds);
    }
    
    // 如果没有边界框，使用第一个点（文字位置点）
    if (action.points.length > 0) {
      return action.points[0];
    }
    
    return { x: 0, y: 0 };
  }
  
}

