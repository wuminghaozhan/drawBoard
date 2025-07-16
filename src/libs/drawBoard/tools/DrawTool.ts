import type { Point } from '../core/CanvasEngine';

import type { SelectionBox } from '../core/SelectionManager';

/**
 * 性能模式枚举
 * 
 * 定义了画板的性能优化策略：
 * - AUTO: 自动模式，根据设备性能和内存使用情况自动选择
 * - HIGH_PERFORMANCE: 高性能模式，优先使用预渲染缓存
 * - LOW_MEMORY: 低内存模式，优先节省内存，使用实时绘制
 * - BALANCED: 平衡模式，智能混合使用两种策略
 */
export const PerformanceMode = {
  AUTO: 'auto',
  HIGH_PERFORMANCE: 'high_performance', 
  LOW_MEMORY: 'low_memory',
  BALANCED: 'balanced'
} as const;

export type PerformanceMode = typeof PerformanceMode[keyof typeof PerformanceMode];

/**
 * 预渲染缓存数据接口
 * 
 * 存储已预渲染的图像数据，用于快速重绘
 */
export interface PreRenderedCache {
  /** 缓存的ImageData，包含完整的绘制结果 */
  imageData: ImageData;
  /** 缓存创建时间戳，用于LRU清理 */
  createdAt: number;
  /** 最后使用时间，用于LRU清理 */
  lastUsed: number;
  /** 缓存的内存大小估算（字节） */
  memorySize: number;
  /** 缓存的边界框，用于精确绘制定位 */
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * 绘制动作接口
 * 
 * 定义了一个完整的绘制操作的数据结构，支持预渲染缓存优化
 */
export interface DrawAction {
  id: string;
  type: string;
  points: Point[];
  context: {
    strokeStyle: string;
    lineWidth: number;
    fillStyle: string;
  };
  timestamp: number;
  
  // 特殊工具字段
  text?: string; // 文字工具专用
  selected?: boolean; // 选择工具专用
  selectedActions?: string[]; // 选择工具专用
  selectionBox?: SelectionBox; // 选择工具专用
  
  // 性能优化字段
  /** 预渲染缓存数据，如果存在则可以直接使用，否则需要实时绘制 */
  preRenderedCache?: PreRenderedCache;
  /** 是否支持预渲染缓存（简单图形通常不需要缓存） */
  supportsCaching?: boolean;
  /** 绘制复杂度评分，用于决定是否启用缓存 */
  complexityScore?: number;
  /** 是否强制使用实时绘制（用于调试或特殊需求） */
  forceRealTimeRender?: boolean;
}

export abstract class DrawTool {
  public name: string;
  public type: string;

  constructor(name: string, type: string) {
    this.name = name;
    this.type = type;
  }

  abstract draw(ctx: CanvasRenderingContext2D, action: DrawAction): void;
  abstract getActionType(): string;

  public getName(): string {
    return this.name;
  }

  public getType(): string {
    return this.type;
  }

  // 提取公共的上下文管理方法
  protected saveContext(ctx: CanvasRenderingContext2D) {
    return {
      strokeStyle: ctx.strokeStyle,
      lineWidth: ctx.lineWidth,
      fillStyle: ctx.fillStyle,
      globalCompositeOperation: ctx.globalCompositeOperation
    };
  }

  protected restoreContext(ctx: CanvasRenderingContext2D, saved: ReturnType<typeof this.saveContext>): void {
    ctx.strokeStyle = saved.strokeStyle;
    ctx.lineWidth = saved.lineWidth;
    ctx.fillStyle = saved.fillStyle;
    ctx.globalCompositeOperation = saved.globalCompositeOperation;
  }

  protected setContext(ctx: CanvasRenderingContext2D, context: DrawAction['context']): void {
    ctx.strokeStyle = context.strokeStyle;
    ctx.lineWidth = context.lineWidth;
    ctx.fillStyle = context.fillStyle;
  }
} 