import type { DrawAction } from '../tools/DrawTool';
import type { HistoryManager } from '../history/HistoryManager';
import type { DrawingHandler } from '../handlers/DrawingHandler';
import type { ToolManager } from '../tools/ToolManager';
import { ToolTypeGuards } from '../tools/ToolInterfaces';
import { logger } from '../infrastructure/logging/Logger';
import type { HistoryAPIConfig } from './APIConfig';

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
  private config: HistoryAPIConfig;

  constructor(
    historyManager: HistoryManager,
    drawingHandler: DrawingHandler,
    toolManager: ToolManager,
    config: HistoryAPIConfig
  ) {
    this.historyManager = historyManager;
    this.drawingHandler = drawingHandler;
    this.toolManager = toolManager;
    this.config = config;
  }

  /**
   * 撤销操作
   * 
   * 按时间戳撤销最近的操作，类型包括：
   * - 批量操作（橡皮擦切割等）
   * - 变形操作（移动/缩放/旋转）
   * - 普通操作（添加/删除 action）
   */
  public async undo(): Promise<boolean> {
    try {
      // ✅ 执行 undo 前：清理当前状态
      this.prepareForHistoryOperation();
      
      // 获取各类操作的时间戳
      const lastBatch = this.historyManager.getLastBatchOperation();
      const batchTime = lastBatch?.timestamp ?? 0;
      const transformTime = this.historyManager.getLastTransformTimestamp();
      // 普通 action 没有时间戳，假设最早（0）
      const canUndoNormal = this.historyManager.canUndo();
      
      // 确定撤销类型（按时间戳选择最近的）
      const maxTime = Math.max(batchTime, transformTime);
      
      if (maxTime === 0 && !canUndoNormal) {
        logger.debug('无法撤销：没有可撤销的操作');
        return false;
      }
      
      // ✅ 撤销时间戳最大的操作
      if (batchTime > 0 && batchTime >= transformTime) {
        // 撤销批量操作
        const result = this.historyManager.undoBatchOperation(lastBatch!.id);
        if (result.success) {
          // 同步到 VirtualLayerManager
          for (const actionId of result.removedActionIds) {
            this.drawingHandler.removeActionFromVirtualLayer(actionId);
          }
          for (const action of result.restoredActions) {
            this.drawingHandler.addActionToVirtualLayer(action);
          }
          
          this.drawingHandler.invalidateOffscreenCache(true);
          this.config.syncLayerDataToSelectTool();
          await this.drawingHandler.forceRedraw();
          logger.debug('批量操作撤销成功', { 
            batchId: lastBatch!.id, 
            type: lastBatch!.type,
            removedCount: result.removedActionIds.length,
            restoredCount: result.restoredActions.length
          });
          return true;
        }
      }
      
      if (transformTime > 0 && transformTime > batchTime) {
        // 撤销变形操作
        const success = this.historyManager.undoTransform();
        if (success) {
          this.drawingHandler.invalidateOffscreenCache(true);
          this.config.syncLayerDataToSelectTool();
          await this.drawingHandler.forceRedraw();
          logger.debug('变形撤销成功');
          return true;
        }
      }
      
      // 撤销普通操作（添加/删除 action）
      if (!canUndoNormal) {
        logger.debug('无法撤销：没有可撤销的普通操作');
        return false;
      }
      
      const action = this.historyManager.undo();
      
      if (action) {
        this.drawingHandler.invalidateOffscreenCache(true);
        this.config.syncLayerDataToSelectTool();
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
   * 支持：批量操作重做、变形操作重做、普通操作重做
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
      
      // 获取各类操作的时间戳
      const lastUndoneBatch = this.historyManager.getLastUndoneBatchOperation();
      const batchTime = lastUndoneBatch?.timestamp ?? 0;
      const transformTime = this.historyManager.getLastUndoneTransformTimestamp();
      const canRedoNormal = this.historyManager.canRedo();
      
      // ✅ 重做时间戳最大的操作
      if (batchTime > 0 && batchTime >= transformTime) {
        // 重做批量操作
        const result = this.historyManager.redoBatchOperation(lastUndoneBatch!.id);
        if (result.success) {
          // 同步到 VirtualLayerManager
          for (const actionId of result.removedActionIds) {
            this.drawingHandler.removeActionFromVirtualLayer(actionId);
          }
          for (const action of result.addedActions) {
            this.drawingHandler.addActionToVirtualLayer(action);
          }
          
          this.drawingHandler.invalidateOffscreenCache(true);
          this.config.syncLayerDataToSelectTool();
          await this.drawingHandler.forceRedraw();
          logger.debug('批量操作重做成功', { 
            batchId: lastUndoneBatch!.id, 
            type: lastUndoneBatch!.type 
          });
          return true;
        }
      }
      
      // 🔧 重做变形操作
      if (transformTime > 0 && transformTime > batchTime) {
        const success = this.historyManager.redoTransform();
        if (success) {
          this.drawingHandler.invalidateOffscreenCache(true);
          this.config.syncLayerDataToSelectTool();
          await this.drawingHandler.forceRedraw();
          logger.debug('变形重做成功');
          return true;
        }
      }
      
      // 重做普通操作
      if (!canRedoNormal) {
        logger.debug('无法重做：没有可重做的普通操作');
        return false;
      }
      
      const action = this.historyManager.redo();
      
      if (action) {
        this.drawingHandler.invalidateOffscreenCache(true);
        this.config.syncLayerDataToSelectTool();
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
   * 是否可以重做（包括批量操作、变形操作和普通操作）
   */
  public canRedo(): boolean {
    const hasBatchRedo = this.historyManager.getLastUndoneBatchOperation() !== null;
    const hasTransformRedo = this.historyManager.canRedoTransform?.() ?? false;
    const hasNormalRedo = this.historyManager.canRedo();
    return hasBatchRedo || hasTransformRedo || hasNormalRedo;
  }

  /**
   * 获取历史记录
   */
  public getHistory(): DrawAction[] {
    return this.historyManager.getHistory();
  }
}

