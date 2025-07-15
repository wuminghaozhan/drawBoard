import type { DrawAction, PreRenderedCache } from '../tools/DrawTool';
import { PerformanceMode } from '../tools/DrawTool';

/**
 * 性能配置接口
 */
export interface PerformanceConfig {
  /** 性能模式 */
  mode: PerformanceMode;
  /** 最大缓存内存限制（MB） */
  maxCacheMemoryMB: number;
  /** 最大缓存条目数 */
  maxCacheItems: number;
  /** 复杂度阈值，超过此值才启用缓存 */
  complexityThreshold: number;
  /** 是否启用内存监控 */
  enableMemoryMonitoring: boolean;
  /** 内存使用率超过此值时自动降级 */
  memoryPressureThreshold: number;
}

/**
 * 内存统计信息
 */
export interface MemoryStats {
  /** 当前缓存使用的内存（MB） */
  currentCacheMemoryMB: number;
  /** 当前缓存项目数量 */
  currentCacheItems: number;
  /** 缓存命中率 */
  cacheHitRate: number;
  /** 总内存使用估算（MB） */
  estimatedTotalMemoryMB: number;
  /** 是否处于内存压力状态 */
  underMemoryPressure: boolean;
}

/**
 * 性能管理器
 * 
 * 负责管理DrawBoard的性能优化策略：
 * - 预渲染缓存管理
 * - 内存使用监控
 * - 性能模式自动切换
 * - LRU缓存清理
 * 
 * @example
 * ```typescript
 * const perfManager = new PerformanceManager({
 *   mode: PerformanceMode.AUTO,
 *   maxCacheMemoryMB: 100,
 *   complexityThreshold: 50
 * });
 * 
 * // 检查是否应该缓存某个action
 * if (perfManager.shouldCache(action)) {
 *   const cache = perfManager.createCache(action, imageData);
 *   action.preRenderedCache = cache;
 * }
 * 
 * // 绘制时检查是否使用缓存
 * if (perfManager.shouldUseCache(action)) {
 *   perfManager.drawFromCache(ctx, action);
 * } else {
 *   // 使用传统绘制方法
 * }
 * ```
 */
export class PerformanceManager {
  private config: PerformanceConfig;
  private cacheMap: Map<string, PreRenderedCache> = new Map();
  private accessOrder: string[] = []; // LRU访问顺序
  private stats = {
    cacheHits: 0,
    cacheMisses: 0,
    totalDrawCalls: 0
  };

  /**
   * 默认性能配置
   */
  private static readonly DEFAULT_CONFIG: PerformanceConfig = {
    mode: PerformanceMode.AUTO,
    maxCacheMemoryMB: 200, // 200MB缓存限制
    maxCacheItems: 500,    // 最多500个缓存项
    complexityThreshold: 30, // 复杂度超过30才缓存
    enableMemoryMonitoring: true,
    memoryPressureThreshold: 0.8 // 80%内存使用率
  };

  constructor(config: Partial<PerformanceConfig> = {}) {
    this.config = { ...PerformanceManager.DEFAULT_CONFIG, ...config };
    
    // 启动内存监控
    if (this.config.enableMemoryMonitoring) {
      this.startMemoryMonitoring();
    }
  }

  /**
   * 设置性能模式
   */
  public setPerformanceMode(mode: PerformanceMode): void {
    const oldMode = this.config.mode;
    this.config.mode = mode;
    
    console.log(`性能模式从 ${oldMode} 切换到 ${mode}`);
    
    // 模式切换时的特殊处理
    if (mode === PerformanceMode.LOW_MEMORY) {
      this.clearAllCaches();
    }
  }

  /**
   * 判断是否应该为某个action创建缓存
   */
  public shouldCache(action: DrawAction): boolean {
    // 强制实时绘制
    if (action.forceRealTimeRender) {
      return false;
    }

    // 不支持缓存的action
    if (action.supportsCaching === false) {
      return false;
    }

    // 低内存模式下不缓存
    if (this.config.mode === PerformanceMode.LOW_MEMORY) {
      return false;
    }

    // 检查复杂度
    const complexity = this.calculateComplexity(action);
    if (complexity < this.config.complexityThreshold) {
      return false;
    }

    // 检查内存限制
    const currentMemory = this.getCurrentMemoryUsage();
    if (currentMemory >= this.config.maxCacheMemoryMB) {
      return false;
    }

    // 检查缓存项数限制
    if (this.cacheMap.size >= this.config.maxCacheItems) {
      return false;
    }

    // 高性能模式下优先缓存
    if (this.config.mode === PerformanceMode.HIGH_PERFORMANCE) {
      return true;
    }

    // AUTO和BALANCED模式下的智能判断
    return this.shouldCacheIntelligent(action, complexity);
  }

  /**
   * 判断是否应该使用缓存绘制
   */
  public shouldUseCache(action: DrawAction): boolean {
    if (!action.preRenderedCache) {
      return false;
    }

    // 强制实时绘制
    if (action.forceRealTimeRender) {
      return false;
    }

    // 检查缓存是否有效
    if (!this.isCacheValid(action.preRenderedCache)) {
      this.removeCache(action.id);
      return false;
    }

    return true;
  }

  /**
   * 创建预渲染缓存
   */
  public createCache(action: DrawAction, canvas: HTMLCanvasElement): PreRenderedCache | null {
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // 计算边界框
      const boundingBox = this.calculateBoundingBox(action);
      
      // 提取ImageData
      const imageData = ctx.getImageData(
        boundingBox.x, 
        boundingBox.y, 
        boundingBox.width, 
        boundingBox.height
      );

      // 计算内存大小
      const memorySize = imageData.data.length; // 4 bytes per pixel (RGBA)

      const cache: PreRenderedCache = {
        imageData,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        memorySize,
        boundingBox
      };

      // 存储缓存
      this.cacheMap.set(action.id, cache);
      this.updateAccessOrder(action.id);

      // 检查内存限制，必要时清理
      this.enforceMemoryLimits();

      return cache;
    } catch (error) {
      console.error('创建缓存失败:', error);
      return null;
    }
  }

  /**
   * 从缓存绘制
   */
  public drawFromCache(ctx: CanvasRenderingContext2D, action: DrawAction): boolean {
    if (!action.preRenderedCache) {
      this.stats.cacheMisses++;
      return false;
    }

    try {
      const cache = action.preRenderedCache;
      
      // 更新访问时间
      cache.lastUsed = Date.now();
      this.updateAccessOrder(action.id);

      // 绘制缓存的ImageData
      ctx.putImageData(
        cache.imageData,
        cache.boundingBox.x,
        cache.boundingBox.y
      );

      this.stats.cacheHits++;
      this.stats.totalDrawCalls++;
      return true;
    } catch (error) {
      console.error('从缓存绘制失败:', error);
      this.removeCache(action.id);
      this.stats.cacheMisses++;
      return false;
    }
  }

  /**
   * 移除特定action的缓存
   */
  public removeCache(actionId: string): void {
    this.cacheMap.delete(actionId);
    const index = this.accessOrder.indexOf(actionId);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * 清空所有缓存
   */
  public clearAllCaches(): void {
    this.cacheMap.clear();
    this.accessOrder.length = 0;
    console.log('已清空所有预渲染缓存');
  }

  /**
   * 获取内存统计信息
   */
  public getMemoryStats(): MemoryStats {
    const currentCacheMemoryMB = this.getCurrentMemoryUsage();
    const cacheHitRate = this.stats.totalDrawCalls > 0 
      ? this.stats.cacheHits / this.stats.totalDrawCalls 
      : 0;

    return {
      currentCacheMemoryMB,
      currentCacheItems: this.cacheMap.size,
      cacheHitRate,
      estimatedTotalMemoryMB: currentCacheMemoryMB * 1.5, // 估算总内存使用
      underMemoryPressure: currentCacheMemoryMB >= this.config.maxCacheMemoryMB * this.config.memoryPressureThreshold
    };
  }

  /**
   * 更新配置
   */
  public updateConfig(newConfig: Partial<PerformanceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // 如果降低了内存限制，立即执行清理
    if (newConfig.maxCacheMemoryMB && newConfig.maxCacheMemoryMB < this.getCurrentMemoryUsage()) {
      this.enforceMemoryLimits();
    }
  }

  // ============================================
  // 私有方法
  // ============================================

  /**
   * 计算action的复杂度评分
   */
  private calculateComplexity(action: DrawAction): number {
    let score = 0;

    // 基于点数量
    score += action.points.length * 0.5;

    // 基于工具类型
    switch (action.type) {
      case 'pen':
        score += 30; // 画笔工具复杂度较高
        break;
      case 'brush':
        score += 50; // 毛笔工具最复杂
        break;
      case 'rect':
      case 'circle':
        score += 5; // 简单图形
        break;
      default:
        score += 20;
    }

    // 基于线宽（更粗的线可能有更复杂的效果）
    score += action.context.lineWidth * 2;

    return Math.round(score);
  }

  /**
   * 智能判断是否缓存（AUTO和BALANCED模式）
   */
  private shouldCacheIntelligent(_action: DrawAction, complexity: number): boolean {
    const memoryStats = this.getMemoryStats();
    
    // 内存压力下降低阈值
    if (memoryStats.underMemoryPressure) {
      return complexity > this.config.complexityThreshold * 1.5;
    }

    // 缓存命中率低时减少缓存
    if (memoryStats.cacheHitRate < 0.5 && this.stats.totalDrawCalls > 10) {
      return complexity > this.config.complexityThreshold * 1.2;
    }

    return true;
  }

  /**
   * 计算边界框
   */
  private calculateBoundingBox(action: DrawAction): { x: number; y: number; width: number; height: number } {
    if (action.points.length === 0) {
      return { x: 0, y: 0, width: 1, height: 1 };
    }

    let minX = action.points[0].x;
    let minY = action.points[0].y;
    let maxX = action.points[0].x;
    let maxY = action.points[0].y;

    for (const point of action.points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }

    // 添加一些边距，考虑线宽
    const margin = action.context.lineWidth * 2;
    
    return {
      x: Math.floor(minX - margin),
      y: Math.floor(minY - margin), 
      width: Math.ceil(maxX - minX + margin * 2),
      height: Math.ceil(maxY - minY + margin * 2)
    };
  }

  /**
   * 检查缓存是否有效
   */
  private isCacheValid(cache: PreRenderedCache): boolean {
    // 简单检查：缓存是否存在有效的ImageData
    return cache.imageData && cache.imageData.data && cache.imageData.data.length > 0;
  }

  /**
   * 获取当前内存使用量（MB）
   */
  private getCurrentMemoryUsage(): number {
    let totalBytes = 0;
    for (const cache of this.cacheMap.values()) {
      totalBytes += cache.memorySize;
    }
    return totalBytes / (1024 * 1024); // 转换为MB
  }

  /**
   * 更新LRU访问顺序
   */
  private updateAccessOrder(actionId: string): void {
    const index = this.accessOrder.indexOf(actionId);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(actionId); // 最近使用的放到末尾
  }

  /**
   * 强制执行内存限制
   */
  private enforceMemoryLimits(): void {
    // 按内存使用量清理
    while (this.getCurrentMemoryUsage() > this.config.maxCacheMemoryMB && this.accessOrder.length > 0) {
      const oldestId = this.accessOrder.shift()!;
      this.cacheMap.delete(oldestId);
    }

    // 按数量限制清理
    while (this.cacheMap.size > this.config.maxCacheItems && this.accessOrder.length > 0) {
      const oldestId = this.accessOrder.shift()!;
      this.cacheMap.delete(oldestId);
    }
  }

  /**
   * 启动内存监控
   */
  private startMemoryMonitoring(): void {
    setInterval(() => {
      const stats = this.getMemoryStats();
      
      // 自动模式下的智能切换
      if (this.config.mode === PerformanceMode.AUTO) {
        if (stats.underMemoryPressure) {
          console.log('检测到内存压力，切换到平衡模式');
          this.setPerformanceMode(PerformanceMode.BALANCED);
                 } else if (stats.currentCacheMemoryMB < this.config.maxCacheMemoryMB * 0.5) {
           // 内存充足时切换到高性能模式
           console.log('内存充足，切换到高性能模式');
           this.setPerformanceMode(PerformanceMode.HIGH_PERFORMANCE);
         }
      }

      // 定期清理过期缓存
      this.cleanupExpiredCaches();
    }, 10000); // 每10秒检查一次
  }

  /**
   * 清理过期缓存
   */
  private cleanupExpiredCaches(): void {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5分钟未使用则清理

    const expiredIds: string[] = [];
    for (const [id, cache] of this.cacheMap) {
      if (now - cache.lastUsed > maxAge) {
        expiredIds.push(id);
      }
    }

    for (const id of expiredIds) {
      this.removeCache(id);
    }

    if (expiredIds.length > 0) {
      console.log(`清理了 ${expiredIds.length} 个过期缓存`);
    }
  }
} 