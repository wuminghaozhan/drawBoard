// 工具函数相关导出
export { HistoryManager } from '../history/HistoryManager';
export { ShortcutManager } from '../shortcuts/ShortcutManager';
export { ExportManager } from '../utils/ExportManager';
export { DrawingHandler } from '../handlers/DrawingHandler';

// 便捷工厂函数
import { DrawBoard } from '../DrawBoard';
import type { DrawBoardConfig } from '../DrawBoard';

/**
 * 创建一个新的画板实例
 * @param container - 容器元素
 * @param config - 配置选项
 * @returns DrawBoard实例
 */
export function createDrawBoard(
  container: HTMLCanvasElement | HTMLDivElement, 
  config?: DrawBoardConfig
): DrawBoard {
  return new DrawBoard(container, config);
} 