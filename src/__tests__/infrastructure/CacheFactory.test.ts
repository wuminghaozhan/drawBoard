/**
 * CacheFactory 单元测试
 */

import { 
  CacheFactory, 
  SimpleCache
} from '../../libs/drawBoard/infrastructure/cache/CacheFactory';
import { LRUCache } from '../../libs/drawBoard/infrastructure/cache/LRUCache';

describe('CacheFactory', () => {
  afterEach(() => {
    CacheFactory.clearPool();
  });

  describe('createSimple', () => {
    it('应该创建简单缓存', () => {
      const cache = CacheFactory.createSimple<string, number>({
        maxSize: 10
      });

      expect(cache).toBeInstanceOf(SimpleCache);
    });

    it('简单缓存应该正常工作', () => {
      const cache = CacheFactory.createSimple<string, number>({
        maxSize: 3
      });

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBe(2);
      expect(cache.get('c')).toBe(3);
    });

    it('简单缓存应该限制大小', () => {
      const cache = CacheFactory.createSimple<string, number>({
        maxSize: 2
      });

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3); // 超过限制

      expect(cache.size()).toBeLessThanOrEqual(2);
    });
  });

  describe('createLRU', () => {
    it('应该创建 LRU 缓存', () => {
      const cache = CacheFactory.createLRU<number>({
        maxEntries: 10
      });

      expect(cache).toBeInstanceOf(LRUCache);
    });

    it('LRU 缓存应该正确淘汰最久未使用的项', () => {
      const cache = CacheFactory.createLRU<number>({
        maxEntries: 3,
        maxMemoryBytes: 100 * 1024 * 1024 // 100MB - 大内存限制，不触发内存淘汰
      });

      cache.set('a', 1, { complexity: 1, memorySize: 10 });
      cache.set('b', 2, { complexity: 1, memorySize: 10 });
      cache.set('c', 3, { complexity: 1, memorySize: 10 });
      
      // 访问 'a' 使其变为最近使用
      cache.get('a');
      
      // 添加新项，应该淘汰 'b'（最久未使用）
      cache.set('d', 4, { complexity: 1, memorySize: 10 });

      expect(cache.get('a')).toBe(1); // 仍然存在
      expect(cache.get('b')).toBeUndefined(); // 被淘汰
      expect(cache.get('c')).toBe(3);
      expect(cache.get('d')).toBe(4);
    });
  });

  describe('createForScenario', () => {
    it('应该为 bounds 场景创建缓存', () => {
      const cache = CacheFactory.createForScenario('bounds');
      expect(cache).toBeDefined();
    });

    it('应该为 anchors 场景创建缓存', () => {
      const cache = CacheFactory.createForScenario('anchors');
      expect(cache).toBeDefined();
    });

    it('应该为 actions 场景创建缓存', () => {
      const cache = CacheFactory.createForScenario('actions');
      expect(cache).toBeDefined();
    });

    it('应该为 layers 场景创建缓存', () => {
      const cache = CacheFactory.createForScenario('layers');
      expect(cache).toBeDefined();
    });

    it('应该为 general 场景创建缓存', () => {
      const cache = CacheFactory.createForScenario('general');
      expect(cache).toBeDefined();
    });
  });

  describe('缓存池', () => {
    it('getOrCreate 应该返回相同实例', () => {
      const factory = () => CacheFactory.createSimple<string, number>({ maxSize: 10 });
      
      const cache1 = CacheFactory.getOrCreate('test-cache', factory);
      const cache2 = CacheFactory.getOrCreate('test-cache', factory);

      expect(cache1).toBe(cache2);
    });

    it('不同 key 应该返回不同实例', () => {
      const factory = () => CacheFactory.createSimple<string, number>({ maxSize: 10 });
      
      const cache1 = CacheFactory.getOrCreate('cache-1', factory);
      const cache2 = CacheFactory.getOrCreate('cache-2', factory);

      expect(cache1).not.toBe(cache2);
    });

    it('clearPool 应该清除所有缓存实例', () => {
      const factory = () => CacheFactory.createSimple<string, number>({ maxSize: 10 });
      
      CacheFactory.getOrCreate('cache-1', factory);
      CacheFactory.getOrCreate('cache-2', factory);

      const statsBefore = CacheFactory.getPoolStats();
      expect(statsBefore.poolSize).toBe(2);

      CacheFactory.clearPool();

      const statsAfter = CacheFactory.getPoolStats();
      expect(statsAfter.poolSize).toBe(0);
    });

    it('getPoolStats 应该返回正确的统计信息', () => {
      CacheFactory.getOrCreate('cache-a', () => 
        CacheFactory.createSimple<string, number>({ maxSize: 10 })
      );
      CacheFactory.getOrCreate('cache-b', () => 
        CacheFactory.createLRU<number>({ maxEntries: 10 })
      );

      const stats = CacheFactory.getPoolStats();
      
      expect(stats.poolSize).toBe(2);
      
      const keys = stats.caches.map(c => c.key);
      expect(keys).toContain('cache-a');
      expect(keys).toContain('cache-b');
    });
  });

  describe('SimpleCache 详细测试', () => {
    let cache: SimpleCache<string, number>;

    beforeEach(() => {
      cache = new SimpleCache<string, number>({ maxSize: 5 });
    });

    it('应该支持 has 方法', () => {
      cache.set('key', 123);
      
      expect(cache.has('key')).toBe(true);
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('应该支持 delete 方法', () => {
      cache.set('key', 123);
      expect(cache.has('key')).toBe(true);

      cache.delete('key');
      expect(cache.has('key')).toBe(false);
    });

    it('应该支持 clear 方法', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      expect(cache.size()).toBe(2);

      cache.clear();
      expect(cache.size()).toBe(0);
    });

    it('应该支持 TTL 过期', async () => {
      const ttlCache = new SimpleCache<string, number>({ 
        maxSize: 10, 
        ttlMs: 50 // 50ms 过期
      });

      ttlCache.set('key', 123);
      expect(ttlCache.get('key')).toBe(123);

      // 等待过期
      await new Promise(resolve => setTimeout(resolve, 60));

      expect(ttlCache.get('key')).toBeUndefined();
    });
  });

  describe('createBoundsCache', () => {
    it('应该创建边界框缓存', () => {
      const cache = CacheFactory.createBoundsCache(100);
      
      cache.set('action-1', { x: 0, y: 0, width: 100, height: 100 });
      
      const bounds = cache.get('action-1');
      expect(bounds).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    });
  });

  describe('createAnchorCache', () => {
    it('应该创建锚点缓存', () => {
      const cache = CacheFactory.createAnchorCache<{ x: number; y: number }>(50);
      
      cache.set('anchor-1', { x: 10, y: 20 });
      
      const anchor = cache.get('anchor-1');
      expect(anchor).toEqual({ x: 10, y: 20 });
    });
  });

  describe('removeFromPool', () => {
    it('应该能从池中移除缓存', () => {
      CacheFactory.getOrCreate('test-cache', () => 
        CacheFactory.createSimple<string, number>({ maxSize: 10 })
      );

      expect(CacheFactory.getPoolStats().poolSize).toBe(1);

      const removed = CacheFactory.removeFromPool('test-cache');
      expect(removed).toBe(true);
      expect(CacheFactory.getPoolStats().poolSize).toBe(0);
    });

    it('移除不存在的缓存应该返回 false', () => {
      const removed = CacheFactory.removeFromPool('nonexistent');
      expect(removed).toBe(false);
    });
  });
});
