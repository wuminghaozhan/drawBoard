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
  private operationCount: number = 0;

  /**
   * 添加动作到历史记录（智能内存管理）
   */
  public addAction(action: DrawAction): void {
    logger.debug('添加动作到历史记录, ID:', action.id);
    
    // 计算动作的内存大小
    const actionMemorySize = this.calculateActionMemorySize(action);
    
    this.history.push(action);
    this.currentMemoryBytes += actionMemorySize;
    
    // 清空重做栈
    if (this.undoneActions.length > 0) {
      this.currentMemoryBytes -= this.calculateArrayMemorySize(this.undoneActions);
      this.undoneActions = [];
    }
    
    // 增量检查内存使用
    this.operationCount++;
    if (this.operationCount % this.memoryCheckInterval === 0) {
      this.enforceMemoryLimits();
    } else {
      // 简单检查数量限制
      this.enforceCountLimits();
    }
    
    logger.debug('历史记录数量:', this.history.length, '内存使用:', (this.currentMemoryBytes / 1024 / 1024).toFixed(2), 'MB');
  }

  /**
   * 撤销操作（智能内存管理）
   */
  public undo(): DrawAction | null {
    if (this.history.length === 0) return null;
    
    const action = this.history.pop()!;
    const actionMemorySize = this.calculateActionMemorySize(action);
    
    this.undoneActions.push(action);
    this.currentMemoryBytes -= actionMemorySize; // 从历史记录移除
    this.currentMemoryBytes += actionMemorySize; // 添加到重做栈（内存总量不变）
    
    // 限制重做栈大小
    if (this.undoneActions.length > this.maxUndoneSize) {
      const removedAction = this.undoneActions.shift()!;
      this.currentMemoryBytes -= this.calculateActionMemorySize(removedAction);
    }
    
    return action;
  }

  /**
   * 重做操作（智能内存管理）
   */
  public redo(): DrawAction | null {
    if (this.undoneActions.length === 0) return null;
    
    const action = this.undoneActions.pop()!;
    
    this.history.push(action);
    // 内存总量不变，只是在两个数组间移动
    
    return action;
  }

  /**
   * 计算单个动作的内存大小（字节）
   */
  private calculateActionMemorySize(action: DrawAction): number {
    let size = 0;
    
    // 基础对象大小
    size += 200; // 基础对象开销
    
    // points数组
    size += action.points.length * 24; // 每个点约24字节 (x, y, timestamp等)
    
    // 字符串字段
    size += (action.id?.length || 0) * 2;
    size += (action.type?.length || 0) * 2;
    size += (action.text?.length || 0) * 2;
    
    // context对象
    size += 100; // context对象开销
    
    // 预渲染缓存（如果存在）
    if (action.preRenderedCache) {
      size += action.preRenderedCache.memorySize || 0;
    }
    
    // 选择相关数据
    if (action.selectedActions) {
      size += action.selectedActions.length * 50; // 每个选择项约50字节
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
   * 强制执行内存限制（完整检查）
   */
  private enforceMemoryLimits(): void {
    // 重新计算精确的内存使用（防止累积误差）
    this.currentMemoryBytes = this.calculateArrayMemorySize(this.history) + 
                              this.calculateArrayMemorySize(this.undoneActions);
    
    const currentMemoryMB = this.currentMemoryBytes / 1024 / 1024;
    
    if (currentMemoryMB > this.maxMemoryMB) {
      logger.info(`内存使用超限 (${currentMemoryMB.toFixed(2)}MB > ${this.maxMemoryMB}MB)，开始清理`);
      
      // 优先清理重做栈
      while (this.undoneActions.length > 0 && currentMemoryMB > this.maxMemoryMB * 0.9) {
        const removedAction = this.undoneActions.shift()!;
        this.currentMemoryBytes -= this.calculateActionMemorySize(removedAction);
      }
      
      // 如果还是超限，清理历史记录
      while (this.history.length > 10 && currentMemoryMB > this.maxMemoryMB * 0.8) {
        const removedAction = this.history.shift()!;
        this.currentMemoryBytes -= this.calculateActionMemorySize(removedAction);
      }
      
      logger.info(`内存清理完成，当前使用: ${(this.currentMemoryBytes / 1024 / 1024).toFixed(2)}MB`);
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
} 