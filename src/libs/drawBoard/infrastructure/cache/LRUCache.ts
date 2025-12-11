import { logger } from '../logging/Logger';

/**
 * LRU 缓存条目
 */
interface CacheEntry<V> {
  /** 缓存值 */
  value: V;
  /** 复杂度评分 */
  complexity: number;
  /** 内存大小估算（字节） */
  memorySize: number;
  /** 创建时间 */
  createdAt: number;
  /** 最后访问时间 */
  lastAccessedAt: number;
  /** 访问次数 */
  accessCount: number;
}

/**
 * LRU 缓存配置
 */
export interface LRUCacheConfig {
  /** 最大条目数量 */
  maxEntries: number;
  /** 最大内存大小（字节） */
  maxMemoryBytes: number;
  /** 复杂度权重：影响淘汰优先级 */
  complexityWeight: number;
  /** 访问频率权重：影响淘汰优先级 */
  accessWeight: number;
  /** TTL（毫秒），0 表示不过期 */
  ttlMs: number;
  /** 清理间隔（毫秒） */
  cleanupIntervalMs: number;
}

/**
 * 缓存统计信息
 */
export interface LRUCacheStats {
  /** 当前条目数量 */
  entryCount: number;
  /** 当前内存使用（字节） */
  memoryUsage: number;
  /** 命中次数 */
  hits: number;
  /** 未命中次数 */
  misses: number;
  /** 命中率 */
  hitRate: number;
  /** 淘汰次数 */
  evictions: number;
  /** 平均复杂度 */
  averageComplexity: number;
}

/**
 * 复杂度感知 LRU 缓存
 * 
 * 结合 LRU（最近最少使用）和复杂度感知的智能缓存策略。
 * 
 * 淘汰策略：
 * 1. 优先淘汰低复杂度、低访问频率的条目
 * 2. 考虑内存大小，优先淘汰大内存条目
 * 3. 支持 TTL 过期
 * 
 * 复杂度评分规则：
 * - 画笔/路径：点数量 × 0.1
 * - 图形：基础复杂度 1-5
 * - 图片：像素数 / 10000
 * 
 * @example
 * ```typescript
 * const cache = new LRUCache<HTMLCanvasElement>({
 *   maxEntries: 100,
 *   maxMemoryBytes: 50 * 1024 * 1024, // 50MB
 *   complexityWeight: 0.3,
 *   accessWeight: 0.5
 * });
 * 
 * // 存储缓存
 * cache.set('layer-1', canvas, {
 *   complexity: 50,
 *   memorySize: 1024 * 1024
 * });
 * 
 * // 获取缓存
 * const cached = cache.get('layer-1');
 * ```
 */
export class LRUCache<V> {
  /** 缓存存储 */
  private cache: Map<string, CacheEntry<V>> = new Map();
  /** 配置 */
  private config: LRUCacheConfig;
  /** 当前内存使用 */
  private currentMemoryUsage: number = 0;
  /** 命中次数 */
  private hits: number = 0;
  /** 未命中次数 */
  private misses: number = 0;
  /** 淘汰次数 */
  private evictions: number = 0;
  /** 清理定时器 */
  private cleanupTimer?: ReturnType<typeof setInterval>;

  /** 默认配置 */
  private static readonly DEFAULT_CONFIG: LRUCacheConfig = {
    maxEntries: 100,
    maxMemoryBytes: 50 * 1024 * 1024, // 50MB
    complexityWeight: 0.3,
    accessWeight: 0.5,
    ttlMs: 0, // 默认不过期
    cleanupIntervalMs: 60000 // 1分钟清理一次
  };

  constructor(config?: Partial<LRUCacheConfig>) {
    this.config = { ...LRUCache.DEFAULT_CONFIG, ...config };

    // 启动定期清理
    if (this.config.cleanupIntervalMs > 0) {
      this.startCleanupTimer();
    }
  }

  /**
   * 获取缓存
   * @param key 缓存键
   * @returns 缓存值，如果不存在返回 undefined
   */
  get(key: string): V | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    // 检查 TTL
    if (this.isExpired(entry)) {
      this.delete(key);
      this.misses++;
      return undefined;
    }

    // 更新访问信息
    entry.lastAccessedAt = Date.now();
    entry.accessCount++;
    
    // LRU：移动到末尾（最近使用）
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.hits++;
    return entry.value;
  }

  /**
   * 设置缓存
   * @param key 缓存键
   * @param value 缓存值
   * @param options 选项
   */
  set(
    key: string,
    value: V,
    options: {
      complexity?: number;
      memorySize?: number;
    } = {}
  ): void {
    const { complexity = 1, memorySize = 0 } = options;

    // 如果已存在，先删除
    if (this.cache.has(key)) {
      this.delete(key);
    }

    // 检查是否需要淘汰
    while (this.needsEviction(memorySize)) {
      if (!this.evictOne()) {
        // 无法淘汰更多，记录警告
        logger.warn('LRUCache: 无法腾出足够空间', {
          required: memorySize,
          current: this.currentMemoryUsage,
          max: this.config.maxMemoryBytes
        });
        break;
      }
    }

    // 创建条目
    const entry: CacheEntry<V> = {
      value,
      complexity,
      memorySize,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      accessCount: 1
    };

    this.cache.set(key, entry);
    this.currentMemoryUsage += memorySize;
  }

  /**
   * 检查缓存是否存在
   * @param key 缓存键
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (this.isExpired(entry)) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * 删除缓存
   * @param key 缓存键
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    this.currentMemoryUsage -= entry.memorySize;
    this.cache.delete(key);
    return true;
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.cache.clear();
    this.currentMemoryUsage = 0;
  }

  /**
   * 获取缓存大小
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * 获取所有键
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * 获取所有键值对
   */
  getAll(): [string, V][] {
    const result: [string, V][] = [];
    this.cache.forEach((entry, key) => {
      if (!this.isExpired(entry)) {
        result.push([key, entry.value]);
      }
    });
    return result;
  }

  /**
   * 遍历所有缓存条目
   */
  forEach(callback: (value: V, key: string) => void): void {
    this.cache.forEach((entry, key) => {
      if (!this.isExpired(entry)) {
        callback(entry.value, key);
      }
    });
  }

  /**
   * 获取统计信息
   */
  getStats(): LRUCacheStats {
    const total = this.hits + this.misses;
    let totalComplexity = 0;

    this.cache.forEach(entry => {
      totalComplexity += entry.complexity;
    });

    return {
      entryCount: this.cache.size,
      memoryUsage: this.currentMemoryUsage,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      evictions: this.evictions,
      averageComplexity: this.cache.size > 0 ? totalComplexity / this.cache.size : 0
    };
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  /**
   * 更新条目复杂度
   * @param key 缓存键
   * @param complexity 新复杂度
   */
  updateComplexity(key: string, complexity: number): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    entry.complexity = complexity;
    return true;
  }

  /**
   * 手动触发清理
   */
  cleanup(): number {
    let cleaned = 0;
    const now = Date.now();

    // 清理过期条目
    for (const [key, entry] of this.cache) {
      if (this.isExpired(entry)) {
        this.delete(key);
        cleaned++;
      }
    }

    // 如果内存仍然超限，继续淘汰
    while (this.currentMemoryUsage > this.config.maxMemoryBytes * 0.9) {
      if (!this.evictOne()) break;
      cleaned++;
    }

    if (cleaned > 0) {
      logger.debug('LRUCache: 清理完成', { cleaned });
    }

    return cleaned;
  }

  /**
   * 销毁缓存
   */
  destroy(): void {
    this.stopCleanupTimer();
    this.clear();
  }

  // ============================================
  // 私有方法
  // ============================================

  /**
   * 检查是否需要淘汰
   */
  private needsEviction(additionalMemory: number): boolean {
    // 检查条目数量
    if (this.cache.size >= this.config.maxEntries) {
      return true;
    }

    // 检查内存使用
    if (this.currentMemoryUsage + additionalMemory > this.config.maxMemoryBytes) {
      return true;
    }

    return false;
  }

  /**
   * 淘汰一个条目
   * @returns 是否成功淘汰
   */
  private evictOne(): boolean {
    if (this.cache.size === 0) {
      return false;
    }

    // 计算每个条目的淘汰优先级
    let lowestScore = Infinity;
    let keyToEvict: string | null = null;

    for (const [key, entry] of this.cache) {
      const score = this.calculateRetentionScore(entry);
      if (score < lowestScore) {
        lowestScore = score;
        keyToEvict = key;
      }
    }

    if (keyToEvict) {
      this.delete(keyToEvict);
      this.evictions++;
      return true;
    }

    return false;
  }

  /**
   * 计算保留分数（分数越高越应该保留）
   * 
   * 保留分数 = 复杂度权重 × 复杂度 + 访问权重 × 访问热度 - 内存权重 × 内存大小
   */
  private calculateRetentionScore(entry: CacheEntry<V>): number {
    const now = Date.now();
    const age = now - entry.lastAccessedAt;
    
    // 访问热度：基于访问次数和最近访问时间
    // 最近访问的条目热度更高
    const recencyScore = Math.max(0, 1 - age / (this.config.ttlMs || 3600000));
    const accessScore = Math.log2(entry.accessCount + 1) * recencyScore;

    // 复杂度分数：复杂度越高越应该保留（因为重新生成成本高）
    const complexityScore = Math.log2(entry.complexity + 1);

    // 内存惩罚：内存越大越应该淘汰
    const memoryPenalty = entry.memorySize / (1024 * 1024); // MB

    // 综合分数
    const score = 
      this.config.complexityWeight * complexityScore +
      this.config.accessWeight * accessScore -
      0.2 * memoryPenalty;

    return score;
  }

  /**
   * 检查条目是否过期
   */
  private isExpired(entry: CacheEntry<V>): boolean {
    if (this.config.ttlMs === 0) {
      return false;
    }

    const now = Date.now();
    return now - entry.createdAt > this.config.ttlMs;
  }

  /**
   * 启动清理定时器
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupIntervalMs);
  }

  /**
   * 停止清理定时器
   */
  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<LRUCacheConfig>): void {
    const needRestartTimer = 
      config.cleanupIntervalMs !== undefined &&
      config.cleanupIntervalMs !== this.config.cleanupIntervalMs;

    this.config = { ...this.config, ...config };

    if (needRestartTimer) {
      this.stopCleanupTimer();
      if (this.config.cleanupIntervalMs > 0) {
        this.startCleanupTimer();
      }
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): LRUCacheConfig {
    return { ...this.config };
  }
}

