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
 * 
 * @example
 * ```typescript
 * import { DrawBoard } from '@/libs/drawBoard';
 * 
 * const drawBoard = new DrawBoard(container, {
 *   maxHistorySize: 50,
 *   enableShortcuts: true
 * });
 * ```
 */

// 导入主要类和接口
import { DrawBoard } from './DrawBoard';
import type { DrawBoardConfig } from './DrawBoard';

// ============================================
// 核心类导出
// ============================================
export { DrawBoard } from './DrawBoard';
export { CanvasEngine } from './core/CanvasEngine';
export { ToolManager } from './tools/ToolManager';
export { ToolFactory } from './tools/ToolFactory';
export { HistoryManager } from './history/HistoryManager';
export { SelectionManager } from './core/SelectionManager';
export { PerformanceManager } from './core/PerformanceManager';
export { ComplexityManager } from './core/ComplexityManager';
export { VirtualLayerManager } from './core/VirtualLayerManager';
export { EventManager } from './events/EventManager';
export { DrawingHandler } from './handlers/DrawingHandler';
export { CursorHandler } from './handlers/CursorHandler';
export { StateHandler } from './handlers/StateHandler';
export { ShortcutManager } from './shortcuts/ShortcutManager';
export { ExportManager } from './utils/ExportManager';

// 工具类导出
export { DrawTool } from './tools/DrawTool';
export { PenToolRefactored } from './tools/PenToolRefactored';
export { RectTool } from './tools/RectTool';
export { CircleTool } from './tools/CircleTool';
export { LineTool } from './tools/LineTool';
export { PolygonTool } from './tools/PolygonTool';
export { TextTool } from './tools/TextTool';
export { EraserTool } from './tools/EraserTool';
export { SelectTool } from './tools/SelectTool';

// 错误处理和资源管理
export { 
  ErrorHandler, 
  DrawBoardError, 
  DrawBoardErrorCode,
  type ErrorRecoveryStrategy 
} from './utils/ErrorHandler';

export { 
  ResourceManager, 
  type DestroyableResource, 
  type ResourceStats 
} from './utils/ResourceManager';

// 类型导出
export type { ToolType } from './tools/DrawTool';
export type { DrawAction, DrawContext } from './tools/DrawTool';
export type { DrawEvent } from './events/EventManager';
export type { DrawBoardState } from './handlers/StateHandler';
export type { PerformanceConfig, MemoryStats } from './core/PerformanceManager';
export type { VirtualLayer, VirtualLayerConfig } from './core/VirtualLayerManager';
export type { ToolMetadata } from './tools/ToolFactory';
export type { StrokeConfig } from './tools/stroke/StrokeTypes';
export type { StrokePresetType } from './tools/StrokePresets';

// ============================================
// 快捷创建函数
// ============================================

/**
 * 创建DrawBoard实例的工厂函数
 */
export function createDrawBoard(
  container: HTMLCanvasElement | HTMLDivElement,
  config?: DrawBoardConfig
): DrawBoard {
  return new DrawBoard(container, config);
} 