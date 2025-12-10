/**
 * 边界框缓存管理器
 * 负责管理图形边界框的缓存，优化性能
 * 
 * 从 SelectTool 中提取，提高代码可维护性和可测试性
 */

import type { DrawAction } from '../DrawTool';
import { logger } from '../../utils/Logger';

/**
 * 边界框类型
 */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 边界框缓存配置
 */
export interface BoundsCacheConfig {
  /** 最大缓存大小 */
  maxSize: number;
}

const DEFAULT_CONFIG: BoundsCacheConfig = {
  maxSize: 100
};

/**
 * 边界框缓存管理器
 */
export class BoundsCacheManager {
  private cache: Map<string, Bounds> = new Map();
  private config: BoundsCacheConfig;

  constructor(config?: Partial<BoundsCacheConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 更新配置
   */
  public updateConfig(config: Partial<BoundsCacheConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 生成缓存键
   */
  public generateCacheKey(action: DrawAction): string {
    return `${action.id}_${action.points.length}`;
  }

  /**
   * 获取缓存的边界框
   */
  public get(key: string): Bounds | undefined {
    return this.cache.get(key);
  }

  /**
   * 获取 action 的缓存边界框
   */
  public getForAction(action: DrawAction): Bounds | undefined {
    const key = this.generateCacheKey(action);
    return this.cache.get(key);
  }

  /**
   * 设置缓存（带 LRU 淘汰）
   */
  public set(key: string, bounds: Bounds): void {
    // 如果缓存已满，删除最旧的（FIFO策略）
    if (this.cache.size >= this.config.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    
    this.cache.set(key, { ...bounds });
  }

  /**
   * 设置 action 的边界框缓存
   */
  public setForAction(action: DrawAction, bounds: Bounds): void {
    const key = this.generateCacheKey(action);
    this.set(key, bounds);
  }

  /**
   * 检查是否有缓存
   */
  public has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * 检查 action 是否有缓存
   */
  public hasForAction(action: DrawAction): boolean {
    const key = this.generateCacheKey(action);
    return this.cache.has(key);
  }

  /**
   * 删除特定 action 的缓存
   */
  public deleteForAction(actionId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(actionId)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 清除所有缓存
   */
  public clear(): void {
    this.cache.clear();
    logger.debug('BoundsCacheManager: 缓存已清除');
  }

  /**
   * 获取缓存大小
   */
  public size(): number {
    return this.cache.size;
  }

  /**
   * 计算边界框（通用方法）
   * 如果缓存存在则返回缓存，否则计算并缓存
   */
  public getOrCompute(
    action: DrawAction,
    computeFn: (action: DrawAction) => Bounds
  ): Bounds {
    const key = this.generateCacheKey(action);
    
    // 检查缓存
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }

    // 计算边界框
    const bounds = computeFn(action);
    
    // 缓存结果
    this.set(key, bounds);
    
    return bounds;
  }

  /**
   * 批量计算边界框
   */
  public getOrComputeBatch(
    actions: DrawAction[],
    computeFn: (action: DrawAction) => Bounds
  ): Map<string, Bounds> {
    const result = new Map<string, Bounds>();
    
    for (const action of actions) {
      const bounds = this.getOrCompute(action, computeFn);
      result.set(action.id, bounds);
    }
    
    return result;
  }

  /**
   * 计算多个 actions 的统一边界框
   */
  public computeUnifiedBounds(
    actions: DrawAction[],
    computeFn: (action: DrawAction) => Bounds
  ): Bounds | null {
    if (actions.length === 0) {
      return null;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const action of actions) {
      const bounds = this.getOrCompute(action, computeFn);
      
      if (bounds.width > 0 && bounds.height > 0) {
        minX = Math.min(minX, bounds.x);
        minY = Math.min(minY, bounds.y);
        maxX = Math.max(maxX, bounds.x + bounds.width);
        maxY = Math.max(maxY, bounds.y + bounds.height);
      }
    }

    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      return null;
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }
}

