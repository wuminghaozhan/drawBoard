import type { DrawAction } from '../tools/DrawTool';
import { logger } from '../infrastructure/logging/Logger';
import type { EventBus } from '../infrastructure/events/EventBus';
import { ConfigConstants } from '../config/Constants';

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
 * 变形操作记录
 * 用于支持 undo/redo 的变形操作
 */
export interface TransformRecord {
  id: string;
  type: 'transform';
  beforeActions: DrawAction[];
  afterActions: DrawAction[];
  timestamp: number;
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
  private historyIndex: Map<string, number> = new Map(); // Action ID -> history 数组索引（O(1) 查找）
  private undoneIndex: Map<string, number> = new Map(); // Action ID -> undoneActions 数组索引
  private maxHistorySize: number = ConfigConstants.HISTORY.MAX_HISTORY_SIZE; // 最大历史记录数量
  private maxUndoneSize: number = ConfigConstants.HISTORY.MAX_UNDONE_SIZE; // 最大重做栈大小
  
  // 内存管理相关
  private maxMemoryMB: number = ConfigConstants.HISTORY.MAX_MEMORY_MB; // 最大内存限制
  private currentMemoryBytes: number = 0;
  private memoryCheckInterval: number = ConfigConstants.HISTORY.MEMORY_CHECK_INTERVAL;
  private readonly MEMORY_RECALCULATE_INTERVAL = ConfigConstants.HISTORY.MEMORY_RECALCULATE_INTERVAL; // 内存重新计算间隔
  private operationCount: number = 0; // 操作计数

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
  private undoneBatchOperations: BatchOperation[] = []; // 已撤销的批量操作（用于 redo）
  private maxBatchOperations: number = ConfigConstants.HISTORY.MAX_BATCH_OPERATIONS;
  private incrementalStorage: Map<string, IncrementalBatchStorage> = new Map();
  private useIncrementalStorage: boolean = true; // 默认启用增量存储
  
  /**
   * 添加动作到历史记录（智能内存管理）
   */
  public addAction(action: DrawAction): void {
    // 基本验证
    if (!action?.id || !action.type) {
      logger.warn('添加无效的 action', { action });
      return;
    }
    
    // O(1) 检查是否已存在
    if (this.historyIndex.has(action.id) || this.undoneIndex.has(action.id)) {
      logger.warn('Action 已存在，跳过添加', { actionId: action.id });
      return;
    }
    
    logger.debug('添加动作到历史记录, ID:', action.id);
    
    const actionMemorySize = this.calculateActionMemorySize(action);
    
    // 添加到历史并更新索引
    this.history.push(action);
    this.historyIndex.set(action.id, this.history.length - 1);
    this.currentMemoryBytes += actionMemorySize;
    
    // 清空重做栈
    if (this.undoneActions.length > 0) {
      const undoneMemorySize = this.calculateArrayMemorySize(this.undoneActions);
      this.currentMemoryBytes -= undoneMemorySize;
      this.undoneActions = [];
      this.undoneIndex.clear();
      logger.debug('清空重做栈，释放内存:', (undoneMemorySize / 1024 / 1024).toFixed(2), 'MB');
    }
    
    // 增量检查内存使用
    this.operationCount++;
    
    if (this.operationCount % this.MEMORY_RECALCULATE_INTERVAL === 0) {
      this.recalculateMemory();
    }
    
    if (this.operationCount % this.memoryCheckInterval === 0) {
      this.enforceMemoryLimits();
    } else {
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
   * 撤销操作
   */
  public undo(): DrawAction | null {
    if (this.history.length === 0) return null;
    
    const action = this.history.pop();
    if (!action) return null;
    
    // 更新索引
    this.historyIndex.delete(action.id);
    this.undoneActions.push(action);
    this.undoneIndex.set(action.id, this.undoneActions.length - 1);
    // 注意：内存总量不变，只是在两个数组间移动
    
    // 限制重做栈大小
    if (this.undoneActions.length > this.maxUndoneSize) {
      const removedAction = this.undoneActions.shift();
      if (removedAction) {
        this.undoneIndex.delete(removedAction.id);
        this.rebuildUndoneIndex(); // 重建索引
        this.currentMemoryBytes -= this.calculateActionMemorySize(removedAction);
      }
    }
    
    return action;
  }

  /**
   * 重做操作
   */
  public redo(): DrawAction | null {
    if (this.undoneActions.length === 0) return null;
    
    const action = this.undoneActions.pop();
    if (!action) return null;
    
    // 更新索引
    this.undoneIndex.delete(action.id);
    this.history.push(action);
    this.historyIndex.set(action.id, this.history.length - 1);
    // 内存总量不变，只是在两个数组间移动
    
    return action;
  }
  
  /**
   * 重建 undone 索引（shift 操作后调用）
   */
  private rebuildUndoneIndex(): void {
    this.undoneIndex.clear();
    this.undoneActions.forEach((action, idx) => {
      this.undoneIndex.set(action.id, idx);
    });
  }
  
  /**
   * 重建 history 索引（shift 操作后调用）
   */
  private rebuildHistoryIndex(): void {
    this.historyIndex.clear();
    this.history.forEach((action, idx) => {
      this.historyIndex.set(action.id, idx);
    });
  }

  /**
   * 计算单个动作的内存大小（字节）
   */
  private calculateActionMemorySize(action: DrawAction): number {
    const { MEMORY_BASE_OBJECT_SIZE, MEMORY_POINT_SIZE, MEMORY_CONTEXT_SIZE, MEMORY_SELECTION_ITEM_SIZE } = ConfigConstants.HISTORY;
    let size = MEMORY_BASE_OBJECT_SIZE;
    
    // points数组
    if (action.points?.length) {
      size += action.points.length * MEMORY_POINT_SIZE;
    }
    
    // 字符串字段
    size += this.calculateStringSize(action.id);
    size += this.calculateStringSize(action.type);
    size += this.calculateStringSize(action.text);
    
    // context对象
    if (action.context) {
      size += MEMORY_CONTEXT_SIZE;
    }
    
    // 预渲染缓存
    if (action.preRenderedCache) {
      size += action.preRenderedCache.memorySize || 0;
    }
    
    // 选择相关数据
    if (action.selectedActions?.length) {
      size += action.selectedActions.length * MEMORY_SELECTION_ITEM_SIZE;
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
   * 强制执行内存限制（完整检查）
   */
  private enforceMemoryLimits(): void {
    // 重新计算精确的内存使用（防止累积误差）
    const historyMemory = this.calculateArrayMemorySize(this.history);
    const undoneMemory = this.calculateArrayMemorySize(this.undoneActions);
    this.currentMemoryBytes = historyMemory + undoneMemory;
    
    let currentMemoryMB = this.currentMemoryBytes / 1024 / 1024;
    
    if (currentMemoryMB > this.maxMemoryMB) {
      logger.info(`内存使用超限 (${currentMemoryMB.toFixed(2)}MB > ${this.maxMemoryMB}MB)，开始清理`);
      
      let cleanedMemory = 0;
      let needRebuildUndone = false;
      let needRebuildHistory = false;
      
      // 优先清理重做栈
      while (this.undoneActions.length > 0 && currentMemoryMB > this.maxMemoryMB * 0.9) {
        const removedAction = this.undoneActions.shift();
        if (removedAction) {
          this.undoneIndex.delete(removedAction.id);
          needRebuildUndone = true;
          const actionSize = this.calculateActionMemorySize(removedAction);
          cleanedMemory += actionSize;
          this.currentMemoryBytes -= actionSize;
          currentMemoryMB = this.currentMemoryBytes / 1024 / 1024;
        }
      }
      
      // 如果还是超限，清理历史记录
      while (this.history.length > 10 && currentMemoryMB > this.maxMemoryMB * 0.8) {
        const removedAction = this.history.shift();
        if (removedAction) {
          this.historyIndex.delete(removedAction.id);
          needRebuildHistory = true;
          const actionSize = this.calculateActionMemorySize(removedAction);
          cleanedMemory += actionSize;
          this.currentMemoryBytes -= actionSize;
          currentMemoryMB = this.currentMemoryBytes / 1024 / 1024;
        }
      }
      
      // 批量重建索引（比循环中重建更高效）
      if (needRebuildUndone) this.rebuildUndoneIndex();
      if (needRebuildHistory) this.rebuildHistoryIndex();
      
      logger.info(`内存清理完成，释放: ${(cleanedMemory / 1024 / 1024).toFixed(2)}MB, 当前使用: ${(this.currentMemoryBytes / 1024 / 1024).toFixed(2)}MB`);
    }
  }

  /**
   * 强制执行数量限制（快速检查）
   */
  private enforceCountLimits(): void {
    if (this.history.length > this.maxHistorySize) {
      const removedAction = this.history.shift()!;
      this.historyIndex.delete(removedAction.id);
      this.rebuildHistoryIndex(); // shift 后需要重建索引
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

  /**
   * @deprecated 使用 getHistory() 替代
   */
  public getAllActions(): DrawAction[] {
    return this.getHistory();
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
    this.historyIndex.clear();
    this.undoneIndex.clear();
    this.operationCount = 0;
  }

  /**
   * 销毁历史管理器，清理所有资源
   */
  public destroy(): void {
    // 取消 EventBus 订阅
    this.unsubscribeFromEvents();
    this.eventBus = undefined;
    
    // 清空历史记录和索引
    this.history = [];
    this.undoneActions = [];
    this.historyIndex.clear();
    this.undoneIndex.clear();
    
    // 重置内存统计
    this.currentMemoryBytes = 0;
    this.operationCount = 0;
    
    // 重置配置
    this.maxHistorySize = ConfigConstants.HISTORY.MAX_HISTORY_SIZE;
    this.maxUndoneSize = ConfigConstants.HISTORY.MAX_UNDONE_SIZE;
    this.maxMemoryMB = ConfigConstants.HISTORY.MAX_MEMORY_MB;
    this.memoryCheckInterval = ConfigConstants.HISTORY.MEMORY_CHECK_INTERVAL;
    
    logger.info('HistoryManager destroyed');
  }

  /**
   * 按ID移除特定动作
   */
  public removeActionById(actionId: string): boolean {
    let removed = false;
    
    // O(1) 查找历史记录索引
    const historyIdx = this.historyIndex.get(actionId);
    if (historyIdx !== undefined) {
      const removedAction = this.history.splice(historyIdx, 1)[0];
      this.historyIndex.delete(actionId);
      this.rebuildHistoryIndex(); // splice 后需要重建索引
      this.currentMemoryBytes -= this.calculateActionMemorySize(removedAction);
      logger.debug('从历史记录中移除动作:', actionId);
      removed = true;
    }

    // O(1) 查找重做栈索引
    const undoneIdx = this.undoneIndex.get(actionId);
    if (undoneIdx !== undefined) {
      const removedAction = this.undoneActions.splice(undoneIdx, 1)[0];
      this.undoneIndex.delete(actionId);
      this.rebuildUndoneIndex(); // splice 后需要重建索引
      this.currentMemoryBytes -= this.calculateActionMemorySize(removedAction);
      logger.debug('从重做栈中移除动作:', actionId);
      removed = true;
    }

    if (removed) {
      this.emitHistoryChanged();
    }

    return removed;
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
    const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    
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
    
    // 清空已撤销的批量操作（新操作会清空 redo 栈）
    this.clearUndoneBatchOperations();
    
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
   * 📝 排除运行时属性（如 imageElement、loadState 等），避免序列化失败
   */
  private createActionSnapshot(action: DrawAction): ActionSnapshot {
    // 深拷贝 action，排除运行时属性
    const serializableAction = this.sanitizeActionForSerialization(action);
    return {
      id: action.id,
      type: action.type,
      serializedData: JSON.stringify(serializableAction)
    };
  }
  
  /**
   * 清理 Action 中的运行时属性，使其可序列化
   */
  private sanitizeActionForSerialization(action: DrawAction): DrawAction {
    const sanitized = { ...action } as DrawAction & {
      imageElement?: unknown;
      loadState?: unknown;
      loadError?: unknown;
    };
    
    // 如果是图片 action，排除运行时属性
    if (action.type === 'image') {
      delete sanitized.imageElement;
      delete sanitized.loadState;
      delete sanitized.loadError;
    }
    
    return sanitized;
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
      const actionCopy = { ...action };
      this.history.push(actionCopy);
      this.historyIndex.set(actionCopy.id, this.history.length - 1);
      this.currentMemoryBytes += this.calculateActionMemorySize(actionCopy);
    }
    
    // ✅ 从批量操作列表中移除，放入已撤销列表（支持 redo）
    this.batchOperations.splice(batchIndex, 1);
    this.undoneBatchOperations.push(batch);
    
    // 注意：增量存储数据保留，redo 时需要使用
    
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
  public redoBatchOperation(batchId: string): { success: boolean; removedActionIds: string[]; addedActions: DrawAction[] } {
    // 从已撤销的批量操作列表中查找
    const undoneIndex = this.undoneBatchOperations.findIndex(b => b.id === batchId);
    if (undoneIndex === -1) {
      logger.warn('未找到已撤销的批量操作', { batchId });
      return { success: false, removedActionIds: [], addedActions: [] };
    }
    
    const batch = this.undoneBatchOperations[undoneIndex];
    
    // 1. 移除原始 Actions（从 HistoryManager 内部）
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
        return { success: false, removedActionIds: [], addedActions: [] };
      }
      addedActions = incrementalData.addedSnapshots.map(s => this.restoreActionFromSnapshot(s));
    } else {
      // 从完整存储恢复
      addedActions = (batch.addedActions || []).map(a => ({ ...a }));
    }
    
    for (const action of addedActions) {
      this.addAction({ ...action });
    }
    
    // 从已撤销列表移除，放回批量操作列表
    this.undoneBatchOperations.splice(undoneIndex, 1);
    this.batchOperations.push(batch);
    
    logger.info('批量操作已重做', {
      batchId,
      type: batch.type,
      useIncrementalStorage: batch.useIncrementalStorage
    });
    
    this.emitHistoryChanged();
    return { 
      success: true, 
      removedActionIds: [...batch.removedActionIds], 
      addedActions 
    };
  }
  
  /**
   * 获取最后一个已撤销的批量操作（用于 redo）
   */
  public getLastUndoneBatchOperation(): BatchOperation | null {
    return this.undoneBatchOperations[this.undoneBatchOperations.length - 1] || null;
  }
  
  /**
   * 清空已撤销的批量操作（执行新操作时调用）
   */
  private clearUndoneBatchOperations(): void {
    // 清理增量存储
    for (const batch of this.undoneBatchOperations) {
      if (batch.useIncrementalStorage) {
        this.incrementalStorage.delete(batch.id);
      }
    }
    this.undoneBatchOperations = [];
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
  
  // 变形操作历史
  private transformHistory: TransformRecord[] = [];
  private undoneTransformHistory: TransformRecord[] = []; // 变形操作重做栈
  private maxTransformHistory: number = ConfigConstants.HISTORY.MAX_TRANSFORM_HISTORY;
  
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
    const transformId = `transform-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    
    // 🔧 清理运行时属性后再深拷贝，避免序列化问题
    const cleanedBeforeActions = beforeActions.map(a => 
      JSON.parse(JSON.stringify(this.sanitizeActionForSerialization(a)))
    );
    const cleanedAfterActions = afterActions.map(a => 
      JSON.parse(JSON.stringify(this.sanitizeActionForSerialization(a)))
    );
    
    // 保存变形记录
    this.transformHistory.push({
      id: transformId,
      type: 'transform',
      beforeActions: cleanedBeforeActions,
      afterActions: cleanedAfterActions,
      timestamp: Date.now()
    });
    
    // 限制记录数量
    if (this.transformHistory.length > this.maxTransformHistory) {
      this.transformHistory.shift();
    }
    
    // 应用变形（更新历史记录中的 actions）
    let failedCount = 0;
    for (const action of afterActions) {
      if (!this.updateAction(action)) {
        failedCount++;
        logger.warn('recordTransform: 更新action失败', { actionId: action.id });
      }
    }
    
    logger.debug('变形操作已记录', {
      transformId,
      actionsCount: afterActions.length,
      failedCount
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
    
    // 🔧 保存到重做栈，支持 redo
    this.undoneTransformHistory.push(lastTransform);
    
    // 限制重做栈大小
    if (this.undoneTransformHistory.length > this.maxTransformHistory) {
      this.undoneTransformHistory.shift();
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
   * 重做变形操作
   * @returns 是否成功重做
   */
  public redoTransform(): boolean {
    const lastUndoneTransform = this.undoneTransformHistory.pop();
    if (!lastUndoneTransform) {
      logger.debug('没有可重做的变形操作');
      return false;
    }
    
    // 🔧 保存到撤销栈
    this.transformHistory.push(lastUndoneTransform);
    
    // 限制撤销栈大小
    if (this.transformHistory.length > this.maxTransformHistory) {
      this.transformHistory.shift();
    }
    
    // 恢复变形后的状态
    for (const action of lastUndoneTransform.afterActions) {
      this.updateAction(action);
    }
    
    logger.info('变形操作已重做', {
      transformId: lastUndoneTransform.id,
      actionsCount: lastUndoneTransform.afterActions.length
    });
    
    this.emitHistoryChanged();
    return true;
  }
  
  /**
   * 检查是否有可重做的变形操作
   */
  public canRedoTransform(): boolean {
    return this.undoneTransformHistory.length > 0;
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
   * 获取最后一个变形操作的时间戳
   */
  public getLastTransformTimestamp(): number {
    const last = this.transformHistory[this.transformHistory.length - 1];
    return last?.timestamp ?? 0;
  }
  
  /**
   * 获取最后一个已撤销的变形操作的时间戳（用于重做）
   */
  public getLastUndoneTransformTimestamp(): number {
    const last = this.undoneTransformHistory[this.undoneTransformHistory.length - 1];
    return last?.timestamp ?? 0;
  }
  
  /**
   * 清空变形历史
   */
  public clearTransformHistory(): void {
    this.transformHistory = [];
    this.undoneTransformHistory = []; // 🔧 同时清空重做栈
    logger.debug('变形历史已清空');
  }
  
  // ==================== 可撤销的变形操作结束 ====================

  /**
   * 内部更新方法（公共逻辑）
   */
  private doUpdateAction(updatedAction: DrawAction, silent: boolean): boolean {
    // O(1) 查找历史记录
    const historyIdx = this.historyIndex.get(updatedAction.id);
    if (historyIdx !== undefined) {
      const oldAction = this.history[historyIdx];
      const oldMemorySize = this.calculateActionMemorySize(oldAction);
      const newMemorySize = this.calculateActionMemorySize(updatedAction);
      
      this.history[historyIdx] = updatedAction;
      this.currentMemoryBytes = this.currentMemoryBytes - oldMemorySize + newMemorySize;
      
      if (!silent) {
        logger.debug('更新历史记录中的动作:', updatedAction.id);
      }
      return true;
    }

    // O(1) 查找重做栈
    const undoneIdx = this.undoneIndex.get(updatedAction.id);
    if (undoneIdx !== undefined) {
      const oldAction = this.undoneActions[undoneIdx];
      const oldMemorySize = this.calculateActionMemorySize(oldAction);
      const newMemorySize = this.calculateActionMemorySize(updatedAction);
      
      this.undoneActions[undoneIdx] = updatedAction;
      this.currentMemoryBytes = this.currentMemoryBytes - oldMemorySize + newMemorySize;
      
      if (!silent) {
        logger.debug('更新重做栈中的动作:', updatedAction.id);
      }
      return true;
    }

    return false;
  }

  /**
   * 更新动作（用于修改已存在的action）
   * 注意：此方法直接更新，不记录到变形历史。如需支持 undo，请使用 recordTransform
   * @param updatedAction 更新后的action（必须包含相同的id）
   * @returns 是否成功更新
   */
  public updateAction(updatedAction: DrawAction): boolean {
    if (!updatedAction?.id) {
      logger.warn('更新动作失败：action或id无效');
      return false;
    }

    const result = this.doUpdateAction(updatedAction, false);
    if (!result) {
      logger.warn('更新动作失败：未找到action:', updatedAction.id);
    }
    return result;
  }

  /**
   * 更新动作（静默模式，不记录日志）
   * 用于拖拽过程中的实时更新
   * @param updatedAction 更新后的action
   * @returns 是否成功更新
   */
  public updateActionWithoutHistory(updatedAction: DrawAction): boolean {
    if (!updatedAction?.id) {
      return false;
    }
    return this.doUpdateAction(updatedAction, true);
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
   * 根据ID获取action（O(1) 查找）
   * @param actionId action的ID
   * @returns 找到的action，如果不存在返回null
   */
  public getActionById(actionId: string): DrawAction | null {
    // O(1) 从历史记录中查找
    const historyIdx = this.historyIndex.get(actionId);
    if (historyIdx !== undefined) {
      return this.history[historyIdx];
    }

    // O(1) 从重做栈中查找
    const undoneIdx = this.undoneIndex.get(actionId);
    if (undoneIdx !== undefined) {
      return this.undoneActions[undoneIdx];
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