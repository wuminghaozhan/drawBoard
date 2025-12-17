import type { DrawAction } from './DrawTool';
import type { Point, CanvasEngine } from '../core/CanvasEngine';
import type { StrokeConfig } from './stroke/StrokeTypes';
import type { StrokePresetType } from './StrokePresets';
import type { VirtualLayerMode } from '../core/VirtualLayerManager';

/**
 * 选择工具接口
 * 定义 SelectTool 对外暴露的所有方法
 */
export interface SelectToolInterface {
  /** 处理鼠标按下事件 */
  handleMouseDown(point: Point): 'select' | 'transform' | 'move' | 'box-select' | 'anchor-drag' | null;
  
  /** 处理鼠标移动事件 */
  handleMouseMove(point: Point): DrawAction | DrawAction[] | null;
  
  /** 处理鼠标抬起事件 */
  handleMouseUp(): DrawAction | DrawAction[] | null;
  
  /** 更新悬停锚点 */
  updateHoverAnchor?(point: Point): boolean | void;
  
  /** 获取当前光标样式 */
  getCurrentCursor(point?: Point): string;
  
  /** 获取选中的动作列表 */
  getSelectedActions(): DrawAction[];
  
  /** 清除选择 */
  clearSelection(): void;
  
  /** 删除选中的动作，返回被删除的动作ID列表 */
  deleteSelectedActions(): string[];
  
  /** 复制选中的动作 */
  copySelectedActions(): DrawAction[];
  
  /** 粘贴动作 */
  pasteActions?(actions: DrawAction[], offsetX: number, offsetY: number): DrawAction[];
  
  /** 设置选中的动作列表 */
  setSelectedActions(actions: DrawAction[]): void;
  
  /** 设置图层动作列表 */
  setLayerActions(actions: DrawAction[], clearSelection?: boolean): void;
  
  /** 设置虚拟图层模式（individual 模式限制单选，grouped 模式允许多选） */
  setVirtualLayerMode(mode: VirtualLayerMode): void;
  
  /** 设置选择限制事件回调（当 individual 模式下多选禁用锚点功能时触发） */
  setOnSelectionLimited?(callback: (info: {
    reason: 'individual-mode-no-transform';
    message: string;
    selectedCount: number;
  }) => void): void;
  
  /** 设置选区浮动工具栏回调 */
  setToolbarCallbacks?(callbacks: {
    onToggleAnchors?: (visible: boolean) => void;
    onStrokeColorChange?: (color: string) => void;
    onFillColorChange?: (color: string) => void;
    onLineWidthChange?: (width: number) => void;
    onTextColorChange?: (color: string) => void;
    onFontSizeChange?: (size: number) => void;
    onFontWeightChange?: (weight: string) => void;
    onToggleLock?: (locked: boolean) => void;
    onMoveToTop?: () => void;
    onMoveToBottom?: () => void;
    onDuplicate?: () => void;
    onDelete?: () => void;
  }): void;
  
  /** 设置样式更新回调（当选中图形的样式被修改时立即调用，用于同步到数据源） */
  setOnStyleUpdated?(callback: (actions: DrawAction[]) => void): void;
  
  /** 设置Canvas引擎和选中图层zIndex */
  setCanvasEngine?(canvasEngine: CanvasEngine, selectedLayerZIndex?: number | null): void;
  
  /** 重置状态 */
  reset?(): void;
  
  /** 强制更新状态 */
  forceUpdate?(): void;
  
  /** 取消拖拽 */
  cancelDrag?(): boolean;
  
  /** 获取调试信息 */
  getDebugInfo?(): {
    allActionsCount: number;
    selectedActionsCount: number;
    isTransformMode: boolean;
    isSelecting: boolean;
    isDraggingAnchor: boolean;
    anchorPointsCount: number;
    boundsCacheSize: number;
  };
}

/**
 * 笔刷工具接口
 * 定义 PenTool 对外暴露的所有方法
 */
export interface PenToolInterface {
  /** 设置运笔效果配置 */
  setStrokeConfig(config: Partial<StrokeConfig>): void;
  
  /** 获取运笔效果配置 */
  getStrokeConfig(): StrokeConfig;
  
  /** 设置运笔预设 */
  setPreset(preset: StrokePresetType): void;
  
  /** 获取当前笔刷预设 */
  getCurrentPreset(): StrokePresetType | null;
}

/**
 * 文字工具接口
 * 定义 TextTool 对外暴露的所有方法
 */
export interface TextToolInterface {
  /** 初始化编辑管理器 */
  initEditingManager(container: HTMLElement, canvas: HTMLCanvasElement): void;
  
  /** 开始编辑（新建文字） */
  startEditing(position: Point, options?: {
    fontSize?: number;
    fontFamily?: string;
    color?: string;
  }): void;
  
  /** 编辑已有文字 */
  editExisting(action: DrawAction, canvasBounds: DOMRect): void;
  
  /** 完成编辑 */
  finishEditing(): void;
  
  /** 取消编辑 */
  cancelEditing(): void;
  
  /** 选中当前光标位置的单词 */
  selectWordAtCursor(): void;
  
  /** 选中所有文本 */
  selectAll(): void;
  
  /** 是否正在编辑 */
  isEditing(): boolean;
  
  /** 获取正在编辑的 action ID（用于在绘制时跳过该 action） */
  getEditingActionId(): string | null;
  
  /** 设置字体大小 */
  setFontSize(size: number): void;
  
  /** 设置字体 */
  setFontFamily(family: string): void;
  
  /** 设置文字颜色 */
  setTextColor(color: string): void;
  
  /** 绘制预览 */
  drawPreview(ctx: CanvasRenderingContext2D): void;
  
  /** 订阅事件 */
  on(handler: (event: { type: string; action?: DrawAction }) => void): () => void;
  
  /** 销毁 */
  destroy(): void;
}

/**
 * 工具类型守卫
 */
export class ToolTypeGuards {
  /**
   * 检查是否为选择工具
   */
  static isSelectTool(tool: any): tool is SelectToolInterface {
    return tool && 
           typeof tool.getActionType === 'function' && 
           tool.getActionType() === 'select' &&
           typeof tool.handleMouseDown === 'function' &&
           typeof tool.handleMouseMove === 'function' &&
           typeof tool.handleMouseUp === 'function' &&
           typeof tool.getSelectedActions === 'function' &&
           typeof tool.clearSelection === 'function';
  }
  
  /**
   * 检查是否为笔刷工具
   */
  static isPenTool(tool: any): tool is PenToolInterface {
    return tool && 
           typeof tool.getActionType === 'function' && 
           tool.getActionType() === 'pen' &&
           typeof tool.setStrokeConfig === 'function' &&
           typeof tool.getStrokeConfig === 'function';
  }
  
  /**
   * 检查是否为文字工具
   */
  static isTextTool(tool: any): tool is TextToolInterface {
    return tool && 
           typeof tool.getActionType === 'function' && 
           tool.getActionType() === 'text' &&
           typeof tool.initEditingManager === 'function' &&
           typeof tool.startEditing === 'function' &&
           typeof tool.finishEditing === 'function' &&
           typeof tool.isEditing === 'function';
  }
}

