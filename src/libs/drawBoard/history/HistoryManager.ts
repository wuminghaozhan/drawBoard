import type { DrawAction } from '../tools/DrawTool';

export class HistoryManager {
  private history: DrawAction[] = [];
  private undoneActions: DrawAction[] = [];
  private maxHistorySize: number = 100;
  private maxUndoneSize: number = 50; // 限制重做栈大小

  public addAction(action: DrawAction): void {
    console.log('=== 添加动作到历史记录 ===', action);
    this.history.push(action);
    
    // 清空重做栈，但限制大小避免内存泄漏
    if (this.undoneActions.length > 0) {
      this.undoneActions = [];
    }
    
    // 限制历史记录大小
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
    
    console.log('=== 历史记录数量 ===', this.history.length);
  }

  // 撤销
  public undo(): DrawAction | null {
    if (this.history.length === 0) return null;
    
    const action = this.history.pop()!;
    this.undoneActions.push(action);
    
    // 限制重做栈大小
    if (this.undoneActions.length > this.maxUndoneSize) {
      this.undoneActions.shift();
    }
    
    return action;
  }

  // 重做
  public redo(): DrawAction | null {
    if (this.undoneActions.length === 0) return null;
    
    const action = this.undoneActions.pop()!;
    this.history.push(action);
    return action;
  }

  public canUndo(): boolean {
    return this.history.length > 0;
  }

  public canRedo(): boolean {
    return this.undoneActions.length > 0;
  }

  public getHistory(): DrawAction[] {
    return [...this.history];
  }

  public clear(): void {
    this.history.length = 0; // 更高效的方式清空数组
    this.undoneActions.length = 0;
  }

  public setMaxHistorySize(size: number): void {
    this.maxHistorySize = size;
    // 批量移除超出限制的历史记录
    while (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }

  public setMaxUndoneSize(size: number): void {
    this.maxUndoneSize = size;
    while (this.undoneActions.length > this.maxUndoneSize) {
      this.undoneActions.shift();
    }
  }

  public getHistoryCount(): number {
    return this.history.length;
  }

  public getUndoneCount(): number {
    return this.undoneActions.length;
  }

  public getMemoryUsage(): number {
    // 估算内存使用量（粗略计算）
    const historySize = this.history.length * 100; // 假设每个 action 约 100 bytes
    const undoneSize = this.undoneActions.length * 100;
    return historySize + undoneSize;
  }

  // 删除指定的动作
  public removeActions(actionIds: string[]): void {
    const idSet = new Set(actionIds);
    this.history = this.history.filter(action => !idSet.has(action.id));
    this.undoneActions = this.undoneActions.filter(action => !idSet.has(action.id));
  }
} 