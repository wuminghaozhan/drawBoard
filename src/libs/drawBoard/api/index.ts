/**
 * DrawBoard API 统一入口
 * 
 * 这是DrawBoard库的API统一入口，按功能模块分组导出所有公共接口。
 * 通过这个入口，用户可以访问到DrawBoard的所有功能，包括：
 * 
 * - 核心类和接口：DrawBoard主类和配置接口
 * - 工具系统：各种绘制工具和相关类型
 * - 预设系统：运笔预设管理功能
 * - 事件系统：事件处理相关接口
 * - 核心组件：Canvas引擎、选择管理器等
 * - 工具函数：便捷的工厂函数和管理器
 * - 常量和配置：默认配置和版本信息
 * 
 * @example
 * ```typescript
 * // 基础使用
 * import { DrawBoard } from '@/libs/drawBoard/api';
 * 
 * // 按需导入
 * import { 
 *   DrawBoard, 
 *   PenTool, 
 *   getAllStrokePresets,
 *   createDrawBoard 
 * } from '@/libs/drawBoard/api';
 * 
 * // 分模块导入
 * import { PenTool, RectTool } from '@/libs/drawBoard/api/tools';
 * import { getAllStrokePresets } from '@/libs/drawBoard/api/presets';
 * ```
 */

// ============================================
// 核心类和接口
// ============================================

/** DrawBoard 主类 - 画板的核心控制器 */
export { DrawBoard } from '../DrawBoard';

/** DrawBoard 配置接口 - 定义画板初始化配置 */
export type { DrawBoardConfig } from '../DrawBoard';

// ============================================
// 功能模块导出
// ============================================

/** 工具系统 - 所有绘制工具相关的类型和类 */
export * from './tools';

/** 预设系统 - 运笔预设管理功能 */
export * from './presets';

/** 事件系统 - 事件处理相关接口 */
export * from './events';

/** 核心组件 - Canvas引擎、选择管理器等底层组件 */
export * from './core';

/** 工具函数 - 便捷的工厂函数和管理器 */
export * from './utils';

/** 常量和配置 - 默认配置、版本信息等 */
export * from './constants'; 