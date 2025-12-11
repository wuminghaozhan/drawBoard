import { LRUCache, type LRUCacheConfig } from './LRUCache';
import { ComplexityAwareCache, type ComplexityAwareCacheConfig } from './ComplexityAwareCache';
import { logger } from '../../infrastructure/logging/Logger';

/**
 * 简单缓存配置
 */
export interface SimpleCacheConfig {
  /** 最大条目数 */
  maxSize: number;
  /** TTL（毫秒），0 表示不过期 */
  ttlMs?: number;
}

/**
 * 简单缓存实现
 * 适用于轻量级场景，不需要 LRU 复杂度
 */
export class SimpleCache<K, V> {
  private cache: Map<K, { value: V; expiresAt: number }> = new Map();
  private maxSize: number;
  private ttlMs: number;

  constructor(config: SimpleCacheConfig) {
    this.maxSize = config.maxSize;
    this.ttlMs = config.ttlMs ?? 0;
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return undefined;
    }

    // 检查是否过期
    if (this.ttlMs > 0 && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key: K, value: V): void {
    // 如果超过最大大小，删除最早的条目
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      value,
      expiresAt: this.ttlMs > 0 ? Date.now() + this.ttlMs : Infinity
    });
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

/**
 * 缓存类型
 */
export type CacheType = 'simple' | 'lru' | 'complexity-aware';

/**
 * 统一缓存配置
 */
export interface UnifiedCacheConfig {
  type: CacheType;
  simple?: SimpleCacheConfig;
  lru?: Partial<LRUCacheConfig>;
  complexityAware?: Partial<ComplexityAwareCacheConfig>;
}

/**
 * 缓存统计信息
 */
export interface CacheStats {
  type: CacheType;
  size: number;
  hits?: number;
  misses?: number;
  hitRate?: number;
  memoryUsage?: number;
}

/**
 * 缓存工厂
 * 
 * 统一缓存策略，提供一致的缓存创建接口。
 * 
 * 特点：
 * - 支持多种缓存类型
 * - 统一的配置接口
 * - 智能默认配置
 * - 缓存池管理
 * 
 * @example
 * ```typescript
 * // 创建简单缓存
 * const simpleCache = CacheFactory.createSimple<string, number>({ maxSize: 100 });
 * 
 * // 创建 LRU 缓存
 * const lruCache = CacheFactory.createLRU<MyData>({ maxEntries: 200 });
 * 
 * // 创建复杂度感知缓存
 * const complexityCache = CacheFactory.createComplexityAware(800, 600);
 * ```
 */
export class CacheFactory {
  // 缓存池：管理已创建的缓存实例
  private static cachePool: Map<string, unknown> = new Map();

  /**
   * 创建简单缓存
   */
  static createSimple<K, V>(config: SimpleCacheConfig): SimpleCache<K, V> {
    return new SimpleCache<K, V>(config);
  }

  /**
   * 创建 LRU 缓存
   */
  static createLRU<V>(config: Partial<LRUCacheConfig> = {}): LRUCache<V> {
    const defaultConfig: LRUCacheConfig = {
      maxEntries: 100,
      maxMemoryBytes: 50 * 1024 * 1024, // 50MB
      complexityWeight: 0.3,
      accessWeight: 0.5,
      ttlMs: 0,
      cleanupIntervalMs: 60000 // 1分钟
    };

    return new LRUCache<V>({ ...defaultConfig, ...config });
  }

  /**
   * 创建复杂度感知缓存
   */
  static createComplexityAware(
    canvasWidth: number,
    canvasHeight: number,
    config: Partial<ComplexityAwareCacheConfig> = {}
  ): ComplexityAwareCache {
    return new ComplexityAwareCache(canvasWidth, canvasHeight, config);
  }

  /**
   * 创建边界框缓存（优化用途）
   */
  static createBoundsCache(maxSize: number = 500): SimpleCache<string, {
    x: number;
    y: number;
    width: number;
    height: number;
  }> {
    return new SimpleCache({
      maxSize,
      ttlMs: 5000 // 5秒过期
    });
  }

  /**
   * 创建锚点缓存（优化用途）
   */
  static createAnchorCache<T>(maxSize: number = 200): SimpleCache<string, T> {
    return new SimpleCache({
      maxSize,
      ttlMs: 100 // 100ms 过期，锚点需要频繁更新
    });
  }

  /**
   * 从缓存池获取或创建缓存
   */
  static getOrCreate<T>(
    poolKey: string,
    factory: () => T
  ): T {
    if (this.cachePool.has(poolKey)) {
      return this.cachePool.get(poolKey) as T;
    }

    const cache = factory();
    this.cachePool.set(poolKey, cache);
    
    logger.debug(`CacheFactory: 创建缓存 ${poolKey}`);
    
    return cache;
  }

  /**
   * 从缓存池移除缓存
   */
  static removeFromPool(poolKey: string): boolean {
    const removed = this.cachePool.delete(poolKey);
    
    if (removed) {
      logger.debug(`CacheFactory: 移除缓存 ${poolKey}`);
    }
    
    return removed;
  }

  /**
   * 清空缓存池
   */
  static clearPool(): void {
    // 销毁所有 LRU 缓存
    for (const [, cache] of this.cachePool) {
      if (cache instanceof LRUCache) {
        cache.destroy();
      }
      if (cache instanceof ComplexityAwareCache) {
        cache.destroy();
      }
    }
    
    this.cachePool.clear();
    logger.debug('CacheFactory: 缓存池已清空');
  }

  /**
   * 获取缓存池统计信息
   */
  static getPoolStats(): {
    poolSize: number;
    caches: Array<{ key: string; type: string; size: number }>;
  } {
    const caches: Array<{ key: string; type: string; size: number }> = [];

    for (const [cacheKey, cache] of this.cachePool) {
      let type = 'unknown';
      let size = 0;

      if (cache instanceof SimpleCache) {
        type = 'simple';
        size = cache.size();
      } else if (cache instanceof LRUCache) {
        type = 'lru';
        size = cache.size();
      } else if (cache instanceof ComplexityAwareCache) {
        type = 'complexity-aware';
        // ComplexityAwareCache uses getStats() instead of size()
        const stats = cache.getStats();
        size = stats.entryCount;
      }

      caches.push({ key: cacheKey, type, size });
    }

    return {
      poolSize: this.cachePool.size,
      caches
    };
  }

  /**
   * 创建适合场景的缓存
   */
  static createForScenario(
    scenario: 'bounds' | 'anchors' | 'actions' | 'layers' | 'general',
    options: { canvasWidth?: number; canvasHeight?: number; maxSize?: number } = {}
  ): SimpleCache<string, unknown> | LRUCache<unknown> | ComplexityAwareCache {
    const { canvasWidth = 800, canvasHeight = 600, maxSize = 100 } = options;

    switch (scenario) {
      case 'bounds':
        return this.createBoundsCache(maxSize);

      case 'anchors':
        return this.createAnchorCache(maxSize);

      case 'actions':
        // Actions 使用复杂度感知缓存
        return this.createComplexityAware(canvasWidth, canvasHeight, {
          cacheThreshold: 15
        });

      case 'layers':
        // 图层使用 LRU 缓存
        return this.createLRU({
          maxEntries: 50,
          maxMemoryBytes: 100 * 1024 * 1024, // 100MB
          complexityWeight: 0.4,
          accessWeight: 0.4
        });

      case 'general':
      default:
        return this.createSimple({ maxSize });
    }
  }
}

/**
 * 缓存装饰器
 * 用于方法级别的缓存
 */
export function cached<T>(
  cacheKey: string,
  config: SimpleCacheConfig = { maxSize: 100 }
) {
  const cache = CacheFactory.getOrCreate(
    `decorator:${cacheKey}`,
    () => CacheFactory.createSimple<string, T>(config)
  );

  return function (
    _target: unknown,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: unknown[]) {
      const key = JSON.stringify(args);
      
      const cachedValue = cache.get(key);
      if (cachedValue !== undefined) {
        return cachedValue;
      }

      const result = originalMethod.apply(this, args);
      cache.set(key, result);
      
      return result;
    };

    return descriptor;
  };
}

