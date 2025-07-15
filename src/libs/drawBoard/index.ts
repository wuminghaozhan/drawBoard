// ============================================
// DrawBoard 画板库 - 主入口文件
// ============================================
/**
 * DrawBoard 是一个功能强大的Canvas画板库
 * 
 * 主要特性：
 * - 支持多种绘制工具（画笔、矩形、圆形、文字、橡皮擦、选择）
 * - 运笔效果系统（压力感应、速度感应、角度感应）
 * - 丰富的预设系统（钢笔、毛笔、粉笔等11种预设）
 * - 历史记录管理（撤销/重做）
 * - 多层Canvas系统
 * - 选择和操作功能
 * - 快捷键支持
 * - 导出功能（PNG、JPEG、剪贴板）
 * 
 * @example
 * ```typescript
 * import { DrawBoard } from '@/libs/drawBoard';
 * 
 * const drawBoard = new DrawBoard(container, {
 *   maxHistorySize: 50,
 *   enableShortcuts: true,
 *   strokeConfig: {
 *     enablePressure: true,
 *     enableVelocity: true
 *   }
 * });
 * ```
 */

// ============================================
// 核心类和接口导出
// ============================================

/** 
 * DrawBoard 主类 - 画板的核心控制器
 * 提供完整的画板功能，包括绘制、工具管理、历史记录等
 */
export { DrawBoard } from './DrawBoard';

/** 
 * DrawBoard 配置接口
 * 定义了画板初始化时的配置选项
 */
export type { DrawBoardConfig } from './DrawBoard';

// ============================================
// 工具系统导出
// ============================================

/** 
 * 工具类型枚举
 * 定义了所有可用的绘制工具类型
 * 'pen' | 'rect' | 'circle' | 'text' | 'eraser' | 'select'
 */
export type { ToolType } from './tools/ToolManager';

/** 
 * 绘制动作接口
 * 定义单次绘制操作的数据结构，包含点坐标、上下文信息等
 */
export type { DrawAction } from './tools/DrawTool';

/** 
 * 性能模式枚举
 * 定义画板的性能优化策略
 */
export { PerformanceMode } from './tools/DrawTool';

/** 
 * 运笔配置接口
 * 定义了画笔工具的运笔效果配置
 */
export type { StrokeConfig } from './tools/PenTool';

/** 
 * 运笔点接口
 * 扩展了基础Point，增加了压力、速度、角度等运笔属性
 */
export type { StrokePoint } from './tools/PenTool';

/** 
 * 运笔预设类型
 * 定义了所有可用的预设类型
 */
export type { StrokePresetType } from './tools/StrokePresets';

/** 
 * 预设系统相关函数
 * 提供预设的获取、搜索、分类等功能
 */
export { 
  /** 获取所有运笔预设 */
  getAllStrokePresets, 
  /** 获取指定类型的预设 */
  getStrokePreset, 
  /** 获取所有预设类型列表 */
  getStrokePresetTypes,
  /** 根据关键词搜索预设 */
  searchStrokePresets,
  /** 按分类获取预设 */
  getPresetsByCategory,
  /** 预设分类常量 */
  PRESET_CATEGORIES
} from './tools/StrokePresets';

// ============================================
// 核心组件导出
// ============================================

/** 
 * Canvas引擎 - 多层Canvas管理器
 * 负责管理多个Canvas层的渲染和交互
 */
export { CanvasEngine } from './core/CanvasEngine';

/** 
 * 点坐标接口
 * 定义了基础的二维坐标点
 */
export type { Point } from './core/CanvasEngine';

/** 
 * 选择框接口
 * 定义了选择区域的矩形框
 */
export type { SelectionBox } from './core/SelectionManager';

// ============================================
// 事件系统导出
// ============================================

/** 
 * 绘制事件接口
 * 定义了绘制过程中的事件数据结构
 */
export type { DrawEvent } from './events/EventManager';

// ============================================
// 工具类导出（供高级用户使用）
// ============================================

/** 画笔工具 - 支持运笔效果的自由绘制工具 */
export { PenTool } from './tools/PenTool';

/** 矩形工具 - 绘制矩形的工具 */
export { RectTool } from './tools/RectTool';

/** 圆形工具 - 绘制圆形的工具 */
export { CircleTool } from './tools/CircleTool';

/** 文字工具 - 添加文字的工具 */
export { TextTool } from './tools/TextTool';

/** 橡皮擦工具 - 擦除内容的工具 */
export { EraserTool } from './tools/EraserTool';

/** 选择工具 - 选择和操作已绘制内容的工具 */
export { SelectTool } from './tools/SelectTool';

/** 绘制工具基类 - 所有工具的基础类 */
export { DrawTool } from './tools/DrawTool';

/** 工具管理器 - 管理所有绘制工具的切换和状态 */
export { ToolManager } from './tools/ToolManager';

// ============================================
// 管理器导出（供高级用户使用）
// ============================================

/** 历史记录管理器 - 管理撤销/重做功能 */
export { HistoryManager } from './history/HistoryManager';

/** 事件管理器 - 处理鼠标、触摸等输入事件 */
export { EventManager } from './events/EventManager';

/** 快捷键管理器 - 管理键盘快捷键 */
export { ShortcutManager } from './shortcuts/ShortcutManager';

/** 导出管理器 - 处理图像导出功能 */
export { ExportManager } from './utils/ExportManager';

/** 选择管理器 - 管理选择区域和选中内容 */
export { SelectionManager } from './core/SelectionManager';

// ============================================
// 便捷工厂函数
// ============================================
import { DrawBoard } from './DrawBoard';
import type { DrawBoardConfig } from './DrawBoard';

/**
 * 创建一个新的画板实例
 * @param container - 容器元素
 * @param config - 配置选项
 * @returns DrawBoard实例
 */
export function createDrawBoard(
  container: HTMLCanvasElement | HTMLDivElement, 
  config?: DrawBoardConfig
) {
  return new DrawBoard(container, config);
}

// ============================================
// 版本信息
// ============================================
export const VERSION = '1.0.0';
export const AUTHOR = 'AI WM';
export const DESCRIPTION = '一个功能强大的Canvas画板库，支持多种绘制工具和运笔效果';

// ============================================
// 默认配置
// ============================================
export const DEFAULT_CONFIG = {
  maxHistorySize: 50,
  enableShortcuts: true,
  strokeConfig: {
    enablePressure: true,
    enableVelocity: true,
    enableAngle: true,
    pressureSensitivity: 0.8,
    velocitySensitivity: 0.6,
    minLineWidth: 1,
    maxLineWidth: 20,
    smoothing: 0.3,
    opacityVariation: true,
    enableBezierSmoothing: true, // 默认启用贝塞尔平滑
    antiAliasLevel: 2 // 中等抗锯齿级别
  }
}; 