import type { DrawAction } from '../tools/DrawTool';
import type { HistoryManager } from '../history/HistoryManager';
import type { DrawingHandler } from '../handlers/DrawingHandler';
import { logger } from '../utils/Logger';

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

  constructor(
    historyManager: HistoryManager,
    drawingHandler: DrawingHandler
  ) {
    this.historyManager = historyManager;
    this.drawingHandler = drawingHandler;
  }

  /**
   * 撤销操作
   */
  public async undo(): Promise<boolean> {
    // 检查是否可以撤销
    if (!this.canUndo()) {
      logger.debug('无法撤销：没有可撤销的操作');
      return false;
    }
    
    try {
      // 执行撤销
      const action = this.historyManager.undo();
      
      if (action) {
        // 标记离屏缓存过期（历史记录已变化）
        this.drawingHandler.invalidateOffscreenCache();
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
   */
  public async redo(): Promise<boolean> {
    // 检查是否可以重做
    if (!this.canRedo()) {
      logger.debug('无法重做：没有可重做的操作');
      return false;
    }
    
    try {
      // 执行重做
      const action = this.historyManager.redo();
      
      if (action) {
        // 标记离屏缓存过期（历史记录已变化）
        this.drawingHandler.invalidateOffscreenCache();
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
   * 清空历史记录
   */
  public async clear(): Promise<void> {
    this.historyManager.clear();
    await this.drawingHandler.forceRedraw();
  }

  /**
   * 是否可以撤销
   */
  public canUndo(): boolean {
    return this.historyManager.canUndo();
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

