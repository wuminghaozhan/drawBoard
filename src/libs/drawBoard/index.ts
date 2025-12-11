// ============================================
// DrawBoard 画板库 - 简化主入口
// ============================================
/**
 * DrawBoard 是一个功能强大的Canvas画板库
 * 
 * 主要特性：
 * - 支持多种绘制工具（画笔、矩形、圆形、文字、橡皮擦、选择）
 * - 运笔效果系统（压力感应、速度感应、角度感应）
 * - 丰富的预设系统（钢笔、毛笔、粉笔等预设）
 * - 历史记录管理（撤销/重做）
 * - 多层Canvas系统
 * - 选择和操作功能
 * - 快捷键支持
 * - 导出功能（PNG、JPEG、剪贴板）
 * - 虚拟图层管理（分组模式/独立模式）
 * 
 * @example
 * ```typescript
 * import { DrawBoard, createDrawBoard } from '@/libs/drawBoard';
 * 
 * // 方式1：直接创建
 * const drawBoard = new DrawBoard(container, {
 *   maxHistorySize: 50,
 *   enableShortcuts: true
 * });
 * 
 * // 方式2：使用工厂函数（推荐，支持单例模式）
 * const drawBoard = createDrawBoard(container, {
 *   maxHistorySize: 50,
 *   enableShortcuts: true
 * });
 * ```
 */

// 导入主要类和接口
import { DrawBoard } from './DrawBoard';
import type { DrawBoardConfig } from './DrawBoard';

// 导入内部使用的类（用于Internal命名空间）
import { DrawingHandler as DrawingHandlerClass } from './handlers/DrawingHandler';
import { CursorHandler as CursorHandlerClass } from './handlers/CursorHandler';
import { StateHandler as StateHandlerClass } from './handlers/StateHandler';

// ============================================
// 公开API - 用户应该使用的接口
// ============================================

/**
 * DrawBoard 主类 - 画板的核心控制器
 * 
 * 这是整个画板系统的门面类，提供统一的公共API接口
 */
export { DrawBoard } from './DrawBoard';

/**
 * 创建DrawBoard实例的工厂函数（推荐使用）
 * 
 * 支持单例模式，确保每个容器只有一个实例
 * 
 * @param container - Canvas容器元素
 * @param config - 配置选项
 * @returns DrawBoard实例
 * 
 * @example
 * ```typescript
 * const drawBoard = createDrawBoard(container, {
 *   maxHistorySize: 100,
 *   virtualLayerConfig: {
 *     mode: 'grouped'
 *   }
 * });
 * ```
 */
export function createDrawBoard(
  container: HTMLCanvasElement | HTMLDivElement,
  config?: DrawBoardConfig
): DrawBoard {
  return DrawBoard.getInstance(container, config);
}

// ============================================
// 核心组件 - 高级用户可能需要
// ============================================

/** Canvas引擎 - 管理多层Canvas的渲染和交互 */
export { CanvasEngine } from './core/CanvasEngine';

/** 工具管理器 - 管理所有绘制工具的切换和状态 */
export { ToolManager } from './tools/ToolManager';

/** 工具工厂 - 创建和管理工具实例 */
export { ToolFactory } from './tools/ToolFactory';

/** 历史记录管理器 - 管理撤销/重做功能 */
export { HistoryManager } from './history/HistoryManager';

/** 选择管理器 - 管理选择区域和选中内容 */
export { SelectionManager } from './core/SelectionManager';

/** 性能管理器 - 管理预渲染缓存和性能优化 */
export { PerformanceManager } from './core/PerformanceManager';

/** 复杂度管理器 - 管理绘制动作的复杂度评分 */
export { ComplexityManager } from './core/ComplexityManager';

/** 虚拟图层管理器 - 管理虚拟图层（支持分组模式和独立模式） */
export { VirtualLayerManager } from './core/VirtualLayerManager';

/** 事件管理器 - 处理鼠标、触摸等输入事件 */
export { EventManager } from './infrastructure/events/EventManager';

/** 快捷键管理器 - 管理键盘快捷键 */
export { ShortcutManager } from './shortcuts/ShortcutManager';

/** 导出管理器 - 处理图像导出功能 */
export { ExportManager } from './utils/ExportManager';

/** 边界验证器 - 统一的边界检查和约束工具 */
export { BoundsValidator } from './utils/BoundsValidator';
export type { Bounds } from './utils/BoundsValidator';

// ============================================
// 工具系统 - 扩展工具时使用
// ============================================

/** 基础绘制工具类 - 所有工具的基类 */
export { DrawTool } from './tools/DrawTool';

// 具体工具类（用于扩展和自定义）
export { PenToolRefactored } from './tools/PenToolRefactored';
export { RectTool } from './tools/RectTool';
export { CircleTool } from './tools/CircleTool';
export { LineTool } from './tools/LineTool';
export { PolygonTool } from './tools/PolygonTool';
export { TextTool } from './tools/TextTool';
export { EraserTool } from './tools/EraserTool';
export { SelectTool } from './tools/SelectTool';

// ============================================
// 错误处理和资源管理
// ============================================

export { 
  ErrorHandler, 
  DrawBoardError, 
  DrawBoardErrorCode,
  type ErrorRecoveryStrategy 
} from './infrastructure/error/ErrorHandler';

export { 
  ResourceManager, 
  type DestroyableResource, 
  type ResourceStats 
} from './utils/ResourceManager';

// ============================================
// 性能优化基础设施
// ============================================

export { 
  DirtyRectManager,
  type DirtyRectConfig,
  type DirtyRectStats,
  type DirtyRectDebugController
} from './infrastructure/performance/DirtyRectManager';

export { SpatialIndex } from './infrastructure/performance/SpatialIndex';
export { MemoryMonitor, type MemoryStats } from './infrastructure/performance/MemoryMonitor';
export { Throttle, throttle, debounce } from './infrastructure/performance/Throttle';

// 缓存基础设施
export { 
  CacheFactory,
  SimpleCache,
  type SimpleCacheConfig,
  type UnifiedCacheConfig,
  type CacheStats
} from './infrastructure/cache/CacheFactory';

export { 
  LRUCache,
  type LRUCacheConfig,
  type LRUCacheStats
} from './infrastructure/cache/LRUCache';

export { 
  ComplexityAwareCache,
  type ComplexityConfig,
  type ComplexityAwareCacheConfig
} from './infrastructure/cache/ComplexityAwareCache';

// 事件基础设施
export { 
  EventBus,
  globalEventBus,
  type DrawBoardEvents,
  type EventHandler,
  type SubscribeOptions
} from './infrastructure/events/EventBus';

export { 
  SelectToolCoordinator,
  type SelectToolCoordinatorConfig
} from './handlers/SelectToolCoordinator';

// ============================================
// 类型导出 - 完整的类型定义
// ============================================

/** DrawBoard配置接口 */
export type { DrawBoardConfig, OptimizationConfig } from './DrawBoard';

/** 工具类型枚举 */
export type { ToolType } from './tools/DrawTool';

/** 绘制动作接口 */
export type { DrawAction, DrawContext } from './tools/DrawTool';

/** 绘制事件类型 */
export type { DrawEvent } from './infrastructure/events/EventManager';

/** DrawBoard状态接口 */
export type { DrawBoardState } from './handlers/StateHandler';

/** 性能配置和统计 */
export type { PerformanceConfig, MemoryStats } from './core/PerformanceManager';

/** 虚拟图层相关类型 */
export type { 
  VirtualLayer, 
  VirtualLayerConfig,
  VirtualLayerMode 
} from './core/VirtualLayerManager';

/** 工具元数据 */
export type { ToolMetadata } from './tools/ToolFactory';

/** 运笔配置 */
export type { StrokeConfig } from './tools/stroke/StrokeTypes';

/** 运笔预设类型 */
export type { StrokePresetType } from './tools/StrokePresets';

// ============================================
// 内部API - 仅用于高级场景和内部实现
// ============================================

/**
 * 内部API对象（修复 erasableSyntaxOnly 错误，不使用 namespace）
 * 
 * 这些类主要用于DrawBoard内部实现，不建议直接使用
 * 除非你需要深度定制或扩展功能
 */
export const Internal = {
  /** 绘制处理器 - 处理绘制相关逻辑（内部使用） */
  DrawingHandler: DrawingHandlerClass,
  
  /** 鼠标样式处理器 - 处理鼠标样式管理（内部使用） */
  CursorHandler: CursorHandlerClass,
  
  /** 状态处理器 - 处理状态管理（内部使用） */
  StateHandler: StateHandlerClass,
} as const;