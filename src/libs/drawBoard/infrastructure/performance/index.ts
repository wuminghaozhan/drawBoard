/**
 * 性能优化基础设施模块
 * 
 * 提供各种性能优化工具：
 * - DirtyRectManager: 脏矩形管理器
 * - SpatialIndex: 空间索引（四叉树）
 * - MemoryMonitor: 内存监控
 * - Throttle: 节流工具
 */

export { 
  DirtyRectManager,
  type DirtyRect,
  type DirtyRectStats,
  type DirtyRectDebugStyle,
  type DirtyRectDebugController
} from './DirtyRectManager';

export { SpatialIndex } from './SpatialIndex';
export { MemoryMonitor, type MemoryStats } from './MemoryMonitor';
export { Throttle, throttle, debounce } from './Throttle';

