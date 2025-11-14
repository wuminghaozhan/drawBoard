/**
 * 函数式状态管理模块
 * 
 * 这个模块负责处理所有状态相关的纯函数操作
 * 包括状态更新、状态计算、状态比较等
 */

import type { DrawBoardState } from '../handlers/StateHandler';

import type { ToolType } from '../tools/DrawTool';
import { pipe, when, memoize } from './DataProcessor';

// ============================================
// 类型定义
// ============================================

export interface StateUpdate<T> {
  type: string;
  payload: T;
  timestamp: number;
}

export interface StateHistory<T> {
  past: T[];
  present: T;
  future: T[];
  maxSize: number;
}

export interface StateSelector<T, R> {
  (state: T): R;
  selectorName?: string;
}

export interface StateComputed<T, R> {
  (state: T): R;
  dependencies: string[];
  cacheKey?: string;
}

// ============================================
// 状态更新函数
// ============================================

/**
 * 不可变状态更新
 */
export const updateState = <T extends Record<string, any>>(
  state: T,
  updates: Partial<T>
): T => ({
  ...state,
  ...updates
});

/**
 * 深度不可变状态更新
 */
export const updateStateDeep = <T extends Record<string, any>>(
  state: T,
  path: string[],
  value: any
): T => {
  if (path.length === 0) return value as T;
  
  const [key, ...rest] = path;
  const currentValue = state[key];
  
  if (rest.length === 0) {
    return { ...state, [key]: value };
  }
  
  if (typeof currentValue === 'object' && currentValue !== null) {
    return {
      ...state,
      [key]: updateStateDeep(currentValue, rest, value)
    };
  }
  
  return { ...state, [key]: value };
};

/**
 * 条件状态更新
 */
export const updateStateWhen = <T extends Record<string, any>>(
  state: T,
  predicate: (state: T) => boolean,
  updates: Partial<T>
): T => predicate(state) ? updateState(state, updates) : state;

/**
 * 批量状态更新
 */
export const batchUpdateState = <T extends Record<string, any>>(
  state: T,
  updates: Array<Partial<T>>
): T => {
  return updates.reduce((currentState, update) => {
    return updateState(currentState, update);
  }, state) as T;
};

// ============================================
// 状态计算函数
// ============================================

/**
 * 计算绘制状态统计
 */
export const computeDrawingStats = (state: DrawBoardState) => {
  const { currentTool } = state;
  const history = (state as any).history || [];
  const selectedActions = (state as any).selectedActions || [];
  
  return {
    totalActions: history.length,
    currentTool,
    selectedCount: selectedActions.length,
    hasSelection: selectedActions.length > 0,
    canUndo: history.length > 0,
    canRedo: false, // 需要从历史管理器获取
    memoryUsage: history.reduce((sum: number, action: any) => sum + (action.memorySize || 0), 0)
  };
};

/**
 * 计算性能状态
 */
export const computePerformanceStats = (state: DrawBoardState) => {
  const history = (state as any).history || [];
  const performanceMode = (state as any).performanceMode || 'normal';
  
  const totalComplexity = history.reduce((sum: number, action: any) => sum + (action.complexity || 0), 0);
  const averageComplexity = history.length > 0 ? totalComplexity / history.length : 0;
  
  return {
    totalComplexity,
    averageComplexity,
    performanceMode,
    isHighComplexity: averageComplexity > 1000,
    needsOptimization: averageComplexity > 2000
  };
};

/**
 * 计算工具状态
 */
export const computeToolStats = (state: DrawBoardState) => {
  const { currentTool } = state;
  const history = (state as any).history || [];
  
  const toolUsage = history.reduce((acc: Record<string, number>, action: any) => {
    acc[action.type] = (acc[action.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  return {
    currentTool,
    toolUsage,
    mostUsedTool: Object.entries(toolUsage)
      .sort(([, a], [, b]) => (b as number) - (a as number))[0]?.[0] || 'none',
    totalToolsUsed: Object.keys(toolUsage).length
  };
};

/**
 * 记忆化的状态计算
 */
export const createMemoizedSelector = <T, R>(
  selector: (state: T) => R,
  name?: string
): StateSelector<T, R> => {
  const memoized = memoize(selector, (state) => JSON.stringify(state));
  (memoized as any).selectorName = name || selector.name;
  return memoized;
};

/**
 * 组合状态选择器
 */
export const combineSelectors = <T, R1, R2>(
  selector1: StateSelector<T, R1>,
  selector2: StateSelector<T, R2>
): StateSelector<T, [R1, R2]> => {
  const combined = (state: T): [R1, R2] => [selector1(state), selector2(state)];
  combined.selectorName = `combine(${selector1.selectorName || 'selector1'}, ${selector2.selectorName || 'selector2'})`;
  return combined;
};

// ============================================
// 状态历史管理
// ============================================

/**
 * 创建状态历史
 */
export const createStateHistory = <T>(initialState: T, maxSize: number = 50): StateHistory<T> => ({
  past: [],
  present: initialState,
  future: [],
  maxSize
});

/**
 * 添加状态到历史
 */
export const addToHistory = <T>(history: StateHistory<T>, newState: T): StateHistory<T> => {
  const { past, present, maxSize } = history;
  
  // 如果状态没有变化，直接返回
  if (present === newState) return history;
  
  const newPast = [...past, present].slice(-maxSize);
  
  return {
    past: newPast,
    present: newState,
    future: [], // 清空未来状态
    maxSize
  };
};

/**
 * 撤销状态
 */
export const undoState = <T>(history: StateHistory<T>): StateHistory<T> => {
  const { past, present, future, maxSize } = history;
  
  if (past.length === 0) return history;
  
  const previous = past[past.length - 1];
  const newPast = past.slice(0, -1);
  const newFuture = [present, ...future];
  
  return {
    past: newPast,
    present: previous,
    future: newFuture.slice(0, maxSize),
    maxSize
  };
};

/**
 * 重做状态
 */
export const redoState = <T>(history: StateHistory<T>): StateHistory<T> => {
  const { past, present, future, maxSize } = history;
  
  if (future.length === 0) return history;
  
  const next = future[0];
  const newFuture = future.slice(1);
  const newPast = [...past, present].slice(-maxSize);
  
  return {
    past: newPast,
    present: next,
    future: newFuture,
    maxSize
  };
};

/**
 * 检查是否可以撤销
 */
export const canUndo = <T>(history: StateHistory<T>): boolean => history.past.length > 0;

/**
 * 检查是否可以重做
 */
export const canRedo = <T>(history: StateHistory<T>): boolean => history.future.length > 0;

// ============================================
// 状态比较和验证
// ============================================

/**
 * 深度比较状态
 */
export const deepEqual = (a: any, b: any): boolean => {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  
  if (typeof a === 'object') {
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    
    if (keysA.length !== keysB.length) return false;
    
    return keysA.every(key => deepEqual(a[key], b[key]));
  }
  
  return false;
};

/**
 * 状态差异分析
 */
export const getStateDiff = (oldState: any, newState: any): Record<string, any> => {
  const diff: Record<string, any> = {};
  
  const allKeys = new Set([...Object.keys(oldState), ...Object.keys(newState)]);
  
  for (const key of allKeys) {
    const oldValue = oldState[key];
    const newValue = newState[key];
    
    if (!deepEqual(oldValue, newValue)) {
      diff[key] = {
        old: oldValue,
        new: newValue,
        changed: true
      };
    }
  }
  
  return diff;
};

/**
 * 状态验证
 */
export const validateState = (state: DrawBoardState): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  // 验证必需字段
  if (!state.currentTool) {
    errors.push('currentTool 是必需的');
  }
  
  if (!Array.isArray((state as any).history)) {
    errors.push('history 必须是数组');
  }
  
  if (!Array.isArray((state as any).selectedActions)) {
    errors.push('selectedActions 必须是数组');
  }
  
  // 验证工具类型
  const validTools: ToolType[] = ['pen', 'brush', 'eraser', 'select', 'rect', 'circle', 'line', 'polygon', 'text'];
  if (!validTools.includes(state.currentTool)) {
    errors.push(`无效的工具类型: ${state.currentTool}`);
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

// ============================================
// 状态转换函数
// ============================================

/**
 * 状态转换管道
 */
export const createStatePipeline = <T>(...transforms: Array<(state: T) => T>) =>
  (state: T): T => pipe(...transforms)(state);

/**
 * 条件状态转换
 */
export const createConditionalTransform = <T>(
  predicate: (state: T) => boolean,
  transform: (state: T) => T
) => (state: T): T => when(predicate, transform)(state);

/**
 * 状态映射
 */
export const mapState = <T, R>(state: T, mapper: (state: T) => R): R => mapper(state);

/**
 * 状态过滤
 */
export const filterState = <T>(state: T, predicate: (state: T) => boolean): T | null =>
  predicate(state) ? state : null;

// ============================================
// 状态快照和恢复
// ============================================

/**
 * 创建状态快照
 */
export const createStateSnapshot = <T>(state: T): {
  timestamp: number;
  state: T;
  hash: string;
} => {
  const stateString = JSON.stringify(state);
  const hash = btoa(stateString).slice(0, 16);
  
  return {
    timestamp: Date.now(),
    state: JSON.parse(stateString), // 深拷贝
    hash
  };
};

/**
 * 恢复状态快照
 */
export const restoreStateSnapshot = <T>(snapshot: { state: T }): T => snapshot.state;

/**
 * 比较快照
 */
export const compareSnapshots = <T>(
  snapshot1: { state: T; timestamp: number },
  snapshot2: { state: T; timestamp: number }
): {
  timeDiff: number;
  stateDiff: Record<string, any>;
  hasChanged: boolean;
} => {
  const timeDiff = snapshot2.timestamp - snapshot1.timestamp;
  const stateDiff = getStateDiff(snapshot1.state, snapshot2.state);
  const hasChanged = Object.keys(stateDiff).length > 0;
  
  return { timeDiff, stateDiff, hasChanged };
};

// ============================================
// 导出
// ============================================

export default {
  // 状态更新
  updateState,
  updateStateDeep,
  updateStateWhen,
  batchUpdateState,
  
  // 状态计算
  computeDrawingStats,
  computePerformanceStats,
  computeToolStats,
  createMemoizedSelector,
  combineSelectors,
  
  // 状态历史
  createStateHistory,
  addToHistory,
  undoState,
  redoState,
  canUndo,
  canRedo,
  
  // 状态比较和验证
  deepEqual,
  getStateDiff,
  validateState,
  
  // 状态转换
  createStatePipeline,
  createConditionalTransform,
  mapState,
  filterState,
  
  // 状态快照
  createStateSnapshot,
  restoreStateSnapshot,
  compareSnapshots
}; 