/**
 * 拖拽状态管理器
 * 负责管理选择工具的拖拽状态和取消机制
 * 
 * 从 SelectTool 中提取，提高代码可维护性和可测试性
 */

import type { DrawAction } from '../DrawTool';
import type { Point } from '../../core/CanvasEngine';
import { logger } from '../../infrastructure/logging/Logger';

/**
 * 拖拽类型
 */
export type DragType = 'none' | 'anchor' | 'move' | 'center' | 'box-select';

/**
 * 拖拽状态数据结构
 */
export interface DragState {
  /** 拖拽类型 */
  type: DragType;
  /** 拖拽起始点 */
  startPoint: Point;
  /** 当前点 */
  currentPoint: Point;
  /** 起始边界框 */
  startBounds: { x: number; y: number; width: number; height: number } | null;
  /** 起始 action（用于恢复） */
  startAction: DrawAction | null;
  /** 起始选中的 actions（用于取消拖拽时恢复） */
  startSelectedActions: DrawAction[];
  /** 正在拖拽的锚点索引 */
  draggedAnchorIndex: number;
  /** 上次处理的点（用于缓存优化） */
  lastProcessedPoint: Point | null;
  /** 上次处理的结果（用于缓存优化） */
  lastResult: DrawAction | DrawAction[] | null;
}

/**
 * 拖拽配置
 */
export interface DragConfig {
  /** 最小拖拽距离（像素） */
  minDragDistance: number;
  /** 拖拽敏感度（0-1） */
  sensitivity: number;
  /** 是否启用圆形精确模式 */
  enableCirclePrecisionMode: boolean;
}

const DEFAULT_CONFIG: DragConfig = {
  minDragDistance: 3,
  sensitivity: 0.7,
  enableCirclePrecisionMode: true
};

/**
 * 拖拽状态管理器
 */
export class DragStateManager {
  private state: DragState | null = null;
  private config: DragConfig;

  constructor(config?: Partial<DragConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 更新配置
   */
  public updateConfig(config: Partial<DragConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取配置
   */
  public getConfig(): DragConfig {
    return { ...this.config };
  }

  /**
   * 开始拖拽
   */
  public startDrag(
    type: DragType,
    startPoint: Point,
    options: {
      bounds?: { x: number; y: number; width: number; height: number } | null;
      action?: DrawAction | null;
      selectedActions?: DrawAction[];
      anchorIndex?: number;
    } = {}
  ): void {
    this.state = {
      type,
      startPoint: { ...startPoint },
      currentPoint: { ...startPoint },
      startBounds: options.bounds ? { ...options.bounds } : null,
      startAction: options.action ? { ...options.action } : null,
      startSelectedActions: options.selectedActions 
        ? options.selectedActions.map(a => ({ ...a })) 
        : [],
      draggedAnchorIndex: options.anchorIndex ?? -1,
      lastProcessedPoint: null,
      lastResult: null
    };

    logger.debug('DragStateManager: 开始拖拽', {
      type,
      startPoint,
      anchorIndex: options.anchorIndex
    });
  }

  /**
   * 更新拖拽位置
   */
  public updateDrag(point: Point): void {
    if (!this.state) return;
    this.state.currentPoint = { ...point };
  }

  /**
   * 结束拖拽
   */
  public endDrag(): DragState | null {
    const finalState = this.state;
    this.state = null;

    if (finalState) {
      logger.debug('DragStateManager: 结束拖拽', {
        type: finalState.type,
        startPoint: finalState.startPoint,
        endPoint: finalState.currentPoint
      });
    }

    return finalState;
  }

  /**
   * 取消拖拽并恢复原始状态
   */
  public cancelDrag(): { 
    cancelled: boolean; 
    restoredActions: DrawAction[] 
  } {
    if (!this.state) {
      return { cancelled: false, restoredActions: [] };
    }

    const restoredActions = this.state.startSelectedActions.map(a => ({ ...a }));
    
    logger.debug('DragStateManager: 取消拖拽，恢复原始状态', {
      restoredActionsCount: restoredActions.length
    });

    this.state = null;

    return { cancelled: true, restoredActions };
  }

  /**
   * 检查是否正在拖拽
   */
  public isDragging(): boolean {
    return this.state !== null && this.state.type !== 'none';
  }

  /**
   * 检查是否正在拖拽特定类型
   */
  public isDraggingType(type: DragType): boolean {
    return this.state !== null && this.state.type === type;
  }

  /**
   * 获取当前拖拽状态
   */
  public getState(): DragState | null {
    return this.state;
  }

  /**
   * 获取拖拽起始点
   */
  public getStartPoint(): Point | null {
    return this.state?.startPoint ?? null;
  }

  /**
   * 获取当前拖拽点
   */
  public getCurrentPoint(): Point | null {
    return this.state?.currentPoint ?? null;
  }

  /**
   * 获取起始边界框
   */
  public getStartBounds(): { x: number; y: number; width: number; height: number } | null {
    return this.state?.startBounds ?? null;
  }

  /**
   * 获取起始 action
   */
  public getStartAction(): DrawAction | null {
    return this.state?.startAction ?? null;
  }

  /**
   * 获取正在拖拽的锚点索引
   */
  public getDraggedAnchorIndex(): number {
    return this.state?.draggedAnchorIndex ?? -1;
  }

  /**
   * 计算拖拽距离
   */
  public getDragDistance(): number {
    if (!this.state) return 0;

    const dx = this.state.currentPoint.x - this.state.startPoint.x;
    const dy = this.state.currentPoint.y - this.state.startPoint.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * 计算拖拽偏移
   */
  public getDragDelta(): { x: number; y: number } {
    if (!this.state) return { x: 0, y: 0 };

    return {
      x: this.state.currentPoint.x - this.state.startPoint.x,
      y: this.state.currentPoint.y - this.state.startPoint.y
    };
  }

  /**
   * 检查拖拽距离是否超过最小阈值
   */
  public isAboveMinDistance(): boolean {
    return this.getDragDistance() >= this.config.minDragDistance;
  }

  /**
   * 应用敏感度到偏移量
   */
  public applySmoothing(actionType?: string): { x: number; y: number } {
    const delta = this.getDragDelta();

    // 圆形精确模式：不应用敏感度
    if (this.config.enableCirclePrecisionMode && actionType === 'circle') {
      return delta;
    }

    return {
      x: delta.x * this.config.sensitivity,
      y: delta.y * this.config.sensitivity
    };
  }

  /**
   * 设置上次处理结果（用于缓存优化）
   */
  public setLastResult(point: Point, result: DrawAction | DrawAction[] | null): void {
    if (!this.state) return;
    this.state.lastProcessedPoint = { ...point };
    this.state.lastResult = result;
  }

  /**
   * 检查是否可以使用缓存结果
   */
  public canUseCachedResult(point: Point, threshold: number = 1): boolean {
    if (!this.state || !this.state.lastProcessedPoint || !this.state.lastResult) {
      return false;
    }

    const dx = point.x - this.state.lastProcessedPoint.x;
    const dy = point.y - this.state.lastProcessedPoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    return distance < threshold;
  }

  /**
   * 获取缓存的结果
   */
  public getCachedResult(): DrawAction | DrawAction[] | null {
    return this.state?.lastResult ?? null;
  }
}

