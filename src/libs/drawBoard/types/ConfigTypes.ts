/**
 * 配置相关类型定义
 * 
 * 独立文件以避免循环依赖
 */

import type { VirtualLayerMode } from '../core/VirtualLayerManager';
import type { PerformanceConfig } from '../core/PerformanceManager';
import type { StrokeConfig } from '../tools/stroke/StrokeTypes';

/**
 * 渲染优化配置接口
 */
export interface OptimizationConfig {
  /** 
   * 是否启用脏矩形优化
   * 启用后，拖拽/变换时只重绘变化的区域
   * @default true
   */
  enableDirtyRect?: boolean;
  
  /** 
   * 是否启用动态图层拆分
   * 启用后，选择元素时会将 draw 层拆分为 bottom/selected/top 三层
   * 注意：此功能会增加内存占用和初始化开销，一般不需要启用
   * @default false
   */
  enableDynamicLayerSplit?: boolean;
  
  /**
   * 动态拆分阈值：只有当 bottom/top 层元素数量超过此值时才启用拆分
   * 仅在 enableDynamicLayerSplit 为 true 时生效
   * @default 100
   */
  dynamicSplitThreshold?: number;
}

/**
 * DrawBoard 配置接口
 * 定义了画板初始化时的各种配置选项
 */
export interface DrawBoardConfig {
  /** 历史记录最大数量，默认为50 */
  maxHistorySize?: number;
  /** 是否启用快捷键，默认为true */
  enableShortcuts?: boolean;
  /** 画板背景色，默认为透明 */
  backgroundColor?: string;
  /** 是否启用触摸支持，默认为true */
  enableTouch?: boolean;
  /** 运笔效果配置 */
  strokeConfig?: Partial<StrokeConfig>;
  /** 性能配置 */
  performanceConfig?: Partial<PerformanceConfig>;
  /** 
   * 渲染优化配置
   * 控制脏矩形算法和动态图层拆分等优化策略
   */
  optimizationConfig?: OptimizationConfig;
  /** 虚拟图层配置 */
  virtualLayerConfig?: {
    /** 虚拟图层模式，默认为单图层对应单个动作 */
    mode?: VirtualLayerMode;
    /** 最大图层数量，默认为50 */
    maxLayers?: number;
    /** 默认图层名称，默认为'虚拟图层' */
    defaultLayerName?: string;
    /** 是否自动创建图层，默认为true */
    autoCreateLayer?: boolean;
    /** 每个图层最大动作数，默认为1000 */
    maxActionsPerLayer?: number;
    /** 清理间隔，默认为100次操作 */
    cleanupInterval?: number;
  };
}

