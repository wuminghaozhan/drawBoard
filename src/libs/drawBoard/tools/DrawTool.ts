import type { Point } from '../core/CanvasEngine';

/**
 * 绘制上下文接口
 * 定义了绘制时的基本属性
 */
export interface DrawContext {
  strokeStyle: string;
  lineWidth: number;
  fillStyle: string;
}

/**
 * 工具类型枚举
 * 定义了所有可用的绘制工具类型
 */
export const ToolType = {
  PEN: 'pen',
  BRUSH: 'brush',
  RECT: 'rect',
  CIRCLE: 'circle',
  LINE: 'line',
  POLYGON: 'polygon',
  TEXT: 'text',
  ERASER: 'eraser',
  SELECT: 'select',
  TRANSFORM: 'transform'
} as const;

export type ToolType = typeof ToolType[keyof typeof ToolType];

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
 * 定义了每个绘制操作的基本信息
 */
export interface DrawAction {
  /** 动作唯一标识 */
  id: string;
  /** 工具类型 */
  type: ToolType;
  /** 绘制点数组 */
  points: Point[];
  /** 绘制上下文（颜色、线宽等） */
  context: DrawContext;
  /** 时间戳 */
  timestamp: number;
  /** 复杂度评分（用于性能优化） */
  complexityScore?: number;
  /** 是否支持缓存 */
  supportsCaching?: boolean;
  /** 特殊属性（如文本内容） */
  text?: string;
  /** 是否被选中 */
  selected?: boolean;
  
  // ============================================
  // 虚拟图层属性
  // ============================================
  /** 虚拟图层ID */
  virtualLayerId?: string;
  /** 虚拟图层名称 */
  layerName?: string;
  /** 虚拟图层可见性 */
  layerVisible?: boolean;
  /** 虚拟图层透明度 (0-1) */
  layerOpacity?: number;
  /** 虚拟图层锁定状态 */
  layerLocked?: boolean;
  /** 虚拟图层创建时间 */
  layerCreated?: number;
  /** 虚拟图层修改时间 */
  layerModified?: number;
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