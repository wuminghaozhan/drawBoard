import type { ToolType } from '../tools/ToolManager';
import type { PerformanceManager } from '../core/PerformanceManager';
import type { HistoryManager } from '../history/HistoryManager';
import type { ToolManager } from '../tools/ToolManager';
import type { SelectionManager } from '../core/SelectionManager';
import type { DrawingHandler } from './DrawingHandler';

/**
 * 画板状态接口
 */
export interface DrawBoardState {
  currentTool: ToolType;
  isDrawing: boolean;
  canUndo: boolean;
  canRedo: boolean;
  historyCount: number;
  memoryUsage?: number;
  performanceStats?: {
    currentCacheMemoryMB: number;
    currentCacheItems: number;
    cacheHitRate: number;
    estimatedTotalMemoryMB: number;
    underMemoryPressure: boolean;
  };
  hasSelection: boolean;
  selectedActionsCount: number;
  drawingState: {
    isDrawing: boolean;
    isSelecting: boolean;
    hasCurrentAction: boolean;
    currentToolType: ToolType;
  };
}

/**
 * 状态处理器 - 负责管理画板的状态信息
 * 
 * 职责：
 * - 收集和管理各个模块的状态信息
 * - 提供统一的状态查询接口
 * - 处理状态变化事件
 * - 提供状态订阅功能
 */
export class StateHandler {
  private stateChangeCallbacks: Array<(state: DrawBoardState) => void> = [];

  // 依赖的管理器
  private toolManager: ToolManager;
  private historyManager: HistoryManager;
  private selectionManager: SelectionManager;
  private performanceManager: PerformanceManager;
  private drawingHandler: DrawingHandler;

  constructor(
    toolManager: ToolManager,
    historyManager: HistoryManager,
    selectionManager: SelectionManager,
    performanceManager: PerformanceManager,
    drawingHandler: DrawingHandler
  ) {
    this.toolManager = toolManager;
    this.historyManager = historyManager;
    this.selectionManager = selectionManager;
    this.performanceManager = performanceManager;
    this.drawingHandler = drawingHandler;
  }

  /**
   * 获取完整的画板状态
   */
  public getState(): DrawBoardState {
    const performanceStats = this.performanceManager.getMemoryStats();
    const drawingState = this.drawingHandler.getDrawingState();
    
    return {
      currentTool: this.toolManager.getCurrentToolType(),
      isDrawing: drawingState.isDrawing,
      canUndo: this.historyManager.canUndo(),
      canRedo: this.historyManager.canRedo(),
      historyCount: this.historyManager.getHistoryCount(),
      memoryUsage: this.historyManager.getMemoryUsage(),
      performanceStats,
      hasSelection: this.selectionManager.hasSelection(),
      selectedActionsCount: this.selectionManager.getSelectedActions().length,
      drawingState
    };
  }

  /**
   * 获取工具状态
   */
  public getToolState(): {
    currentTool: ToolType;
    availableTools: Array<{ type: ToolType; name: string }>;
  } {
    return {
      currentTool: this.toolManager.getCurrentToolType(),
      availableTools: this.toolManager.getToolNames()
    };
  }

  /**
   * 获取历史记录状态
   */
  public getHistoryState(): {
    canUndo: boolean;
    canRedo: boolean;
    historyCount: number;
    memoryUsage?: number;
  } {
    return {
      canUndo: this.historyManager.canUndo(),
      canRedo: this.historyManager.canRedo(),
      historyCount: this.historyManager.getHistoryCount(),
      memoryUsage: this.historyManager.getMemoryUsage()
    };
  }

  /**
   * 获取选择状态
   */
  public getSelectionState(): {
    hasSelection: boolean;
    selectedActionsCount: number;
    selectionBox?: {
      left: number;
      top: number;
      width: number;
      height: number;
    };
  } {
    const selectionBox = this.selectionManager.getSelectionBox();
    
    return {
      hasSelection: this.selectionManager.hasSelection(),
      selectedActionsCount: this.selectionManager.getSelectedActions().length,
      selectionBox: selectionBox ? {
        left: selectionBox.left,
        top: selectionBox.top,
        width: selectionBox.width,
        height: selectionBox.height
      } : undefined
    };
  }

  /**
   * 获取性能状态
   */
  public getPerformanceState() {
    return {
      performanceStats: this.performanceManager.getMemoryStats(),
      cacheEnabled: true, // 可以添加更多性能相关状态
    };
  }

  /**
   * 获取绘制状态
   */
  public getDrawingState() {
    return this.drawingHandler.getDrawingState();
  }

  /**
   * 订阅状态变化事件
   * @param callback 状态变化回调函数
   * @returns 取消订阅的函数
   */
  public onStateChange(callback: (state: DrawBoardState) => void): () => void {
    this.stateChangeCallbacks.push(callback);
    
    // 返回取消订阅函数
    return () => {
      const index = this.stateChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.stateChangeCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * 触发状态变化事件
   */
  public emitStateChange(): void {
    const currentState = this.getState();
    this.stateChangeCallbacks.forEach(callback => {
      try {
        callback(currentState);
      } catch (error) {
        console.error('状态变化回调执行错误:', error);
      }
    });
  }

  /**
   * 检查是否有未保存的变更
   */
  public hasUnsavedChanges(): boolean {
    return this.historyManager.getHistoryCount() > 0;
  }

  /**
   * 检查是否可以执行特定操作
   */
  public canPerformOperation(operation: 'undo' | 'redo' | 'delete' | 'copy'): boolean {
    switch (operation) {
      case 'undo':
        return this.historyManager.canUndo();
      case 'redo':
        return this.historyManager.canRedo();
      case 'delete':
      case 'copy':
        return this.selectionManager.hasSelection();
      default:
        return false;
    }
  }

  /**
   * 清理资源
   */
  public destroy(): void {
    this.stateChangeCallbacks.length = 0;
  }
} 