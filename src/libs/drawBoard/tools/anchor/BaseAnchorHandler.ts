import type { DrawAction } from '../DrawTool';
import type { Point } from '../../core/CanvasEngine';
import type { AnchorPoint, AnchorType, Bounds, ShapeAnchorHandler } from './AnchorTypes';
import { AnchorUtils } from '../../utils/AnchorUtils';
import { ShapeUtils } from '../../utils/ShapeUtils';
import { logger } from '../../infrastructure/logging/Logger';

/**
 * 基础锚点处理器
 * 提供锚点处理器的通用功能，减少代码重复
 * 
 * 所有具体的锚点处理器应该继承此类，并实现抽象方法
 */
export abstract class BaseAnchorHandler implements ShapeAnchorHandler {
  /** 锚点大小 */
  protected readonly anchorSize: number = AnchorUtils.DEFAULT_ANCHOR_SIZE;
  
  /**
   * 抽象方法：生成锚点
   * 子类必须实现此方法
   */
  abstract generateAnchors(action: DrawAction, bounds: Bounds): AnchorPoint[];
  
  /**
   * 抽象方法：处理锚点拖拽
   * 子类必须实现此方法
   */
  abstract handleAnchorDrag(
    action: DrawAction,
    anchorType: AnchorType,
    startPoint: Point,
    currentPoint: Point,
    dragStartBounds: Bounds,
    dragStartAction?: DrawAction
  ): DrawAction | null;
  
  /**
   * 通用方法：移动图形
   * 所有子类都可以使用此方法
   * 
   * @param action 图形动作
   * @param deltaX X方向偏移
   * @param deltaY Y方向偏移
   * @param canvasBounds 画布边界（可选）
   * @returns 移动后的图形动作，如果 delta 无效则返回 null
   */
  public handleMove(
    action: DrawAction,
    deltaX: number,
    deltaY: number,
    canvasBounds?: { width: number; height: number }
  ): DrawAction | null {
    return ShapeUtils.moveShape(action, deltaX, deltaY, canvasBounds);
  }
  
  /**
   * 通用方法：计算中心点
   * 所有子类都可以使用此方法
   * 
   * @param action 图形动作
   * @returns 中心点坐标
   */
  public calculateCenterPoint(action: DrawAction): Point {
    return AnchorUtils.calculateCenterPoint(action.points);
  }
  
  /**
   * 通用方法：计算边界框
   * 所有子类都可以使用此方法
   * 
   * @param action 图形动作
   * @returns 边界框
   */
  protected calculateBounds(action: DrawAction): Bounds {
    return ShapeUtils.calculateBounds(action.points);
  }
  
  /**
   * 通用方法：验证并修正边界框
   * 所有子类都可以使用此方法
   * 
   * @param bounds 边界框
   * @param canvasBounds 画布边界（可选）
   * @returns 修正后的边界框
   */
  protected validateBounds(
    bounds: Bounds,
    canvasBounds?: { width: number; height: number }
  ): Bounds {
    return ShapeUtils.validateBounds(bounds, canvasBounds);
  }
  
  /**
   * 通用方法：检查点是否在锚点范围内
   * 所有子类都可以使用此方法
   * 
   * @param point 检查的点
   * @param anchor 锚点
   * @param tolerance 容差（可选）
   * @returns 是否在范围内
   */
  protected isPointInAnchor(
    point: Point,
    anchor: AnchorPoint,
    tolerance: number = AnchorUtils.DEFAULT_ANCHOR_TOLERANCE
  ): boolean {
    return AnchorUtils.isPointInAnchor(point, anchor, tolerance);
  }

  /**
   * 生成8个标准锚点（4个角点 + 4个边中点）
   * 子类可以调用此方法生成标准锚点
   * 
   * @param bounds 边界框
   * @param shapeType 图形类型
   * @returns 8个标准锚点数组
   */
  protected generateStandardAnchors(
    bounds: Bounds,
    shapeType: string
  ): AnchorPoint[] {
    const anchors: AnchorPoint[] = [];
    const halfSize = this.anchorSize / 2;
    const { x, y, width, height } = bounds;
    
    // 四个角点
    anchors.push(
      { x: x - halfSize, y: y - halfSize, type: 'top-left', cursor: 'nw-resize', shapeType },
      { x: x + width - halfSize, y: y - halfSize, type: 'top-right', cursor: 'ne-resize', shapeType },
      { x: x + width - halfSize, y: y + height - halfSize, type: 'bottom-right', cursor: 'se-resize', shapeType },
      { x: x - halfSize, y: y + height - halfSize, type: 'bottom-left', cursor: 'sw-resize', shapeType }
    );
    
    // 四个边中点
    anchors.push(
      { x: x + width / 2 - halfSize, y: y - halfSize, type: 'top', cursor: 'n-resize', shapeType },
      { x: x + width - halfSize, y: y + height / 2 - halfSize, type: 'right', cursor: 'e-resize', shapeType },
      { x: x + width / 2 - halfSize, y: y + height - halfSize, type: 'bottom', cursor: 's-resize', shapeType },
      { x: x - halfSize, y: y + height / 2 - halfSize, type: 'left', cursor: 'w-resize', shapeType }
    );
    
    return anchors;
  }

  /**
   * 生成中心点锚点
   * 
   * @param bounds 边界框
   * @param shapeType 图形类型
   * @returns 中心点锚点
   */
  protected generateCenterAnchor(
    bounds: Bounds,
    shapeType: string
  ): AnchorPoint {
    const halfSize = this.anchorSize / 2;
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    
    return {
      x: centerX - halfSize,
      y: centerY - halfSize,
      type: 'center',
      cursor: 'move',
      shapeType,
      isCenter: true
    };
  }

  /**
   * 通用缩放方法
   * 对所有点应用缩放变换
   * 
   * @param action 图形动作
   * @param scaleX X轴缩放比例
   * @param scaleY Y轴缩放比例
   * @param centerX 缩放中心X坐标
   * @param centerY 缩放中心Y坐标
   * @returns 缩放后的图形动作，如果缩放无效则返回 null
   */
  protected scaleAction(
    action: DrawAction,
    scaleX: number,
    scaleY: number,
    centerX: number,
    centerY: number
  ): DrawAction | null {
    if (!isFinite(scaleX) || !isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
      return null;
    }
    
    const newPoints: Point[] = [];
    for (const point of action.points) {
      const newX = centerX + (point.x - centerX) * scaleX;
      const newY = centerY + (point.y - centerY) * scaleY;
      
      if (!isFinite(newX) || !isFinite(newY)) {
        logger.warn(`${this.constructor.name}: 缩放后产生无效的点坐标`, { newX, newY, point, scaleX, scaleY });
        return null;
      }
      
      newPoints.push({ ...point, x: newX, y: newY });
    }
    
    return { ...action, points: newPoints };
  }

  /**
   * 计算边中点拖拽的缩放中心
   * 缩放中心是对边的中点，这样拖拽边中点时，对边保持不动
   * 
   * @param edgeType 边类型
   * @param bounds 边界框
   * @returns 缩放中心点
   */
  protected getEdgeDragScaleCenter(
    edgeType: 'top' | 'right' | 'bottom' | 'left',
    bounds: Bounds
  ): Point {
    switch (edgeType) {
      case 'top':
        // 拖拽上边：下边保持不动，缩放中心是下边中点
        return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height };
      case 'right':
        // 拖拽右边：左边保持不动，缩放中心是左边中点
        return { x: bounds.x, y: bounds.y + bounds.height / 2 };
      case 'bottom':
        // 拖拽下边：上边保持不动，缩放中心是上边中点
        return { x: bounds.x + bounds.width / 2, y: bounds.y };
      case 'left':
        // 拖拽左边：右边保持不动，缩放中心是右边中点
        return { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 };
    }
  }

  /**
   * 计算角点拖拽的缩放中心
   * 缩放中心是对角点（固定点），这样拖拽角点时，对角点保持不动
   * 
   * @param cornerType 角点类型
   * @param bounds 边界框
   * @returns 缩放中心点
   */
  protected getCornerDragScaleCenter(
    cornerType: 'top-left' | 'top-right' | 'bottom-right' | 'bottom-left',
    bounds: Bounds
  ): Point {
    switch (cornerType) {
      case 'top-left':
        // 拖拽左上角：右下角保持不动，缩放中心是右下角
        return { x: bounds.x + bounds.width, y: bounds.y + bounds.height };
      case 'top-right':
        // 拖拽右上角：左下角保持不动，缩放中心是左下角
        return { x: bounds.x, y: bounds.y + bounds.height };
      case 'bottom-right':
        // 拖拽右下角：左上角保持不动，缩放中心是左上角
        return { x: bounds.x, y: bounds.y };
      case 'bottom-left':
        // 拖拽左下角：右上角保持不动，缩放中心是右上角
        return { x: bounds.x + bounds.width, y: bounds.y };
    }
  }

  /**
   * 验证并处理边界框
   * 
   * @param bounds 边界框
   * @param minSize 最小尺寸
   * @returns 验证后的边界框，如果无效则返回 null
   */
  protected validateAndClampBounds(
    bounds: Bounds,
    minSize: number = 10
  ): Bounds | null {
    if (bounds.width < minSize || bounds.height < minSize) {
      return null;
    }
    
    if (!isFinite(bounds.x) || !isFinite(bounds.y) || 
        !isFinite(bounds.width) || !isFinite(bounds.height)) {
      return null;
    }
    
    return bounds;
  }

  /**
   * 计算新的边界框（根据锚点类型和鼠标移动）
   * 
   * @param bounds 原始边界框
   * @param anchorType 锚点类型
   * @param deltaX X方向移动距离
   * @param deltaY Y方向移动距离
   * @returns 新的边界框，如果无效则返回 null
   */
  protected calculateNewBounds(
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
    
    return this.validateAndClampBounds(newBounds);
  }
}

