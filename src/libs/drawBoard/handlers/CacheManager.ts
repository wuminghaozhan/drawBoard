import type { CanvasEngine } from '../core/CanvasEngine';
import type { DrawAction } from '../tools/DrawTool';
import { MemoryMonitor } from '../infrastructure/performance/MemoryMonitor';
import { ConfigConstants } from '../config/Constants';
import { logger } from '../infrastructure/logging/Logger';
import { SafeExecutor } from '../infrastructure/error/SafeExecutor';
import { LRUCache, type LRUCacheStats } from '../infrastructure/cache/LRUCache';
import { ComplexityAwareCache } from '../infrastructure/cache/ComplexityAwareCache';

/**
 * 缓存管理器配置
 */
export interface CacheManagerConfig {
  /** 是否启用 LRU 缓存 */
  enableLRU: boolean;
  /** 是否启用复杂度感知缓存 */
  enableComplexityAware: boolean;
  /** LRU 缓存最大条目数 */
  maxLRUEntries: number;
  /** LRU 缓存最大内存（MB） */
  maxLRUMemoryMB: number;
  /** 复杂度缓存阈值 */
  complexityCacheThreshold: number;
  /** 离屏缓存阈值 */
  offscreenCacheThreshold: number;
}

/**
 * 缓存管理器
 * 负责各种缓存的管理，提高代码可维护性
 * 
 * 职责：
 * - 动作缓存管理（LRU + 复杂度感知）
 * - 离屏Canvas缓存管理
 * - 图层缓存管理
 * - 缓存失效管理
 * - 智能内存管理
 */
export class CacheManager {
  // 动作缓存（基础）
  private actionCache: Set<string> = new Set();
  private lastCachedActionCount: number = 0;
  
  // LRU 缓存（用于边界框、元数据等）
  private lruCache: LRUCache<unknown>;
  
  // 复杂度感知缓存（用于高复杂度动作的离屏渲染）
  private complexityCache: ComplexityAwareCache;
  
  // 离屏Canvas缓存（用于历史动作整体缓存）
  private offscreenCanvas?: HTMLCanvasElement;
  private offscreenCtx?: CanvasRenderingContext2D;
  private offscreenCacheDirty: boolean = true;
  private readonly OFFSCREEN_CACHE_THRESHOLD: number;
  
  // 智能内存管理
  private memoryMonitor: MemoryMonitor;
  private readonly MAX_MEMORY_USAGE: number;
  
  // 配置
  private config: CacheManagerConfig;
  
  // 画布引用
  private canvasEngine: CanvasEngine;
  
  // 显式声明成员（修复 erasableSyntaxOnly 错误）
  private drawAction?: (ctx: CanvasRenderingContext2D, action: DrawAction) => Promise<void>;
  
  /** 默认配置 */
  private static readonly DEFAULT_CONFIG: CacheManagerConfig = {
    enableLRU: true,
    enableComplexityAware: true,
    maxLRUEntries: 200,
    maxLRUMemoryMB: 20,
    complexityCacheThreshold: 15,
    offscreenCacheThreshold: ConfigConstants.PERFORMANCE.OFFScreen_CACHE_THRESHOLD
  };
  
  constructor(
    canvasEngine: CanvasEngine,
    drawAction?: (ctx: CanvasRenderingContext2D, action: DrawAction) => Promise<void>,
    config?: Partial<CacheManagerConfig>
  ) {
    this.canvasEngine = canvasEngine;
    this.drawAction = drawAction;
    
    // 合并配置
    this.config = { ...CacheManager.DEFAULT_CONFIG, ...config };
    this.OFFSCREEN_CACHE_THRESHOLD = this.config.offscreenCacheThreshold;
    this.MAX_MEMORY_USAGE = ConfigConstants.MEMORY.DEFAULT_MAX_USAGE;
    
    // 初始化内存监控
    this.memoryMonitor = new MemoryMonitor();
    this.memoryMonitor.setMaxMemoryUsage(this.MAX_MEMORY_USAGE);
    
    // 初始化 LRU 缓存
    this.lruCache = new LRUCache<unknown>({
      maxEntries: this.config.maxLRUEntries,
      maxMemoryBytes: this.config.maxLRUMemoryMB * 1024 * 1024,
      complexityWeight: 0.3,
      accessWeight: 0.5,
      ttlMs: 300000, // 5分钟
      cleanupIntervalMs: 60000
    });
    
    // 初始化复杂度感知缓存
    const canvas = canvasEngine.getCanvas();
    this.complexityCache = new ComplexityAwareCache(
      canvas.width,
      canvas.height,
      {
        cacheThreshold: this.config.complexityCacheThreshold,
        maxEntries: 30,
        maxMemoryBytes: 30 * 1024 * 1024,
        autoCalculateMemory: true
      }
    );
    
    logger.debug('CacheManager 初始化完成', {
      enableLRU: this.config.enableLRU,
      enableComplexityAware: this.config.enableComplexityAware,
      maxLRUEntries: this.config.maxLRUEntries,
      maxLRUMemoryMB: this.config.maxLRUMemoryMB
    });
  }
  
  /**
   * 检查并更新动作缓存
   */
  checkAndUpdateActionCache(allActions: DrawAction[]): void {
    if (allActions.length !== this.lastCachedActionCount) {
      this.updateActionCache(allActions);
      this.lastCachedActionCount = allActions.length;
      // 历史动作数量变化，标记离屏缓存过期
      this.invalidateOffscreenCache();
    }
  }
  
  /**
   * 更新动作缓存
   */
  updateActionCache(actions: DrawAction[]): void {
    this.actionCache.clear();
    for (const action of actions) {
      this.actionCache.add(action.id);
    }
    logger.debug('动作缓存已更新', { cachedCount: this.actionCache.size });
  }
  
  /**
   * 添加动作到缓存
   */
  addActionToCache(actionId: string): void {
    this.actionCache.add(actionId);
  }
  
  /**
   * 从缓存移除动作
   */
  removeActionFromCache(actionId: string): void {
    this.actionCache.delete(actionId);
  }
  
  /**
   * 检查动作是否在缓存中
   */
  isActionCached(actionId: string): boolean {
    return this.actionCache.has(actionId);
  }
  
  /**
   * 清空动作缓存
   */
  clearActionCache(): void {
    this.actionCache.clear();
    this.lastCachedActionCount = 0;
  }
  
  /**
   * 获取动作缓存大小
   */
  getActionCacheSize(): number {
    return this.actionCache.size;
  }
  
  /**
   * 检查是否应该使用离屏缓存
   */
  shouldUseOffscreenCache(historyCount: number): boolean {
    // 检查历史动作数量
    if (historyCount < this.OFFSCREEN_CACHE_THRESHOLD) {
      return false;
    }
    
    // 检查内存使用率
    if (this.memoryMonitor.isMemoryUsageHigh()) {
      logger.debug('内存使用率高，禁用离屏缓存');
      this.cleanupOffscreenCanvas();
      return false;
    }
    
    return true;
  }
  
  /**
   * 获取离屏Canvas缓存
   */
  async getOffscreenCache(
    mainCtx: CanvasRenderingContext2D,
    allActions: DrawAction[]
  ): Promise<HTMLCanvasElement | null> {
    return SafeExecutor.executeAsync(async () => {
      // 检查是否应该使用缓存
      if (!this.shouldUseOffscreenCache(allActions.length)) {
        return null;
      }
      
      // 初始化离屏Canvas
      if (!this.offscreenCanvas) {
        const canvas = mainCtx.canvas;
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCanvas.width = canvas.width;
        this.offscreenCanvas.height = canvas.height;
        this.offscreenCtx = this.offscreenCanvas.getContext('2d') ?? undefined;
        
        if (!this.offscreenCtx) {
          logger.error('无法创建离屏Canvas上下文');
          this.offscreenCanvas = undefined;
          return null;
        }
      }
      
      // 如果缓存过期，重新构建
      if (this.offscreenCacheDirty) {
        if (!this.offscreenCtx) {
          return null;
        }
        
        // 清空离屏Canvas
        this.offscreenCtx.clearRect(
          0,
          0,
          this.offscreenCanvas.width,
          this.offscreenCanvas.height
        );
        
        // 绘制所有历史动作
        if (this.drawAction) {
          for (const action of allActions) {
            await this.drawAction(this.offscreenCtx, action);
          }
        }
        
        this.offscreenCacheDirty = false;
        logger.debug('离屏缓存已重建', { actionCount: allActions.length });
      }
      
      return this.offscreenCanvas;
    }, null, '获取离屏缓存失败');
  }
  
  /**
   * 标记离屏缓存过期
   */
  invalidateOffscreenCache(): void {
    this.offscreenCacheDirty = true;
    logger.debug('离屏缓存已标记为过期');
  }
  
  /**
   * 清理离屏Canvas
   */
  cleanupOffscreenCanvas(): void {
    if (this.offscreenCanvas) {
      this.offscreenCanvas.width = 0;
      this.offscreenCanvas.height = 0;
      this.offscreenCanvas = undefined;
      this.offscreenCtx = undefined;
      this.offscreenCacheDirty = true;
      logger.debug('离屏Canvas已清理（内存紧张）');
    }
  }
  
  /**
   * 检查离屏缓存是否过期
   */
  isOffscreenCacheDirty(): boolean {
    return this.offscreenCacheDirty;
  }
  
  /**
   * 获取缓存统计信息
   */
  getCacheStats(): {
    actionCacheSize: number;
    hasOffscreenCache: boolean;
    offscreenCacheDirty: boolean;
    memoryUsage: number | null;
    memoryUsageHigh: boolean;
    lruStats: LRUCacheStats;
    complexityCacheStats: LRUCacheStats & { poolSize: number };
  } {
    return {
      actionCacheSize: this.actionCache.size,
      hasOffscreenCache: !!this.offscreenCanvas,
      offscreenCacheDirty: this.offscreenCacheDirty,
      memoryUsage: this.memoryMonitor.getMemoryUsage(),
      memoryUsageHigh: this.memoryMonitor.isMemoryUsageHigh(),
      lruStats: this.lruCache.getStats(),
      complexityCacheStats: this.complexityCache.getStats()
    };
  }
  
  /**
   * 清空所有缓存
   */
  clearAllCache(): void {
    this.clearActionCache();
    this.cleanupOffscreenCanvas();
    this.lruCache.clear();
    this.complexityCache.invalidateAll();
    logger.debug('所有缓存已清空');
  }
  
  /**
   * 刷新内存监控
   */
  refreshMemoryMonitor(): void {
    this.memoryMonitor.refresh();
  }
  
  // ============================================
  // LRU 缓存相关方法
  // ============================================
  
  /**
   * 从 LRU 缓存获取数据
   */
  getLRU<T>(key: string): T | undefined {
    if (!this.config.enableLRU) return undefined;
    return this.lruCache.get(key) as T | undefined;
  }
  
  /**
   * 设置 LRU 缓存数据
   */
  setLRU<T>(key: string, value: T, options?: { complexity?: number; memorySize?: number }): void {
    if (!this.config.enableLRU) return;
    this.lruCache.set(key, value, options);
  }
  
  /**
   * 删除 LRU 缓存数据
   */
  deleteLRU(key: string): boolean {
    return this.lruCache.delete(key);
  }
  
  /**
   * 检查 LRU 缓存是否存在
   */
  hasLRU(key: string): boolean {
    return this.lruCache.has(key);
  }
  
  // ============================================
  // 复杂度感知缓存相关方法
  // ============================================
  
  /**
   * 检查动作是否应该使用复杂度缓存
   */
  shouldCacheAction(action: DrawAction): boolean {
    if (!this.config.enableComplexityAware) return false;
    return this.complexityCache.shouldCache(action);
  }
  
  /**
   * 获取动作的复杂度评分
   */
  getActionComplexity(action: DrawAction): number {
    return this.complexityCache.calculateComplexity(action);
  }
  
  /**
   * 获取或创建动作的离屏缓存
   */
  async getOrCreateActionCache(action: DrawAction): Promise<HTMLCanvasElement | null> {
    if (!this.config.enableComplexityAware || !this.drawAction) {
      return null;
    }
    
    if (!this.complexityCache.shouldCache(action)) {
      return null;
    }
    
    try {
      return await this.complexityCache.getOrCreate(action, this.drawAction);
    } catch (error) {
      logger.error('创建动作缓存失败', { actionId: action.id, error });
      return null;
    }
  }
  
  /**
   * 获取动作缓存
   */
  getActionCacheCanvas(actionId: string): HTMLCanvasElement | undefined {
    const cached = this.complexityCache.get(actionId);
    return cached?.canvas;
  }
  
  /**
   * 使动作缓存失效
   */
  invalidateActionCache(actionId: string): boolean {
    return this.complexityCache.invalidate(actionId);
  }
  
  /**
   * 批量使动作缓存失效
   */
  invalidateActionCaches(actionIds: string[]): number {
    return this.complexityCache.invalidateMany(actionIds);
  }
  
  /**
   * 预热高复杂度动作缓存
   */
  async prewarmCache(actions: DrawAction[]): Promise<number> {
    if (!this.config.enableComplexityAware || !this.drawAction) {
      return 0;
    }
    
    return this.complexityCache.prewarm(actions, this.drawAction, {
      maxCount: 10,
      idleCallback: true
    });
  }
  
  // ============================================
  // 画布尺寸更新
  // ============================================
  
  /**
   * 更新画布尺寸（清除相关缓存）
   */
  updateCanvasSize(width: number, height: number): void {
    // 更新复杂度缓存的尺寸
    this.complexityCache.updateCanvasSize(width, height);
    
    // 标记离屏缓存过期
    this.invalidateOffscreenCache();
    
    // 更新离屏 Canvas 尺寸
    if (this.offscreenCanvas) {
      this.offscreenCanvas.width = width;
      this.offscreenCanvas.height = height;
    }
    
    logger.debug('CacheManager: 画布尺寸已更新', { width, height });
  }
  
  /**
   * 更新配置
   */
  updateConfig(config: Partial<CacheManagerConfig>): void {
    this.config = { ...this.config, ...config };
    
    // 更新 LRU 缓存配置
    if (config.maxLRUEntries !== undefined || config.maxLRUMemoryMB !== undefined) {
      this.lruCache.updateConfig({
        maxEntries: this.config.maxLRUEntries,
        maxMemoryBytes: this.config.maxLRUMemoryMB * 1024 * 1024
      });
    }
    
    // 更新复杂度缓存配置
    if (config.complexityCacheThreshold !== undefined) {
      this.complexityCache.updateConfig({
        cacheThreshold: this.config.complexityCacheThreshold
      });
    }
    
    logger.debug('CacheManager: 配置已更新', config);
  }
  
  /**
   * 获取配置
   */
  getConfig(): CacheManagerConfig {
    return { ...this.config };
  }
  
  /**
   * 手动触发缓存清理
   */
  cleanup(): void {
    this.lruCache.cleanup();
    this.complexityCache.cleanup();
    this.memoryMonitor.refresh();
    logger.debug('CacheManager: 缓存清理完成');
  }
  
  /**
   * 销毁缓存管理器
   */
  destroy(): void {
    this.clearAllCache();
    this.lruCache.destroy();
    this.complexityCache.destroy();
    logger.debug('CacheManager: 已销毁');
  }
}
