/**
 * SelectTool 模块导出
 * 
 * 将 SelectTool 拆分为多个子模块，提高代码可维护性
 */

// 核心功能模块
export { HitTestManager } from './HitTestManager';
export { BoxSelectionManager, type SelectionBox } from './BoxSelectionManager';
export { 
  SelectionRenderer, 
  modernSelectionStyle,
  type SelectionStyle,
  type HoverAnchorInfo,
  type Bounds 
} from './SelectionRenderer';

// 缓存和状态管理模块
export { 
  AnchorCacheManager, 
  type AnchorCacheData, 
  type AnchorCacheConfig 
} from './AnchorCacheManager';
export { 
  DragStateManager, 
  type DragState, 
  type DragType, 
  type DragConfig 
} from './DragStateManager';
export { 
  BoundsCacheManager, 
  type Bounds as BoundsCacheBounds, 
  type BoundsCacheConfig 
} from './BoundsCacheManager';
