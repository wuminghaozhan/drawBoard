/**
 * SelectTool 鼠标事件处理器
 * 
 * 职责：
 * - 处理 mouseDown/mouseMove/mouseUp 事件的核心逻辑
 * - 确定操作类型（选择/变换/移动/框选/缩放）
 * - 管理拖拽状态
 */
import type { Point } from '../../core/CanvasEngine';
import type { DrawAction } from '../DrawTool';
import type { AnchorPoint, Bounds } from '../anchor/AnchorTypes';
import { logger } from '../../infrastructure/logging/Logger';

/** 拖拽操作类型 */
export type DragOperationType = 'select' | 'transform' | 'move' | 'box-select' | 'resize' | null;

/** 拖拽状态 */
export interface DragState {
  /** 是否正在拖拽锚点 */
  isDraggingResizeAnchor: boolean;
  /** 是否正在拖拽移动 */
  isDraggingMove: boolean;
  /** 是否正在拖拽中心点 */
  isDraggingCenter: boolean;
  /** 拖拽的锚点索引 */
  draggedAnchorIndex: number;
  /** 拖拽起始点 */
  dragStartPoint: Point | null;
  /** 拖拽起始边界 */
  dragStartBounds: Bounds | null;
  /** 拖拽起始 Action */
  dragStartAction: DrawAction | null;
}

/** 拖拽开始状态（用于取消操作恢复） */
export interface DragStartState {
  actions: DrawAction[];
  bounds: Bounds | null;
}

/** 事件处理上下文 */
export interface MouseEventContext {
  /** 所有 Actions */
  allActions: DrawAction[];
  /** 选中的 Actions */
  selectedActions: DrawAction[];
  /** 锚点列表 */
  anchorPoints: AnchorPoint[];
  /** 中心锚点 */
  centerAnchorPoint: AnchorPoint | null;
  /** 移动区域 */
  moveArea: Bounds | null;
  /** 是否处于变换模式 */
  isTransformMode: boolean;
  /** 选中图层的 zIndex */
  selectedLayerZIndex: number | null;
  /** 锚点容差 */
  anchorTolerance: number;
}

/** 锚点查询结果 */
export interface AnchorQueryResult {
  index: number;
  anchor: AnchorPoint;
  isCenter: boolean;
}

/**
 * 判断点是否在锚点附近
 */
export function getAnchorPointAt(
  point: Point,
  anchorPoints: AnchorPoint[],
  centerAnchorPoint: AnchorPoint | null,
  tolerance: number
): AnchorQueryResult | null {
  // 先检查边锚点（优先级更高）
  for (let i = 0; i < anchorPoints.length; i++) {
    const anchor = anchorPoints[i];
    const dx = point.x - anchor.x;
    const dy = point.y - anchor.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance <= tolerance) {
      return { index: i, anchor, isCenter: false };
    }
  }
  
  // 再检查中心锚点
  if (centerAnchorPoint) {
    const dx = point.x - centerAnchorPoint.x;
    const dy = point.y - centerAnchorPoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance <= tolerance) {
      return { index: -1, anchor: centerAnchorPoint, isCenter: true };
    }
  }
  
  return null;
}

/**
 * 判断点是否在移动区域内
 */
export function isPointInMoveArea(point: Point, moveArea: Bounds | null): boolean {
  if (!moveArea) return false;
  
  return (
    point.x >= moveArea.x &&
    point.x <= moveArea.x + moveArea.width &&
    point.y >= moveArea.y &&
    point.y <= moveArea.y + moveArea.height
  );
}

/**
 * 确定 mouseDown 操作类型
 */
export function determineMouseDownOperation(
  point: Point,
  context: MouseEventContext,
  selectActionAtPoint: (point: Point, tolerance: number) => DrawAction | null
): {
  operation: DragOperationType;
  dragState: Partial<DragState>;
  clickedAction?: DrawAction;
} {
  // 如果有选中的 actions，检查交互区域
  if (context.selectedActions.length > 0) {
    // 1. 优先检查是否点击了边锚点
    const anchorInfo = getAnchorPointAt(
      point,
      context.anchorPoints,
      context.centerAnchorPoint,
      context.anchorTolerance
    );
    
    if (anchorInfo && !anchorInfo.isCenter) {
      // 边锚点：缩放/变形
      return {
        operation: 'resize',
        dragState: {
          isDraggingResizeAnchor: true,
          isDraggingMove: false,
          isDraggingCenter: false,
          draggedAnchorIndex: anchorInfo.index,
          dragStartPoint: point,
          dragStartBounds: null,
          dragStartAction: context.selectedActions.length === 1 
            ? { ...context.selectedActions[0] } 
            : null
        }
      };
    }
    
    // 2. 检查是否点击了中心点
    if (anchorInfo && anchorInfo.isCenter) {
      return {
        operation: 'move',
        dragState: {
          isDraggingResizeAnchor: false,
          isDraggingMove: false,
          isDraggingCenter: true,
          draggedAnchorIndex: -1,
          dragStartPoint: point,
          dragStartBounds: null
        }
      };
    }
    
    // 3. 检查是否点击了移动区域
    if (isPointInMoveArea(point, context.moveArea)) {
      return {
        operation: 'move',
        dragState: {
          isDraggingResizeAnchor: false,
          isDraggingMove: true,
          isDraggingCenter: false,
          draggedAnchorIndex: -1,
          dragStartPoint: point,
          dragStartBounds: null
        }
      };
    }
  }
  
  // 普通选择模式
  const clickedAction = selectActionAtPoint(point, context.anchorTolerance);
  
  if (clickedAction) {
    return {
      operation: 'transform',
      dragState: {},
      clickedAction
    };
  }
  
  // 开始框选
  return {
    operation: 'box-select',
    dragState: {}
  };
}

/**
 * 创建初始拖拽状态
 */
export function createInitialDragState(): DragState {
  return {
    isDraggingResizeAnchor: false,
    isDraggingMove: false,
    isDraggingCenter: false,
    draggedAnchorIndex: -1,
    dragStartPoint: null,
    dragStartBounds: null,
    dragStartAction: null
  };
}

/**
 * 重置拖拽状态
 */
export function resetDragState(state: DragState): void {
  state.isDraggingResizeAnchor = false;
  state.isDraggingMove = false;
  state.isDraggingCenter = false;
  state.draggedAnchorIndex = -1;
  state.dragStartPoint = null;
  state.dragStartBounds = null;
  state.dragStartAction = null;
}

