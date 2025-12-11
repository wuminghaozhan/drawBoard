/**
 * 基础设施层统一导出
 * 
 * 提供与业务逻辑无关的通用能力：
 * - cache: 缓存系统
 * - error: 错误处理
 * - events: 事件系统  
 * - performance: 性能优化
 * - logging: 日志系统
 */

// ============================================
// 缓存基础设施
// ============================================
export { 
  LRUCache,
  type LRUCacheConfig,
  type LRUCacheStats
} from './cache/LRUCache';

export { 
  CacheFactory,
  SimpleCache,
  type SimpleCacheConfig,
  type CachePoolStats
} from './cache/CacheFactory';

export { 
  ComplexityAwareCache,
  type ComplexityConfig,
  type ComplexityAwareCacheConfig
} from './cache/ComplexityAwareCache';

// ============================================
// 错误处理基础设施
// ============================================
export { 
  ErrorHandler,
  DrawBoardError,
  DrawBoardErrorCode,
  type ErrorRecoveryStrategy
} from './error/ErrorHandler';

export { 
  DrawBoardErrorConfig,
  type ErrorConfig,
  type ErrorLevel,
  type ErrorCategory
} from './error/ErrorConfig';

export { SafeExecutor } from './error/SafeExecutor';
export { APIErrorHandler, type APIError } from './error/APIErrorHandler';

// ============================================
// 事件基础设施
// ============================================
export { 
  EventBus,
  globalEventBus,
  type DrawBoardEvents,
  type EventHandler,
  type SubscribeOptions
} from './events/EventBus';

export { 
  EventManager,
  type DrawEvent
} from './events/EventManager';

// ============================================
// 性能优化基础设施
// ============================================
export { 
  DirtyRectManager,
  type DirtyRect,
  type DirtyRectConfig,
  type DirtyRectStats,
  type DirtyRectDebugStyle,
  type DirtyRectDebugController
} from './performance/DirtyRectManager';

export { SpatialIndex } from './performance/SpatialIndex';
export { MemoryMonitor, type MemoryStats } from './performance/MemoryMonitor';
export { Throttle, throttle, debounce } from './performance/Throttle';

// ============================================
// 日志基础设施
// ============================================
export { logger, Logger, type LogLevel, type LogConfig } from './logging/Logger';

