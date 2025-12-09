import type { DrawAction } from './DrawTool';
import type { Point, CanvasEngine } from '../core/CanvasEngine';
import type { StrokeConfig } from './stroke/StrokeTypes';
import type { StrokePresetType } from './StrokePresets';

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
}

