/**
 * 缓存基础设施模块
 * 
 * 提供各种缓存实现：
 * - LRUCache: 最近最少使用缓存
 * - CacheFactory: 统一缓存工厂
 * - ComplexityAwareCache: 复杂度感知缓存
 */

export { LRUCache, type LRUCacheConfig } from './LRUCache';
export { 
  CacheFactory, 
  type SimpleCacheConfig,
  type LRUCacheConfig as LRUCacheFactoryConfig,
  type ComplexityAwareCacheConfig,
  type CachePoolStats
} from './CacheFactory';
export { ComplexityAwareCache } from './ComplexityAwareCache';

