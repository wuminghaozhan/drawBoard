import type { DrawAction } from '../DrawTool';
import type { Point } from '../../core/CanvasEngine';
import type { AnchorPoint, AnchorType, Bounds, ShapeAnchorHandler } from './AnchorTypes';
import { AnchorUtils } from '../../utils/AnchorUtils';
import { ShapeUtils } from '../../utils/ShapeUtils';

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
}

