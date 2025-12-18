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
   * 📝 文本只支持左右边中点锚点用于调整宽度，不支持角点变形和旋转
   */
  public generateAnchors(_action: DrawAction, bounds: Bounds): AnchorPoint[] {
    const anchors: AnchorPoint[] = [];
    const halfSize = this.anchorSize / 2;
    const { x, y, width, height } = bounds;
    
    // 生成中心点（用于移动）
    anchors.push(this.generateCenterAnchor(bounds, 'text'));
    
    // 📝 只生成左右边中点锚点（用于调整宽度）
    // 左边中点
    anchors.push({
      x: x - halfSize,
      y: y + height / 2 - halfSize,
      type: 'left',
      cursor: 'ew-resize',
      shapeType: 'text'
    });
    
    // 右边中点
    anchors.push({
      x: x + width - halfSize,
      y: y + height / 2 - halfSize,
      type: 'right',
      cursor: 'ew-resize',
      shapeType: 'text'
    });
    
    return anchors;
  }
  
  /**
   * 处理文字锚点拖拽
   * 📝 文本只支持 left/right 锚点用于调整宽度，由 AnchorDragHandler.handleTextWidthDrag 处理
   * 中心点拖拽：移动文字位置
   */
  public handleAnchorDrag(
    action: DrawAction,
    anchorType: AnchorType,
    startPoint: Point,
    currentPoint: Point,
    _dragStartBounds: Bounds,
    _dragStartAction?: DrawAction
  ): DrawAction | null {
    // 中心点拖拽：移动文字位置
    if (anchorType === 'center') {
      const deltaX = currentPoint.x - startPoint.x;
      const deltaY = currentPoint.y - startPoint.y;
      return this.handleMove(action, deltaX, deltaY);
    }
    
    // 📝 left/right 锚点由 AnchorDragHandler.handleTextWidthDrag 专门处理
    // 这里不需要额外处理
    return null;
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

