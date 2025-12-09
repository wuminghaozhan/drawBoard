import type { DrawAction } from '../tools/DrawTool';
import { logger } from '../utils/Logger';

/**
 * 历史管理器 - 优化版本
 * 
 * 改进:
 * - 基于内存大小的智能管理
 * - 更精确的内存使用计算
 * - 智能清理策略
 * - 性能监控
 */
export class HistoryManager {
  private history: DrawAction[] = [];
  private undoneActions: DrawAction[] = [];
  private maxHistorySize: number = 100;
  private maxUndoneSize: number = 50;
  
  // 内存管理相关
  private maxMemoryMB: number = 50; // 最大内存限制50MB
  private currentMemoryBytes: number = 0;
  private memoryCheckInterval: number = 10; // 每10次操作检查一次内存
  private readonly MEMORY_RECALCULATE_INTERVAL = 50; // 每50次操作重新计算内存，防止累积误差
  private operationCount: number = 0;

  // 性能监控相关
  private performanceMetrics = { // 性能指标
    totalOperations: 0, // 总操作数
    memoryCleanups: 0, // 内存清理次数
    lastCleanupTime: 0, // 上次清理时间
    averageOperationTime: 0 // 平均操作时间
  };

  // 配置选项
  private config = {
    enablePerformanceMonitoring: true, // 是否启用性能监控
    enableDetailedLogging: false, // 是否启用详细日志
    memoryCalculationPrecision: 'high' as 'low' | 'medium' | 'high' // 内存计算精度
  };
  
  /**
   * 添加动作到历史记录（智能内存管理）
   */
  public addAction(action: DrawAction): void {
    logger.debug('添加动作到历史记录, ID:', action.id);
    
    // 计算动作的内存大小
    const actionMemorySize = this.calculateActionMemorySize(action);
    
    this.history.push(action);
    this.currentMemoryBytes += actionMemorySize;
    
    // 清空重做栈 - 修复内存计算
    if (this.undoneActions.length > 0) {
      const undoneMemorySize = this.calculateArrayMemorySize(this.undoneActions);
      this.currentMemoryBytes -= undoneMemorySize;
      this.undoneActions = [];
      logger.debug('清空重做栈，释放内存:', (undoneMemorySize / 1024 / 1024).toFixed(2), 'MB');
    }
    
    // 增量检查内存使用
    this.operationCount++;
    
    // 定期重新计算内存，防止累积误差
    if (this.operationCount % this.MEMORY_RECALCULATE_INTERVAL === 0) {
      this.recalculateMemory();
    }
    
    if (this.operationCount % this.memoryCheckInterval === 0) {
      this.enforceMemoryLimits();
    } else {
      // 简单检查数量限制
      this.enforceCountLimits();
    }
    
    logger.debug('历史记录数量:', this.history.length, '内存使用:', (this.currentMemoryBytes / 1024 / 1024).toFixed(2), 'MB');
  }
  
  /**
   * 重新计算内存使用（防止累积误差）
   */
  private recalculateMemory(): void {
    const historyMemory = this.calculateArrayMemorySize(this.history);
    const undoneMemory = this.calculateArrayMemorySize(this.undoneActions);
    const oldMemory = this.currentMemoryBytes;
    this.currentMemoryBytes = historyMemory + undoneMemory;
    
    const diff = Math.abs(this.currentMemoryBytes - oldMemory);
    if (diff > 1024) { // 如果差异超过1KB，记录警告
      logger.warn('HistoryManager: 内存计算误差较大', {
        oldMemory: (oldMemory / 1024 / 1024).toFixed(2) + 'MB',
        newMemory: (this.currentMemoryBytes / 1024 / 1024).toFixed(2) + 'MB',
        diff: (diff / 1024).toFixed(2) + 'KB'
      });
    }
    
    logger.debug('内存使用已重新计算:', (this.currentMemoryBytes / 1024 / 1024).toFixed(2), 'MB');
  }

  /**
   * 撤销操作（智能内存管理）
   */
  public undo(): DrawAction | null {
    if (this.history.length === 0) return null;
    
    const action = this.history.pop();
    if (!action) return null; // 额外的安全检查
    
    const actionMemorySize = this.calculateActionMemorySize(action);
    
    this.undoneActions.push(action);
    this.currentMemoryBytes -= actionMemorySize; // 从历史记录移除
    this.currentMemoryBytes += actionMemorySize; // 添加到重做栈（内存总量不变）
    
    // 限制重做栈大小
    if (this.undoneActions.length > this.maxUndoneSize) {
      const removedAction = this.undoneActions.shift();
      if (removedAction) {
        this.currentMemoryBytes -= this.calculateActionMemorySize(removedAction);
      }
    }
    
    return action;
  }

  /**
   * 重做操作（智能内存管理）
   */
  public redo(): DrawAction | null {
    if (this.undoneActions.length === 0) return null;
    
    const action = this.undoneActions.pop();
    if (!action) return null; // 额外的安全检查
    
    this.history.push(action);
    // 内存总量不变，只是在两个数组间移动
    
    return action;
  }

  /**
   * 计算单个动作的内存大小（字节）- 改进版本
   */
  private calculateActionMemorySize(action: DrawAction): number {
    let size = 0;
    
    // 使用更精确的基础对象大小估算
    size += 64; // 基础对象开销（更保守的估算）
    
    // points数组 - 更精确的计算
    if (action.points && Array.isArray(action.points)) {
      // 每个点对象：x(8) + y(8) + timestamp(8) + 对象开销(16) = 40字节
      size += action.points.length * 40;
    }
    
    // 字符串字段 - 使用UTF-8编码估算
    size += this.calculateStringSize(action.id);
    size += this.calculateStringSize(action.type);
    size += this.calculateStringSize(action.text);
    
    // context对象 - 更精确的估算
    if (action.context) {
      size += 128; // context对象开销
      // 如果有更多context属性，可以进一步细化
    }
    
    // 预渲染缓存
    if (action.preRenderedCache) {
      size += action.preRenderedCache.memorySize || 0;
    }
    
    // 选择相关数据
    if (action.selectedActions && Array.isArray(action.selectedActions)) {
      size += action.selectedActions.length * 32; // 每个选择项约32字节
    }
    
    return size;
  }

  /**
   * 计算数组的总内存大小
   */
  private calculateArrayMemorySize(actions: DrawAction[]): number {
    return actions.reduce((total, action) => total + this.calculateActionMemorySize(action), 0);
  }

  /**
   * 计算字符串的内存大小
   */
  private calculateStringSize(str?: string): number {
    if (!str) return 0;
    // UTF-8编码：ASCII字符1字节，中文等2-4字节
    // 这里使用保守估算：平均每个字符2字节
    return str.length * 2;
  }

  /**
   * 强制执行内存限制（完整检查）- 优化版本
   */
  private enforceMemoryLimits(): void {
    // 重新计算精确的内存使用（防止累积误差）
    const historyMemory = this.calculateArrayMemorySize(this.history);
    const undoneMemory = this.calculateArrayMemorySize(this.undoneActions);
    this.currentMemoryBytes = historyMemory + undoneMemory;
    
    // 【修复】使用 let 而不是 const，因为需要在循环中更新
    let currentMemoryMB = this.currentMemoryBytes / 1024 / 1024;
    
    if (currentMemoryMB > this.maxMemoryMB) {
      logger.info(`内存使用超限 (${currentMemoryMB.toFixed(2)}MB > ${this.maxMemoryMB}MB)，开始清理`);
      
      let cleanedMemory = 0;
      
      // 优先清理重做栈
      // 【修复】循环条件中需要重新计算 currentMemoryMB
      while (this.undoneActions.length > 0 && currentMemoryMB > this.maxMemoryMB * 0.9) {
        const removedAction = this.undoneActions.shift();
        if (removedAction) {
          const actionSize = this.calculateActionMemorySize(removedAction);
          cleanedMemory += actionSize;
          this.currentMemoryBytes -= actionSize;
          currentMemoryMB = this.currentMemoryBytes / 1024 / 1024; // 更新循环条件变量
        }
      }
      
      // 如果还是超限，清理历史记录
      // 【修复】循环条件中需要重新计算 currentMemoryMB
      while (this.history.length > 10 && currentMemoryMB > this.maxMemoryMB * 0.8) {
        const removedAction = this.history.shift();
        if (removedAction) {
          const actionSize = this.calculateActionMemorySize(removedAction);
          cleanedMemory += actionSize;
          this.currentMemoryBytes -= actionSize;
          currentMemoryMB = this.currentMemoryBytes / 1024 / 1024; // 更新循环条件变量
        }
      }
      
      // 注意：currentMemoryBytes 已在循环中更新，这里不需要再减
      
      logger.info(`内存清理完成，释放: ${(cleanedMemory / 1024 / 1024).toFixed(2)}MB, 当前使用: ${(this.currentMemoryBytes / 1024 / 1024).toFixed(2)}MB`);
    }
  }

  /**
   * 强制执行数量限制（快速检查）
   */
  private enforceCountLimits(): void {
    // 快速的数量检查
    if (this.history.length > this.maxHistorySize) {
      const removedAction = this.history.shift()!;
      this.currentMemoryBytes -= this.calculateActionMemorySize(removedAction);
    }
  }

  /**
   * 获取内存使用情况
   */
  public getMemoryUsage(): number {
    return this.currentMemoryBytes / 1024 / 1024; // 返回MB
  }

  /**
   * 设置内存限制
   */
  public setMaxMemoryMB(maxMB: number): void {
    this.maxMemoryMB = maxMB;
    this.enforceMemoryLimits();
  }

  // 保持原有API兼容性
  public canUndo(): boolean {
    return this.history.length > 0;
  }

  public canRedo(): boolean {
    return this.undoneActions.length > 0;
  }

  public getHistory(): DrawAction[] {
    return [...this.history];
  }

  public getAllActions(): DrawAction[] {
    // 返回历史记录的副本，用于绘制
    return [...this.history];
  }

  public getHistoryCount(): number {
    return this.history.length;
  }

  public setMaxHistorySize(size: number): void {
    this.maxHistorySize = size;
    this.enforceCountLimits();
  }

  public clear(): void {
    this.currentMemoryBytes = 0;
    this.history = [];
    this.undoneActions = [];
    this.operationCount = 0;
  }

  /**
   * 销毁历史管理器，清理所有资源
   */
  public destroy(): void {
    // 清空历史记录
    this.history = [];
    this.undoneActions = [];
    
    // 重置内存统计
    this.currentMemoryBytes = 0;
    this.operationCount = 0;
    
    // 重置配置
    this.maxHistorySize = 100;
    this.maxUndoneSize = 50;
    this.maxMemoryMB = 50;
    this.memoryCheckInterval = 10;
    
    logger.info('🗑️ HistoryManager destroyed');
  }

  /**
   * 按ID移除特定动作
   */
  public removeActionById(actionId: string): boolean {
    // 从历史记录中移除
    const historyIndex = this.history.findIndex(action => action.id === actionId);
    if (historyIndex !== -1) {
      const removedAction = this.history.splice(historyIndex, 1)[0];
      this.currentMemoryBytes -= this.calculateActionMemorySize(removedAction);
      logger.debug('从历史记录中移除动作:', actionId);
      return true;
    }

    // 从重做栈中移除
    const undoneIndex = this.undoneActions.findIndex(action => action.id === actionId);
    if (undoneIndex !== -1) {
      const removedAction = this.undoneActions.splice(undoneIndex, 1)[0];
      this.currentMemoryBytes -= this.calculateActionMemorySize(removedAction);
      logger.debug('从重做栈中移除动作:', actionId);
      return true;
    }

    return false;
  }

  /**
   * 更新动作（用于修改已存在的action，如拖拽锚点、变换等）
   * @param updatedAction 更新后的action（必须包含相同的id）
   * @returns 是否成功更新
   */
  public updateAction(updatedAction: DrawAction): boolean {
    if (!updatedAction || !updatedAction.id) {
      logger.warn('更新动作失败：action或id无效');
      return false;
    }

    // 从历史记录中查找并更新
    const historyIndex = this.history.findIndex(action => action.id === updatedAction.id);
    if (historyIndex !== -1) {
      const oldAction = this.history[historyIndex];
      const oldMemorySize = this.calculateActionMemorySize(oldAction);
      const newMemorySize = this.calculateActionMemorySize(updatedAction);
      
      // 更新action
      this.history[historyIndex] = updatedAction;
      
      // 更新内存计数
      this.currentMemoryBytes = this.currentMemoryBytes - oldMemorySize + newMemorySize;
      
      logger.debug('更新历史记录中的动作:', updatedAction.id);
      return true;
    }

    // 从重做栈中查找并更新
    const undoneIndex = this.undoneActions.findIndex(action => action.id === updatedAction.id);
    if (undoneIndex !== -1) {
      const oldAction = this.undoneActions[undoneIndex];
      const oldMemorySize = this.calculateActionMemorySize(oldAction);
      const newMemorySize = this.calculateActionMemorySize(updatedAction);
      
      // 更新action
      this.undoneActions[undoneIndex] = updatedAction;
      
      // 更新内存计数
      this.currentMemoryBytes = this.currentMemoryBytes - oldMemorySize + newMemorySize;
      
      logger.debug('更新重做栈中的动作:', updatedAction.id);
      return true;
    }

    logger.warn('更新动作失败：未找到action:', updatedAction.id);
    return false;
  }

  /**
   * 批量更新动作（用于同时更新多个actions）
   * @param updatedActions 更新后的actions数组
   * @returns 成功更新的数量
   */
  public updateActions(updatedActions: DrawAction[]): number {
    let successCount = 0;
    for (const action of updatedActions) {
      if (this.updateAction(action)) {
        successCount++;
      }
    }
    logger.debug(`批量更新动作: ${successCount}/${updatedActions.length} 成功`);
    return successCount;
  }

  /**
   * 根据ID获取action
   * @param actionId action的ID
   * @returns 找到的action，如果不存在返回null
   */
  public getActionById(actionId: string): DrawAction | null {
    // 从历史记录中查找
    const historyAction = this.history.find(action => action.id === actionId);
    if (historyAction) {
      return historyAction;
    }

    // 从重做栈中查找
    const undoneAction = this.undoneActions.find(action => action.id === actionId);
    if (undoneAction) {
      return undoneAction;
    }

    return null;
  }

  /**
   * 获取性能指标
   */
  public getPerformanceMetrics() {
    return {
      ...this.performanceMetrics,
      currentMemoryMB: this.getMemoryUsage(),
      historyCount: this.history.length,
      undoneCount: this.undoneActions.length
    };
  }

  /**
   * 设置配置选项
   */
  public setConfig(config: Partial<typeof this.config>): void {
    this.config = { ...this.config, ...config };
    logger.info('HistoryManager配置已更新:', this.config);
  }

  /**
   * 获取当前配置
   */
  public getConfig() {
    return { ...this.config };
  }

  /**
   * 重置性能指标
   */
  public resetPerformanceMetrics(): void {
    this.performanceMetrics = {
      totalOperations: 0,
      memoryCleanups: 0,
      lastCleanupTime: 0,
      averageOperationTime: 0
    };
    logger.info('性能指标已重置');
  }
} 