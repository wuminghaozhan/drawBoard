import type { Point } from '../../core/CanvasEngine';
import type { DrawAction } from '../DrawTool';

/**
 * 锚点类型 - 统一定义
 * 
 * 包含两种命名风格：
 * 1. 位置描述型：'top-left', 'bottom-right' 等 - 用于形状特定锚点
 * 2. 功能描述型：'resize-nw', 'resize-se' 等 - 用于通用缩放锚点
 */
export type AnchorType = 
  // ===== 位置描述型锚点（形状特定） =====
  | 'center'           // 中心点（用于移动）
  | 'top-left'         // 左上角
  | 'top-right'        // 右上角
  | 'bottom-right'     // 右下角
  | 'bottom-left'      // 左下角
  | 'top'              // 上边中点
  | 'right'            // 右边中点
  | 'bottom'           // 下边中点
  | 'left'             // 左边中点
  | 'start'            // 起点（用于直线）
  | 'end'              // 终点（用于直线）
  | 'vertex'           // 顶点（用于多边形）
  | 'key-point'        // 关键点（用于路径）
  // ===== 功能描述型锚点（通用缩放） =====
  | 'resize-nw'        // 左上角缩放
  | 'resize-n'         // 上边缩放
  | 'resize-ne'        // 右上角缩放
  | 'resize-w'         // 左边缩放
  | 'resize-e'         // 右边缩放
  | 'resize-sw'        // 左下角缩放
  | 'resize-s'         // 下边缩放
  | 'resize-se'        // 右下角缩放
  | 'rotate'           // 旋转锚点
  | 'move'             // 移动锚点
  | 'custom';          // 自定义锚点

/**
 * 锚点接口 - 统一定义
 */
export interface AnchorPoint {
  /** 锚点X坐标 */
  x: number;
  /** 锚点Y坐标 */
  y: number;
  /** 锚点类型 */
  type: AnchorType;
  /** CSS光标样式 */
  cursor: string;
  /** 图形类型（可选，用于形状特定锚点） */
  shapeType?: string;
  /** 是否为中心点 */
  isCenter?: boolean;
  /** 关联的动作 ID（可选，用于多选场景） */
  actionId?: string;
  /** 原始边界框（可选，用于拖拽时参考） */
  originalBounds?: Bounds;
}

/**
 * 边界框接口
 */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 图形锚点处理器接口
 * 每种图形类型实现此接口，提供专门的锚点生成和拖拽处理
 */
export interface ShapeAnchorHandler {
  /**
   * 生成锚点
   * @param action 图形action
   * @param bounds 图形边界框
   * @returns 锚点数组
   */
  generateAnchors(action: DrawAction, bounds: Bounds): AnchorPoint[];
  
  /**
   * 处理锚点拖拽
   * @param action 图形action
   * @param anchorType 锚点类型
   * @param startPoint 拖拽开始点
   * @param currentPoint 当前鼠标位置
   * @param dragStartBounds 拖拽开始时的边界框
   * @param dragStartAction 拖拽开始时的action（用于圆形等需要保持原始状态的图形）
   * @returns 更新后的action，如果返回null表示操作无效
   */
  handleAnchorDrag(
    action: DrawAction,
    anchorType: AnchorType,
    startPoint: Point,
    currentPoint: Point,
    dragStartBounds: Bounds,
    dragStartAction?: DrawAction
  ): DrawAction | null;
  
  /**
   * 处理移动操作
   * @param action 图形action
   * @param deltaX X方向移动距离
   * @param deltaY Y方向移动距离
   * @param canvasBounds 画布边界
   * @returns 更新后的action
   */
  handleMove(
    action: DrawAction,
    deltaX: number,
    deltaY: number,
    canvasBounds?: { width: number; height: number }
  ): DrawAction | null;
  
  /**
   * 计算图形中心点
   * @param action 图形action
   * @param bounds 图形边界框（可选，用于优化性能）
   * @returns 中心点坐标
   */
  calculateCenterPoint(action: DrawAction, bounds?: Bounds): Point;
}

