import type { ToolType } from '../tools/DrawTool';
import type { PerformanceManager } from '../core/PerformanceManager';
import type { HistoryManager } from '../history/HistoryManager';
import type { ToolManager } from '../tools/ToolManager';
import type { CoreSelectionManager } from '../core/CoreSelectionManager';
import type { DrawingHandler } from './DrawingHandler';
import { logger } from '../infrastructure/logging/Logger';
import { ConfigConstants } from '../config/Constants';

/**
 * 绘制状态接口 - 包含所有绘制相关状态
 */
export interface DrawingState {
  isDrawing: boolean;
  isSelecting: boolean;
  hasCurrentAction: boolean;
  currentToolType: ToolType;
  currentActionId?: string;
  cachedActionsCount?: number;
  lastDrawTime?: number;
  drawingDuration?: number;
}

/**
 * 性能统计接口
 */
export interface PerformanceStats {
  currentCacheMemoryMB: number;
  currentCacheItems: number;
  cacheHitRate: number;
  estimatedTotalMemoryMB: number;
  underMemoryPressure: boolean;
}

/**
 * 选择框接口
 */
export interface SelectionBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * 画板状态接口 - 重构后消除重复
 */
export interface DrawBoardState {
  currentTool: ToolType;
  canUndo: boolean;
  canRedo: boolean;
  historyCount: number;
  memoryUsage?: number;
  performanceStats?: PerformanceStats;
  hasSelection: boolean;
  selectedActionsCount: number;
  drawingState: DrawingState; // 包含所有绘制相关状态
}

/**
 * 操作类型定义
 */
export type OperationType = 'undo' | 'redo' | 'delete' | 'copy' | 'paste' | 'selectAll';

/**
 * 状态处理器配置接口
 */
export interface StateHandlerConfig {
  enableValidation?: boolean;
  enableErrorRecovery?: boolean;
  maxCallbackErrors?: number;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
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
  private failedCallbacks: Set<(state: DrawBoardState) => void> = new Set();
  private callbackErrorCount: Map<(state: DrawBoardState) => void, number> = new Map();
  private config: Required<StateHandlerConfig>;

  // 依赖的管理器
  private toolManager: ToolManager;
  private historyManager: HistoryManager;
  private selectionManager: CoreSelectionManager;
  private performanceManager: PerformanceManager;
  private drawingHandler?: DrawingHandler;

  constructor(
    toolManager: ToolManager,
    historyManager: HistoryManager,
    selectionManager: CoreSelectionManager,
    performanceManager: PerformanceManager,
    config: StateHandlerConfig = {}
  ) {
    this.toolManager = toolManager; // 工具管理器
    this.historyManager = historyManager; // 历史记录管理器
    this.selectionManager = selectionManager; // 选择管理器
    this.performanceManager = performanceManager; // 性能管理器
    
    // 设置默认配置
    this.config = {
      enableValidation: true,
      enableErrorRecovery: true,
      maxCallbackErrors: ConfigConstants.STATE_HANDLER.MAX_CALLBACK_ERRORS,
      logLevel: 'info',
      ...config
    };
  }

  /**
   * 设置绘制处理器（延迟注入）- 改进版本
   */
  public setDrawingHandler(drawingHandler: DrawingHandler): void {
    if (!drawingHandler) {
      throw new Error('DrawingHandler不能为空');
    }
    
    if (this.drawingHandler) {
      logger.warn('DrawingHandler已存在，将被覆盖');
    }
    
    this.drawingHandler = drawingHandler;
    logger.info('DrawingHandler设置成功');
  }

  /**
   * 获取绘制状态 - 改进版本
   */
  public getDrawingState(): DrawingState {
    if (!this.drawingHandler) {
      logger.warn('DrawingHandler未设置，返回默认状态');
      return this.getDefaultDrawingState();
    }
    
    try {
      const handlerState = this.drawingHandler.getDrawingState();
      // 转换类型以匹配DrawingState接口
      return {
        ...handlerState,
        currentActionId: handlerState.currentActionId || undefined
      };
    } catch (error) {
      logger.error('获取绘制状态失败:', error);
      return this.getDefaultDrawingState();
    }
  }

  /**
   * 获取默认绘制状态
   */
  private getDefaultDrawingState(): DrawingState {
    return {
      isDrawing: false, // 是否正在绘制
      isSelecting: false, // 是否正在选择
      hasCurrentAction: false, // 是否有当前动作
      currentToolType: this.toolManager.getCurrentToolType(), // 当前工具类型
      currentActionId: undefined, // 当前动作ID
      cachedActionsCount: 0, // 缓存动作数量
      lastDrawTime: undefined, // 上次绘制时间
      drawingDuration: 0 // 绘制持续时间
    };
  }

  /**
   * 获取完整的画板状态 - 重构版本
   */
  public getState(): DrawBoardState {
    try {
      const state = this.calculateState();
      
      if (this.config.enableValidation && !this.validateState(state)) {
        logger.error('状态验证失败，返回安全状态');
        return this.getSafeState();
      }
      
      return state;
    } catch (error) {
      logger.error('计算状态时发生错误:', error);
      return this.getSafeState();
    }
  }

  /**
   * 计算完整状态
   */
  private calculateState(): DrawBoardState {
    const performanceStats = this.performanceManager.getMemoryStats();
    const drawingState = this.getDrawingState();
    
    return {
      currentTool: this.toolManager.getCurrentToolType(), // 当前工具类型
      canUndo: this.historyManager.canUndo(), // 是否可以撤销
      canRedo: this.historyManager.canRedo(), // 是否可以重做
      historyCount: this.historyManager.getHistoryCount(), // 历史记录数量
      memoryUsage: this.historyManager.getMemoryUsage(), // 内存使用量
      performanceStats, // 性能统计
      hasSelection: this.selectionManager.hasSelection(), // 是否有选择
      selectedActionsCount: this.selectionManager.getSelectedActions().length, // 选中动作数量
      drawingState // 绘制状态
    };
  }

  /**
   * 验证状态有效性
   */
  private validateState(state: DrawBoardState): boolean {
    // 验证基本数值
    if (state.historyCount < 0) {
      logger.error('历史记录数量不能为负数:', state.historyCount);
      return false;
    }
    
    if (state.selectedActionsCount < 0) {
      logger.error('选中动作数量不能为负数:', state.selectedActionsCount);
      return false;
    }
    
    // 验证状态一致性
    if (state.hasSelection && state.selectedActionsCount === 0) {
      logger.warn('状态不一致：有选择但没有选中的动作');
    }
    
    if (!state.hasSelection && state.selectedActionsCount > 0) {
      logger.warn('状态不一致：没有选择但有选中的动作');
    }
    
    // 验证绘制状态
    if (state.drawingState.isDrawing && !state.drawingState.hasCurrentAction) {
      logger.warn('状态不一致：正在绘制但没有当前动作');
    }
    
    return true;
  }

  /**
   * 获取安全状态（错误恢复）
   */
  private getSafeState(): DrawBoardState {
    return {
      currentTool: this.toolManager.getCurrentToolType(), // 当前工具类型
      canUndo: false, // 是否可以撤销
      canRedo: false, // 是否可以重做
      historyCount: 0, // 历史记录数量
      memoryUsage: 0, // 内存使用量
      performanceStats: {
        currentCacheMemoryMB: 0, // 当前缓存内存量
        currentCacheItems: 0, // 当前缓存项数
        cacheHitRate: 0, // 缓存命中率
        estimatedTotalMemoryMB: 0, // 估计总内存量
        underMemoryPressure: false // 是否内存压力
      },
      hasSelection: false, // 是否有选择
      selectedActionsCount: 0, // 选中动作数量
      drawingState: this.getDefaultDrawingState() // 绘制状态
    };
  }

  /**
   * 获取工具状态
   */
  public getToolState(): {
    currentTool: ToolType;
    availableTools: Array<{ type: ToolType; name: string }>;
  } {
    try {
      return {
        currentTool: this.toolManager.getCurrentToolType(), // 当前工具类型
        availableTools: this.toolManager.getToolNames() // 可用工具列表
      };
    } catch (error) {
      logger.error('获取工具状态失败:', error);
      return {
        currentTool: 'pen' as ToolType, // 默认工具类型
        availableTools: [] // 空工具列表
      };
    }
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
    try {
      return {
        canUndo: this.historyManager.canUndo(), // 是否可以撤销
        canRedo: this.historyManager.canRedo(), // 是否可以重做
        historyCount: this.historyManager.getHistoryCount(), // 历史记录数量
        memoryUsage: this.historyManager.getMemoryUsage() // 内存使用量
      };
    } catch (error) {
      logger.error('获取历史记录状态失败:', error);
      return {
        canUndo: false,
        canRedo: false,
        historyCount: 0,
        memoryUsage: 0
      };
    }
  }

  /**
   * 获取选择状态
   */
  public getSelectionState(): {
    hasSelection: boolean;
    selectedActionsCount: number;
    selectionBox?: SelectionBox;
  } {
    try {
      const selectionBox = this.selectionManager.getSelectionBox();
      
      return {
        hasSelection: this.selectionManager.hasSelection(), // 是否有选择
        selectedActionsCount: this.selectionManager.getSelectedActions().length, // 选中动作数量
        selectionBox: selectionBox ? {
          left: selectionBox.left, // 选择框左上角X坐标
          top: selectionBox.top,
          width: selectionBox.width,
          height: selectionBox.height
        } : undefined
      };
    } catch (error) {
      logger.error('获取选择状态失败:', error);
      return {
        hasSelection: false,
        selectedActionsCount: 0,
        selectionBox: undefined
      };
    }
  }

  /**
   * 获取性能状态
   */
  public getPerformanceState() {
    try {
      return {
        performanceStats: this.performanceManager.getMemoryStats(),
        cacheEnabled: true,
      };
    } catch (error) {
      logger.error('获取性能状态失败:', error);
      return {
        performanceStats: { // 性能统计
          currentCacheMemoryMB: 0, // 当前缓存内存量
          currentCacheItems: 0, // 当前缓存项数
          cacheHitRate: 0, // 缓存命中率
          estimatedTotalMemoryMB: 0, // 估计总内存量
          underMemoryPressure: false // 是否内存压力
        },
        cacheEnabled: false, // 是否启用缓存
      };
    }
  }

  /**
   * 订阅状态变化事件
   * @param callback 状态变化回调函数
   * @returns 取消订阅的函数
   */
  public onStateChange(callback: (state: DrawBoardState) => void): () => void {
    if (typeof callback !== 'function') {
      throw new Error('回调函数必须是函数类型');
    }
    
    // 检查是否在失败列表中
    if (this.failedCallbacks.has(callback)) {
      logger.warn('尝试重新注册失败的回调函数');
      this.failedCallbacks.delete(callback);
      this.callbackErrorCount.delete(callback);
    }
    
    this.stateChangeCallbacks.push(callback);
    
    // 返回取消订阅函数
    return () => {
      const index = this.stateChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.stateChangeCallbacks.splice(index, 1);
        this.callbackErrorCount.delete(callback);
        this.failedCallbacks.delete(callback);
      }
    };
  }

  /**
   * 触发状态变化事件 - 增强错误处理版本
   */
  public emitStateChange(): void {
    const currentState = this.getState();
    const failedCallbacks: Array<{ callback: (state: DrawBoardState) => void; error: Error }> = [];
    
    this.stateChangeCallbacks.forEach(callback => {
      try {
        callback(currentState);
      } catch (error) {
        const errorObj = error as Error;
        logger.error('状态变化回调执行错误:', errorObj);
        failedCallbacks.push({ callback, error: errorObj });
      }
    });
    
    // 处理失败的回调
    if (this.config.enableErrorRecovery) {
      this.handleFailedCallbacks(failedCallbacks);
    }
  }

  /**
   * 处理失败的回调
   */
  private handleFailedCallbacks(failedCallbacks: Array<{ callback: (state: DrawBoardState) => void; error: Error }>): void {
    failedCallbacks.forEach(({ callback }) => {
      const errorCount = (this.callbackErrorCount.get(callback) || 0) + 1;
      this.callbackErrorCount.set(callback, errorCount);
      
      if (errorCount >= this.config.maxCallbackErrors) {
        // 移除失败的回调
        const index = this.stateChangeCallbacks.indexOf(callback);
        if (index > -1) {
          this.stateChangeCallbacks.splice(index, 1);
          this.failedCallbacks.add(callback);
          this.callbackErrorCount.delete(callback);
          logger.warn(`已移除失败的回调函数，错误次数: ${errorCount}`);
        }
      } else {
        logger.warn(`回调函数执行失败，错误次数: ${errorCount}/${this.config.maxCallbackErrors}`);
      }
    });
  }

  /**
   * 检查是否有未保存的变更
   */
  public hasUnsavedChanges(): boolean {
    try {
      return this.historyManager.getHistoryCount() > 0;
    } catch (error) {
      logger.error('检查未保存变更失败:', error);
      return false;
    }
  }

  /**
   * 检查是否可以执行特定操作 - 改进版本
   */
  public canPerformOperation(operation: OperationType): boolean {
    try {
      switch (operation) {
        case 'undo':
          return this.historyManager.canUndo();
        case 'redo':
          return this.historyManager.canRedo();
        case 'delete':
        case 'copy':
          return this.selectionManager.hasSelection();
        case 'paste':
          return this.hasClipboardData();
        case 'selectAll':
          return this.historyManager.getHistoryCount() > 0;
        default:
          logger.warn(`未知操作类型: ${operation}`);
          return false;
      }
    } catch (error) {
      logger.error(`检查操作权限失败 [${operation}]:`, error);
      return false;
    }
  }

  /**
   * 检查剪贴板是否有数据
   * 
   * 注意：此方法需要从DrawBoard获取剪贴板状态
   * 当前实现返回false，实际应该通过DrawBoard.hasClipboardData()获取
   * 
   * @returns 当前总是返回 false（需要从DrawBoard获取实际状态）
   */
  private hasClipboardData(): boolean {
    // 注意：此方法应该通过DrawBoard.hasClipboardData()获取实际状态
    // 当前返回false，因为StateHandler无法直接访问DrawBoard的剪贴板
    return false;
  }

  /**
   * 获取配置信息
   */
  public getConfig(): Readonly<Required<StateHandlerConfig>> {
    return this.config;
  }

  /**
   * 更新配置
   */
  public updateConfig(newConfig: Partial<StateHandlerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('StateHandler配置已更新:', this.config);
  }

  /**
   * 获取错误统计信息
   */
  public getErrorStats(): {
    failedCallbacksCount: number;
    callbackErrorCounts: Map<(state: DrawBoardState) => void, number>;
    totalCallbacks: number;
  } {
    return {
      failedCallbacksCount: this.failedCallbacks.size,
      callbackErrorCounts: new Map(this.callbackErrorCount),
      totalCallbacks: this.stateChangeCallbacks.length
    };
  }

  /**
   * 清理资源
   */
  public destroy(): void {
    this.stateChangeCallbacks.length = 0;
    this.failedCallbacks.clear();
    this.callbackErrorCount.clear();
    this.drawingHandler = undefined;
    logger.info('StateHandler资源已清理');
  }
} 