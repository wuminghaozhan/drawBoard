import type { CanvasEngine } from '../core/CanvasEngine';
import type { HistoryManager } from '../history/HistoryManager';
import type { ToolManager } from '../tools/ToolManager';
import type { VirtualLayerManager, VirtualLayer } from '../core/VirtualLayerManager';
import type { DrawAction } from '../tools/DrawTool';
import { logger } from '../infrastructure/logging/Logger';
import { SafeExecutor } from '../infrastructure/error/SafeExecutor';
import type { CacheManager } from './CacheManager';
import { DirtyRectManager, type DirtyRectConfig } from '../infrastructure/performance/DirtyRectManager';
import type { Bounds } from '../utils/BoundsValidator';

/**
 * 绘制动作函数类型
 */
export type DrawActionFn = (ctx: CanvasRenderingContext2D, action: DrawAction) => Promise<void>;

/**
 * 绘制选择工具UI函数类型
 */
export type DrawSelectToolUIFn = () => Promise<void>;

/**
 * 重绘管理器配置
 */
export interface RedrawManagerConfig {
  /** 是否启用脏矩形优化 */
  enableDirtyRect: boolean;
  /** 脏矩形配置 */
  dirtyRectConfig?: Partial<DirtyRectConfig>;
}

/**
 * 重绘管理器
 * 负责各种重绘场景的管理，提高代码可维护性
 * 
 * 职责：
 * - 全量重绘
 * - 增量重绘
 * - 几何图形重绘
 * - 图层重绘
 * - 选择工具UI重绘
 * - 脏矩形局部重绘（性能优化）
 */
export class RedrawManager {
  // 显式声明成员（修复 erasableSyntaxOnly 错误）
  private canvasEngine: CanvasEngine;
  private historyManager: HistoryManager;
  private toolManager: ToolManager;
  private virtualLayerManager?: VirtualLayerManager;
  private cacheManager?: CacheManager;
  private drawAction?: DrawActionFn;
  private drawSelectToolUI?: DrawSelectToolUIFn;
  
  /** 脏矩形管理器 */
  private dirtyRectManager: DirtyRectManager;
  /** 配置 */
  private config: RedrawManagerConfig;
  /** 上一帧的动作边界（用于脏矩形计算） */
  private lastActionBounds: Map<string, Bounds> = new Map();
  
  /** 默认配置 */
  private static readonly DEFAULT_CONFIG: RedrawManagerConfig = {
    enableDirtyRect: true,
    dirtyRectConfig: {
      mergeThreshold: 30,
      maxDirtyRects: 30,
      padding: 4,
      fullRedrawThreshold: 0.4
    }
  };
  
  constructor(
    canvasEngine: CanvasEngine,
    historyManager: HistoryManager,
    toolManager: ToolManager,
    virtualLayerManager?: VirtualLayerManager,
    cacheManager?: CacheManager,
    drawAction?: DrawActionFn,
    drawSelectToolUI?: DrawSelectToolUIFn,
    config?: Partial<RedrawManagerConfig>
  ) {
    this.canvasEngine = canvasEngine;
    this.historyManager = historyManager;
    this.toolManager = toolManager;
    this.virtualLayerManager = virtualLayerManager;
    this.cacheManager = cacheManager;
    this.drawAction = drawAction;
    this.drawSelectToolUI = drawSelectToolUI;
    
    // 合并配置
    this.config = { ...RedrawManager.DEFAULT_CONFIG, ...config };
    
    // 初始化脏矩形管理器
    const canvas = this.canvasEngine.getCanvas();
    this.dirtyRectManager = new DirtyRectManager(
      canvas.width,
      canvas.height,
      this.config.dirtyRectConfig
    );
  }
  
  /**
   * 全量重绘Canvas（所有图层）
   */
  async redrawAll(currentAction?: DrawAction | null): Promise<void> {
    return SafeExecutor.executeAsync(async () => {
      const canvas = this.canvasEngine.getCanvas();
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('无法获取Canvas上下文');
      }
      
      // 清空画布
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // 获取所有历史动作
      const allActions = this.historyManager.getAllActions();
      
      // 检查是否需要更新缓存
      if (this.cacheManager) {
        this.cacheManager.checkAndUpdateActionCache(allActions);
      }
      
      // 按虚拟图层分组绘制
      if (this.virtualLayerManager) {
        await this.drawActionsByVirtualLayers(ctx, allActions);
      } else {
        // 兼容模式：直接绘制所有动作
        if (this.drawAction) {
          for (const action of allActions) {
            await this.drawAction(ctx, action);
          }
        }
      }
      
      // 绘制当前动作
      if (currentAction && currentAction.points.length > 0 && this.drawAction) {
        await this.drawAction(ctx, currentAction);
      }
      
      // 如果是选择工具，绘制选择框和锚点
      if (this.toolManager.getCurrentTool() === 'select' && this.drawSelectToolUI) {
        await this.drawSelectToolUI();
      }
      
      logger.debug('全量重绘完成', {
        totalActions: allActions.length,
        currentAction: currentAction?.id
      });
    }, undefined, '全量重绘失败');
  }
  
  /**
   * 增量重绘（只重绘新增的动作）
   */
  async redrawIncremental(
    newActions: DrawAction[],
    currentAction?: DrawAction | null
  ): Promise<void> {
    return SafeExecutor.executeAsync(async () => {
      const canvas = this.canvasEngine.getCanvas();
      const ctx = canvas.getContext('2d');
      if (!ctx || !this.drawAction) {
        return;
      }
      
      // 只绘制新增的动作
      for (const action of newActions) {
        await this.drawAction(ctx, action);
      }
      
      // 绘制当前动作
      if (currentAction && currentAction.points.length > 0) {
        await this.drawAction(ctx, currentAction);
      }
      
      logger.debug('增量重绘完成', { newActionsCount: newActions.length });
    }, undefined, '增量重绘失败');
  }
  
  /**
   * 几何图形重绘（使用离屏缓存优化）
   */
  async redrawGeometric(
    allActions: DrawAction[],
    currentAction?: DrawAction | null
  ): Promise<void> {
    return SafeExecutor.executeAsync(async () => {
      const canvas = this.canvasEngine.getCanvas();
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('无法获取Canvas上下文');
      }
      
      // 检查是否使用离屏缓存
      if (this.cacheManager && this.cacheManager.shouldUseOffscreenCache(allActions.length)) {
        const offscreenCanvas = await this.cacheManager.getOffscreenCache(ctx, allActions);
        if (offscreenCanvas) {
          // 清空主Canvas
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          // 绘制离屏缓存
          ctx.drawImage(offscreenCanvas, 0, 0);
          
          // 绘制当前动作
          if (currentAction && currentAction.points.length > 0 && this.drawAction) {
            await this.drawAction(ctx, currentAction);
          }
          
          logger.debug('几何图形重绘完成（使用离屏缓存）', {
            totalActions: allActions.length
          });
          return;
        }
      }
      
      // 不使用缓存，直接全量重绘
      await this.redrawAll(currentAction);
      
      logger.debug('几何图形重绘完成', {
        totalActions: allActions.length
      });
    }, undefined, '几何图形重绘失败');
  }
  
  /**
   * 重绘指定图层
   */
  async redrawLayer(layerId: string, allActions: DrawAction[]): Promise<void> {
    return SafeExecutor.executeAsync(async () => {
      if (!this.virtualLayerManager) {
        await this.redrawAll();
        return;
      }
      
      const layer = this.virtualLayerManager.getVirtualLayer(layerId);
      if (!layer) {
        logger.warn(`图层不存在: ${layerId}`);
        return;
      }
      
      // 获取图层缓存
      const cacheCanvas = this.virtualLayerManager.getLayerCache(layerId);
      if (!cacheCanvas || !layer.cacheCtx) {
        logger.warn(`图层缓存不存在: ${layerId}`);
        return;
      }
      
      // 清空缓存
      layer.cacheCtx.clearRect(0, 0, cacheCanvas.width, cacheCanvas.height);
      
      // 创建动作ID到动作的映射
      const actionMap = new Map<string, DrawAction>();
      for (const action of allActions) {
        actionMap.set(action.id, action);
      }
      
      // 重新渲染图层
      if (this.drawAction) {
        for (const actionId of layer.actionIds) {
          const action = actionMap.get(actionId);
          if (action) {
            await this.drawAction(layer.cacheCtx, action);
          }
        }
      }
      
      // 标记缓存有效
      this.virtualLayerManager.markLayerCacheValid(layerId);
      
      logger.debug(`重绘图层完成: ${layerId}`);
    }, undefined, `重绘图层失败: ${layerId}`);
  }
  
  /**
   * 重绘bottom层（下层图层）
   */
  async redrawBottomLayers(
    selectedLayerZIndex: number,
    allActions: DrawAction[]
  ): Promise<void> {
    return SafeExecutor.executeAsync(async () => {
      if (!this.virtualLayerManager) {
        await this.redrawAll();
        return;
      }
      
      const bottomCtx = this.canvasEngine.getBottomLayersDrawContext();
      if (!bottomCtx) {
        await this.redrawAll();
        return;
      }
      
      // 获取下层图层
      const allLayers = this.virtualLayerManager.getAllVirtualLayers();
      const bottomLayers = allLayers.filter(layer => layer.zIndex < selectedLayerZIndex);
      
      await this.redrawLayersInContext(bottomCtx, bottomLayers, allActions, 'bottom');
    }, undefined, '重绘bottom层失败');
  }
  
  /**
   * 重绘top层（上层图层）
   */
  async redrawTopLayers(
    selectedLayerZIndex: number,
    allActions: DrawAction[]
  ): Promise<void> {
    return SafeExecutor.executeAsync(async () => {
      if (!this.virtualLayerManager) {
        await this.redrawAll();
        return;
      }
      
      const topCtx = this.canvasEngine.getTopLayersDrawContext();
      if (!topCtx) {
        await this.redrawAll();
        return;
      }
      
      // 获取上层图层
      const allLayers = this.virtualLayerManager.getAllVirtualLayers();
      const topLayers = allLayers.filter(layer => layer.zIndex > selectedLayerZIndex);
      
      await this.redrawLayersInContext(topCtx, topLayers, allActions, 'top');
    }, undefined, '重绘top层失败');
  }
  
  /**
   * 重绘选中图层
   */
  async redrawSelectedLayer(
    selectedLayerZIndex: number,
    allActions: DrawAction[]
  ): Promise<void> {
    return SafeExecutor.executeAsync(async () => {
      if (!this.virtualLayerManager) {
        await this.redrawAll();
        return;
      }
      
      const selectedCtx = this.canvasEngine.getSelectedLayerDrawContext();
      if (!selectedCtx) {
        await this.redrawAll();
        return;
      }
      
      // 获取选中图层
      const allLayers = this.virtualLayerManager.getAllVirtualLayers();
      const selectedLayer = allLayers.find(layer => layer.zIndex === selectedLayerZIndex);
      
      if (!selectedLayer) {
        await this.redrawAll();
        return;
      }
      
      // 清空选中图层
      const canvas = selectedCtx.canvas;
      selectedCtx.clearRect(0, 0, canvas.width, canvas.height);
      
      // 创建动作ID到动作的映射
      const actionMap = new Map<string, DrawAction>();
      for (const action of allActions) {
        actionMap.set(action.id, action);
      }
      
      // 使用缓存或直接绘制
      const cacheCanvas = this.virtualLayerManager.getLayerCache(selectedLayer.id);
      if (cacheCanvas && !selectedLayer.cacheDirty) {
        selectedCtx.drawImage(cacheCanvas, 0, 0);
      } else {
        // 重新渲染到缓存，然后绘制
        if (this.drawAction) {
          const layerCache = this.virtualLayerManager.getLayerCache(selectedLayer.id);
          if (layerCache && selectedLayer.cacheCtx) {
            selectedLayer.cacheCtx.clearRect(0, 0, layerCache.width, layerCache.height);
            for (const actionId of selectedLayer.actionIds) {
              const action = actionMap.get(actionId);
              if (action) {
                await this.drawAction(selectedLayer.cacheCtx, action);
              }
            }
            this.virtualLayerManager.markLayerCacheValid(selectedLayer.id);
            selectedCtx.drawImage(layerCache, 0, 0);
          }
        }
      }
      
      logger.debug('只重绘选中图层完成', { layerId: selectedLayer.id });
    }, undefined, '重绘选中图层失败');
  }
  
  /**
   * 在指定上下文中重绘图层列表
   */
  private async redrawLayersInContext(
    ctx: CanvasRenderingContext2D,
    layers: VirtualLayer[],
    allActions: DrawAction[],
    layerType: 'bottom' | 'top'
  ): Promise<void> {
    if (!this.virtualLayerManager || !this.drawAction) {
      return;
    }
    
    // 创建动作ID到动作的映射
    const actionMap = new Map<string, DrawAction>();
    for (const action of allActions) {
      actionMap.set(action.id, action);
    }
    
    // 清空层
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    
    // 绘制所有图层
    for (const layer of layers) {
      if (!layer || !layer.visible || layer.locked) continue;
      
      // 验证图层是否仍然存在
      if (!this.virtualLayerManager.getVirtualLayer(layer.id)) {
        logger.warn(`图层在绘制过程中被删除，跳过: ${layer.id}`);
        continue;
      }
      
      const originalGlobalAlpha = ctx.globalAlpha;
      ctx.globalAlpha = layer.opacity;
      
      // 使用缓存渲染
      const cacheCanvas = this.virtualLayerManager.getLayerCache(layer.id);
      if (cacheCanvas && !layer.cacheDirty) {
        ctx.drawImage(cacheCanvas, 0, 0);
      } else {
        // 重新渲染到缓存
        const layerCache = this.virtualLayerManager.getLayerCache(layer.id);
        if (layerCache && layer.cacheCtx) {
          layer.cacheCtx.clearRect(0, 0, layerCache.width, layerCache.height);
          for (const actionId of layer.actionIds) {
            const action = actionMap.get(actionId);
            if (action) {
              await this.drawAction(layer.cacheCtx, action);
            }
          }
          this.virtualLayerManager.markLayerCacheValid(layer.id);
          ctx.drawImage(layerCache, 0, 0);
        }
      }
      
      ctx.globalAlpha = originalGlobalAlpha;
    }
    
    logger.debug(`重绘${layerType}层完成`, { layerCount: layers.length });
  }
  
  /**
   * 按虚拟图层分组绘制动作
   */
  private async drawActionsByVirtualLayers(
    ctx: CanvasRenderingContext2D,
    allActions: DrawAction[]
  ): Promise<void> {
    if (!this.virtualLayerManager || !this.drawAction) {
      return;
    }
    
    const layers = this.virtualLayerManager.getAllVirtualLayers();
    
    // 【性能优化】使用 Map 代替 Array.find()，将 O(n) 查找优化为 O(1)
    const actionMap = new Map<string, DrawAction>();
    for (const action of allActions) {
      actionMap.set(action.id, action);
    }
    
    for (const layer of layers) {
      if (!layer.visible || layer.locked) continue;
      
      const originalGlobalAlpha = ctx.globalAlpha;
      ctx.globalAlpha = layer.opacity;
      
      // 使用缓存渲染
      const cacheCanvas = this.virtualLayerManager.getLayerCache(layer.id);
      if (cacheCanvas && !layer.cacheDirty) {
        ctx.drawImage(cacheCanvas, 0, 0);
      } else {
        // 重新渲染到缓存
        const layerCache = this.virtualLayerManager.getLayerCache(layer.id);
        if (layerCache && layer.cacheCtx) {
          layer.cacheCtx.clearRect(0, 0, layerCache.width, layerCache.height);
          for (const actionId of layer.actionIds) {
            const action = actionMap.get(actionId);
            if (action) {
              await this.drawAction(layer.cacheCtx, action);
            }
          }
          this.virtualLayerManager.markLayerCacheValid(layer.id);
          ctx.drawImage(layerCache, 0, 0);
        }
      }
      
      ctx.globalAlpha = originalGlobalAlpha;
    }
  }
  
  // ============================================
  // 脏矩形优化相关方法
  // ============================================
  
  /**
   * 标记动作为脏（需要重绘）
   * @param action 发生变化的动作
   */
  markActionDirty(action: DrawAction): void {
    if (!this.config.enableDirtyRect) return;
    
    const bounds = this.calculateActionBounds(action);
    if (bounds) {
      // 标记旧位置和新位置都为脏
      const oldBounds = this.lastActionBounds.get(action.id);
      if (oldBounds) {
        this.dirtyRectManager.markDirtyFromMove(oldBounds, bounds);
      } else {
        this.dirtyRectManager.markDirty(bounds);
      }
      
      // 更新边界缓存
      this.lastActionBounds.set(action.id, bounds);
    }
  }
  
  /**
   * 标记多个动作为脏
   * @param actions 发生变化的动作列表
   */
  markActionsDirty(actions: DrawAction[]): void {
    for (const action of actions) {
      this.markActionDirty(action);
    }
  }
  
  /**
   * 标记区域为脏
   * @param bounds 脏区域
   */
  markBoundsDirty(bounds: Bounds): void {
    if (!this.config.enableDirtyRect) return;
    this.dirtyRectManager.markDirty(bounds);
  }
  
  /**
   * 强制全量重绘
   */
  markFullRedraw(): void {
    this.dirtyRectManager.markFullRedraw();
  }
  
  /**
   * 清除脏标记
   */
  clearDirtyRects(): void {
    this.dirtyRectManager.clear();
  }
  
  /**
   * 检查是否有脏区域需要重绘
   */
  hasDirtyRects(): boolean {
    return this.dirtyRectManager.hasDirtyRects();
  }
  
  /**
   * 获取脏矩形统计信息
   */
  getDirtyRectStats() {
    return this.dirtyRectManager.getStats();
  }
  
  /**
   * 使用脏矩形进行局部重绘
   * @param currentAction 当前正在绘制的动作
   */
  async redrawDirty(currentAction?: DrawAction | null): Promise<void> {
    if (!this.config.enableDirtyRect || !this.hasDirtyRects()) {
      return;
    }
    
    // 如果需要全量重绘，直接调用 redrawAll
    if (this.dirtyRectManager.needsFullRedraw()) {
      logger.debug('脏区域过大，切换到全量重绘');
      await this.redrawAll(currentAction);
      this.clearDirtyRects();
      return;
    }
    
    return SafeExecutor.executeAsync(async () => {
      const canvas = this.canvasEngine.getCanvas();
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('无法获取Canvas上下文');
      }
      
      const allActions = this.historyManager.getAllActions();
      
      // 使用脏矩形进行局部重绘
      await this.dirtyRectManager.clipAndRedraw(ctx, async (ctx, clipRect) => {
        // 在裁剪区域内重绘所有相关动作
        await this.redrawActionsInRect(ctx, allActions, clipRect);
        
        // 如果有当前动作，也需要绘制
        if (currentAction && currentAction.points.length > 0 && this.drawAction) {
          const actionBounds = this.calculateActionBounds(currentAction);
          if (actionBounds && this.rectsIntersect(actionBounds, clipRect)) {
            await this.drawAction(ctx, currentAction);
          }
        }
      });
      
      // 如果是选择工具，绘制选择框和锚点
      if (this.toolManager.getCurrentTool() === 'select' && this.drawSelectToolUI) {
        await this.drawSelectToolUI();
      }
      
      const stats = this.getDirtyRectStats();
      logger.debug('脏矩形局部重绘完成', {
        dirtyRectCount: stats.mergedRectCount,
        dirtyRatio: `${(stats.dirtyRatio * 100).toFixed(1)}%`,
        totalActions: allActions.length
      });
      
      // 清除脏标记
      this.clearDirtyRects();
    }, undefined, '脏矩形重绘失败');
  }
  
  /**
   * 在指定矩形区域内重绘动作
   */
  private async redrawActionsInRect(
    ctx: CanvasRenderingContext2D,
    allActions: DrawAction[],
    clipRect: Bounds
  ): Promise<void> {
    if (!this.drawAction) return;
    
    // 筛选与裁剪区域相交的动作
    const relevantActions = allActions.filter(action => {
      const bounds = this.calculateActionBounds(action);
      return bounds && this.rectsIntersect(bounds, clipRect);
    });
    
    // 按虚拟图层分组绘制
    if (this.virtualLayerManager) {
      const layers = this.virtualLayerManager.getAllVirtualLayers();
      const actionMap = new Map<string, DrawAction>();
      for (const action of relevantActions) {
        actionMap.set(action.id, action);
      }
      
      for (const layer of layers) {
        if (!layer.visible || layer.locked) continue;
        
        const originalGlobalAlpha = ctx.globalAlpha;
        ctx.globalAlpha = layer.opacity;
        
        for (const actionId of layer.actionIds) {
          const action = actionMap.get(actionId);
          if (action) {
            await this.drawAction(ctx, action);
          }
        }
        
        ctx.globalAlpha = originalGlobalAlpha;
      }
    } else {
      // 兼容模式：直接绘制
      for (const action of relevantActions) {
        await this.drawAction(ctx, action);
      }
    }
  }
  
  /**
   * 计算动作的边界框
   */
  private calculateActionBounds(action: DrawAction): Bounds | null {
    if (!action.points || action.points.length === 0) {
      return null;
    }
    
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    
    for (const point of action.points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    
    // 扩展线宽
    const lineWidth = action.context?.lineWidth ?? 2;
    const halfWidth = lineWidth / 2;
    
    return {
      x: minX - halfWidth,
      y: minY - halfWidth,
      width: maxX - minX + lineWidth,
      height: maxY - minY + lineWidth
    };
  }
  
  /**
   * 检查两个矩形是否相交
   */
  private rectsIntersect(a: Bounds, b: Bounds): boolean {
    return !(
      a.x + a.width < b.x ||
      b.x + b.width < a.x ||
      a.y + a.height < b.y ||
      b.y + b.height < a.y
    );
  }
  
  /**
   * 更新画布尺寸
   */
  updateCanvasSize(width: number, height: number): void {
    this.dirtyRectManager.updateCanvasSize(width, height);
    // 尺寸变化，清除边界缓存
    this.lastActionBounds.clear();
  }
  
  /**
   * 更新配置
   */
  updateConfig(config: Partial<RedrawManagerConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.dirtyRectConfig) {
      this.dirtyRectManager.updateConfig(config.dirtyRectConfig);
    }
  }
  
  /**
   * 获取配置
   */
  getConfig(): RedrawManagerConfig {
    return { ...this.config };
  }
  
  /**
   * 清除动作边界缓存
   */
  clearBoundsCache(): void {
    this.lastActionBounds.clear();
  }
  
  /**
   * 移除动作边界缓存
   */
  removeActionBounds(actionId: string): void {
    this.lastActionBounds.delete(actionId);
  }
}
