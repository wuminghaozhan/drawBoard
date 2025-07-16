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
export type { DrawBoardConfig } from './DrawBoard';

// ============================================
// 工具相关导出
// ============================================
export type { ToolType } from './tools/ToolManager';
export type { DrawTool } from './tools/DrawTool';

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