/**
 * 文字工具模块导出
 */

export { TextEditingManager } from './TextEditingManager';
export type {
  TextEditingConfig,
  TextEditingState,
  TextCommitEvent,
  TextChangeEvent
} from './TextEditingManager';

export { TextCursorRenderer, TextMeasurer } from './TextCursorRenderer';
export type {
  CursorConfig,
  CursorPosition,
  SelectionRange
} from './TextCursorRenderer';

