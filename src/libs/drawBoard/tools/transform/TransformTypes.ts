import type { Point } from '../../core/CanvasEngine';
import type { DrawAction } from '../DrawTool';

/**
 * 控制点类型枚举
 */
export const ControlPointType = {
  CORNER_TOP_LEFT: 'CORNER_TOP_LEFT',
  CORNER_TOP_RIGHT: 'CORNER_TOP_RIGHT', 
  CORNER_BOTTOM_LEFT: 'CORNER_BOTTOM_LEFT',
  CORNER_BOTTOM_RIGHT: 'CORNER_BOTTOM_RIGHT',
  EDGE_TOP: 'EDGE_TOP',
  EDGE_RIGHT: 'EDGE_RIGHT', 
  EDGE_BOTTOM: 'EDGE_BOTTOM',
  EDGE_LEFT: 'EDGE_LEFT',
  LINE_START: 'LINE_START',
  LINE_END: 'LINE_END',
  LINE_POINT: 'LINE_POINT',
  MOVE: 'MOVE'
} as const;

export type ControlPointType = typeof ControlPointType[keyof typeof ControlPointType];

/**
 * 控制点接口
 */
export interface ControlPoint {
  id: string;
  type: ControlPointType;
  x: number;
  y: number;
  size: number;
  visible: boolean;
  cursor: string;
  pointIndex?: number; // 用于线条的点索引
}

/**
 * 变换操作接口
 */
export interface TransformOperation {
  type: 'move' | 'resize' | 'reshape';
  actionId: string;
  startPoints: Point[];
  currentPoints: Point[];
  controlPoint: ControlPoint;
  startBounds: ShapeBounds;
}

/**
 * 图形边界框接口
 */
export interface ShapeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

/**
 * 变换配置接口
 */
export interface TransformConfig {
  /** 控制点大小 */
  controlPointSize: number;
  /** 控制点颜色 */
  controlPointColor: string;
  /** 控制点边框颜色 */
  controlPointBorderColor: string;
  /** 悬停时的控制点颜色 */
  controlPointHoverColor: string;
  /** 选择框颜色 */
  selectionBoxColor: string;
  /** 选择框线宽 */
  selectionBoxLineWidth: number;
  /** 键盘移动步长 */
  keyboardMoveStep: number;
  /** 是否显示边界框 */
  showBoundingBox: boolean;
  /** 是否启用键盘控制 */
  enableKeyboardControl: boolean;
}

/**
 * 变换操作
 */
export interface TransformOperation {
  /** 操作类型 */
  type: 'move' | 'resize' | 'reshape';
  /** 图形ID */
  actionId: string;
  /** 初始点位置 */
  startPoints: Point[];
  /** 控制点 */
  controlPoint: ControlPoint;
  /** 初始边界 */
  startBounds: ShapeBounds;
  /** 开始位置 */
  startPoint: Point;
  /** 当前位置 */
  currentPoint: Point;
}

/**
 * 边界框类型别名（用于兼容）
 */
export type BoundingBox = ShapeBounds;

/**
 * 控制点配置常量
 */
export const CONTROL_POINT_CONFIG = {
  SIZE: 8,
  BACKGROUND_COLOR: '#FFFFFF',
  BORDER_COLOR: '#007AFF',
  HOVER_COLOR: '#FF6B35',
  HIGHLIGHT_COLOR: '#007AFF'
};

/**
 * 默认变换配置
 */
export const DEFAULT_TRANSFORM_CONFIG: TransformConfig = {
  controlPointSize: 8,
  controlPointColor: '#007AFF',
  controlPointBorderColor: '#FFFFFF',
  controlPointHoverColor: '#FF6B35',
  selectionBoxColor: '#007AFF',
  selectionBoxLineWidth: 1,
  keyboardMoveStep: 1,
  showBoundingBox: true,
  enableKeyboardControl: true
}; 