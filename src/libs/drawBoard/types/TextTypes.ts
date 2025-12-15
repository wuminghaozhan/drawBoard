/**
 * 文字相关类型定义
 * 
 * 独立文件以避免循环依赖
 */

import type { DrawAction } from '../tools/DrawTool';

/**
 * 文字 Action 接口
 */
export interface TextAction extends DrawAction {
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  textAlign?: CanvasTextAlign;
  textBaseline?: CanvasTextBaseline;
  /** 文本框宽度（像素），如果设置则启用自动换行 */
  width?: number;
  /** 文本框高度（像素），可选 */
  height?: number;
  /** 行高倍数，默认 1.2 */
  lineHeight?: number;
}

/**
 * 文字工具事件类型
 */
export type TextToolEventType = 'textCreated' | 'textUpdated' | 'editingStarted' | 'editingEnded';

/**
 * 文字工具事件处理器
 */
export type TextToolEventHandler = (event: { 
  type: TextToolEventType; 
  action?: TextAction; 
  actionId?: string | null 
}) => void;

