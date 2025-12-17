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

// 变换操作模块
export { 
  TransformOperations,
  type TransformResult,
  type BatchTransformResult
} from './TransformOperations';

// 锚点生成模块
export {
  AnchorGenerator,
  type AnchorPoint,
  type AnchorType,
  type AnchorGeneratorConfig,
  type AnchorGeneratorResult,
  type Bounds as AnchorBounds
} from './AnchorGenerator';

// 锚点拖拽处理模块
export {
  AnchorDragHandler,
  type DragHandlerConfig,
  type DragHandlerState,
  type DragResult
} from './AnchorDragHandler';

// 边界框计算模块
export {
  BoundsCalculator,
  boundsCalculator,
  type BoundsCalculatorConfig
} from './BoundsCalculator';

// 鼠标事件处理模块
export {
  getAnchorPointAt,
  isPointInMoveArea,
  determineMouseDownOperation,
  createInitialDragState,
  resetDragState,
  type DragOperationType,
  type DragState as MouseEventDragState,
  type DragStartState,
  type MouseEventContext,
  type AnchorQueryResult
} from './MouseEventHandler';

// 空间选择助手（基于空间索引的选择算法）
export {
  SpatialSelectionHelper
} from './SpatialSelectionHelper';

// 选区浮动工具栏
export {
  SelectionToolbar,
  type SelectionToolbarConfig,
  type SelectionToolbarCallbacks
} from './SelectionToolbar';
