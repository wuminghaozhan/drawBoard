import type { DrawAction } from '../tools/DrawTool';
import type { ToolManager } from '../tools/ToolManager';
import type { HistoryManager } from '../history/HistoryManager';
import type { CoreSelectionManager } from '../core/CoreSelectionManager';
import type { VirtualLayerManager } from '../core/VirtualLayerManager';
import type { DrawingHandler } from '../handlers/DrawingHandler';
import type { CanvasEngine } from '../core/CanvasEngine';
import { BoundsValidator, type Bounds as BoundsType } from '../utils/BoundsValidator';
import { logger } from '../infrastructure/logging/Logger';
import { ToolTypeGuards } from '../tools/ToolInterfaces';
import { 
  DataExporter, 
  type ExportOptions, 
  type DrawBoardExportData 
} from '../utils/DataExporter';

/**
 * DrawBoard 选择操作 API
 * 
 * 封装所有选择相关的操作，包括：
 * - 选择管理（清除、删除、全选）
 * - 剪贴板操作（复制、剪切、粘贴）
 * - 选择工具协调
 * 
 * 通过组合模式，将选择相关的逻辑从 DrawBoard 主类中分离出来
 */
export class DrawBoardSelectionAPI {
  private clipboard: DrawAction[] = [];
  private toolManager: ToolManager;
  private historyManager: HistoryManager;
  private selectionManager: CoreSelectionManager;
  private virtualLayerManager: VirtualLayerManager | null;
  private drawingHandler: DrawingHandler;
  private canvasEngine: CanvasEngine;

  constructor(
    toolManager: ToolManager,
    historyManager: HistoryManager,
    selectionManager: CoreSelectionManager,
    virtualLayerManager: VirtualLayerManager | null,
    drawingHandler: DrawingHandler,
    canvasEngine: CanvasEngine
  ) {
    this.toolManager = toolManager;
    this.historyManager = historyManager;
    this.selectionManager = selectionManager;
    this.virtualLayerManager = virtualLayerManager;
    this.drawingHandler = drawingHandler;
    this.canvasEngine = canvasEngine;
  }

  /**
   * 清除选择
   */
  public async clearSelection(): Promise<void> {
    // 清除SelectionManager的选择
    this.selectionManager.clearSelection();
    
    // 清除SelectTool的选择
    const currentTool = this.toolManager.getCurrentToolInstance();
    if (currentTool && ToolTypeGuards.isSelectTool(currentTool)) {
      currentTool.clearSelection();
    }
    
    await this.drawingHandler.forceRedraw();
  }

  /**
   * 删除选择
   */
  /**
   * 删除选中的 action（直接删除，不需要确认）
   * individual 模式下会同时删除对应的图层
   */
  public async deleteSelection(): Promise<void> {
    // 从SelectTool获取选中的actions
    let selectedActions: DrawAction[] = [];
    const currentTool = this.toolManager.getCurrentToolInstance();
    if (currentTool && ToolTypeGuards.isSelectTool(currentTool)) {
      selectedActions = currentTool.getSelectedActions();
      
      // 如果没有选中的actions，直接返回
      if (selectedActions.length === 0) {
        return;
      }
      
      // 优先使用deleteSelectedActions方法（它会清除选择状态并返回要删除的IDs）
      const deletedActionIds = currentTool.deleteSelectedActions();
      if (deletedActionIds.length > 0) {
        // 从HistoryManager中删除这些actions
        deletedActionIds.forEach(actionId => {
          this.historyManager.removeActionById(actionId);
          // ✅ 同步从VirtualLayerManager中移除（individual模式下会删除对应图层）
          this.drawingHandler.removeActionFromVirtualLayer(actionId);
        });
        
        // 清除SelectionManager的选择状态
        this.selectionManager.clearSelection();
        
        // ✅ 强制使所有图层缓存失效
        this.drawingHandler.invalidateOffscreenCache(true);
        
        await this.drawingHandler.forceRedraw();
        logger.debug('已删除选中的 action', { count: deletedActionIds.length });
        return;
      }
    }
    
    // 如果没有从SelectTool获取到，则从SelectionManager获取
    if (selectedActions.length === 0 && this.selectionManager.hasSelection()) {
      selectedActions = this.selectionManager.getSelectedActions().map(item => item.action);
    }
    
    // 删除选中的actions
    if (selectedActions.length > 0) {
      selectedActions.forEach(action => {
        this.historyManager.removeActionById(action.id);
        // ✅ 同步从VirtualLayerManager中移除
        this.drawingHandler.removeActionFromVirtualLayer(action.id);
      });
      
      // 清除选择状态
      this.selectionManager.clearSelection();
      if (currentTool && ToolTypeGuards.isSelectTool(currentTool)) {
        currentTool.clearSelection();
      }
      
      // ✅ 强制使所有图层缓存失效
      this.drawingHandler.invalidateOffscreenCache(true);
      
      await this.drawingHandler.forceRedraw();
      logger.debug('已删除选中的 action', { count: selectedActions.length });
    }
  }

  /**
   * 复制选择
   */
  public copySelection(): DrawAction[] {
    const copiedActions: DrawAction[] = [];
    
    // 优先从SelectTool获取
    const currentTool = this.toolManager.getCurrentToolInstance();
    if (currentTool && ToolTypeGuards.isSelectTool(currentTool)) {
      copiedActions.push(...currentTool.copySelectedActions());
    } else if (this.selectionManager.hasSelection()) {
      // 从SelectionManager获取
      copiedActions.push(...this.selectionManager.copySelectedActions());
    }
    
    // 存储到剪贴板
    if (copiedActions.length > 0) {
      this.clipboard = copiedActions;
      logger.debug('已复制到剪贴板', { count: copiedActions.length });
    }
    
    return copiedActions;
  }

  /**
   * 剪切选择
   */
  public async cutSelection(): Promise<DrawAction[]> {
    // 先复制
    const copiedActions = this.copySelection();
    
    if (copiedActions.length > 0) {
      // 然后删除
      await this.deleteSelection();
      logger.debug('已剪切到剪贴板', { count: copiedActions.length });
    }
    
    return copiedActions;
  }

  /**
   * 复制选中的图形（在画布上直接创建副本）
   * 
   * individual 模式下：
   * - 完全复制图层 + action
   * - 新图层 zIndex = 源图层 zIndex + 1
   * - 如果存在 zIndex 冲突，自动调整其他图层的 zIndex
   * 
   * @returns 复制后的 actions
   */
  public async duplicateSelection(): Promise<DrawAction[]> {
    const currentTool = this.toolManager.getCurrentToolInstance();
    if (!currentTool || !ToolTypeGuards.isSelectTool(currentTool)) {
      logger.warn('duplicateSelection: 当前工具不是选择工具');
      return [];
    }

    const selectedActions = currentTool.getSelectedActions();
    if (selectedActions.length === 0) {
      logger.debug('duplicateSelection: 没有选中的图形');
      return [];
    }

    // individual 模式下使用 VirtualLayerManager 的复制方法
    if (this.virtualLayerManager && this.virtualLayerManager.getMode() === 'individual') {
      const duplicatedActions: DrawAction[] = [];

      for (const action of selectedActions) {
        const layerId = action.virtualLayerId;
        if (!layerId) {
          logger.warn('duplicateSelection: action 没有关联的图层', action.id);
          continue;
        }

        // 使用 VirtualLayerManager 复制图层和 action
        const result = this.virtualLayerManager.duplicateLayerWithAction(layerId, action);
        if (result) {
          // 将新 action 添加到 HistoryManager
          this.historyManager.addAction(result.action);
          duplicatedActions.push(result.action);

          logger.debug('duplicateSelection: 复制成功', {
            sourceActionId: action.id,
            newActionId: result.action.id,
            newLayerId: result.layer.id,
            newZIndex: result.layer.zIndex
          });
        }
      }

      if (duplicatedActions.length > 0) {
        // 清除当前选择
        currentTool.clearSelection();
        
        // 强制重绘
        this.drawingHandler.invalidateOffscreenCache(true);
        await this.drawingHandler.forceRedraw();

        // 选中新复制的图形（需要等待重绘完成后同步数据）
        // 这里通过 SelectToolCoordinator 的 syncLayerDataToSelectTool 会自动更新
        
        logger.debug('duplicateSelection: 完成', { count: duplicatedActions.length });
      }

      return duplicatedActions;
    }

    // grouped 模式或无 VirtualLayerManager 时，使用简单的复制逻辑
    const duplicatedActions: DrawAction[] = [];
    const offset = 20; // 偏移量

    for (const action of selectedActions) {
      const newActionId = `action-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      const newAction: DrawAction = {
        ...action,
        id: newActionId,
        points: action.points.map(p => ({
          x: p.x + offset,
          y: p.y + offset
        })),
        context: { ...action.context },
        timestamp: Date.now(),
        virtualLayerId: undefined // grouped 模式下由 DrawingHandler 处理
      };

      // 添加到 HistoryManager（DrawingHandler 会处理图层分配）
      this.historyManager.addAction(newAction);
      duplicatedActions.push(newAction);
    }

    if (duplicatedActions.length > 0) {
      currentTool.clearSelection();
      this.drawingHandler.invalidateOffscreenCache(true);
      await this.drawingHandler.forceRedraw();
      
      logger.debug('duplicateSelection: 完成（grouped模式）', { count: duplicatedActions.length });
    }

    return duplicatedActions;
  }
  
  /**
   * 获取选中图形的图层ID集合（公共辅助方法）
   * @returns 图层ID集合，如果无效返回 null
   */
  private getSelectedLayerIds(): Set<string> | null {
    const currentTool = this.toolManager.getCurrentToolInstance();
    if (!currentTool || !ToolTypeGuards.isSelectTool(currentTool)) {
      return null;
    }
    
    const selectedActions = currentTool.getSelectedActions();
    if (selectedActions.length === 0) {
      return null;
    }
    
    const layerIds = new Set<string>();
    for (const action of selectedActions) {
      if (action.virtualLayerId) {
        layerIds.add(action.virtualLayerId);
      }
    }
    
    return layerIds.size > 0 ? layerIds : null;
  }
  
  /**
   * 将选中图形的图层移动到最顶层
   */
  public async moveSelectionToTop(): Promise<void> {
    const layerIds = this.getSelectedLayerIds();
    if (!layerIds || !this.virtualLayerManager) {
      logger.debug('moveSelectionToTop: 没有选中的图形或无图层管理器');
      return;
    }
    
    for (const layerId of layerIds) {
      this.virtualLayerManager.moveLayerToTop(layerId);
    }
    
    this.drawingHandler.invalidateOffscreenCache(true);
    await this.drawingHandler.forceRedraw();
  }
  
  /**
   * 将选中图形的图层移动到最底层
   */
  public async moveSelectionToBottom(): Promise<void> {
    const layerIds = this.getSelectedLayerIds();
    if (!layerIds || !this.virtualLayerManager) {
      logger.debug('moveSelectionToBottom: 没有选中的图形或无图层管理器');
      return;
    }
    
    for (const layerId of layerIds) {
      this.virtualLayerManager.moveLayerToBottom(layerId);
    }
    
    this.drawingHandler.invalidateOffscreenCache(true);
    await this.drawingHandler.forceRedraw();
  }
  
  /**
   * 切换选中图形的锁定状态
   * @param locked 是否锁定
   */
  public async toggleSelectionLock(locked: boolean): Promise<void> {
    const layerIds = this.getSelectedLayerIds();
    if (!layerIds || !this.virtualLayerManager) {
      logger.debug('toggleSelectionLock: 没有选中的图形或无图层管理器');
      return;
    }
    
    // 设置所有选中图层的锁定状态
    for (const layerId of layerIds) {
      this.virtualLayerManager.setVirtualLayerLocked(layerId, locked);
    }
    
    // 同步更新 HistoryManager 中对应 action 的锁定状态
    const currentTool = this.toolManager.getCurrentToolInstance();
    if (currentTool && ToolTypeGuards.isSelectTool(currentTool)) {
      const selectedActions = currentTool.getSelectedActions();
      for (const action of selectedActions) {
        action.layerLocked = locked;
        (action as DrawAction & { locked?: boolean }).locked = locked;
        // 同步到 HistoryManager
        this.historyManager.updateAction(action.id, action);
      }
    }
    
    logger.debug('toggleSelectionLock: 锁定状态已切换', { locked, layerCount: layerIds.size });
    
    // 强制重绘（锁定状态影响锚点显示）
    this.drawingHandler.invalidateOffscreenCache(true);
    await this.drawingHandler.forceRedraw();
  }

  /**
   * 粘贴选择
   * @param offsetX 水平偏移量，默认10px
   * @param offsetY 垂直偏移量，默认10px
   */
  public async pasteSelection(offsetX: number = 10, offsetY: number = 10): Promise<DrawAction[]> {
    if (this.clipboard.length === 0) {
      logger.warn('剪贴板为空，无法粘贴');
      return [];
    }

    // 获取画布边界
    const canvas = this.canvasEngine.getCanvas();
    const canvasBounds: BoundsType = {
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height
    };

    // 生成新的ID，避免冲突，并验证和限制边界
    const pastedActions = this.clipboard
      .filter(action => {
        // 验证动作有效性
        if (!action.points || action.points.length === 0) {
          logger.warn('粘贴的动作points为空，跳过', action.id);
          return false;
        }
        if (!action.type) {
          logger.warn('粘贴的动作类型为空，跳过', action.id);
          return false;
        }
        return true;
      })
      .map(action => {
        const newId = `${action.id}_paste_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // 限制所有点在画布范围内
        const validatedPoints = action.points.map(point => {
          const offsetPoint = {
            x: point.x + offsetX,
            y: point.y + offsetY,
            timestamp: Date.now()
          };
          
          // 使用边界验证器限制点在画布内
          return BoundsValidator.clampPointToCanvas(offsetPoint, canvasBounds);
        });
        
        return {
          ...action,
          id: newId,
          points: validatedPoints
        };
      });
    
    if (pastedActions.length === 0) {
      logger.warn('粘贴后没有有效的动作');
      return [];
    }

    // 添加到历史记录
    for (const action of pastedActions) {
      try {
        this.historyManager.addAction(action);
        
        // 分配到虚拟图层
        if (this.virtualLayerManager) {
          this.virtualLayerManager.handleNewAction(action);
        }
      } catch (error) {
        logger.error('添加粘贴动作失败', { action: action.id, error });
        // 继续处理其他动作，不中断整个粘贴流程
      }
    }

    // 如果当前是选择工具，选中粘贴的内容
    const currentTool = this.toolManager.getCurrentToolInstance();
    if (currentTool && ToolTypeGuards.isSelectTool(currentTool)) {
      if (currentTool.pasteActions) {
        currentTool.pasteActions(pastedActions, 0, 0);
      } else {
        currentTool.setSelectedActions(pastedActions);
      }
    }

    // 触发重绘
    await this.drawingHandler.forceRedraw();
    
    logger.debug('已粘贴', { count: pastedActions.length });
    return pastedActions;
  }

  /**
   * 检查剪贴板是否有数据
   */
  public hasClipboardData(): boolean {
    return this.clipboard.length > 0;
  }

  /**
   * 全选所有内容
   */
  public async selectAll(): Promise<void> {
    // 获取所有历史动作
    const allActions = this.historyManager.getAllActions();
    
    if (allActions.length === 0) {
      logger.debug('没有可选择的动作');
      return;
    }
    
    // 切换到选择工具（通过 setTool 方法，需要外部调用）
    // 注意：这里不直接调用 setTool，因为需要 DrawBoard 实例
    // 这个方法应该由 DrawBoard 调用，然后调用此方法
    
    // 获取选择工具实例
    const currentTool = this.toolManager.getCurrentToolInstance();
    if (currentTool && ToolTypeGuards.isSelectTool(currentTool)) {
      // 设置所有动作为选中状态
      currentTool.setSelectedActions(allActions);
      
      // 更新图层动作列表（确保选择工具知道所有动作）
      currentTool.setLayerActions(allActions, false);
    }
    
    // 【修复】使用 await 确保重绘完成并捕获可能的错误
    await this.drawingHandler.forceRedraw();
    
    logger.debug('已全选', { count: allActions.length });
  }

  /**
   * 更新选中图形的样式（颜色、线宽等）
   * @param style 样式对象，支持 strokeStyle（描边颜色）、fillStyle（填充颜色）和 lineWidth（线宽）
   */
  public async updateSelectionStyle(style: { strokeStyle?: string; fillStyle?: string; lineWidth?: number }): Promise<void> {
    const currentTool = this.toolManager.getCurrentToolInstance();
    if (!currentTool || !ToolTypeGuards.isSelectTool(currentTool)) {
      logger.warn('updateSelectionStyle: 当前不是选择工具');
      return;
    }

    const selectedActions = currentTool.getSelectedActions();
    if (selectedActions.length === 0) {
      logger.warn('updateSelectionStyle: 没有选中的图形');
      return;
    }

    // 更新每个选中 action 的样式
    for (const action of selectedActions) {
      if (!action.context) {
        action.context = {};
      }
      if (style.strokeStyle !== undefined) {
        action.context.strokeStyle = style.strokeStyle;
      }
      if (style.fillStyle !== undefined) {
        action.context.fillStyle = style.fillStyle;
      }
      if (style.lineWidth !== undefined) {
        action.context.lineWidth = style.lineWidth;
      }

      // 同步到 HistoryManager（VirtualLayerManager 会通过事件自动响应）
      this.historyManager.updateAction(action);
    }

    // 使图层缓存失效
    this.drawingHandler.invalidateOffscreenCache(true);

    // 触发重绘
    await this.drawingHandler.forceRedraw();

    logger.debug('updateSelectionStyle: 已更新选中图形样式', { 
      style, 
      count: selectedActions.length 
    });
  }

  /**
   * 更新选中文本的样式
   */
  public async updateTextStyle(style: { color?: string; fontSize?: number; fontWeight?: string }): Promise<void> {
    const currentTool = this.toolManager.getCurrentToolInstance();
    if (!currentTool || !ToolTypeGuards.isSelectTool(currentTool)) {
      logger.warn('updateTextStyle: 当前不是选择工具');
      return;
    }

    const selectedActions = currentTool.getSelectedActions();
    if (selectedActions.length === 0) {
      logger.warn('updateTextStyle: 没有选中的图形');
      return;
    }

    // 只更新文本类型的 action
    for (const action of selectedActions) {
      if (action.type !== 'text') {
        continue;
      }
      
      // 转换为 TextAction 类型
      const textAction = action as import('../tools/DrawTool').DrawAction & {
        fontSize?: number;
        fontWeight?: string;
      };
      
      // 更新文本颜色（使用 fillStyle）
      if (style.color !== undefined) {
        if (!action.context) {
          action.context = {};
        }
        action.context.fillStyle = style.color;
        action.context.strokeStyle = style.color;
      }
      
      // 更新字体大小
      if (style.fontSize !== undefined) {
        textAction.fontSize = style.fontSize;
      }
      
      // 更新字体粗细
      if (style.fontWeight !== undefined) {
        textAction.fontWeight = style.fontWeight;
      }
      
      // 📝 重新计算文本边界（fontSize 或 fontWeight 改变会影响尺寸）
      // 如果文本有 width（多行模式），保持 width，只重新计算 height
      // 如果文本没有 width（单行模式），重新计算 width 和 height
      if (style.fontSize !== undefined || style.fontWeight !== undefined) {
        const textActionTyped = textAction as import('../types/TextTypes').TextAction;
        const text = textActionTyped.text || '';
        const fontSize = textAction.fontSize || 16;
        const lineHeight = fontSize * 1.2;
        
        if (textActionTyped.width && textActionTyped.width > 0) {
          // 📝 多行模式：保持 width，重新计算 height
          // 估算多行文本高度
          const avgCharWidth = fontSize * 0.8;
          const charsPerLine = Math.max(1, Math.floor(textActionTyped.width / avgCharWidth));
          const paragraphs = text.split('\n');
          let totalLines = 0;
          
          for (const paragraph of paragraphs) {
            if (paragraph.length === 0) {
              totalLines += 1;
            } else {
              const paragraphLines = Math.ceil(paragraph.length / charsPerLine);
              totalLines += Math.max(1, paragraphLines);
            }
          }
          
          textActionTyped.height = Math.max(lineHeight, totalLines * lineHeight);
        } else {
          // 📝 单行模式：重新计算 width 和 height
          let estimatedWidth = 0;
          for (const char of text) {
            if (/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(char)) {
              estimatedWidth += fontSize;
            } else {
              estimatedWidth += fontSize * 0.6;
            }
          }
          textActionTyped.width = Math.max(estimatedWidth, fontSize);
          textActionTyped.height = lineHeight;
        }
      }

      // 同步到 HistoryManager
      this.historyManager.updateAction(action);
    }

    // 使图层缓存失效
    this.drawingHandler.invalidateOffscreenCache(true);

    // 触发重绘
    await this.drawingHandler.forceRedraw();

    logger.debug('updateTextStyle: 已更新选中文本样式', { 
      style, 
      count: selectedActions.filter(a => a.type === 'text').length 
    });
  }

  /**
   * 是否有选择
   */
  public hasSelection(): boolean {
    // 检查SelectTool
    const currentTool = this.toolManager.getCurrentToolInstance();
    if (currentTool && ToolTypeGuards.isSelectTool(currentTool)) {
      const selectedActions = currentTool.getSelectedActions();
      if (selectedActions.length > 0) {
        return true;
      }
    }
    
    // 检查SelectionManager
    return this.selectionManager.hasSelection();
  }

  /**
   * 获取选择
   */
  public getSelectedActions(): DrawAction[] {
    // 优先从SelectTool获取
    const currentTool = this.toolManager.getCurrentToolInstance();
    if (currentTool && ToolTypeGuards.isSelectTool(currentTool)) {
      return currentTool.getSelectedActions();
    }
    
    // 从SelectionManager获取
    return this.selectionManager.getSelectedActions().map(item => item.action);
  }

  // ============================================
  // 选区导出功能
  // ============================================

  /**
   * 导出选中的元素为 JSON 对象
   */
  public exportSelectionData(options: ExportOptions = {}): DrawBoardExportData | null {
    const selectedActions = this.getSelectedActions();
    
    if (selectedActions.length === 0) {
      logger.warn('没有选中的元素，无法导出');
      return null;
    }

    const canvas = this.canvasEngine.getCanvas();
    const size = { width: canvas.width, height: canvas.height };
    const config = {
      width: size.width,
      height: size.height,
      virtualLayerMode: this.virtualLayerManager?.getMode() || 'individual' as const
    };

    // 导出时不包含图层信息（选中的元素可能来自不同图层）
    return DataExporter.exportData(selectedActions, [], config, {
      ...options,
      includeLayers: false
    });
  }

  /**
   * 导出选中的元素为 JSON 字符串
   */
  public exportSelectionToJSON(options: ExportOptions = {}): string | null {
    const selectedActions = this.getSelectedActions();
    
    if (selectedActions.length === 0) {
      logger.warn('没有选中的元素，无法导出');
      return null;
    }

    const canvas = this.canvasEngine.getCanvas();
    const size = { width: canvas.width, height: canvas.height };
    const config = {
      width: size.width,
      height: size.height,
      virtualLayerMode: this.virtualLayerManager?.getMode() || 'individual' as const
    };

    return DataExporter.exportToJSON(selectedActions, [], config, {
      ...options,
      includeLayers: false
    });
  }

  /**
   * 下载选中的元素为 JSON 文件
   */
  public downloadSelectionAsJSON(options: ExportOptions = {}): boolean {
    const selectedActions = this.getSelectedActions();
    
    if (selectedActions.length === 0) {
      logger.warn('没有选中的元素，无法导出');
      return false;
    }

    const canvas = this.canvasEngine.getCanvas();
    const size = { width: canvas.width, height: canvas.height };
    const config = {
      width: size.width,
      height: size.height,
      virtualLayerMode: this.virtualLayerManager?.getMode() || 'individual' as const
    };

    const filename = options.filename || `selection-${Date.now()}.json`;

    DataExporter.downloadAsJSON(selectedActions, [], config, {
      ...options,
      includeLayers: false,
      filename
    });

    logger.info('选区已导出', { count: selectedActions.length, filename });
    return true;
  }

  /**
   * 复制选中元素的 JSON 到剪贴板
   */
  public async copySelectionAsJSON(options: ExportOptions = {}): Promise<boolean> {
    const selectedActions = this.getSelectedActions();
    
    if (selectedActions.length === 0) {
      logger.warn('没有选中的元素，无法复制');
      return false;
    }

    const canvas = this.canvasEngine.getCanvas();
    const size = { width: canvas.width, height: canvas.height };
    const config = {
      width: size.width,
      height: size.height,
      virtualLayerMode: this.virtualLayerManager?.getMode() || 'individual' as const
    };

    const success = await DataExporter.copyToClipboard(selectedActions, [], config, {
      ...options,
      includeLayers: false
    });

    if (success) {
      logger.info('选区 JSON 已复制到剪贴板', { count: selectedActions.length });
    }

    return success;
  }
}

