import type { DrawAction } from '../../tools/DrawTool';
import { LRUCache, type LRUCacheConfig, type LRUCacheStats } from './LRUCache';
import { logger } from '../../infrastructure/logging/Logger';

/**
 * 复杂度计算配置
 */
export interface ComplexityConfig {
  /** 每个点的复杂度权重 */
  pointWeight: number;
  /** 基础复杂度（所有图形的最低复杂度） */
  baseComplexity: number;
  /** 各类型图形的复杂度乘数 */
  typeMultipliers: Record<string, number>;
  /** 最大复杂度限制 */
  maxComplexity: number;
}

/**
 * 复杂度感知缓存配置
 */
export interface ComplexityAwareCacheConfig extends Partial<LRUCacheConfig> {
  /** 复杂度计算配置 */
  complexityConfig?: Partial<ComplexityConfig>;
  /** 缓存阈值：复杂度超过此值才缓存 */
  cacheThreshold: number;
  /** 是否自动计算内存大小 */
  autoCalculateMemory: boolean;
}

/**
 * 缓存的 Canvas 条目
 */
interface CachedCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  action: DrawAction;
  complexity: number;
}

/**
 * 复杂度感知缓存
 * 
 * 专门用于 DrawAction 的智能缓存，自动计算复杂度并决定是否缓存。
 * 
 * 核心功能：
 * - 自动计算 DrawAction 的复杂度
 * - 只缓存高复杂度的动作（低复杂度动作直接绘制更快）
 * - 智能内存管理
 * - Canvas 离屏缓存池
 * 
 * @example
 * ```typescript
 * const cache = new ComplexityAwareCache(canvasWidth, canvasHeight);
 * 
 * // 检查是否应该缓存
 * if (cache.shouldCache(action)) {
 *   // 获取或创建缓存
 *   const cachedCanvas = cache.getOrCreate(action, drawFn);
 *   // 使用缓存绘制
 *   ctx.drawImage(cachedCanvas, 0, 0);
 * } else {
 *   // 低复杂度，直接绘制
 *   drawFn(ctx, action);
 * }
 * ```
 */
export class ComplexityAwareCache {
  /** 内部 LRU 缓存 */
  private lruCache: LRUCache<CachedCanvas>;
  /** 画布宽度 */
  private canvasWidth: number;
  /** 画布高度 */
  private canvasHeight: number;
  /** 配置 */
  private config: ComplexityAwareCacheConfig;
  /** 复杂度配置 */
  private complexityConfig: ComplexityConfig;
  /** Canvas 对象池 */
  private canvasPool: HTMLCanvasElement[] = [];
  /** 对象池最大大小 */
  private readonly POOL_MAX_SIZE = 10;

  /** 默认复杂度配置 */
  private static readonly DEFAULT_COMPLEXITY_CONFIG: ComplexityConfig = {
    pointWeight: 0.1,
    baseComplexity: 1,
    typeMultipliers: {
      pen: 1.0,
      brush: 1.2,
      rect: 0.5,
      circle: 0.5,
      line: 0.3,
      polygon: 0.8,
      text: 0.4,
      eraser: 0.8,
      select: 0.1,
      transform: 0.1
    },
    maxComplexity: 1000
  };

  /** 默认配置 */
  private static readonly DEFAULT_CONFIG: ComplexityAwareCacheConfig = {
    maxEntries: 50,
    maxMemoryBytes: 30 * 1024 * 1024, // 30MB
    complexityWeight: 0.4,
    accessWeight: 0.4,
    ttlMs: 300000, // 5分钟
    cleanupIntervalMs: 60000, // 1分钟
    cacheThreshold: 10, // 复杂度 > 10 才缓存
    autoCalculateMemory: true
  };

  constructor(
    canvasWidth: number,
    canvasHeight: number,
    config?: Partial<ComplexityAwareCacheConfig>
  ) {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.config = { ...ComplexityAwareCache.DEFAULT_CONFIG, ...config };
    this.complexityConfig = {
      ...ComplexityAwareCache.DEFAULT_COMPLEXITY_CONFIG,
      ...config?.complexityConfig
    };

    // 创建 LRU 缓存
    this.lruCache = new LRUCache<CachedCanvas>({
      maxEntries: this.config.maxEntries,
      maxMemoryBytes: this.config.maxMemoryBytes,
      complexityWeight: this.config.complexityWeight,
      accessWeight: this.config.accessWeight,
      ttlMs: this.config.ttlMs,
      cleanupIntervalMs: this.config.cleanupIntervalMs
    });
  }

  /**
   * 计算 DrawAction 的复杂度
   */
  calculateComplexity(action: DrawAction): number {
    const { pointWeight, baseComplexity, typeMultipliers, maxComplexity } = this.complexityConfig;

    // 获取类型乘数
    const typeMultiplier = typeMultipliers[action.type] ?? 1;

    // 基于点数计算复杂度
    const pointComplexity = (action.points?.length ?? 0) * pointWeight;

    // 基于线宽计算复杂度（更粗的线需要更多渲染）
    const lineWidthFactor = action.context?.lineWidth ? Math.log2(action.context.lineWidth + 1) : 1;

    // 综合复杂度
    const complexity = (baseComplexity + pointComplexity) * typeMultiplier * lineWidthFactor;

    // 限制最大值
    return Math.min(complexity, maxComplexity);
  }

  /**
   * 判断是否应该缓存该动作
   */
  shouldCache(action: DrawAction): boolean {
    const complexity = this.calculateComplexity(action);
    return complexity >= this.config.cacheThreshold;
  }

  /**
   * 获取缓存（如果存在且有效）
   */
  get(actionId: string): CachedCanvas | undefined {
    return this.lruCache.get(actionId);
  }

  /**
   * 获取或创建缓存
   * @param action DrawAction
   * @param drawFn 绘制函数
   * @returns 缓存的 Canvas
   */
  async getOrCreate(
    action: DrawAction,
    drawFn: (ctx: CanvasRenderingContext2D, action: DrawAction) => Promise<void>
  ): Promise<HTMLCanvasElement> {
    const cached = this.lruCache.get(action.id);
    
    if (cached) {
      return cached.canvas;
    }

    // 创建新缓存
    const canvas = this.acquireCanvas();
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('无法创建 Canvas 上下文');
    }

    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 绘制动作
    await drawFn(ctx, action);

    // 计算复杂度和内存
    const complexity = this.calculateComplexity(action);
    const memorySize = this.config.autoCalculateMemory
      ? this.calculateCanvasMemory(canvas)
      : 0;

    // 存入缓存
    const entry: CachedCanvas = {
      canvas,
      ctx,
      action,
      complexity
    };

    this.lruCache.set(action.id, entry, { complexity, memorySize });

    logger.debug('创建动作缓存', {
      actionId: action.id,
      type: action.type,
      complexity,
      memorySize: `${(memorySize / 1024).toFixed(2)}KB`
    });

    return canvas;
  }

  /**
   * 使缓存失效
   */
  invalidate(actionId: string): boolean {
    const cached = this.lruCache.get(actionId);
    if (cached) {
      // 归还 Canvas 到对象池
      this.releaseCanvas(cached.canvas);
    }
    return this.lruCache.delete(actionId);
  }

  /**
   * 批量使缓存失效
   */
  invalidateMany(actionIds: string[]): number {
    let count = 0;
    for (const id of actionIds) {
      if (this.invalidate(id)) {
        count++;
      }
    }
    return count;
  }

  /**
   * 使所有缓存失效
   */
  invalidateAll(): void {
    // 归还所有 Canvas 到对象池
    for (const key of this.lruCache.keys()) {
      const cached = this.lruCache.get(key);
      if (cached) {
        this.releaseCanvas(cached.canvas);
      }
    }
    this.lruCache.clear();
  }

  /**
   * 检查缓存是否存在
   */
  has(actionId: string): boolean {
    return this.lruCache.has(actionId);
  }

  /**
   * 更新画布尺寸
   */
  updateCanvasSize(width: number, height: number): void {
    if (width === this.canvasWidth && height === this.canvasHeight) {
      return;
    }

    this.canvasWidth = width;
    this.canvasHeight = height;

    // 尺寸变化，所有缓存失效
    this.invalidateAll();
    
    // 清空对象池
    this.clearPool();

    logger.debug('画布尺寸更新，缓存已清空', { width, height });
  }

  /**
   * 获取统计信息
   */
  getStats(): LRUCacheStats & { poolSize: number } {
    return {
      ...this.lruCache.getStats(),
      poolSize: this.canvasPool.length
    };
  }

  /**
   * 手动触发清理
   */
  cleanup(): number {
    return this.lruCache.cleanup();
  }

  /**
   * 销毁缓存
   */
  destroy(): void {
    this.invalidateAll();
    this.clearPool();
    this.lruCache.destroy();
  }

  // ============================================
  // Canvas 对象池
  // ============================================

  /**
   * 从对象池获取 Canvas
   */
  private acquireCanvas(): HTMLCanvasElement {
    let canvas = this.canvasPool.pop();

    if (!canvas) {
      canvas = document.createElement('canvas');
    }

    canvas.width = this.canvasWidth;
    canvas.height = this.canvasHeight;

    return canvas;
  }

  /**
   * 归还 Canvas 到对象池
   */
  private releaseCanvas(canvas: HTMLCanvasElement): void {
    if (this.canvasPool.length < this.POOL_MAX_SIZE) {
      // 清空内容
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      this.canvasPool.push(canvas);
    } else {
      // 对象池已满，释放 Canvas
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  /**
   * 清空对象池
   */
  private clearPool(): void {
    for (const canvas of this.canvasPool) {
      canvas.width = 0;
      canvas.height = 0;
    }
    this.canvasPool = [];
  }

  /**
   * 计算 Canvas 内存大小
   */
  private calculateCanvasMemory(canvas: HTMLCanvasElement): number {
    // RGBA 4 字节/像素
    return canvas.width * canvas.height * 4;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ComplexityAwareCacheConfig>): void {
    this.config = { ...this.config, ...config };

    if (config.complexityConfig) {
      this.complexityConfig = { ...this.complexityConfig, ...config.complexityConfig };
    }

    // 更新 LRU 缓存配置
    this.lruCache.updateConfig({
      maxEntries: this.config.maxEntries,
      maxMemoryBytes: this.config.maxMemoryBytes,
      complexityWeight: this.config.complexityWeight,
      accessWeight: this.config.accessWeight,
      ttlMs: this.config.ttlMs,
      cleanupIntervalMs: this.config.cleanupIntervalMs
    });
  }

  /**
   * 获取配置
   */
  getConfig(): ComplexityAwareCacheConfig {
    return { ...this.config };
  }

  /**
   * 预热缓存（后台预渲染高复杂度动作）
   */
  async prewarm(
    actions: DrawAction[],
    drawFn: (ctx: CanvasRenderingContext2D, action: DrawAction) => Promise<void>,
    options: {
      maxCount?: number;
      idleCallback?: boolean;
    } = {}
  ): Promise<number> {
    const { maxCount = 10, idleCallback = true } = options;

    // 筛选高复杂度动作
    const highComplexityActions = actions
      .filter(action => this.shouldCache(action) && !this.has(action.id))
      .sort((a, b) => this.calculateComplexity(b) - this.calculateComplexity(a))
      .slice(0, maxCount);

    if (highComplexityActions.length === 0) {
      return 0;
    }

    let prewarmed = 0;

    if (idleCallback && typeof requestIdleCallback !== 'undefined') {
      // 使用 requestIdleCallback 后台预渲染
      await new Promise<void>(resolve => {
        const processAction = async (deadline: IdleDeadline, index: number) => {
          while (index < highComplexityActions.length && deadline.timeRemaining() > 5) {
            await this.getOrCreate(highComplexityActions[index], drawFn);
            prewarmed++;
            index++;
          }

          if (index < highComplexityActions.length) {
            requestIdleCallback(newDeadline => processAction(newDeadline, index));
          } else {
            resolve();
          }
        };

        requestIdleCallback(deadline => processAction(deadline, 0));
      });
    } else {
      // 直接预渲染
      for (const action of highComplexityActions) {
        await this.getOrCreate(action, drawFn);
        prewarmed++;
      }
    }

    logger.debug('缓存预热完成', {
      prewarmed,
      total: highComplexityActions.length
    });

    return prewarmed;
  }
}

