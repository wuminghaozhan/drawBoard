import { logger } from './Logger';

/**
 * 内存监控器
 * 用于监控浏览器内存使用情况，支持智能缓存管理
 */
export class MemoryMonitor {
  private maxMemoryUsage: number = 0.8; // 80%内存使用率阈值（可配置）
  private lastCheckTime: number = 0;
  private readonly CHECK_INTERVAL = 5000; // 5秒检查一次
  private cachedMemoryUsage: number | null = null;

  /**
   * 获取当前内存使用率（0-1）
   * 如果浏览器不支持 performance.memory，返回 null
   */
  public getMemoryUsage(): number | null {
    // 检查是否支持 performance.memory（Chrome/Edge）
    const performance = window.performance as any;
    if (!performance || !performance.memory) {
      return null;
    }

    const memory = performance.memory;
    const used = memory.usedJSHeapSize;
    const total = memory.totalJSHeapSize;
    const limit = memory.jsHeapSizeLimit;

    if (!used || !total || !limit) {
      return null;
    }

    // 计算使用率（基于限制值）
    const usage = used / limit;
    return Math.min(1, Math.max(0, usage));
  }

  /**
   * 检查内存使用率是否超过阈值
   * 使用缓存机制，避免频繁检查
   */
  public isMemoryUsageHigh(): boolean {
    const now = Date.now();
    
    // 如果距离上次检查时间太短，使用缓存值
    if (now - this.lastCheckTime < this.CHECK_INTERVAL && this.cachedMemoryUsage !== null) {
      return this.cachedMemoryUsage > this.maxMemoryUsage;
    }

    // 更新检查时间
    this.lastCheckTime = now;
    
    // 获取当前内存使用率
    const usage = this.getMemoryUsage();
    
    if (usage === null) {
      // 不支持内存监控，默认返回 false（允许使用缓存）
      this.cachedMemoryUsage = null;
      return false;
    }

    // 更新缓存
    this.cachedMemoryUsage = usage;
    
    const isHigh = usage > this.maxMemoryUsage;
    
    if (isHigh) {
      logger.warn(`内存使用率过高: ${(usage * 100).toFixed(1)}%`, {
        used: this.formatBytes((window.performance as any).memory.usedJSHeapSize),
        total: this.formatBytes((window.performance as any).memory.totalJSHeapSize),
        limit: this.formatBytes((window.performance as any).memory.jsHeapSizeLimit)
      });
    }
    
    return isHigh;
  }

  /**
   * 获取内存使用信息（用于调试）
   */
  public getMemoryInfo(): {
    usage: number | null;
    used: string | null;
    total: string | null;
    limit: string | null;
    isHigh: boolean;
  } {
    const performance = window.performance as any;
    if (!performance || !performance.memory) {
      return {
        usage: null,
        used: null,
        total: null,
        limit: null,
        isHigh: false
      };
    }

    const memory = performance.memory;
    const usage = this.getMemoryUsage();
    
    return {
      usage,
      used: this.formatBytes(memory.usedJSHeapSize),
      total: this.formatBytes(memory.totalJSHeapSize),
      limit: this.formatBytes(memory.jsHeapSizeLimit),
      isHigh: usage !== null && usage > this.maxMemoryUsage
    };
  }

  /**
   * 格式化字节数为可读字符串
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * 设置内存使用率阈值
   */
  public setMaxMemoryUsage(threshold: number): void {
    if (threshold < 0 || threshold > 1) {
      logger.warn('内存使用率阈值必须在 0-1 之间');
      return;
    }
    this.maxMemoryUsage = threshold;
    logger.debug(`内存使用率阈值已更新: ${(threshold * 100).toFixed(1)}%`);
  }

  /**
   * 强制刷新内存使用率缓存
   */
  public refresh(): void {
    this.lastCheckTime = 0;
    this.cachedMemoryUsage = null;
  }
}

