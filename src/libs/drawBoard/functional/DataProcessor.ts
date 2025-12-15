/**
 * 函数式数据处理模块
 * 
 * 这个模块包含所有纯函数，用于处理绘制数据、状态计算、配置验证等
 * 所有函数都是无副作用的，便于测试和组合
 */

import type { DrawAction } from '../tools/DrawTool';
import type { DrawBoardConfig } from '../types/ConfigTypes';

// ============================================
// 类型定义
// ============================================

export interface Point {
  x: number;
  y: number;
  pressure?: number;
  timestamp: number;
}

export interface ProcessedStroke {
  points: Point[];
  bounds: Bounds;
  complexity: number;
  length: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface HistoryStats {
  totalActions: number;
  memoryUsage: number;
  complexityScore: number;
  averageComplexity: number;
  actionTypes: Record<string, number>;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface StateSnapshot {
  timestamp: number;
  version: string;
  state: any;
}

// ============================================
// 工具函数
// ============================================

/**
 * 管道函数 - 组合多个函数
 */
export const pipe = <T>(...fns: Array<(arg: T) => T>) => 
  (value: T): T => fns.reduce((acc, fn) => fn(acc), value);

/**
 * 组合函数 - 从右到左组合
 */
export const compose = <T>(...fns: Array<(arg: T) => T>) => 
  (value: T): T => fns.reduceRight((acc, fn) => fn(acc), value);

/**
 * 条件函数 - 根据条件选择函数
 */
export const when = <T>(predicate: (value: T) => boolean, fn: (value: T) => T) =>
  (value: T): T => predicate(value) ? fn(value) : value;

// ============================================
// 数据处理函数
// ============================================

/**
 * 处理绘制点数据
 */
export const processStrokeData = (points: Point[]): ProcessedStroke => {
  if (points.length === 0) {
    return {
      points: [],
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 },
      complexity: 0,
      length: 0
    };
  }

  const filteredPoints = filterValidPoints(points);
  const smoothedPoints = smoothPoints(filteredPoints);
  const bounds = calculateBounds(smoothedPoints);
  const complexity = calculateStrokeComplexity(smoothedPoints);
  const length = calculateStrokeLength(smoothedPoints);

  return {
    points: smoothedPoints,
    bounds,
    complexity,
    length
  };
};

/**
 * 过滤有效点
 */
export const filterValidPoints = (points: Point[]): Point[] =>
  points.filter(point => 
    point.pressure !== undefined && 
    point.pressure > 0.1 && 
    !isNaN(point.x) && 
    !isNaN(point.y)
  );

/**
 * 平滑点数据
 */
export const smoothPoints = (points: Point[]): Point[] => {
  if (points.length < 3) return points;

  return points.map((point, index) => {
    if (index === 0 || index === points.length - 1) return point;

    const prev = points[index - 1];
    const next = points[index + 1];

    return {
      x: (prev.x + point.x + next.x) / 3,
      y: (prev.y + point.y + next.y) / 3,
      pressure: point.pressure,
      timestamp: point.timestamp
    };
  });
};

/**
 * 计算边界
 */
export const calculateBounds = (points: Point[]): Bounds => {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
};

/**
 * 计算笔画复杂度
 */
export const calculateStrokeComplexity = (points: Point[]): number => {
  if (points.length < 2) return 0;

  let complexity = 0;
  
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    
    // 距离变化
    const distance = Math.sqrt(
      Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2)
    );
    
    // 压力变化
    const pressureChange = Math.abs((curr.pressure || 0) - (prev.pressure || 0));
    
    // 方向变化
    const angle = Math.atan2(curr.y - prev.y, curr.x - prev.x);
    const prevAngle = i > 1 ? Math.atan2(prev.y - points[i - 2].y, prev.x - points[i - 2].x) : angle;
    const angleChange = Math.abs(angle - prevAngle);
    
    complexity += distance * (1 + pressureChange) * (1 + angleChange);
  }

  return complexity;
};

/**
 * 计算笔画长度
 */
export const calculateStrokeLength = (points: Point[]): number => {
  if (points.length < 2) return 0;

  return points.slice(1).reduce((length, point, index) => {
    const prev = points[index];
    const distance = Math.sqrt(
      Math.pow(point.x - prev.x, 2) + Math.pow(point.y - prev.y, 2)
    );
    return length + distance;
  }, 0);
};

// ============================================
// 历史记录统计函数
// ============================================

/**
 * 计算历史记录统计信息
 */
export const calculateHistoryStats = (history: DrawAction[]): HistoryStats => {
  const totalActions = history.length;
  const memoryUsage = history.reduce((sum, action) => sum + ((action as any).memorySize || 0), 0);
  const complexityScore = history.reduce((sum, action) => sum + ((action as any).complexity || 0), 0);
  const averageComplexity = totalActions > 0 ? complexityScore / totalActions : 0;
  
  const actionTypes = history.reduce((acc, action) => {
    const type = action.type;
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    totalActions,
    memoryUsage,
    complexityScore,
    averageComplexity,
    actionTypes
  };
};

/**
 * 获取指定类型的动作
 */
export const getActionsByType = (history: DrawAction[], type: string): DrawAction[] =>
  history.filter(action => action.type === type);

/**
 * 获取指定时间范围内的动作
 */
export const getActionsByTimeRange = (history: DrawAction[], startTime: number, endTime: number): DrawAction[] =>
  history.filter(action => 
    action.timestamp >= startTime && action.timestamp <= endTime
  );

// ============================================
// 配置验证函数
// ============================================

/**
 * 验证 DrawBoard 配置
 */
export const validateDrawBoardConfig = (config: Partial<DrawBoardConfig>): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 验证历史记录大小
  if (config.maxHistorySize !== undefined) {
    if (config.maxHistorySize < 1) {
      errors.push('maxHistorySize 必须大于 0');
    } else if (config.maxHistorySize > 10000) {
      warnings.push('maxHistorySize 过大可能影响性能');
    }
  }

  // 验证背景色
  if (config.backgroundColor && !isValidColor(config.backgroundColor)) {
    errors.push('backgroundColor 不是有效的颜色值');
  }

  // 验证虚拟图层配置
  if (config.virtualLayerConfig) {
    const layerValidation = validateVirtualLayerConfig(config.virtualLayerConfig);
    errors.push(...layerValidation.errors);
    warnings.push(...layerValidation.warnings);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

/**
 * 验证虚拟图层配置
 */
export const validateVirtualLayerConfig = (config: any): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (config.maxLayers !== undefined && config.maxLayers < 1) {
    errors.push('maxLayers 必须大于 0');
  }

  if (config.maxActionsPerLayer !== undefined && config.maxActionsPerLayer < 1) {
    errors.push('maxActionsPerLayer 必须大于 0');
  }

  return { isValid: errors.length === 0, errors, warnings };
};

/**
 * 验证颜色值
 */
export const isValidColor = (color: string): boolean => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  
  ctx.fillStyle = color;
  return ctx.fillStyle !== '#000000' || color === '#000000';
};

// ============================================
// 状态管理函数
// ============================================

/**
 * 创建状态快照
 */
export const createStateSnapshot = (state: any, version: string = '1.0.0'): StateSnapshot => ({
  timestamp: Date.now(),
  version,
  state: JSON.parse(JSON.stringify(state)) // 深拷贝
});

/**
 * 比较状态是否发生变化
 */
export const hasStateChanged = (oldState: any, newState: any): boolean => {
  try {
    return JSON.stringify(oldState) !== JSON.stringify(newState);
  } catch {
    // 如果序列化失败，认为状态发生了变化
    return true;
  }
};

/**
 * 合并状态
 */
export const mergeState = (baseState: any, partialState: any): any => ({
  ...baseState,
  ...partialState
});

/**
 * 获取状态差异
 */
export const getStateDiff = (oldState: any, newState: any): Record<string, any> => {
  const diff: Record<string, any> = {};
  
  const allKeys = new Set([...Object.keys(oldState), ...Object.keys(newState)]);
  
  for (const key of allKeys) {
    if (oldState[key] !== newState[key]) {
      diff[key] = {
        old: oldState[key],
        new: newState[key]
      };
    }
  }
  
  return diff;
};

// ============================================
// 工具函数
// ============================================

/**
 * 防抖函数
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: ReturnType<typeof setTimeout>;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
};

/**
 * 节流函数
 */
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let lastCall = 0;
  
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      func(...args);
    }
  };
};

/**
 * 记忆化函数
 */
export const memoize = <T extends (...args: any[]) => any>(
  func: T,
  keyGenerator?: (...args: Parameters<T>) => string
): T => {
  const cache = new Map<string, ReturnType<T>>();
  
  return ((...args: Parameters<T>): ReturnType<T> => {
    const key = keyGenerator ? keyGenerator(...args) : JSON.stringify(args);
    
    if (cache.has(key)) {
      return cache.get(key)!;
    }
    
    const result = func(...args);
    cache.set(key, result);
    return result;
  }) as T;
};

// ============================================
// 导出
// ============================================

export default {
  // 工具函数
  pipe,
  compose,
  when,
  debounce,
  throttle,
  memoize,
  
  // 数据处理
  processStrokeData,
  filterValidPoints,
  smoothPoints,
  calculateBounds,
  calculateStrokeComplexity,
  calculateStrokeLength,
  
  // 历史记录
  calculateHistoryStats,
  getActionsByType,
  getActionsByTimeRange,
  
  // 配置验证
  validateDrawBoardConfig,
  validateVirtualLayerConfig,
  isValidColor,
  
  // 状态管理
  createStateSnapshot,
  hasStateChanged,
  mergeState,
  getStateDiff
}; 