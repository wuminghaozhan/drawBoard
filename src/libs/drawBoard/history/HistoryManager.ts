import type { DrawAction } from '../tools/DrawTool';
import { logger } from '../infrastructure/logging/Logger';
import type { EventBus } from '../infrastructure/events/EventBus';

/**
 * 批量操作记录
 * 用于将多个原子操作合并为一个可撤销的单元
 */
export interface BatchOperation {
  /** 批量操作 ID */
  id: string;
  /** 操作类型 */
  type: 'eraser-split' | 'multi-delete' | 'multi-transform' | 'custom';
  /** 被移除的 Action IDs */
  removedActionIds: string[];
  /** 被移除的 Actions (用于撤销时恢复) - 可选，启用增量存储时为 undefined */
  removedActions?: DrawAction[];
  /** 新增的 Action IDs */
  addedActionIds: string[];
  /** 新增的 Actions (用于重做时恢复) - 可选，启用增量存储时为 undefined */
  addedActions?: DrawAction[];
  /** 时间戳 */
  timestamp: number;
  /** 描述 */
  description?: string;
  /** 是否使用增量存储 */
  useIncrementalStorage?: boolean;
}

/**
 * 增量操作存储
 * 只存储 action ID 和必要的差异信息，减少内存占用
 */
export interface IncrementalBatchStorage {
  /** 被移除的 Action 的快照（精简版） */
  removedSnapshots: ActionSnapshot[];
  /** 新增的 Action 的快照（精简版） */
  addedSnapshots: ActionSnapshot[];
}

/**
 * Action 快照（精简版，只存储必要信息）
 */
export interface ActionSnapshot {
  id: string;
  type: string;
  /** 关键属性的 JSON 字符串（用于恢复） */
  serializedData: string;
}

/**
 * 历史管理器 - 优化版本
 * 
 * 改进:
 * - 基于内存大小的智能管理
 * - 更精确的内存使用计算
 * - 智能清理策略
 * - 性能监控
 * - EventBus 集成
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

  // EventBus 相关
  private eventBus?: EventBus;
  private eventUnsubscribers: (() => void)[] = [];
  
  // 批量操作相关
  private batchOperations: BatchOperation[] = [];
  private maxBatchOperations: number = 50;
  private incrementalStorage: Map<string, IncrementalBatchStorage> = new Map();
  private useIncrementalStorage: boolean = true; // 默认启用增量存储
  
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
    // 取消 EventBus 订阅
    this.unsubscribeFromEvents();
    this.eventBus = undefined;
    
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
  
  // ==================== 批量操作支持 ====================
  
  /**
   * 执行批量操作（橡皮擦分割等）
   * 
   * 将多个原子操作合并为一个可撤销单元
   * 支持增量存储以减少内存占用
   * 
   * @param type 操作类型
   * @param removedActionIds 要移除的 Action IDs
   * @param newActions 要添加的新 Actions
   * @param description 操作描述
   * @returns 批量操作 ID
   */
  public executeBatchOperation(
    type: BatchOperation['type'],
    removedActionIds: string[],
    newActions: DrawAction[],
    description?: string
  ): string {
    const batchId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // 保存被移除的 Actions
    const removedActions: DrawAction[] = [];
    for (const actionId of removedActionIds) {
      const action = this.history.find(a => a.id === actionId);
      if (action) {
        removedActions.push({ ...action });
      }
    }
    
    // 执行移除
    for (const actionId of removedActionIds) {
      this.removeActionById(actionId);
    }
    
    // 执行添加
    for (const action of newActions) {
      this.addAction(action);
    }
    
    // 根据是否启用增量存储决定存储方式
    let batchOp: BatchOperation;
    
    if (this.useIncrementalStorage) {
      // 增量存储：只存储 ID 和序列化快照
      const incrementalData: IncrementalBatchStorage = {
        removedSnapshots: removedActions.map(a => this.createActionSnapshot(a)),
        addedSnapshots: newActions.map(a => this.createActionSnapshot(a))
      };
      this.incrementalStorage.set(batchId, incrementalData);
      
      batchOp = {
        id: batchId,
        type,
        removedActionIds,
        addedActionIds: newActions.map(a => a.id),
        timestamp: Date.now(),
        description,
        useIncrementalStorage: true
      };
    } else {
      // 完整存储
      batchOp = {
        id: batchId,
        type,
        removedActionIds,
        removedActions,
        addedActionIds: newActions.map(a => a.id),
        addedActions: newActions.map(a => ({ ...a })),
        timestamp: Date.now(),
        description,
        useIncrementalStorage: false
      };
    }
    
    this.batchOperations.push(batchOp);
    
    // 限制批量操作记录数量
    if (this.batchOperations.length > this.maxBatchOperations) {
      const removed = this.batchOperations.shift();
      if (removed?.useIncrementalStorage) {
        this.incrementalStorage.delete(removed.id);
      }
    }
    
    logger.info('批量操作已执行', {
      batchId,
      type,
      removedCount: removedActionIds.length,
      addedCount: newActions.length,
      useIncrementalStorage: this.useIncrementalStorage,
      description
    });
    
    this.emitHistoryChanged();
    return batchId;
  }
  
  /**
   * 创建 Action 快照（用于增量存储）
   */
  private createActionSnapshot(action: DrawAction): ActionSnapshot {
    return {
      id: action.id,
      type: action.type,
      serializedData: JSON.stringify(action)
    };
  }
  
  /**
   * 从快照恢复 Action
   */
  private restoreActionFromSnapshot(snapshot: ActionSnapshot): DrawAction {
    return JSON.parse(snapshot.serializedData) as DrawAction;
  }
  
  /**
   * 设置是否使用增量存储
   */
  public setIncrementalStorageEnabled(enabled: boolean): void {
    this.useIncrementalStorage = enabled;
    logger.debug('增量存储设置', { enabled });
  }
  
  /**
   * 获取增量存储统计
   */
  public getIncrementalStorageStats(): {
    enabled: boolean;
    storedBatches: number;
    estimatedMemorySaved: number;
  } {
    let estimatedSaved = 0;
    for (const [, data] of this.incrementalStorage) {
      // 估算：完整存储约为快照的 1.5 倍（因为快照只有字符串）
      const snapshotSize = data.removedSnapshots.length + data.addedSnapshots.length;
      estimatedSaved += snapshotSize * 500; // 假设每个 Action 平均节省 500 字节
    }
    
    return {
      enabled: this.useIncrementalStorage,
      storedBatches: this.incrementalStorage.size,
      estimatedMemorySaved: estimatedSaved
    };
  }
  
  /**
   * 撤销批量操作
   * 
   * @param batchId 批量操作 ID
   * @returns 撤销结果，包含移除的 action IDs 和恢复的 actions
   */
  public undoBatchOperation(batchId: string): { success: boolean; removedActionIds: string[]; restoredActions: DrawAction[] } {
    const batchIndex = this.batchOperations.findIndex(b => b.id === batchId);
    if (batchIndex === -1) {
      logger.warn('未找到批量操作', { batchId });
      return { success: false, removedActionIds: [], restoredActions: [] };
    }
    
    const batch = this.batchOperations[batchIndex];
    
    // 1. 移除添加的 Actions（从 HistoryManager 内部）
    for (const actionId of batch.addedActionIds) {
      this.removeActionById(actionId);
    }
    
    // 2. 恢复移除的 Actions
    let restoredActions: DrawAction[];
    
    if (batch.useIncrementalStorage) {
      // 从增量存储恢复
      const incrementalData = this.incrementalStorage.get(batchId);
      if (!incrementalData) {
        logger.error('增量存储数据丢失', { batchId });
        return { success: false, removedActionIds: [], restoredActions: [] };
      }
      restoredActions = incrementalData.removedSnapshots.map(s => this.restoreActionFromSnapshot(s));
    } else {
      // 从完整存储恢复
      restoredActions = (batch.removedActions || []).map(a => ({ ...a }));
    }
    
    for (const action of restoredActions) {
      this.history.push({ ...action });
      this.currentMemoryBytes += this.calculateActionMemorySize(action);
    }
    
    // ✅ 从批量操作列表中移除已撤销的操作（防止重复撤销）
    this.batchOperations.splice(batchIndex, 1);
    
    // 清理增量存储
    if (batch.useIncrementalStorage) {
      this.incrementalStorage.delete(batchId);
    }
    
    logger.info('批量操作已撤销', {
      batchId,
      type: batch.type,
      restoredCount: restoredActions.length,
      removedCount: batch.addedActionIds.length,
      useIncrementalStorage: batch.useIncrementalStorage
    });
    
    this.emitHistoryChanged();
    return { 
      success: true, 
      removedActionIds: [...batch.addedActionIds], 
      restoredActions 
    };
  }
  
  /**
   * 重做批量操作
   * 
   * @param batchId 批量操作 ID
   * @returns 是否成功
   */
  public redoBatchOperation(batchId: string): boolean {
    const batch = this.batchOperations.find(b => b.id === batchId);
    if (!batch) {
      logger.warn('未找到批量操作', { batchId });
      return false;
    }
    
    // 1. 移除原始 Actions
    for (const actionId of batch.removedActionIds) {
      this.removeActionById(actionId);
    }
    
    // 2. 添加新 Actions
    let addedActions: DrawAction[];
    
    if (batch.useIncrementalStorage) {
      // 从增量存储恢复
      const incrementalData = this.incrementalStorage.get(batchId);
      if (!incrementalData) {
        logger.error('增量存储数据丢失', { batchId });
        return false;
      }
      addedActions = incrementalData.addedSnapshots.map(s => this.restoreActionFromSnapshot(s));
    } else {
      // 从完整存储恢复
      addedActions = batch.addedActions || [];
    }
    
    for (const action of addedActions) {
      this.addAction({ ...action });
    }
    
    logger.info('批量操作已重做', {
      batchId,
      type: batch.type,
      useIncrementalStorage: batch.useIncrementalStorage
    });
    
    this.emitHistoryChanged();
    return true;
  }
  
  /**
   * 获取最近的批量操作
   */
  public getLastBatchOperation(): BatchOperation | null {
    return this.batchOperations[this.batchOperations.length - 1] || null;
  }
  
  /**
   * 获取所有批量操作
   */
  public getBatchOperations(): BatchOperation[] {
    return [...this.batchOperations];
  }
  
  /**
   * 清空批量操作记录
   */
  public clearBatchOperations(): void {
    this.batchOperations = [];
  }
  
  // ==================== 批量操作支持结束 ====================

  // ==================== 可撤销的变形操作 ====================
  
  /**
   * 变形操作记录（用于支持 undo/redo 的变形）
   */
  private transformHistory: Array<{
    id: string;
    type: 'transform';
    beforeActions: DrawAction[];
    afterActions: DrawAction[];
    timestamp: number;
  }> = [];
  private maxTransformHistory: number = 50;
  
  /**
   * 记录可撤销的变形操作
   * 用于选区移动/缩放/旋转等变形操作
   * 
   * @param beforeActions 变形前的 actions（深拷贝）
   * @param afterActions 变形后的 actions
   * @returns 变形操作 ID
   */
  public recordTransform(
    beforeActions: DrawAction[],
    afterActions: DrawAction[]
  ): string {
    const transformId = `transform-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // 保存变形记录
    this.transformHistory.push({
      id: transformId,
      type: 'transform',
      beforeActions: beforeActions.map(a => JSON.parse(JSON.stringify(a))), // 深拷贝
      afterActions: afterActions.map(a => JSON.parse(JSON.stringify(a))),   // 深拷贝
      timestamp: Date.now()
    });
    
    // 限制记录数量
    if (this.transformHistory.length > this.maxTransformHistory) {
      this.transformHistory.shift();
    }
    
    // 应用变形（更新历史记录中的 actions）
    for (const action of afterActions) {
      this.updateAction(action);
    }
    
    logger.info('变形操作已记录', {
      transformId,
      actionsCount: afterActions.length,
      actionIds: afterActions.map(a => a.id)
    });
    
    this.emitHistoryChanged();
    return transformId;
  }
  
  /**
   * 撤销变形操作
   * @returns 是否成功撤销
   */
  public undoTransform(): boolean {
    const lastTransform = this.transformHistory.pop();
    if (!lastTransform) {
      logger.debug('没有可撤销的变形操作');
      return false;
    }
    
    // 恢复变形前的状态
    for (const action of lastTransform.beforeActions) {
      this.updateAction(action);
    }
    
    logger.info('变形操作已撤销', {
      transformId: lastTransform.id,
      actionsCount: lastTransform.beforeActions.length
    });
    
    this.emitHistoryChanged();
    return true;
  }
  
  /**
   * 检查是否有可撤销的变形操作
   */
  public canUndoTransform(): boolean {
    return this.transformHistory.length > 0;
  }
  
  /**
   * 获取变形历史记录数量
   */
  public getTransformHistoryCount(): number {
    return this.transformHistory.length;
  }
  
  /**
   * 清空变形历史
   */
  public clearTransformHistory(): void {
    this.transformHistory = [];
    logger.debug('变形历史已清空');
  }
  
  // ==================== 可撤销的变形操作结束 ====================

  /**
   * 更新动作（用于修改已存在的action，如拖拽锚点、变换等）
   * 注意：此方法直接更新，不记录到变形历史。如需支持 undo，请使用 recordTransform
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

  /**
   * 设置 EventBus 引用
   */
  public setEventBus(eventBus: EventBus): void {
    this.unsubscribeFromEvents();
    this.eventBus = eventBus;
    this.subscribeToEvents();
  }

  /**
   * 发出历史变更事件
   */
  private emitHistoryChanged(): void {
    if (!this.eventBus) return;
    
    this.eventBus.emit('history:changed', {
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      count: this.history.length
    });
  }

  /**
   * 订阅 EventBus 事件
   */
  private subscribeToEvents(): void {
    if (!this.eventBus) return;

    // 订阅 action 更新事件 - 自动更新历史记录
    const unsubAction = this.eventBus.on('action:updated', ({ actionId, changes }) => {
      const action = this.getActionById(actionId);
      if (action) {
        const updatedAction = { ...action, ...changes };
        this.updateAction(updatedAction as DrawAction);
      }
    });
    this.eventUnsubscribers.push(unsubAction);

    // 订阅撤销/重做事件
    const unsubUndo = this.eventBus.on('history:undo', () => {
      this.undo();
    });
    this.eventUnsubscribers.push(unsubUndo);

    const unsubRedo = this.eventBus.on('history:redo', () => {
      this.redo();
    });
    this.eventUnsubscribers.push(unsubRedo);
  }

  /**
   * 取消 EventBus 订阅
   */
  private unsubscribeFromEvents(): void {
    this.eventUnsubscribers.forEach(unsub => unsub());
    this.eventUnsubscribers = [];
  }
} 