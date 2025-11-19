import type { CanvasEngine } from '../core/CanvasEngine';
import type { DrawAction } from '../tools/DrawTool';
import { MemoryMonitor } from '../utils/MemoryMonitor';
import { ConfigConstants } from '../config/Constants';
import { logger } from '../utils/Logger';
import { SafeExecutor } from '../utils/SafeExecutor';

/**
 * 缓存管理器
 * 负责各种缓存的管理，提高代码可维护性
 * 
 * 职责：
 * - 动作缓存管理
 * - 离屏Canvas缓存管理
 * - 图层缓存管理
 * - 缓存失效管理
 */
export class CacheManager {
  // 动作缓存
  private actionCache: Set<string> = new Set();
  private lastCachedActionCount: number = 0;
  
  // 离屏Canvas缓存
  private offscreenCanvas?: HTMLCanvasElement;
  private offscreenCtx?: CanvasRenderingContext2D;
  private offscreenCacheDirty: boolean = true;
  private readonly OFFSCREEN_CACHE_THRESHOLD = ConfigConstants.PERFORMANCE.OFFScreen_CACHE_THRESHOLD;
  
  // 智能内存管理
  private memoryMonitor: MemoryMonitor;
  private readonly MAX_MEMORY_USAGE = ConfigConstants.MEMORY.DEFAULT_MAX_USAGE;
  
  constructor(
    private canvasEngine: CanvasEngine,
    private drawAction?: (ctx: CanvasRenderingContext2D, action: DrawAction) => Promise<void>
  ) {
    this.memoryMonitor = new MemoryMonitor();
    this.memoryMonitor.setMaxMemoryUsage(this.MAX_MEMORY_USAGE);
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
        this.offscreenCtx = this.offscreenCanvas.getContext('2d');
        
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
  } {
    return {
      actionCacheSize: this.actionCache.size,
      hasOffscreenCache: !!this.offscreenCanvas,
      offscreenCacheDirty: this.offscreenCacheDirty,
      memoryUsage: this.memoryMonitor.getMemoryUsage(),
      memoryUsageHigh: this.memoryMonitor.isMemoryUsageHigh()
    };
  }
  
  /**
   * 清空所有缓存
   */
  clearAllCache(): void {
    this.clearActionCache();
    this.cleanupOffscreenCanvas();
    logger.debug('所有缓存已清空');
  }
  
  /**
   * 刷新内存监控
   */
  refreshMemoryMonitor(): void {
    this.memoryMonitor.refresh();
  }
}
