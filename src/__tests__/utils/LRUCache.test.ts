import { LRUCache, type LRUCacheConfig } from '../../libs/drawBoard/infrastructure/cache/LRUCache';

describe('LRUCache', () => {
  let cache: LRUCache<string>;

  beforeEach(() => {
    cache = new LRUCache<string>({
      maxEntries: 5,
      maxMemoryBytes: 1024 * 1024, // 1MB
      complexityWeight: 0.3,
      accessWeight: 0.5,
      ttlMs: 0, // 无过期
      cleanupIntervalMs: 0 // 禁用自动清理
    });
  });

  afterEach(() => {
    cache.destroy();
  });

  describe('基本操作', () => {
    it('应该存储和获取值', () => {
      cache.set('key1', 'value1', { complexity: 10, memorySize: 100 });
      expect(cache.get('key1')).toBe('value1');
    });

    it('应该返回 undefined 对于不存在的键', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('应该正确报告缓存大小', () => {
      cache.set('key1', 'value1', { complexity: 10, memorySize: 100 });
      cache.set('key2', 'value2', { complexity: 10, memorySize: 100 });
      expect(cache.size()).toBe(2);
    });

    it('应该正确检查键是否存在', () => {
      cache.set('key1', 'value1', { complexity: 10, memorySize: 100 });
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
    });

    it('应该正确删除条目', () => {
      cache.set('key1', 'value1', { complexity: 10, memorySize: 100 });
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeUndefined();
    });

    it('删除不存在的键应该返回 false', () => {
      expect(cache.delete('nonexistent')).toBe(false);
    });

    it('应该正确清除所有条目', () => {
      cache.set('key1', 'value1', { complexity: 10, memorySize: 100 });
      cache.set('key2', 'value2', { complexity: 10, memorySize: 100 });
      cache.clear();
      expect(cache.size()).toBe(0);
    });
  });

  describe('LRU 淘汰', () => {
    it('当超过最大条目数时应该淘汰条目', () => {
      // 缓存最大 5 个条目
      for (let i = 0; i < 7; i++) {
        cache.set(`key${i}`, `value${i}`, { complexity: 10, memorySize: 100 });
      }
      
      expect(cache.size()).toBeLessThanOrEqual(5);
    });

    it('应该优先淘汰低访问频率的条目', () => {
      // 添加 5 个条目
      for (let i = 0; i < 5; i++) {
        cache.set(`key${i}`, `value${i}`, { complexity: 10, memorySize: 100 });
      }
      
      // 频繁访问某些条目
      for (let i = 0; i < 10; i++) {
        cache.get('key0');
        cache.get('key1');
      }
      
      // 添加新条目，触发淘汰
      cache.set('key5', 'value5', { complexity: 10, memorySize: 100 });
      
      // key0 和 key1 应该被保留（访问频率高）
      expect(cache.has('key0')).toBe(true);
      expect(cache.has('key1')).toBe(true);
    });

    it('应该优先淘汰低复杂度的条目', () => {
      // 添加不同复杂度的条目
      cache.set('low1', 'value1', { complexity: 1, memorySize: 100 });
      cache.set('low2', 'value2', { complexity: 1, memorySize: 100 });
      cache.set('high1', 'value3', { complexity: 100, memorySize: 100 });
      cache.set('high2', 'value4', { complexity: 100, memorySize: 100 });
      cache.set('high3', 'value5', { complexity: 100, memorySize: 100 });
      
      // 添加新条目，触发淘汰
      cache.set('new1', 'value6', { complexity: 50, memorySize: 100 });
      
      // 高复杂度条目应该被保留
      expect(cache.has('high1')).toBe(true);
      expect(cache.has('high2')).toBe(true);
      expect(cache.has('high3')).toBe(true);
    });
  });

  describe('内存限制', () => {
    it('当超过内存限制时应该淘汰条目', () => {
      const smallMemoryCache = new LRUCache<string>({
        maxEntries: 100,
        maxMemoryBytes: 500, // 500 bytes
        complexityWeight: 0.3,
        accessWeight: 0.5,
        ttlMs: 0,
        cleanupIntervalMs: 0
      });

      // 添加条目，每个 200 bytes
      smallMemoryCache.set('key1', 'value1', { complexity: 10, memorySize: 200 });
      smallMemoryCache.set('key2', 'value2', { complexity: 10, memorySize: 200 });
      smallMemoryCache.set('key3', 'value3', { complexity: 10, memorySize: 200 });
      
      // 应该触发淘汰
      expect(smallMemoryCache.size()).toBeLessThan(3);
      
      smallMemoryCache.destroy();
    });
  });

  describe('TTL 过期', () => {
    it('过期的条目应该被移除', async () => {
      const ttlCache = new LRUCache<string>({
        maxEntries: 100,
        maxMemoryBytes: 1024 * 1024,
        complexityWeight: 0.3,
        accessWeight: 0.5,
        ttlMs: 100, // 100ms 过期
        cleanupIntervalMs: 0
      });

      ttlCache.set('key1', 'value1', { complexity: 10, memorySize: 100 });
      
      expect(ttlCache.get('key1')).toBe('value1');
      
      // 等待过期
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(ttlCache.get('key1')).toBeUndefined();
      
      ttlCache.destroy();
    });
  });

  describe('统计信息', () => {
    it('应该正确追踪命中和未命中', () => {
      cache.set('key1', 'value1', { complexity: 10, memorySize: 100 });
      
      // 命中
      cache.get('key1');
      cache.get('key1');
      
      // 未命中
      cache.get('nonexistent');
      
      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(2/3, 2);
    });

    it('应该正确报告内存使用', () => {
      cache.set('key1', 'value1', { complexity: 10, memorySize: 100 });
      cache.set('key2', 'value2', { complexity: 10, memorySize: 200 });
      
      const stats = cache.getStats();
      expect(stats.memoryUsage).toBe(300);
    });

    it('应该正确计算平均复杂度', () => {
      cache.set('key1', 'value1', { complexity: 10, memorySize: 100 });
      cache.set('key2', 'value2', { complexity: 30, memorySize: 100 });
      
      const stats = cache.getStats();
      expect(stats.averageComplexity).toBe(20);
    });
  });

  describe('getAll', () => {
    it('应该返回所有缓存的键值对', () => {
      cache.set('key1', 'value1', { complexity: 10, memorySize: 100 });
      cache.set('key2', 'value2', { complexity: 10, memorySize: 100 });
      
      const all = cache.getAll();
      expect(all.length).toBe(2);
      expect(all.map(([k]) => k)).toContain('key1');
      expect(all.map(([k]) => k)).toContain('key2');
    });
  });

  describe('forEach', () => {
    it('应该遍历所有条目', () => {
      cache.set('key1', 'value1', { complexity: 10, memorySize: 100 });
      cache.set('key2', 'value2', { complexity: 10, memorySize: 100 });
      
      const keys: string[] = [];
      cache.forEach((value, key) => {
        keys.push(key);
      });
      
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
    });
  });

  describe('edge cases', () => {
    it('应该处理相同键的更新', () => {
      cache.set('key1', 'value1', { complexity: 10, memorySize: 100 });
      cache.set('key1', 'value2', { complexity: 20, memorySize: 200 });
      
      expect(cache.get('key1')).toBe('value2');
      expect(cache.size()).toBe(1);
    });

    it('应该处理零复杂度', () => {
      cache.set('key1', 'value1', { complexity: 0, memorySize: 100 });
      expect(cache.get('key1')).toBe('value1');
    });

    it('应该处理零内存大小', () => {
      cache.set('key1', 'value1', { complexity: 10, memorySize: 0 });
      expect(cache.get('key1')).toBe('value1');
    });
  });
});

