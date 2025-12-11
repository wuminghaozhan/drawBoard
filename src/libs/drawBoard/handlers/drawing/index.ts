/**
 * DrawingHandler 子模块导出
 * 
 * 将 DrawingHandler 拆分为多个子模块，提高代码可维护性
 */

// 离屏缓存管理
export { 
  OffscreenCacheManager,
  type OffscreenCacheConfig 
} from './OffscreenCacheManager';

// Action 渲染器
export { 
  ActionRenderer,
  type ActionRendererConfig 
} from './ActionRenderer';

// 脏矩形处理器
export { 
  DirtyRectHandler,
  type DirtyRectHandlerConfig,
  type RedrawCallback
} from './DirtyRectHandler';

