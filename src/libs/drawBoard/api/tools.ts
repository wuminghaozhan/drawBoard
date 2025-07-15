/**
 * 工具系统 API 导出
 * 
 * 这个模块导出了所有与绘制工具相关的类型和类，
 * 包括工具类型定义、绘制动作接口、运笔配置等
 */

// 工具系统相关导出
export { ToolManager } from '../tools/ToolManager';
export type { ToolType } from '../tools/ToolManager';

export { DrawTool } from '../tools/DrawTool';
export type { DrawAction, PreRenderedCache } from '../tools/DrawTool';
export { PerformanceMode } from '../tools/DrawTool';

export { PenTool } from '../tools/PenTool';
export type { StrokePoint, StrokeConfig } from '../tools/PenTool';

export { RectTool } from '../tools/RectTool';
export { CircleTool } from '../tools/CircleTool';
export { TextTool } from '../tools/TextTool';
export type { TextAction } from '../tools/TextTool';
export { EraserTool } from '../tools/EraserTool';
export { SelectTool } from '../tools/SelectTool'; 