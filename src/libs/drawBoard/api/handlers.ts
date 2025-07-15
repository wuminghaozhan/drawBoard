/**
 * DrawBoard 处理器系统导出
 * 
 * 处理器系统将DrawBoard的复杂逻辑按职责分离到不同的处理器中：
 * - DrawingHandler: 绘制逻辑处理
 * - CursorHandler: 鼠标样式管理
 * - StateHandler: 状态管理
 * 
 * @example
 * ```typescript
 * import { DrawingHandler, CursorHandler, StateHandler } from '@/libs/drawBoard/api/handlers';
 * 
 * // 单独使用处理器
 * const drawingHandler = new DrawingHandler(canvasEngine, toolManager, ...);
 * const cursorHandler = new CursorHandler(container);
 * const stateHandler = new StateHandler(toolManager, historyManager, ...);
 * ```
 */

// ============================================
// 绘制处理器
// ============================================

/** 绘制处理器 - 负责处理所有绘制相关的逻辑 */
export { DrawingHandler } from '../handlers/DrawingHandler';

// ============================================
// 鼠标样式处理器
// ============================================

/** 鼠标样式处理器 - 负责管理画板的鼠标样式 */
export { CursorHandler } from '../handlers/CursorHandler';

// ============================================
// 状态处理器
// ============================================

/** 状态处理器 - 负责管理画板的状态信息 */
export { StateHandler } from '../handlers/StateHandler';

/** 画板状态接口 */
export type { DrawBoardState } from '../handlers/StateHandler'; 