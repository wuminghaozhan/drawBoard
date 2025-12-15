import type { DrawAction } from '../tools/DrawTool';
import type { HistoryManager } from '../history/HistoryManager';
import type { DrawingHandler } from '../handlers/DrawingHandler';
import type { ToolManager } from '../tools/ToolManager';
import { ToolTypeGuards } from '../tools/ToolInterfaces';
import { logger } from '../infrastructure/logging/Logger';

/**
 * DrawBoard 历史记录 API
 * 
 * 封装所有历史记录相关的操作，包括：
 * - 撤销/重做
 * - 历史记录查询
 * - 历史记录统计
 * 
 * 通过组合模式，将历史记录相关的逻辑从 DrawBoard 主类中分离出来
 */
export class DrawBoardHistoryAPI {
  private historyManager: HistoryManager;
  private drawingHandler: DrawingHandler;
  private toolManager: ToolManager;
  private syncLayerDataToSelectTool: () => void;

  constructor(
    historyManager: HistoryManager,
    drawingHandler: DrawingHandler,
    toolManager: ToolManager,
    syncLayerDataToSelectTool: () => void
  ) {
    this.historyManager = historyManager;
    this.drawingHandler = drawingHandler;
    this.toolManager = toolManager;
    this.syncLayerDataToSelectTool = syncLayerDataToSelectTool;
  }

  /**
   * 撤销操作
   * 
   * 优先级（按时间戳，最近的优先）：
   * 1. 批量操作（橡皮擦切割等）
   * 2. 变形操作（移动/缩放/旋转）
   * 3. 普通操作（添加/删除 action）
   */
  public async undo(): Promise<boolean> {
    try {
      // ✅ 执行 undo 前：清理当前状态
      this.prepareForHistoryOperation();
      
      // 获取各类操作的时间戳，撤销最近的
      const lastBatch = this.historyManager.getLastBatchOperation();
      const transformCount = this.historyManager.getTransformHistoryCount();
      const canUndoNormal = this.historyManager.canUndo();
      
      // 确定撤销类型（按时间戳选择最近的）
      const batchTime = lastBatch?.timestamp ?? 0;
      // 变形操作没有暴露时间戳，假设如果存在就是最近的
      const hasTransform = transformCount > 0;
      
      // ✅ 优先撤销批量操作（橡皮擦切割）
      if (lastBatch && batchTime > 0) {
        const result = this.historyManager.undoBatchOperation(lastBatch.id);
        if (result.success) {
          // 同步到 VirtualLayerManager
          // 1. 移除新添加的 actions
          for (const actionId of result.removedActionIds) {
            this.drawingHandler.removeActionFromVirtualLayer(actionId);
          }
          // 2. 恢复原始 actions
          for (const action of result.restoredActions) {
            this.drawingHandler.addActionToVirtualLayer(action);
          }
          
          this.drawingHandler.invalidateOffscreenCache(true);
          this.syncLayerDataToSelectTool();
          await this.drawingHandler.forceRedraw();
          logger.debug('批量操作撤销成功', { 
            batchId: lastBatch.id, 
            type: lastBatch.type,
            removedCount: result.removedActionIds.length,
            restoredCount: result.restoredActions.length
          });
          return true;
        }
      }
      
      // ✅ 撤销变形操作
      if (hasTransform) {
        const success = this.historyManager.undoTransform();
        if (success) {
          this.drawingHandler.invalidateOffscreenCache(true);
          this.syncLayerDataToSelectTool();
          await this.drawingHandler.forceRedraw();
          logger.debug('变形撤销成功');
          return true;
        }
      }
      
      // 撤销普通操作（添加/删除 action）
      if (!canUndoNormal) {
        logger.debug('无法撤销：没有可撤销的操作');
        return false;
      }
      
      const action = this.historyManager.undo();
      
      if (action) {
        // 标记离屏缓存和所有虚拟图层缓存过期
        this.drawingHandler.invalidateOffscreenCache(true);
        this.syncLayerDataToSelectTool();
        await this.drawingHandler.forceRedraw();
        logger.debug('撤销成功', { actionId: action.id, actionType: action.type });
        return true;
      } else {
        logger.warn('撤销失败：没有返回action');
        return false;
      }
    } catch (error) {
      logger.error('撤销操作失败', { error });
      return false;
    }
  }

  /**
   * 重做操作
   * 
   * 支持：批量操作重做、普通操作重做
   * 注意：变形操作目前不支持重做
   */
  public async redo(): Promise<boolean> {
    // 检查是否可以重做
    if (!this.canRedo()) {
      logger.debug('无法重做：没有可重做的操作');
      return false;
    }
    
    try {
      // ✅ 执行 redo 前：清理当前状态
      this.prepareForHistoryOperation();
      
      // 注意：批量操作 undo 后会从 batchOperations 中移除
      // 需要通过其他方式跟踪已撤销的批量操作才能重做
      // 当前实现：只支持普通操作的重做
      
      const action = this.historyManager.redo();
      
      if (action) {
        // 标记离屏缓存和所有虚拟图层缓存过期
        this.drawingHandler.invalidateOffscreenCache(true);
        this.syncLayerDataToSelectTool();
        await this.drawingHandler.forceRedraw();
        logger.debug('重做成功', { actionId: action.id, actionType: action.type });
        return true;
      } else {
        logger.warn('重做失败：没有返回action');
        return false;
      }
    } catch (error) {
      logger.error('重做操作失败', { error });
      return false;
    }
  }
  
  /**
   * 准备执行历史操作（undo/redo 前的清理）
   * 
   * - 清除选择状态
   * - 中断当前绘制
   * - 重置工具状态
   */
  private prepareForHistoryOperation(): void {
    // 1. 清除选择状态
    const currentTool = this.toolManager.getCurrentToolInstance();
    if (currentTool && ToolTypeGuards.isSelectTool(currentTool)) {
      currentTool.clearSelection();
      logger.debug('undo/redo 准备: 清除选择状态');
    }
    
    // 2. 重置绘制状态（中断当前绘制）
    this.drawingHandler.resetDrawingState();
    logger.debug('undo/redo 准备: 重置绘制状态');
  }
  
  /**
   * 清除选择状态（如果当前工具是选择工具）
   * @deprecated 使用 prepareForHistoryOperation 代替
   */
  private clearSelectionIfNeeded(): void {
    const currentTool = this.toolManager.getCurrentToolInstance();
    if (currentTool && ToolTypeGuards.isSelectTool(currentTool)) {
      currentTool.clearSelection();
      logger.debug('DrawBoardHistoryAPI: 清除选择状态');
    }
  }

  /**
   * 清空历史记录
   */
  public async clear(): Promise<void> {
    this.historyManager.clear();
    await this.drawingHandler.forceRedraw();
  }

  /**
   * 是否可以撤销（包括批量操作、变形操作和普通操作）
   */
  public canUndo(): boolean {
    const hasBatch = this.historyManager.getLastBatchOperation() !== null;
    const hasTransform = this.historyManager.canUndoTransform();
    const hasNormal = this.historyManager.canUndo();
    return hasBatch || hasTransform || hasNormal;
  }

  /**
   * 是否可以重做
   */
  public canRedo(): boolean {
    return this.historyManager.canRedo();
  }

  /**
   * 获取历史记录
   */
  public getHistory(): DrawAction[] {
    return this.historyManager.getHistory();
  }
}

