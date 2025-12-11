/**
 * 离屏缓存管理器
 * 
 * 负责管理离屏 Canvas 缓存，优化大量历史动作的重绘性能
 */

import { logger } from '../../infrastructure/logging/Logger';
import type { MemoryMonitor } from '../../infrastructure/performance/MemoryMonitor';
import type { DrawAction } from '../../tools/DrawTool';

/**
 * 离屏缓存配置
 */
export interface OffscreenCacheConfig {
  /** 启用离屏缓存的历史动作阈值 */
  cacheThreshold: number;
  /** 是否启用几何图形优化 */
  enableGeometricOptimization: boolean;
}

/**
 * 离屏缓存管理器
 */
export class OffscreenCacheManager {
  /** 离屏 Canvas */
  private offscreenCanvas?: HTMLCanvasElement;
  /** 离屏 Canvas 上下文 */
  private offscreenCtx?: CanvasRenderingContext2D;
  /** 缓存是否过期 */
  private cacheDirty: boolean = true;
  /** 内存监控器 */
  private memoryMonitor: MemoryMonitor;
  /** 配置 */
  private config: OffscreenCacheConfig;

  constructor(memoryMonitor: MemoryMonitor, config: Partial<OffscreenCacheConfig> = {}) {
    this.memoryMonitor = memoryMonitor;
    this.config = {
      cacheThreshold: 100,
      enableGeometricOptimization: true,
      ...config
    };
  }

  /**
   * 标记缓存过期
   */
  public invalidate(): void {
    this.cacheDirty = true;
    logger.debug('离屏缓存已标记为过期');
  }

  /**
   * 检查缓存是否过期
   */
  public isDirty(): boolean {
    return this.cacheDirty;
  }

  /**
   * 检查是否应该使用离屏缓存
   */
  public shouldUseCache(historyCount: number): boolean {
    // 检查内存使用率
    if (this.memoryMonitor.isMemoryUsageHigh()) {
      // 内存紧张，禁用缓存
      if (this.offscreenCanvas) {
        this.cleanup();
      }
      return false;
    }
    
    // 检查历史动作数量
    if (historyCount < this.config.cacheThreshold) {
      return false;
    }
    
    // 检查是否启用几何图形优化
    return this.config.enableGeometricOptimization;
  }

  /**
   * 初始化离屏 Canvas
   */
  public initialize(width: number, height: number): CanvasRenderingContext2D | null {
    if (!this.offscreenCanvas) {
      this.offscreenCanvas = document.createElement('canvas');
      this.offscreenCtx = this.offscreenCanvas.getContext('2d') ?? undefined;
    }
    
    // 如果尺寸变化，更新离屏Canvas尺寸
    if (this.offscreenCanvas.width !== width || this.offscreenCanvas.height !== height) {
      this.offscreenCanvas.width = width;
      this.offscreenCanvas.height = height;
      this.cacheDirty = true; // 尺寸变化，需要重新绘制
    }

    return this.offscreenCtx ?? null;
  }

  /**
   * 获取离屏 Canvas 上下文
   */
  public getContext(): CanvasRenderingContext2D | null {
    return this.offscreenCtx ?? null;
  }

  /**
   * 获取离屏 Canvas
   */
  public getCanvas(): HTMLCanvasElement | null {
    return this.offscreenCanvas ?? null;
  }

  /**
   * 清空离屏 Canvas 内容
   */
  public clear(): void {
    if (this.offscreenCtx && this.offscreenCanvas) {
      this.offscreenCtx.clearRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
    }
  }

  /**
   * 标记缓存为有效（绘制完成后调用）
   */
  public markValid(): void {
    this.cacheDirty = false;
  }

  /**
   * 将离屏缓存绘制到目标上下文
   */
  public drawTo(targetCtx: CanvasRenderingContext2D): void {
    if (this.offscreenCanvas && !this.cacheDirty) {
      targetCtx.drawImage(this.offscreenCanvas, 0, 0);
    }
  }

  /**
   * 清理离屏 Canvas（释放内存）
   */
  public cleanup(): void {
    if (this.offscreenCanvas) {
      // 1. 先清除内容
      if (this.offscreenCtx) {
        this.offscreenCtx.clearRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
      }
      
      // 2. 显式释放 GPU 资源
      // 设置 canvas 尺寸为 0 可以触发浏览器释放底层的显存
      this.offscreenCanvas.width = 0;
      this.offscreenCanvas.height = 0;
      
      // 3. 清除引用
      this.offscreenCanvas = undefined;
      this.offscreenCtx = undefined;
      this.cacheDirty = true;
      
      logger.debug('离屏Canvas已清理，GPU资源已释放');
    }
  }

  /**
   * 更新配置
   */
  public updateConfig(config: Partial<OffscreenCacheConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取缓存状态
   */
  public getStats(): { hasCache: boolean; isDirty: boolean; size: { width: number; height: number } | null } {
    return {
      hasCache: !!this.offscreenCanvas,
      isDirty: this.cacheDirty,
      size: this.offscreenCanvas 
        ? { width: this.offscreenCanvas.width, height: this.offscreenCanvas.height }
        : null
    };
  }
}

