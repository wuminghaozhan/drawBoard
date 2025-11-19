import type { ToolManager } from '../tools/ToolManager';
import type { DrawingHandler } from './DrawingHandler';
import type { CursorHandler } from './CursorHandler';
import type { DrawEvent } from '../events/EventManager';
import type { DrawAction } from '../tools/DrawTool';
import type { Point } from '../core/CanvasEngine';
import { logger } from '../utils/Logger';
import { SafeExecutor } from '../utils/SafeExecutor';
import { ConfigConstants } from '../config/Constants';

/**
 * 事件协调器
 * 负责协调不同工具的事件处理，统一事件分发逻辑
 * 
 * 职责：
 * - 统一事件分发
 * - 工具类型判断
 * - 选择工具特殊处理
 * - 重绘协调
 */
export class EventCoordinator {
  private lastSelectToolRedrawTime: number = 0;
  private readonly SELECT_TOOL_REDRAW_INTERVAL = ConfigConstants.PERFORMANCE.THROTTLE_DELAY;
  
  constructor(
    private toolManager: ToolManager,
    private drawingHandler: DrawingHandler,
    private cursorHandler: CursorHandler,
    private syncLayerDataToSelectTool?: () => void,
    private handleUpdatedActions?: (actions: DrawAction | DrawAction[]) => Promise<void>
  ) {}
  
  /**
   * 处理绘制开始事件
   */
  handleDrawStart(event: DrawEvent): void {
    return SafeExecutor.execute(() => {
      logger.debug('EventCoordinator: handleDrawStart', {
        tool: this.toolManager.getCurrentTool(),
        point: event.point
      });
      
      // 如果是选择工具，特殊处理
      if (this.toolManager.getCurrentTool() === 'select') {
        this.handleSelectToolDrawStart(event);
        return;
      }
      
      // 其他工具走正常的绘制流程
      this.drawingHandler.handleDrawStart(event);
      this.updateCursor();
    }, undefined, '处理绘制开始事件失败');
  }
  
  /**
   * 处理绘制移动事件
   */
  handleDrawMove(event: DrawEvent): void {
    return SafeExecutor.execute(() => {
      // 如果是选择工具，特殊处理
      if (this.toolManager.getCurrentTool() === 'select') {
        this.handleSelectToolDrawMove(event);
        return;
      }
      
      // 其他工具走正常的绘制流程
      this.drawingHandler.handleDrawMove(event);
      this.updateCursor();
    }, undefined, '处理绘制移动事件失败');
  }
  
  /**
   * 处理绘制结束事件
   */
  async handleDrawEnd(event: DrawEvent): Promise<void> {
    return SafeExecutor.executeAsync(async () => {
      // 如果是选择工具，特殊处理
      if (this.toolManager.getCurrentTool() === 'select') {
        await this.handleSelectToolDrawEnd(event);
        return;
      }
      
      // 其他工具走正常的绘制流程
      await this.drawingHandler.handleDrawEnd(event);
      this.updateCursor();
    }, undefined, '处理绘制结束事件失败');
  }
  
  /**
   * 处理选择工具的绘制开始
   */
  private handleSelectToolDrawStart(event: DrawEvent): void {
    const currentTool = this.toolManager.getCurrentToolInstance();
    if (!currentTool || currentTool.getActionType() !== 'select') {
      logger.warn('选择工具实例获取失败或类型不匹配');
      return;
    }
    
    // 同步图层数据
    if (this.syncLayerDataToSelectTool) {
      this.syncLayerDataToSelectTool();
    }
    
    // 调用选择工具的 handleMouseDown
    const selectTool = currentTool as unknown as {
      handleMouseDown: (point: Point) => 'select' | 'transform' | 'move' | 'box-select' | 'anchor-drag' | null;
    };
    
    const result = selectTool.handleMouseDown(event.point);
    logger.debug('选择工具 handleMouseDown 返回', { result });
    
    // 触发重绘以显示选择框或锚点
    this.drawingHandler.forceRedraw();
    this.updateCursor();
  }
  
  /**
   * 处理选择工具的绘制移动
   */
  private handleSelectToolDrawMove(event: DrawEvent): void {
    const currentTool = this.toolManager.getCurrentToolInstance();
    if (!currentTool || currentTool.getActionType() !== 'select') {
      return;
    }
    
    const selectTool = currentTool as unknown as {
      handleMouseMove: (point: Point) => DrawAction | DrawAction[] | null;
      updateHoverAnchor?: (point: Point) => boolean | void;
    };
    
    // 更新悬停锚点（用于光标更新和hover状态显示）
    let hoverChanged = false;
    if (selectTool.updateHoverAnchor) {
      const result = selectTool.updateHoverAnchor(event.point);
      hoverChanged = result === true; // 如果返回true，表示hover状态变化
    }
    
    const updatedActions = selectTool.handleMouseMove(event.point);
    
    // 节流重绘（避免过于频繁的重绘）
    const now = Date.now();
    if (now - this.lastSelectToolRedrawTime >= this.SELECT_TOOL_REDRAW_INTERVAL) {
      // 如果hover状态变化或拖拽中，都需要重绘
      if (updatedActions || hoverChanged) {
        // 只重绘，不更新历史记录（避免拖拽过程中的频繁更新）
        this.drawingHandler.forceRedraw().catch(error => {
          logger.error('重绘失败', error);
        });
      } else {
        // 框选过程中也需要重绘以显示选择框
        this.drawingHandler.forceRedraw().catch(error => {
          logger.error('重绘失败', error);
        });
      }
      this.lastSelectToolRedrawTime = now;
    }
    
    this.updateCursor();
  }
  
  /**
   * 处理选择工具的绘制结束
   */
  private async handleSelectToolDrawEnd(event: DrawEvent): Promise<void> {
    const currentTool = this.toolManager.getCurrentToolInstance();
    if (!currentTool || currentTool.getActionType() !== 'select') {
      return;
    }
    
    const selectTool = currentTool as unknown as {
      handleMouseUp: () => DrawAction | DrawAction[] | null;
    };
    
    const updatedActions = selectTool.handleMouseUp();
    
    // 如果返回了更新后的actions，更新HistoryManager和标记图层缓存过期
    if (updatedActions && this.handleUpdatedActions) {
      await this.handleUpdatedActions(updatedActions);
    }
    
    // 同步图层数据并触发重绘
    if (this.syncLayerDataToSelectTool) {
      this.syncLayerDataToSelectTool();
    }
    await this.drawingHandler.forceRedraw();
    
    this.updateCursor();
  }
  
  /**
   * 更新光标
   */
  private updateCursor(): void {
    if (this.cursorHandler) {
      const drawingState = this.drawingHandler.getDrawingState();
      const lineWidth = 2; // 默认线宽，可以从配置或工具获取
      this.cursorHandler.updateCursor(
        this.toolManager.getCurrentTool(),
        drawingState.isDrawing || false,
        lineWidth
      );
    }
  }
}
