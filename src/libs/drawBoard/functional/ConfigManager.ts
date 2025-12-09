/**
 * 函数式配置管理模块
 * 
 * 这个模块负责处理所有配置相关的纯函数操作
 * 包括默认配置生成、配置验证、配置合并等
 */

import type { DrawBoardConfig } from '../DrawBoard';
import type { StrokeConfig } from '../tools/stroke/StrokeTypes';
import type { PerformanceConfig } from '../core/PerformanceManager';
import { PerformanceMode } from '../core/PerformanceManager';
import type { VirtualLayerConfig, VirtualLayerMode } from '../core/VirtualLayerManager';
import { validateDrawBoardConfig } from './DataProcessor';
import type { ValidationResult } from './DataProcessor';

// ============================================
// 类型定义
// ============================================

export interface DefaultConfigs {
  drawBoard: DrawBoardConfig;
  stroke: StrokeConfig;
  performance: PerformanceConfig;
  virtualLayer: VirtualLayerConfig;
}

export interface ConfigPreset {
  name: string;
  description: string;
  config: Partial<DrawBoardConfig>;
}

export interface ConfigDiff {
  added: Record<string, any>;
  removed: Record<string, any>;
  changed: Record<string, { old: any; new: any }>;
}

// ============================================
// 默认配置
// ============================================

/**
 * 获取默认配置
 */
export const getDefaultConfigs = (): DefaultConfigs => ({
  drawBoard: {
    maxHistorySize: 50,
    enableShortcuts: true,
    backgroundColor: 'transparent',
    enableTouch: true,
    strokeConfig: getDefaultStrokeConfig(),
    performanceConfig: getDefaultPerformanceConfig(),
    virtualLayerConfig: getDefaultVirtualLayerConfig()
  },
  stroke: getDefaultStrokeConfig(),
  performance: getDefaultPerformanceConfig(),
  virtualLayer: getDefaultVirtualLayerConfig()
});

/**
 * 获取默认笔画配置
 */
export const getDefaultStrokeConfig = (): StrokeConfig => ({
  enablePressure: true,
  enableVelocity: true,
  enableAngle: true,
  pressureSensitivity: 0.8,
  velocitySensitivity: 0.7,
  minLineWidth: 1,
  maxLineWidth: 20,
  smoothing: 0.3,
  opacityVariation: true,
  enableBezierSmoothing: true,
  antiAliasLevel: 2
});

/**
 * 获取默认性能配置
 */
export const getDefaultPerformanceConfig = (): PerformanceConfig => ({
  mode: PerformanceMode.AUTO,
  maxCacheMemoryMB: 50,
  maxCacheItems: 100,
  complexityThreshold: 1000,
  enableMemoryMonitoring: true,
  memoryPressureThreshold: 0.8,
  enableCaching: true,
  enableBatching: true
});

/**
 * 获取默认虚拟图层配置
 */
export const getDefaultVirtualLayerConfig = (): VirtualLayerConfig => ({
  mode: 'individual' as VirtualLayerMode,
  maxLayers: 50,
  defaultLayerName: '虚拟图层',
  maxActionsPerLayer: 1000,
});

// ============================================
// 配置预设
// ============================================

/**
 * 获取配置预设
 */
export const getConfigPresets = (): ConfigPreset[] => [
  {
    name: 'default',
    description: '默认配置 - 平衡性能和功能',
    config: {}
  },
  {
    name: 'performance',
    description: '性能优先 - 适合复杂绘制',
    config: {
      maxHistorySize: 30,
      performanceConfig: {
        enableCaching: true,
        maxCacheItems: 200,
        maxCacheMemoryMB: 100,
        complexityThreshold: 500,
        enableBatching: true,
        mode: PerformanceMode.AUTO
      },
      strokeConfig: {
        smoothing: 0.1,
        maxLineWidth: 10
      }
    }
  },
  {
    name: 'quality',
    description: '质量优先 - 适合精细绘制',
    config: {
      maxHistorySize: 100,
      performanceConfig: {
        enableCaching: true,
        maxCacheItems: 50,
        maxCacheMemoryMB: 200,
        complexityThreshold: 2000,
        enableBatching: false,
        mode: PerformanceMode.BALANCED
      },
      strokeConfig: {
        smoothing: 0.5,
        maxLineWidth: 50,
        pressureSensitivity: 1.0
      }
    }
  },
  {
    name: 'mobile',
    description: '移动端优化 - 适合触摸设备',
    config: {
      enableTouch: true,
      maxHistorySize: 20,
      performanceConfig: {
        enableCaching: true,
        maxCacheItems: 30,
        maxCacheMemoryMB: 25,
        complexityThreshold: 300,
        enableBatching: true,
        mode: PerformanceMode.HIGH_PERFORMANCE
      },
      strokeConfig: {
        smoothing: 0.2,
        maxLineWidth: 15,
        pressureSensitivity: 0.6
      }
    }
  }
];

/**
 * 根据名称获取预设配置
 */
export const getConfigPresetByName = (name: string): ConfigPreset | null => {
  const presets = getConfigPresets();
  return presets.find(preset => preset.name === name) || null;
};

// ============================================
// 配置操作函数
// ============================================

/**
 * 合并配置
 */
export const mergeConfig = (
  baseConfig: Partial<DrawBoardConfig>,
  overrideConfig: Partial<DrawBoardConfig>
): DrawBoardConfig => {
  const defaults = getDefaultConfigs().drawBoard;
  
  return {
    ...defaults,
    ...baseConfig,
    ...overrideConfig,
    strokeConfig: {
      ...defaults.strokeConfig,
      ...baseConfig.strokeConfig,
      ...overrideConfig.strokeConfig
    },
    performanceConfig: {
      ...defaults.performanceConfig,
      ...baseConfig.performanceConfig,
      ...overrideConfig.performanceConfig
    },
    virtualLayerConfig: {
      ...defaults.virtualLayerConfig,
      ...baseConfig.virtualLayerConfig,
      ...overrideConfig.virtualLayerConfig
    }
  };
};

/**
 * 深度合并配置
 */
export const deepMergeConfig = (
  baseConfig: Partial<DrawBoardConfig>,
  overrideConfig: Partial<DrawBoardConfig>
): DrawBoardConfig => {
  const defaults = getDefaultConfigs().drawBoard;
  
  const deepMerge = (base: any, override: any): any => {
    if (override === undefined) return base;
    if (base === undefined) return override;
    if (typeof override !== 'object' || override === null) return override;
    if (Array.isArray(override)) return override;
    
    const result = { ...base };
    for (const key in override) {
      if (override.hasOwnProperty(key)) {
        result[key] = deepMerge(base[key], override[key]);
      }
    }
    return result;
  };
  
  return deepMerge(defaults, deepMerge(baseConfig, overrideConfig));
};

/**
 * 验证并清理配置
 */
export const validateAndCleanConfig = (config: Partial<DrawBoardConfig>): {
  config: DrawBoardConfig;
  validation: ValidationResult;
} => {
  const validation = validateDrawBoardConfig(config);
  
  if (!validation.isValid) {
    // 如果配置无效，使用默认配置
    return {
      config: getDefaultConfigs().drawBoard,
      validation
    };
  }
  
  // 合并配置，确保所有必需字段都存在
  const cleanedConfig = mergeConfig({}, config);
  
  return {
    config: cleanedConfig,
    validation
  };
};

/**
 * 比较配置差异
 */
export const compareConfigs = (
  oldConfig: DrawBoardConfig,
  newConfig: DrawBoardConfig
): ConfigDiff => {
  const added: Record<string, any> = {};
  const removed: Record<string, any> = {};
  const changed: Record<string, { old: any; new: any }> = {};
  
  const allKeys = new Set([
    ...Object.keys(oldConfig),
    ...Object.keys(newConfig)
  ]);
  
  for (const key of allKeys) {
    const oldValue = oldConfig[key as keyof DrawBoardConfig];
    const newValue = newConfig[key as keyof DrawBoardConfig];
    
    if (oldValue === undefined && newValue !== undefined) {
      added[key] = newValue;
    } else if (oldValue !== undefined && newValue === undefined) {
      removed[key] = oldValue;
    } else if (oldValue !== newValue) {
      changed[key] = { old: oldValue, new: newValue };
    }
  }
  
  return { added, removed, changed };
};

/**
 * 创建配置快照
 */
export const createConfigSnapshot = (config: DrawBoardConfig): {
  timestamp: number;
  config: DrawBoardConfig;
  hash: string;
} => {
  const configString = JSON.stringify(config);
  const hash = btoa(configString).slice(0, 16); // 简单的哈希
  
  return {
    timestamp: Date.now(),
    config: JSON.parse(configString), // 深拷贝
    hash
  };
};

/**
 * 检查配置是否有效
 */
export const isConfigValid = (config: Partial<DrawBoardConfig>): boolean => {
  const validation = validateDrawBoardConfig(config);
  return validation.isValid;
};

/**
 * 获取配置建议
 */
export const getConfigSuggestions = (config: Partial<DrawBoardConfig>): string[] => {
  const suggestions: string[] = [];
  
  // 检查历史记录大小
  if (config.maxHistorySize !== undefined) {
    if (config.maxHistorySize < 10) {
      suggestions.push('建议将 maxHistorySize 设置为至少 10，以确保基本的撤销功能');
    } else if (config.maxHistorySize > 1000) {
      suggestions.push('maxHistorySize 过大可能影响性能，建议设置为 100-500');
    }
  }
  
  // 检查性能配置
  if (config.performanceConfig) {
    const perf = config.performanceConfig;
    if (perf.maxCacheMemoryMB && perf.maxCacheMemoryMB < 10) {
      suggestions.push('内存限制过低可能影响绘制性能，建议设置为至少 10MB');
    }
    if (perf.maxCacheItems && perf.maxCacheItems > 500) {
      suggestions.push('缓存大小过大可能占用过多内存，建议设置为 50-200');
    }
  }
  
  // 检查笔画配置
  if (config.strokeConfig) {
    const stroke = config.strokeConfig;
    if (stroke.maxLineWidth && stroke.minLineWidth && stroke.maxLineWidth < stroke.minLineWidth) {
      suggestions.push('maxLineWidth 应该大于 minLineWidth');
    }
    if (stroke.pressureSensitivity && (stroke.pressureSensitivity < 0 || stroke.pressureSensitivity > 1)) {
      suggestions.push('pressureSensitivity 应该在 0-1 之间');
    }
  }
  
  return suggestions;
};

/**
 * 优化配置
 */
export const optimizeConfig = (config: DrawBoardConfig): DrawBoardConfig => {
  const optimized = { ...config };
  
  // 根据设备性能优化
  const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const memory = (navigator as any).deviceMemory || 4; // GB
  
      if (isMobile) {
      optimized.maxHistorySize = Math.min(optimized.maxHistorySize || 50, 30);
      if (optimized.performanceConfig) {
        optimized.performanceConfig.maxCacheMemoryMB = Math.min(
          optimized.performanceConfig.maxCacheMemoryMB || 50,
          25
        );
        optimized.performanceConfig.maxCacheItems = Math.min(
          optimized.performanceConfig.maxCacheItems || 100,
          30
        );
      }
    }
  
  // 根据内存大小优化
  if (memory < 4) {
    optimized.performanceConfig = {
      ...optimized.performanceConfig,
      maxCacheMemoryMB: Math.min(
        optimized.performanceConfig?.maxCacheMemoryMB || 50,
        25
      ),
      maxCacheItems: Math.min(optimized.performanceConfig?.maxCacheItems || 100, 50)
    };
  }
  
  return optimized;
};

// ============================================
// 导出
// ============================================

export default {
  // 默认配置
  getDefaultConfigs,
  getDefaultStrokeConfig,
  getDefaultPerformanceConfig,
  getDefaultVirtualLayerConfig,
  
  // 配置预设
  getConfigPresets,
  getConfigPresetByName,
  
  // 配置操作
  mergeConfig,
  deepMergeConfig,
  validateAndCleanConfig,
  compareConfigs,
  createConfigSnapshot,
  isConfigValid,
  getConfigSuggestions,
  optimizeConfig
}; 