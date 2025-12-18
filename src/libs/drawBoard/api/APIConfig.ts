/**
 * API 模块配置接口
 * 用于替代多个回调参数，提高代码可维护性
 */

/**
 * 工具 API 配置
 */
export interface ToolAPIConfig {
  /** 同步图层数据到选择工具 */
  syncLayerDataToSelectTool: () => void;
  /** 检查复杂度重新计算 */
  checkComplexityRecalculation: () => Promise<void>;
  /** 更新光标 */
  updateCursor: () => void;
  /** 强制重绘 */
  forceRedraw: () => Promise<void>;
  /** 标记需要清除选择UI（可选） */
  markNeedsClearSelectionUI?: () => void;
}

/**
 * 历史记录 API 配置
 */
export interface HistoryAPIConfig {
  /** 同步图层数据到选择工具 */
  syncLayerDataToSelectTool: () => void;
}

/**
 * 虚拟图层 API 配置
 */
export interface VirtualLayerAPIConfig {
  /** 同步图层数据到选择工具 */
  syncLayerDataToSelectTool: (preserveSelection?: boolean) => void;
}

/**
 * 数据 API 配置
 */
export interface DataAPIConfig {
  /** 应用导入的 actions */
  applyActions: (actions: import('../tools/DrawTool').DrawAction[]) => void;
  /** 重建图层 */
  rebuildLayers: (layers: Array<{ id: string; name: string; visible: boolean; locked: boolean }>) => void;
  /** 重新渲染 */
  redraw: () => Promise<void>;
}

