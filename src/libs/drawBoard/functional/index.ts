/**
 * 函数式编程模块入口
 * 
 * 这个模块提供了 DrawBoard 中所有函数式编程相关的功能
 * 包括数据处理、配置管理、状态管理等纯函数操作
 */

// ============================================
// 核心函数式模块
// ============================================

export * from './DataProcessor';
export * from './ConfigManager';
export { 
  updateState,
  updateStateDeep,
  updateStateWhen,
  batchUpdateState,
  computeDrawingStats,
  computePerformanceStats,
  computeToolStats,
  createMemoizedSelector,
  combineSelectors,
  createStateHistory,
  addToHistory,
  undoState,
  redoState,
  canUndo,
  canRedo,
  deepEqual,
  validateState,
  createStatePipeline,
  createConditionalTransform,
  mapState,
  filterState,
  restoreStateSnapshot,
  compareSnapshots
} from './StateManager';

// ============================================
// 默认导出
// ============================================

import DataProcessor from './DataProcessor';
import ConfigManager from './ConfigManager';
import StateManager from './StateManager';

export default {
  // 数据处理
  data: DataProcessor,
  
  // 配置管理
  config: ConfigManager,
  
  // 状态管理
  state: StateManager,
  
  // 便捷方法
  pipe: DataProcessor.pipe,
  compose: DataProcessor.compose,
  when: DataProcessor.when,
  memoize: DataProcessor.memoize,
  debounce: DataProcessor.debounce,
  throttle: DataProcessor.throttle
};

// ============================================
// 类型导出
// ============================================

export type {
  // 数据处理类型
  Point,
  ProcessedStroke,
  Bounds,
  HistoryStats,
  ValidationResult,
  StateSnapshot
} from './DataProcessor';

export type {
  // 配置管理类型
  DefaultConfigs,
  ConfigPreset,
  ConfigDiff
} from './ConfigManager';

export type {
  // 状态管理类型
  StateUpdate,
  StateHistory,
  StateSelector,
  StateComputed
} from './StateManager'; 