import type { ToolManager } from '../tools/ToolManager';
import type { HistoryManager } from '../history/HistoryManager';
import type { DrawingHandler } from './DrawingHandler';
import type { DrawBoardToolAPI } from '../api/DrawBoardToolAPI';
import type { CanvasEngine } from '../core/CanvasEngine';
import type { DrawEvent } from '../infrastructure/events/EventManager';
import type { DrawAction } from '../tools/DrawTool';
import type { TextAction } from '../types/TextTypes';
import { ToolTypeGuards } from '../tools/ToolInterfaces';
import { logger } from '../infrastructure/logging/Logger';

/**
 * 文本工具处理器
 * 负责处理文本工具的点击、双击、编辑等逻辑
 * 
 * 职责：
 * - 处理文本工具的单击事件（创建新文本或编辑已有文本）
 * - 处理文本工具的双击事件（编辑已有文本并选中单词）
 * - 查找点击位置的文本对象
 * - 检测点是否在文本边界内
 * - 估算文本宽度和高度
 */
export class TextToolHandler {
  private toolManager: ToolManager;
  private historyManager: HistoryManager;
  private drawingHandler: DrawingHandler;
  private toolAPI: DrawBoardToolAPI;
  private canvasEngine: CanvasEngine;

  constructor(
    toolManager: ToolManager,
    historyManager: HistoryManager,
    drawingHandler: DrawingHandler,
    toolAPI: DrawBoardToolAPI,
    canvasEngine: CanvasEngine
  ) {
    this.toolManager = toolManager;
    this.historyManager = historyManager;
    this.drawingHandler = drawingHandler;
    this.toolAPI = toolAPI;
    this.canvasEngine = canvasEngine;
  }

  /**
   * 处理文本工具的单击事件
   * - 如果点击了已有文本，进入编辑模式
   * - 如果点击了空白处，创建新文本
   */
  async handleClick(event: DrawEvent): Promise<void> {
    try {
      const textTool = await this.toolManager.getTool('text');
      
      // 如果已经在编辑中，忽略新的点击
      if (textTool && ToolTypeGuards.isTextTool(textTool) && textTool.isEditing()) {
        logger.debug('文字工具正在编辑中，忽略点击事件');
        return;
      }
      
      // 检测是否点击了已有的文本对象
      const hitTextAction = this.findTextActionAtPoint(event.point);
      
      if (hitTextAction) {
        // 点击了已有文本，进入编辑模式
        await this.editExistingText(hitTextAction);
        logger.info('单击已有文字，进入编辑模式', { actionId: hitTextAction.id });
      } else {
        // 点击了空白处，创建新文本
        await this.createNewText(event.point);
        logger.info('单击创建新文字', { point: event.point });
      }
    } catch (error) {
      logger.error('文字工具单击处理失败', error);
      throw error;
    }
  }

  /**
   * 查找点击位置的文本对象
   */
  private findTextActionAtPoint(point: { x: number; y: number }): DrawAction | null {
    const allActions = this.historyManager.getHistory();
    const tolerance = 5; // 点击容差（像素）
    
    // 从后往前遍历（后绘制的在上层）
    for (let i = allActions.length - 1; i >= 0; i--) {
      const action = allActions[i];
      if (action.type === 'text' && this.isPointInTextBounds(point, action, tolerance)) {
        return action;
      }
    }
    
    return null;
  }

  /**
   * 检测点是否在文本边界内
   * 📝 统一使用 points[0] + width/height 规范
   */
  private isPointInTextBounds(point: { x: number; y: number }, action: DrawAction, tolerance: number): boolean {
    if (!action.points || action.points.length === 0) return false;
    
    const textAction = action as TextAction;
    const textPoint = action.points[0];
    
    if (!textPoint || !isFinite(textPoint.x) || !isFinite(textPoint.y)) {
      return false;
    }
    
    const text = textAction.text || '';
    const fontSize = textAction.fontSize || 16;
    const lineHeight = fontSize * (textAction.lineHeight ?? 1.2);
    
    // 📝 统一使用 width/height 属性，如果不存在则估算
    let width: number;
    let height: number;
    
    if (textAction.width && textAction.width > 0) {
      width = textAction.width;
      // 如果 height 存在，使用它；否则估算多行文本高度
      if (textAction.height && textAction.height > 0) {
        height = textAction.height;
      } else {
        height = this.estimateMultilineTextHeight(text, fontSize, lineHeight, width);
      }
    } else {
      // 估算单行文本
      width = this.estimateTextWidth(text, fontSize);
      height = lineHeight;
    }
    
    const bounds = {
      x: textPoint.x - tolerance,
      y: textPoint.y - tolerance,
      width: width + tolerance * 2,
      height: height + tolerance * 2
    };
    
    return (
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.height
    );
  }

  /**
   * 估算文本宽度（单行）
   */
  private estimateTextWidth(text: string, fontSize: number): number {
    // 使用 Canvas 测量文本宽度
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      // 降级方案：使用字符数估算
      return text.length * fontSize * 0.6;
    }
    
    ctx.font = `${fontSize}px Arial`;
    return ctx.measureText(text).width;
  }

  /**
   * 估算多行文本的高度
   */
  private estimateMultilineTextHeight(text: string, fontSize: number, lineHeight: number, maxWidth: number): number {
    if (!text || maxWidth <= 0) {
      return lineHeight;
    }
    
    const paragraphs = text.split('\n');
    let totalLines = 0;
    const avgCharWidth = fontSize * 0.8;
    const charsPerLine = Math.max(1, Math.floor(maxWidth / avgCharWidth));
    
    for (const paragraph of paragraphs) {
      if (paragraph.length === 0) {
        totalLines += 1;
      } else {
        const paragraphLines = Math.ceil(paragraph.length / charsPerLine);
        totalLines += Math.max(1, paragraphLines);
      }
    }
    
    return Math.max(lineHeight, totalLines * lineHeight);
  }

  /**
   * 编辑已有文本
   */
  async editExistingText(textAction: DrawAction): Promise<void> {
    // 初始化文字工具编辑管理器
    const canvasContainer = this.canvasEngine.getContainer();
    await this.toolAPI.initializeTextToolEditing(canvasContainer);
    
    // ⭐ 先设置 editingActionId，确保在任何重绘中都跳过该文本
    // 这必须在 editExisting 之前设置，避免重影
    this.drawingHandler.setEditingActionId(textAction.id);
    this.drawingHandler.forceRedraw();
    
    // 记录当前编辑的 actionId，用于在 editingEnded 时判断是否是这个会话
    const currentEditingActionId = textAction.id;
    
    // 获取文字工具并开始编辑
    const textTool = await this.toolManager.getTool('text');
    if (textTool && ToolTypeGuards.isTextTool(textTool)) {
      const canvasBounds = this.canvasEngine.getCanvas().getBoundingClientRect();
      textTool.editExisting(textAction, canvasBounds);
      
      // 监听编辑完成事件
      const unsubscribe = textTool.on((textEvent) => {
        try {
          if (textEvent.type === 'textUpdated' && textEvent.action) {
            // 只处理当前编辑会话的事件
            if (textEvent.action.id === currentEditingActionId) {
              this.historyManager.updateAction(textEvent.action);
              logger.debug('文字已更新', { actionId: textEvent.action.id });
            }
          }
          
          if (textEvent.type === 'editingEnded') {
            // ⭐ 只处理当前编辑会话的事件
            const eventActionId = (textEvent as { actionId?: string | null }).actionId ?? null;
            if (eventActionId !== currentEditingActionId) {
              // 不是这个会话的事件，忽略（不要 unsubscribe）
              return;
            }
            
            // 只有当 editingActionId 仍然是这个 actionId 时才清除
            const currentId = this.drawingHandler.getEditingActionId();
            if (currentId === currentEditingActionId) {
              this.drawingHandler.setEditingActionId(null);
              this.drawingHandler.forceRedraw();
            }
            unsubscribe();
          }
        } catch (eventError) {
          logger.error('处理文字更新事件失败', eventError);
        }
      });
    }
  }

  /**
   * 创建新文本
   */
  async createNewText(point: { x: number; y: number }): Promise<void> {
    // 初始化文字工具编辑管理器
    const canvasContainer = this.canvasEngine.getContainer();
    await this.toolAPI.initializeTextToolEditing(canvasContainer);
    
    // 获取当前画布上下文的颜色设置
    const ctx = this.canvasEngine.getContext();
    const color = ctx.fillStyle as string || '#000000';
    
    // 开始新建文字
    await this.toolAPI.startTextEditing(point, {
      color,
      fontSize: 16,
      fontFamily: 'Arial'
    });
    
    // 获取文字工具并监听事件
    const textTool = await this.toolManager.getTool('text');
    if (textTool && ToolTypeGuards.isTextTool(textTool)) {
      const unsubscribe = textTool.on((textEvent) => {
        try {
          if (textEvent.type === 'textCreated' && textEvent.action) {
            // 添加到历史记录
            this.historyManager.addAction(textEvent.action);
            this.drawingHandler.forceRedraw();
            logger.debug('新文字已创建', { actionId: textEvent.action.id });
          }
          
          if (textEvent.type === 'editingEnded') {
            unsubscribe();
          }
        } catch (eventError) {
          logger.error('处理文字创建事件失败', eventError);
        }
      });
    }
  }

  /**
   * 处理文本工具的双击事件（选中单词）
   */
  async handleDoubleClick(event: DrawEvent): Promise<void> {
    try {
      const textTool = await this.toolManager.getTool('text');
      
      // 如果已经在编辑中，选中当前光标位置的单词
      if (textTool && ToolTypeGuards.isTextTool(textTool) && textTool.isEditing()) {
        textTool.selectWordAtCursor();
        logger.info('双击选中单词');
        return;
      }
      
      // 检测是否双击了已有的文本对象
      const hitTextAction = this.findTextActionAtPoint(event.point);
      
      if (hitTextAction) {
        // 双击了已有文本，进入编辑模式并选中单词
        await this.editExistingText(hitTextAction);
        
        // 稍微延迟后选中单词（等待编辑器初始化完成）
        setTimeout(() => {
          if (textTool && ToolTypeGuards.isTextTool(textTool)) {
            textTool.selectWordAtCursor();
          }
        }, 50);
        
        logger.info('双击已有文字，进入编辑并选中单词', { actionId: hitTextAction.id });
      } else {
        // 双击了空白处，创建新文字
        await this.createNewText(event.point);
        logger.info('双击创建新文字', { point: event.point });
      }
    } catch (error) {
      logger.error('文字工具双击处理失败', error);
      throw error;
    }
  }
}

