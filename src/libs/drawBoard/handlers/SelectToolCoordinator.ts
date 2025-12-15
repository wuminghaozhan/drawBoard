import type { CanvasEngine } from '../core/CanvasEngine';
import type { ToolManager } from '../tools/ToolManager';
import type { HistoryManager } from '../history/HistoryManager';
import type { VirtualLayerManager } from '../core/VirtualLayerManager';
import type { DrawingHandler } from './DrawingHandler';
import type { DrawAction } from '../tools/DrawTool';
import type { DrawEvent } from '../infrastructure/events/EventManager';
import { ToolTypeGuards, type SelectToolInterface } from '../tools/ToolInterfaces';
import { logger } from '../infrastructure/logging/Logger';
import { EventBus, type DrawBoardEvents } from '../infrastructure/events/EventBus';

/**
 * SelectTool 协调器配置
 */
export interface SelectToolCoordinatorConfig {
  /** 重绘节流间隔（毫秒） */
  redrawThrottleMs?: number;
  /** 事件总线（可选，用于组件解耦） */
  eventBus?: EventBus;
}

/**
 * SelectTool 协调器
 * 
 * 职责：
 * - 协调 SelectTool 的事件处理流程
 * - 管理图层数据同步
 * - 处理 Action 更新
 * - 与 DrawingHandler 协同进行脏矩形优化
 * 
 * 从 DrawBoard 中提取，减少主类复杂度
 */
export class SelectToolCoordinator {
  private canvasEngine: CanvasEngine;
  private toolManager: ToolManager;
  private historyManager: HistoryManager;
  private virtualLayerManager?: VirtualLayerManager;
  private drawingHandler: DrawingHandler;
  private eventBus?: EventBus;
  
  // 状态
  private isSyncingLayerData: boolean = false;
  private lastRedrawTime: number = 0;
  private readonly redrawThrottleMs: number;
  private previousSelectedIds: string[] = [];
  
  // ✅ 变形操作状态（用于支持 undo/redo）
  private transformStartActions: DrawAction[] = [];
  private isTransforming: boolean = false;

  constructor(
    canvasEngine: CanvasEngine,
    toolManager: ToolManager,
    historyManager: HistoryManager,
    drawingHandler: DrawingHandler,
    virtualLayerManager?: VirtualLayerManager,
    config: SelectToolCoordinatorConfig = {}
  ) {
    this.canvasEngine = canvasEngine;
    this.toolManager = toolManager;
    this.historyManager = historyManager;
    this.drawingHandler = drawingHandler;
    this.virtualLayerManager = virtualLayerManager;
    this.redrawThrottleMs = config.redrawThrottleMs ?? 16; // ~60fps
    this.eventBus = config.eventBus;
    
    logger.debug('SelectToolCoordinator 初始化完成');
  }

  /**
   * 设置事件总线
   */
  public setEventBus(eventBus: EventBus): void {
    this.eventBus = eventBus;
  }

  /**
   * 发出选择变更事件
   */
  private emitSelectionChanged(selectedIds: string[]): void {
    if (!this.eventBus) return;
    
    // 检查是否真的有变化
    const previousSet = new Set(this.previousSelectedIds);
    const currentSet = new Set(selectedIds);
    const hasChanged = 
      previousSet.size !== currentSet.size ||
      [...previousSet].some(id => !currentSet.has(id));
    
    if (hasChanged) {
      this.eventBus.emit('selection:changed', {
        selectedIds,
        previousIds: this.previousSelectedIds
      });
      this.previousSelectedIds = [...selectedIds];
    }
  }

  /**
   * 发出 Action 更新事件
   */
  private emitActionUpdated(actionId: string, changes: Record<string, unknown>): void {
    if (!this.eventBus) return;
    this.eventBus.emit('action:updated', { actionId, changes });
  }

  /**
   * 处理 SelectTool 的绘制开始事件
   */
  public async handleDrawStart(event: DrawEvent): Promise<void> {
    const currentTool = this.toolManager.getCurrentToolInstance();
    
    if (!currentTool || !ToolTypeGuards.isSelectTool(currentTool)) {
      return;
    }

    // 同步图层数据（不保留选择，因为可能点击了新位置）
    this.syncLayerDataToSelectTool(false);

    // ✅ 保存变形开始前的 actions 状态（用于 undo/redo）
    const selectedActions = currentTool.getSelectedActions?.() || [];
    if (selectedActions.length > 0) {
      // 深拷贝原始状态
      this.transformStartActions = selectedActions.map(a => JSON.parse(JSON.stringify(a)));
      this.isTransforming = true;
      logger.debug('变形操作开始，保存原始状态', { 
        actionsCount: selectedActions.length,
        actionIds: selectedActions.map(a => a.id)
      });
    } else {
      this.transformStartActions = [];
      this.isTransforming = false;
    }

    // 处理鼠标按下
    currentTool.handleMouseDown(event.point);

    // 触发重绘
    try {
      await this.drawingHandler.forceRedraw();
    } catch (error) {
      logger.error('SelectTool 重绘失败', error);
    }
  }

  /**
   * 处理 SelectTool 的绘制移动事件
   * @returns 是否需要更新光标
   */
  public handleDrawMove(event: DrawEvent): { needsCursorUpdate: boolean } {
    const currentTool = this.toolManager.getCurrentToolInstance();
    
    if (!currentTool || !ToolTypeGuards.isSelectTool(currentTool)) {
      return { needsCursorUpdate: false };
    }

    // 更新悬停锚点（悬停检测始终需要，不依赖按下状态）
    let hoverChanged = false;
    if (currentTool.updateHoverAnchor) {
      const result = currentTool.updateHoverAnchor(event.point);
      hoverChanged = result === true;
    }

    // 只有在鼠标/触摸按下状态时才处理拖拽
    // 这确保了拖拽动作在鼠标松开后立即停止
    if (!event.isPointerDown) {
      // 仅悬停状态：只更新光标，不执行拖拽
      if (hoverChanged) {
        const now = Date.now();
        if (now - this.lastRedrawTime >= this.redrawThrottleMs) {
          this.drawingHandler.forceRedraw().catch(error => {
            logger.error('悬停重绘失败', error);
          });
          this.lastRedrawTime = now;
        }
      }
      return { needsCursorUpdate: hoverChanged };
    }

    // 以下是按下状态时的拖拽逻辑
    
    // 获取选中的动作用于脏矩形优化
    const selectedActions = currentTool.getSelectedActions?.() || [];

    // 在处理前标记旧位置为脏
    if (selectedActions.length > 0) {
      this.drawingHandler.markActionsDirty(selectedActions);
    }

    const updatedActions = currentTool.handleMouseMove(event.point);

    // 在处理后标记新位置为脏
    if (updatedActions) {
      const actionsToMark = Array.isArray(updatedActions) ? updatedActions : [updatedActions];
      this.drawingHandler.markActionsDirty(actionsToMark);
    }

    // 节流重绘
    const now = Date.now();
    if (now - this.lastRedrawTime >= this.redrawThrottleMs) {
      if (updatedActions || hoverChanged) {
        this.performOptimizedRedraw().catch(error => {
          logger.error('优化重绘失败', error);
        });
      } else {
        // 框选过程中也需要重绘
        this.drawingHandler.forceRedraw().catch(error => {
          logger.error('重绘失败', error);
        });
      }
      this.lastRedrawTime = now;
    }

    return { needsCursorUpdate: true };
  }

  /**
   * 处理 SelectTool 的绘制结束事件
   */
  public async handleDrawEnd(): Promise<DrawAction | DrawAction[] | null> {
    const currentTool = this.toolManager.getCurrentToolInstance();
    
    if (!currentTool || !ToolTypeGuards.isSelectTool(currentTool)) {
      return null;
    }

    const updatedActions = currentTool.handleMouseUp();

    // 如果返回了更新后的 actions，需要更新历史记录
    if (updatedActions) {
      await this.handleUpdatedActions(updatedActions);
    }

    // 同步图层数据（保留选择）
    const mode = this.virtualLayerManager?.getMode();
    const preserveSelection = mode === 'individual';
    this.syncLayerDataToSelectTool(preserveSelection);

    return updatedActions;
  }

  /**
   * 处理更新后的 Actions
   * 使用 recordTransform 记录变形操作，支持 undo/redo
   */
  public handleUpdatedActions(updatedActions: DrawAction | DrawAction[]): void {
    const actionsArray = Array.isArray(updatedActions) ? updatedActions : [updatedActions];
    
    // 发出选择变更事件
    this.emitSelectionChanged(actionsArray.map(a => a.id));
    
    // ✅ 使用 recordTransform 记录可撤销的变形操作
    if (this.isTransforming && this.transformStartActions.length > 0) {
      // 检查是否真的有变化（比较点位置）
      const hasChanges = this.hasActionChanges(this.transformStartActions, actionsArray);
      
      if (hasChanges) {
        // 记录变形操作（支持 undo/redo）
        const transformId = this.historyManager.recordTransform(
          this.transformStartActions,
          actionsArray
        );
        logger.info('变形操作已记录', { 
          transformId, 
          actionsCount: actionsArray.length 
        });
      } else {
        logger.debug('变形操作无变化，跳过记录');
      }
      
      // 清理状态
      this.transformStartActions = [];
      this.isTransforming = false;
    } else {
      // 非变形操作，直接更新（如新建选择等）
      for (const action of actionsArray) {
        this.historyManager.updateAction(action);
      }
    }
    
    // 发出 action 更新事件
    for (const action of actionsArray) {
      this.emitActionUpdated(action.id, { points: action.points });
      
      // 标记虚拟图层缓存过期
      if (action.virtualLayerId && this.virtualLayerManager) {
        this.virtualLayerManager.markLayerCacheDirty(action.virtualLayerId);
      }
    }

    // 标记离屏缓存过期
    this.drawingHandler.invalidateOffscreenCache();

    logger.debug('已更新 actions', {
      count: actionsArray.length,
      ids: actionsArray.map(a => a.id)
    });
  }

  /**
   * 检查 actions 是否有变化
   * 比较点位置来判断是否真的发生了变形
   */
  private hasActionChanges(beforeActions: DrawAction[], afterActions: DrawAction[]): boolean {
    if (beforeActions.length !== afterActions.length) {
      return true;
    }
    
    for (let i = 0; i < beforeActions.length; i++) {
      const before = beforeActions[i];
      const after = afterActions.find(a => a.id === before.id);
      
      if (!after) {
        return true;
      }
      
      // 比较点数量
      if (before.points.length !== after.points.length) {
        return true;
      }
      
      // 比较每个点的位置（允许微小误差）
      const tolerance = 0.01;
      for (let j = 0; j < before.points.length; j++) {
        const dx = Math.abs(before.points[j].x - after.points[j].x);
        const dy = Math.abs(before.points[j].y - after.points[j].y);
        if (dx > tolerance || dy > tolerance) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * 执行优化的重绘（优先使用脏矩形）
   */
  private async performOptimizedRedraw(): Promise<void> {
    try {
      // 尝试使用脏矩形优化
      if (this.drawingHandler.hasDirtyRects()) {
        const usedDirtyRect = await this.drawingHandler.redrawDirtyRects();
        
        if (usedDirtyRect) {
          // 脏矩形重绘成功，还需要重绘选择工具 UI
          await this.drawingHandler.drawSelectToolUI();
          return;
        }
      }

      // 降级到全量重绘
      await this.drawingHandler.forceRedraw();
    } catch (error) {
      logger.error('优化重绘失败，回退到全量重绘', error);
      await this.drawingHandler.forceRedraw();
    }
  }

  /**
   * 同步图层数据到选择工具
   * 
   * @param preserveSelection 是否保留当前选择
   */
  public syncLayerDataToSelectTool(preserveSelection: boolean = false): void {
    // 防重复调用
    if (this.isSyncingLayerData) {
      logger.debug('syncLayerDataToSelectTool: 正在同步中，跳过重复调用');
      return;
    }

    this.isSyncingLayerData = true;

    try {
      const currentTool = this.toolManager.getCurrentToolInstance();
      
      if (!currentTool || !ToolTypeGuards.isSelectTool(currentTool)) {
        return;
      }

      // 获取所有 actions
      const allActions = this.historyManager.getAllActions();
      let layerActions = allActions;

      // 根据虚拟图层模式过滤 actions
      if (this.virtualLayerManager) {
        const mode = this.virtualLayerManager.getMode();
        
        if (mode === 'individual') {
          // individual 模式：可以选择所有图层的 actions
          layerActions = allActions;
          logger.debug('syncLayerDataToSelectTool: individual 模式，使用所有 actions', {
            totalActions: allActions.length
          });
        } else {
          // grouped 模式：只获取当前活动图层的 actions
          const activeLayer = this.virtualLayerManager.getActiveVirtualLayer();
          if (activeLayer) {
            layerActions = allActions.filter((action: DrawAction) =>
              action.virtualLayerId === activeLayer.id
            );
          }
        }
      }

      // 判断是否需要清空选择
      const shouldClearSelection = this.shouldClearSelection(
        currentTool,
        layerActions,
        preserveSelection
      );

      logger.info('syncLayerDataToSelectTool: 同步图层数据', {
        layerActionsCount: layerActions.length,
        preserveSelection,
        shouldClearSelection
      });

      // 设置图层 actions
      currentTool.setLayerActions(layerActions, shouldClearSelection);

      // 如果清空了选择，重置工具状态
      if (shouldClearSelection && currentTool.reset) {
        currentTool.reset();
      }

      // individual 模式的特殊处理
      if (this.virtualLayerManager?.getMode() === 'individual') {
        this.handleIndividualModeSync(currentTool);
      }

      // 设置 CanvasEngine
      this.updateSelectToolCanvasEngine(currentTool);

      // individual 模式下触发重绘
      this.triggerIndividualModeRedraw(currentTool);

    } catch (error) {
      logger.error('同步图层数据到选择工具失败', error);
    } finally {
      this.isSyncingLayerData = false;
    }
  }

  /**
   * 判断是否需要清空选择
   */
  private shouldClearSelection(
    currentTool: SelectToolInterface,
    layerActions: DrawAction[],
    preserveSelection: boolean
  ): boolean {
    if (preserveSelection) {
      return false;
    }

    const mode = this.virtualLayerManager?.getMode();
    if (mode !== 'grouped') {
      return false;
    }

    const selectToolActions = currentTool.getSelectedActions();
    const currentLayerActionIds = new Set(layerActions.map((a: DrawAction) => a.id));
    
    // 检查是否有选中的 actions 不属于当前图层
    return selectToolActions.some((action: DrawAction) => 
      !currentLayerActionIds.has(action.id)
    );
  }

  /**
   * 处理 individual 模式的同步
   */
  private handleIndividualModeSync(currentTool: SelectToolInterface): void {
    const selectedActions = currentTool.getSelectedActions();
    
    if (selectedActions.length === 0) {
      return;
    }

    // 收集所有被选中的虚拟图层 ID
    const selectedLayerIds = new Set<string>();
    for (const action of selectedActions) {
      if (action.virtualLayerId) {
        selectedLayerIds.add(action.virtualLayerId);
      }
    }

    if (selectedLayerIds.size === 0) {
      return;
    }

    logger.debug('individual 模式：处理选中图层', {
      selectedActionsCount: selectedActions.length,
      selectedLayerIds: Array.from(selectedLayerIds)
    });

    // 找到 zIndex 最小的选中图层作为拆分基准
    const allLayers = this.virtualLayerManager?.getAllVirtualLayers() || [];
    const selectedLayers = allLayers.filter(layer => selectedLayerIds.has(layer.id));

    if (selectedLayers.length === 0) {
      return;
    }

    const minZIndexLayer = selectedLayers.reduce((min, layer) =>
      layer.zIndex < min.zIndex ? layer : min
    );

    const currentActiveLayer = this.virtualLayerManager?.getActiveVirtualLayer();
    
    // 如果需要切换图层
    if (!currentActiveLayer || currentActiveLayer.id !== minZIndexLayer.id) {
      this.switchToLayerWithSelectionPreserve(
        currentTool,
        minZIndexLayer.id,
        selectedActions
      );
    } else {
      // 已经是活动图层，只更新 SelectTool
      this.updateSelectToolCanvasEngine(currentTool);
    }
  }

  /**
   * 切换图层并保留选择
   */
  private switchToLayerWithSelectionPreserve(
    currentTool: SelectToolInterface,
    layerId: string,
    selectedActionsBeforeSwitch: DrawAction[]
  ): void {
    const switchSuccess = this.virtualLayerManager?.setActiveVirtualLayer(layerId);

    if (!switchSuccess) {
      logger.warn('individual 模式：切换图层失败', { layerId });
      return;
    }

    const newActiveLayer = this.virtualLayerManager?.getActiveVirtualLayer();
    
    if (newActiveLayer && currentTool.setCanvasEngine) {
      currentTool.setCanvasEngine(this.canvasEngine, newActiveLayer.zIndex);

      // 验证并恢复选择
      const selectedActionsAfterSwitch = currentTool.getSelectedActions();
      
      if (selectedActionsAfterSwitch.length === 0 && selectedActionsBeforeSwitch.length > 0) {
        logger.warn('individual 模式：选择在切换图层后丢失，恢复选择');
        
        if (currentTool.setSelectedActions) {
          currentTool.setSelectedActions(selectedActionsBeforeSwitch);
        }
      }
    }
  }

  /**
   * 更新 SelectTool 的 CanvasEngine
   */
  private updateSelectToolCanvasEngine(currentTool: SelectToolInterface): void {
    if (!currentTool.setCanvasEngine) {
      return;
    }

    const selectedLayerZIndex = this.virtualLayerManager?.getActiveVirtualLayerZIndex() ?? null;
    
    logger.debug('设置选择工具的 CanvasEngine', {
      selectedLayerZIndex,
      activeLayerId: this.virtualLayerManager?.getActiveVirtualLayer()?.id
    });

    currentTool.setCanvasEngine(this.canvasEngine, selectedLayerZIndex);
  }

  /**
   * individual 模式下触发重绘
   */
  private triggerIndividualModeRedraw(currentTool: SelectToolInterface): void {
    const mode = this.virtualLayerManager?.getMode();
    
    if (mode !== 'individual') {
      return;
    }

    const selectedActions = currentTool.getSelectedActions();
    
    if (selectedActions.length === 0 || !this.canvasEngine?.isDrawLayerSplit()) {
      return;
    }

    logger.info('individual 模式：图层划分完成，触发重绘');

    Promise.resolve().then(async () => {
      try {
        await this.drawingHandler.forceRedraw();
        logger.debug('individual 模式：重绘完成');
      } catch (error) {
        logger.error('individual 模式：重绘失败', error);
      }
    }).catch(error => {
      logger.error('individual 模式：Promise 链错误', error);
    });
  }

  /**
   * 强制同步 SelectTool 数据
   */
  public forceSyncSelectToolData(): void {
    this.syncLayerDataToSelectTool(true);
  }

  /**
   * 获取调试信息
   */
  public getDebugInfo(): {
    isSyncing: boolean;
    lastRedrawTime: number;
    redrawThrottleMs: number;
  } {
    return {
      isSyncing: this.isSyncingLayerData,
      lastRedrawTime: this.lastRedrawTime,
      redrawThrottleMs: this.redrawThrottleMs
    };
  }

  /**
   * 销毁协调器
   */
  public destroy(): void {
    this.isSyncingLayerData = false;
    this.lastRedrawTime = 0;
    logger.debug('SelectToolCoordinator 已销毁');
  }
}

