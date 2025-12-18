import type { DrawAction } from '../tools/DrawTool';
import { logger } from '../infrastructure/logging/Logger';
import { CanvasEngine } from './CanvasEngine';
import type { HistoryManager } from '../history/HistoryManager';
import { EventBus } from '../infrastructure/events/EventBus';

/**
 * 虚拟图层接口
 * 定义了一个虚拟图层的属性
 */
export interface VirtualLayer {
  id: string; // 虚拟图层ID
  name: string; // 虚拟图层名称
  visible: boolean; // 虚拟图层可见性
  opacity: number; // 虚拟图层透明度
  locked: boolean; // 虚拟图层锁定状态
  created: number; // 虚拟图层创建时间
  modified: number; // 虚拟图层修改时间
  actionIds: string[]; // 属于该虚拟图层的动作ID列表
  actionIdsSet: Set<string>; // 优化：使用Set进行快速查找
  zIndex: number; // 图层顺序（z-index），数值越大越在上层
  // 渲染缓存相关
  cacheCanvas?: HTMLCanvasElement; // 离屏Canvas缓存
  cacheCtx?: CanvasRenderingContext2D; // 缓存Canvas的上下文
  cacheDirty: boolean; // 缓存是否过期（需要重新渲染）
  cacheWidth: number; // 缓存Canvas宽度
  cacheHeight: number; // 缓存Canvas高度
}

/**
 * 虚拟图层模式
 */
export type VirtualLayerMode = 'grouped' | 'individual';

/**
 * 虚拟图层管理器配置
 */
export interface VirtualLayerConfig {
  /** 虚拟图层模式：'grouped' | 'individual' */
  mode?: VirtualLayerMode;
  maxLayers?: number; // 最大虚拟图层数量
  defaultLayerName?: string; // 默认虚拟图层名称
  /** 每个图层最大动作数，默认为1000 */
  maxActionsPerLayer?: number;
  /** 分组模式下的时间间隔阈值（毫秒），超过此时间创建新图层 */
  timeThreshold?: number;
  /** 分组模式下的工具类型变化是否创建新图层 */
  createLayerOnToolChange?: boolean;
  
  // ============================================
  // 渲染优化配置
  // ============================================
  
  /** 
   * 是否启用动态图层拆分优化
   * 启用后，选择元素时会将 draw 层拆分为 bottom/selected/top 三层
   * 注意：此功能会增加内存占用和初始化开销，脏矩形算法已足够优化，一般不需要启用
   * @default false
   */
  enableDynamicLayerSplit?: boolean;
  
  /**
   * 动态拆分阈值：只有当 bottom/top 层元素数量超过此值时才启用拆分
   * @default 100
   */
  dynamicSplitThreshold?: number;
}

/**
 * 虚拟图层管理器
 * 
 * 功能特性：
 * - 支持两种虚拟图层模式：分组模式和独立模式
 * - 虚拟图层可见性/透明度/锁定控制
 * - 虚拟图层重命名/删除/合并
 * - 与 HistoryManager 协同工作
 * 
 * 设计理念：
 * - 保持 CanvasEngine 的三层物理架构
 * - 在 draw 层内部实现虚拟图层管理
 * - 每个动作可以属于一个虚拟图层
 * - 支持动作的图层属性独立控制
 * 
 * 性能优化：
 * - 使用Set进行O(1)的动作ID查找
 * - 智能缓存策略
 * - 批量操作优化
 */
export class VirtualLayerManager {
  private virtualLayers: Map<string, VirtualLayer> = new Map(); // 虚拟图层Map
  private actionLayerMap: Map<string, string> = new Map(); // actionId -> layerId
  private activeLayerId: string = ''; // 活动虚拟图层ID
  private mode: VirtualLayerMode = 'individual'; // 虚拟图层模式
  
  // 配置参数
  private maxLayers: number = 50; // 最大虚拟图层数量
  private defaultLayerName: string = '图层'; // 默认虚拟图层名称
  private maxActionsPerLayer: number = 1000; // 每个图层最大动作数
  private timeThreshold: number = 5000; // 时间间隔阈值（毫秒）
  private createLayerOnToolChange: boolean = true; // 工具类型变化是否创建新图层
  
  // 渲染优化配置
  private enableDynamicLayerSplit: boolean = false; // 是否启用动态图层拆分（默认关闭）
  private dynamicSplitThreshold: number = 100; // 动态拆分阈值
  
  // 性能优化：缓存统计信息
  private statsCache: {
    totalLayers: number; // 总虚拟图层数量
    visibleLayers: number; // 可见虚拟图层数量
    lockedLayers: number; // 锁定虚拟图层数量
    totalActions: number; // 总动作数量
    lastUpdate: number;
  } | null = null;
  
  // 性能优化：缓存可见动作ID
  private visibleActionIdsCache: string[] | null = null;
  private visibleActionIdsCacheTime: number = 0;
  
  // 图层顺序管理
  private nextZIndex: number = 0; // 下一个zIndex值
  
  // Canvas尺寸（用于创建缓存Canvas）
  private canvasWidth: number = 0;
  private canvasHeight: number = 0;
  
  // CanvasEngine引用（用于创建动态图层）
  private canvasEngine?: CanvasEngine;
  
  // HistoryManager引用（用于获取动作数据）
  private historyManager?: HistoryManager;
  
  // EventBus 引用（用于组件解耦）
  private eventBus?: EventBus;
  private eventUnsubscribers: (() => void)[] = [];

  constructor(config: VirtualLayerConfig = {}, canvasEngine?: CanvasEngine, eventBus?: EventBus) {
    this.mode = config.mode || 'individual';
    this.maxLayers = config.maxLayers || 50;
    this.defaultLayerName = config.defaultLayerName || '图层';
    this.maxActionsPerLayer = config.maxActionsPerLayer || 1000;
    this.timeThreshold = config.timeThreshold || 5000;
    this.createLayerOnToolChange = config.createLayerOnToolChange !== false;
    this.canvasEngine = canvasEngine;
    this.eventBus = eventBus;
    
    // 渲染优化配置
    this.enableDynamicLayerSplit = config.enableDynamicLayerSplit ?? false; // 默认关闭
    this.dynamicSplitThreshold = config.dynamicSplitThreshold ?? 100;
    
    // 订阅 EventBus 事件
    this.subscribeToEvents();
    
    logger.debug('VirtualLayerManager 初始化', {
      mode: this.mode,
      enableDynamicLayerSplit: this.enableDynamicLayerSplit,
      dynamicSplitThreshold: this.dynamicSplitThreshold
    });
    
    // 创建默认虚拟图层
    this.createDefaultLayer();
    
    logger.debug('VirtualLayerManager初始化完成', {
      mode: this.mode,
      maxLayers: this.maxLayers,
      maxActionsPerLayer: this.maxActionsPerLayer,
      hasCanvasEngine: !!this.canvasEngine
    });
  }

  /**
   * 设置CanvasEngine引用（用于动态图层管理）
   */
  public setCanvasEngine(canvasEngine: CanvasEngine): void {
    this.canvasEngine = canvasEngine;
    logger.debug('VirtualLayerManager已设置CanvasEngine引用');
  }

  /**
   * 设置HistoryManager引用（用于获取动作数据）
   */
  public setHistoryManager(historyManager: HistoryManager): void {
    this.historyManager = historyManager;
    logger.debug('VirtualLayerManager已设置HistoryManager引用');
  }

  /**
   * 设置 EventBus 引用
   */
  public setEventBus(eventBus: EventBus): void {
    // 先取消旧的订阅
    this.unsubscribeFromEvents();
    this.eventBus = eventBus;
    this.subscribeToEvents();
  }

  /**
   * 订阅 EventBus 事件
   */
  private subscribeToEvents(): void {
    if (!this.eventBus) return;

    // 订阅 action 更新事件 - 自动标记图层缓存过期
    const unsubAction = this.eventBus.on('action:updated', ({ actionId }) => {
      const layerId = this.actionLayerMap.get(actionId);
      if (layerId) {
        this.markLayerCacheDirty(layerId);
      }
    });
    this.eventUnsubscribers.push(unsubAction);

    // 订阅选择变更事件 - 可用于日志或其他处理
    const unsubSelection = this.eventBus.on('selection:changed', ({ selectedIds }) => {
      logger.debug('VirtualLayerManager: 收到选择变更', { count: selectedIds.length });
    });
    this.eventUnsubscribers.push(unsubSelection);
  }

  /**
   * 取消 EventBus 订阅
   */
  private unsubscribeFromEvents(): void {
    this.eventUnsubscribers.forEach(unsub => unsub());
    this.eventUnsubscribers = [];
  }

  /**
   * 创建默认虚拟图层
   */
  private createDefaultLayer(): void {
    const defaultLayer = this.createVirtualLayer('默认图层');
    this.activeLayerId = defaultLayer.id;
  }

  /**
   * 创建虚拟图层
   */
  public createVirtualLayer(name?: string): VirtualLayer {
    if (this.virtualLayers.size >= this.maxLayers) {
      throw new Error(`已达到最大虚拟图层数量限制: ${this.maxLayers}`);
    }

    const layerId = this.generateLayerId();
    const layerName = name || `${this.defaultLayerName} ${this.virtualLayers.size + 1}`;
    const now = Date.now();

    const newLayer: VirtualLayer = {
      id: layerId,
      name: layerName,
      visible: true,
      opacity: 1.0,
      locked: false,
      created: now,
      modified: now,
      actionIds: [],
      actionIdsSet: new Set<string>(),
      zIndex: this.nextZIndex++, // 分配zIndex
      cacheDirty: true, // 新图层需要渲染
      cacheWidth: this.canvasWidth,
      cacheHeight: this.canvasHeight
    };
    
    // 初始化缓存Canvas（延迟创建，在需要时创建）

    this.virtualLayers.set(layerId, newLayer);
    logger.debug('创建虚拟图层:', newLayer.name, layerId);
    
    return newLayer;
  }

  /**
   * 删除虚拟图层
   */
  public deleteVirtualLayer(layerId: string): boolean {
    // 不能删除最后一个图层
    if (this.virtualLayers.size <= 1) {
      logger.warn('不能删除最后一个虚拟图层');
      return false;
    }

    const layer = this.virtualLayers.get(layerId);
    if (!layer) {
      logger.warn('虚拟图层不存在:', layerId);
      return false;
    }

    // 获取默认图层（用于后续处理）
    const defaultLayer = this.getDefaultLayer();

    // individual模式：直接删除图层和action映射（保持一个图层一个action的规则）
    if (this.mode === 'individual') {
      // 删除action映射
      layer.actionIds.forEach(actionId => {
        this.actionLayerMap.delete(actionId);
      });
      // 删除图层
      this.virtualLayers.delete(layerId);
      logger.debug(`独立模式：删除图层 ${layer.name}（保持一个图层一个action规则）`);
    } else {
      // grouped模式：将该图层的动作移动到默认图层
      if (defaultLayer && layer.actionIds.length > 0) {
        layer.actionIds.forEach(actionId => {
          this.actionLayerMap.set(actionId, defaultLayer.id);
          defaultLayer.actionIds.push(actionId);
          defaultLayer.actionIdsSet.add(actionId);
        });
        defaultLayer.modified = Date.now();
      }
      // 删除图层
      this.virtualLayers.delete(layerId);
    }

    // 如果删除的是当前激活图层，切换到默认图层并重新拆分draw层
    if (this.activeLayerId === layerId) {
      const oldActiveLayerId = this.activeLayerId;
      this.activeLayerId = defaultLayer?.id || '';
      
      // 如果draw层已拆分，需要重新拆分（因为活动图层变化了）
      if (this.canvasEngine && this.canvasEngine.isDrawLayerSplit() && defaultLayer) {
        // 合并旧的draw层拆分
        this.canvasEngine.mergeDrawLayers();
        // 重新拆分draw层（使用新的活动图层）
        const allLayers = this.getAllVirtualLayers();
        const allLayerZIndices = allLayers.map(l => l.zIndex);
        try {
          this.canvasEngine.splitDrawLayer(defaultLayer.zIndex, allLayerZIndices);
          logger.debug('删除活动图层后重新拆分draw层:', defaultLayer.name);
        } catch (error) {
          logger.error('重新拆分draw层失败:', error);
        }
      }
      
      logger.debug('删除活动图层，切换到默认图层:', oldActiveLayerId, '->', this.activeLayerId);
    }

    this.invalidateCache();
    logger.debug('删除虚拟图层:', layer.name);
    return true;
  }

  // 防止快速切换图层时的竞态条件
  private layerSwitchInProgress: boolean = false;

  /**
   * 设置活动虚拟图层
   */
  public setActiveVirtualLayer(layerId: string): boolean {
    // 防止并发切换
    if (this.layerSwitchInProgress) {
      logger.warn('图层切换正在进行中，忽略重复请求:', layerId);
      return false;
    }

    const layer = this.getVirtualLayer(layerId);
    if (!layer) {
      logger.warn('虚拟图层不存在:', layerId);
      return false;
    }

    if (layer.locked) {
      logger.warn('虚拟图层已锁定，无法激活:', layer.name);
      return false;
    }

    // 如果切换到同一个图层，直接返回
    if (this.activeLayerId === layerId) {
      logger.debug('已激活该图层，无需重复切换:', layer.name);
      return true;
    }

    this.layerSwitchInProgress = true;

    try {
      // 清除之前的动态图层和draw层拆分
      if (this.activeLayerId && this.activeLayerId !== layerId) {
        this.clearActiveLayerSelection();
        // 合并之前的draw层拆分
        if (this.canvasEngine) {
          this.canvasEngine.mergeDrawLayers();
        }
      }

      this.activeLayerId = layerId;
    
      // 创建动态图层用于交互元素
      if (this.canvasEngine) {
        try {
          this.canvasEngine.getSelectionLayerForVirtualLayer(layer.zIndex);
          logger.debug('为虚拟图层创建动态图层:', layer.name, 'zIndex:', layer.zIndex);
        } catch (error) {
          logger.error('创建动态图层失败:', error);
        }
        
        // 拆分draw层以实现性能优化（仅在启用时执行）
        if (this.shouldSplitDrawLayers()) {
          try {
            const allLayers = this.getAllVirtualLayers(); // 已按zIndex排序
            const allLayerZIndices = allLayers.map(l => l.zIndex); // 已排序的zIndex数组
            const splitResult = this.canvasEngine.splitDrawLayer(layer.zIndex, allLayerZIndices);
            logger.debug('拆分draw层完成:', layer.name, 'zIndex:', layer.zIndex, splitResult);
            
            // 拆分后需要初始化绘制bottom和top层的内容
            // 注意：这里只标记需要重绘，实际绘制由DrawingHandler处理
            // 因为DrawingHandler需要访问HistoryManager来获取动作数据
            this.markLayersForInitialDraw(splitResult, layer.zIndex, allLayers);
          } catch (error) {
            logger.error('拆分draw层失败:', error);
          }
        } else {
          logger.debug('动态图层拆分已禁用，跳过拆分', {
            enableDynamicLayerSplit: this.enableDynamicLayerSplit
          });
        }
      }
    } finally {
      this.layerSwitchInProgress = false;
    }
    
    logger.debug('切换到虚拟图层:', layer.name);
    return true;
  }

  /**
   * 判断是否应该拆分 draw 层
   * 根据配置和实际情况决定是否启用动态图层拆分
   */
  private shouldSplitDrawLayers(): boolean {
    // 如果明确禁用，直接返回 false
    if (!this.enableDynamicLayerSplit) {
      return false;
    }
    
    // 如果启用了动态拆分，检查是否满足阈值条件
    // 只有当 bottom/top 层元素足够多时才值得拆分
    const allLayers = this.getAllVirtualLayers();
    const activeLayer = this.getVirtualLayer(this.activeLayerId);
    
    if (!activeLayer) {
      return false;
    }
    
    // 计算 bottom 和 top 层的总动作数
    let bottomActionCount = 0;
    let topActionCount = 0;
    
    for (const layer of allLayers) {
      if (layer.zIndex < activeLayer.zIndex) {
        bottomActionCount += layer.actionIds.length;
      } else if (layer.zIndex > activeLayer.zIndex) {
        topActionCount += layer.actionIds.length;
      }
    }
    
    // 只有当任一层超过阈值时才值得拆分
    const shouldSplit = bottomActionCount > this.dynamicSplitThreshold || 
                        topActionCount > this.dynamicSplitThreshold;
    
    logger.debug('动态拆分判断', {
      bottomActionCount,
      topActionCount,
      threshold: this.dynamicSplitThreshold,
      shouldSplit
    });
    
    return shouldSplit;
  }

  /**
   * 清除活动图层的选择状态（删除动态图层）
   */
  private clearActiveLayerSelection(): void {
    if (this.activeLayerId && this.canvasEngine) {
      const layer = this.getVirtualLayer(this.activeLayerId);
      if (layer) {
        const dynamicLayerId = `selection-${layer.zIndex}`;
        this.canvasEngine.removeDynamicLayer(dynamicLayerId);
        logger.debug('清除虚拟图层的动态图层:', layer.name);
      }
    }
  }

  /**
   * 清除活动图层（公共方法）
   */
  public clearActiveLayer(): void {
    this.clearActiveLayerSelection();
    // 合并draw层拆分
    if (this.canvasEngine) {
      this.canvasEngine.mergeDrawLayers();
    }
    this.activeLayerId = '';
  }
  
  /**
   * 标记需要初始绘制的图层（拆分draw层后调用）
   * @param splitResult 拆分结果
   * @param selectedZIndex 选中图层zIndex
   * @param allLayers 所有图层
   */
  private markLayersForInitialDraw(
    splitResult: { hasBottom: boolean; hasTop: boolean },
    selectedZIndex: number,
    allLayers: VirtualLayer[]
  ): void {
    // 标记bottom层需要绘制（如果有）
    if (splitResult.hasBottom) {
      const bottomLayers = allLayers.filter(l => l.zIndex < selectedZIndex);
      for (const bottomLayer of bottomLayers) {
        // 标记缓存过期，需要重新绘制
        bottomLayer.cacheDirty = true;
      }
    }
    
    // 标记top层需要绘制（如果有）
    if (splitResult.hasTop) {
      const topLayers = allLayers.filter(l => l.zIndex > selectedZIndex);
      for (const topLayer of topLayers) {
        // 标记缓存过期，需要重新绘制
        topLayer.cacheDirty = true;
      }
    }
    
    // 标记选中图层需要绘制
    const selectedLayer = allLayers.find(l => l.zIndex === selectedZIndex);
    if (selectedLayer) {
      selectedLayer.cacheDirty = true;
    }
  }

  /**
   * 获取活动虚拟图层
   */
  public getActiveVirtualLayer(): VirtualLayer | null {
    return this.getVirtualLayer(this.activeLayerId);
  }

  /**
   * 获取活动虚拟图层的zIndex
   */
  public getActiveVirtualLayerZIndex(): number | null {
    const layer = this.getActiveVirtualLayer();
    return layer ? layer.zIndex : null;
  }

  /**
   * 获取指定虚拟图层
   */
  public getVirtualLayer(layerId: string): VirtualLayer | null {
    return this.virtualLayers.get(layerId) || null;
  }

  // ============================================
  // 优化配置 API
  // ============================================

  /**
   * 获取是否启用动态图层拆分
   */
  public isDynamicLayerSplitEnabled(): boolean {
    return this.enableDynamicLayerSplit;
  }

  /**
   * 设置是否启用动态图层拆分
   */
  public setDynamicLayerSplitEnabled(enabled: boolean): void {
    this.enableDynamicLayerSplit = enabled;
    logger.info(`VirtualLayerManager: 动态图层拆分 ${enabled ? '启用' : '禁用'}`);
    
    // 如果禁用，立即合并现有拆分
    if (!enabled && this.canvasEngine) {
      this.canvasEngine.mergeDrawLayers();
    }
  }

  /**
   * 获取动态拆分阈值
   */
  public getDynamicSplitThreshold(): number {
    return this.dynamicSplitThreshold;
  }

  /**
   * 设置动态拆分阈值
   */
  public setDynamicSplitThreshold(threshold: number): void {
    this.dynamicSplitThreshold = Math.max(1, threshold);
    logger.debug('VirtualLayerManager: 动态拆分阈值更新为', this.dynamicSplitThreshold);
  }

  /**
   * 销毁VirtualLayerManager，清理所有资源
   */
  public destroy(): void {
    logger.debug('🗑️ 开始销毁VirtualLayerManager...');
    
    // 0. 取消 EventBus 订阅
    this.unsubscribeFromEvents();
    this.eventBus = undefined;
    
    // 1. 清理所有动态图层
    if (this.canvasEngine && this.activeLayerId) {
      this.clearActiveLayerSelection();
    }
    
    // 2. 清理所有图层缓存Canvas
    for (const layer of this.virtualLayers.values()) {
      if (layer.cacheCanvas) {
        // 清理Canvas资源
        layer.cacheCanvas.width = 0;
        layer.cacheCanvas.height = 0;
        layer.cacheCanvas = undefined;
        layer.cacheCtx = undefined;
      }
    }
    
    // 3. 清理所有图层缓存（调用已有方法）
    this.clearAllLayerCaches();
    
    // 4. 清理Map和Set
    this.virtualLayers.clear();
    this.actionLayerMap.clear();
    
    // 5. 清理统计缓存
    this.statsCache = null;
    this.visibleActionIdsCache = null;
    this.visibleActionIdsCacheTime = 0;
    
    // 6. 清理CanvasEngine引用
    this.canvasEngine = undefined;
    
    // 7. 重置状态
    this.activeLayerId = '';
    this.nextZIndex = 0;
    this.canvasWidth = 0;
    this.canvasHeight = 0;
    
    // 8. 使缓存失效
    this.invalidateCache();
    
    logger.debug('✅ VirtualLayerManager已销毁');
  }

  /**
   * 获取所有虚拟图层（按zIndex排序）
   */
  public getAllVirtualLayers(): VirtualLayer[] {
    return Array.from(this.virtualLayers.values())
      .sort((a, b) => a.zIndex - b.zIndex);
  }

  /**
   * 获取可见的虚拟图层
   */
  public getVisibleVirtualLayers(): VirtualLayer[] {
    return Array.from(this.virtualLayers.values()).filter(layer => layer.visible);
  }

  /**
   * 设置虚拟图层可见性
   */
  public setVirtualLayerVisible(layerId: string, visible: boolean): boolean {
    const layer = this.getVirtualLayer(layerId);
    if (!layer) return false;

    layer.visible = visible;
    layer.modified = Date.now();
    // 可见性变化不需要重新渲染缓存，只需要重绘
    // 注意：实际重绘由DrawBoard根据draw层拆分状态决定
    this.invalidateCache();
    logger.debug('设置虚拟图层可见性:', layer.name, visible);
    return true;
  }

  /**
   * 设置虚拟图层透明度
   */
  public setVirtualLayerOpacity(layerId: string, opacity: number): boolean {
    const layer = this.getVirtualLayer(layerId);
    if (!layer) return false;

    layer.opacity = Math.max(0, Math.min(1, opacity));
    layer.modified = Date.now();
    // 透明度变化不需要重新渲染缓存，只需要重绘
    // 注意：实际重绘由DrawBoard根据draw层拆分状态决定
    this.invalidateCache();
    logger.debug('设置虚拟图层透明度:', layer.name, layer.opacity);
    return true;
  }

  /**
   * 设置虚拟图层锁定状态
   */
  public setVirtualLayerLocked(layerId: string, locked: boolean): boolean {
    const layer = this.getVirtualLayer(layerId);
    if (!layer) return false;

    layer.locked = locked;
    layer.modified = Date.now();
    this.invalidateCache();
    logger.debug('设置虚拟图层锁定:', layer.name, locked);
    return true;
  }

  /**
   * 重命名虚拟图层
   */
  public renameVirtualLayer(layerId: string, newName: string): boolean {
    const layer = this.getVirtualLayer(layerId);
    if (!layer) return false;

    const oldName = layer.name;
    layer.name = newName.trim() || oldName;
    layer.modified = Date.now();
    this.invalidateCache();
    logger.debug('重命名虚拟图层:', oldName, '->', layer.name);
    return true;
  }

  /**
   * 将动作分配到虚拟图层
   * 注意：individual模式下，如果目标图层已有action，会拒绝分配
   */
  public assignActionToLayer(actionId: string, layerId: string): boolean {
    const layer = this.getVirtualLayer(layerId);
    if (!layer || layer.locked) {
      logger.warn('无法分配动作：虚拟图层不存在或已锁定');
      return false;
    }

    // individual模式：检查目标图层是否已有action（保持一个图层一个action的规则）
    if (this.mode === 'individual') {
      if (layer.actionIds.length > 0 && !layer.actionIdsSet.has(actionId)) {
        logger.warn(`独立模式：图层 ${layer.name} 已有action，无法分配新action（保持一个图层一个action规则）`);
        return false;
      }
    }

        // 从原图层移除
        const oldLayerId = this.actionLayerMap.get(actionId);
        if (oldLayerId) {
          const oldLayer = this.getVirtualLayer(oldLayerId);
          if (oldLayer && oldLayer.actionIdsSet.has(actionId)) {
            const index = oldLayer.actionIds.indexOf(actionId);
            if (index > -1) {
              oldLayer.actionIds.splice(index, 1);
              oldLayer.actionIdsSet.delete(actionId);
              oldLayer.modified = Date.now();
          // 标记原图层缓存过期
          this.markLayerCacheDirty(oldLayerId);
            }
          }
        }

        // 添加到新图层
        this.actionLayerMap.set(actionId, layerId);
        if (!layer.actionIdsSet.has(actionId)) {
          layer.actionIds.push(actionId);
          layer.actionIdsSet.add(actionId);
      layer.modified = Date.now();
      // 标记新图层缓存过期
      this.markLayerCacheDirty(layerId);
    }

    this.invalidateCache();
    logger.debug('分配动作到虚拟图层:', actionId, '->', layer.name);
    return true;
  }

  /**
   * 获取动作所属的虚拟图层
   */
  public getActionLayer(actionId: string): VirtualLayer | null {
    const layerId = this.actionLayerMap.get(actionId);
    return layerId ? this.getVirtualLayer(layerId) : null;
  }

  /**
   * 获取虚拟图层的所有动作
   */
  public getLayerActions(layerId: string): string[] {
    const layer = this.getVirtualLayer(layerId);
    return layer ? [...layer.actionIds] : [];
  }

  /**
   * 从图层中移除动作
   */
  public removeActionFromLayer(actionId: string, layerId: string): boolean {
    const layer = this.getVirtualLayer(layerId);
    if (!layer) {
      logger.warn('无法移除动作：虚拟图层不存在', { actionId, layerId });
      return false;
    }
    
    if (!layer.actionIdsSet.has(actionId)) {
      logger.debug('动作不在该图层中', { actionId, layerId });
      return false;
    }
    
    // 从图层移除
    const index = layer.actionIds.indexOf(actionId);
    if (index !== -1) {
      layer.actionIds.splice(index, 1);
    }
    layer.actionIdsSet.delete(actionId);
    layer.modified = Date.now();
    
    // 从映射中移除
    this.actionLayerMap.delete(actionId);
    
    // 标记缓存过期
    this.markLayerCacheDirty(layerId);
    this.invalidateCache();
    
    logger.debug('从图层移除动作', { actionId, layerId, layerName: layer.name });
    return true;
  }

  /**
   * 处理新动作（根据模式自动分配图层）
   */
  public handleNewAction(action: DrawAction): void {
    // individual 模式：每个动作必然对应一个新图层，忽略已指定的图层
    if (this.mode === 'individual') {
      this.handleIndividualMode(action);
      return;
    }

    // grouped 模式：可以使用已指定的图层或默认图层
    // 如果动作已经指定了虚拟图层，直接使用
    if (action.virtualLayerId) {
      this.assignActionToLayer(action.id, action.virtualLayerId);
      return;
    }

    // 优化：自动将未分配的动作分配到默认图层
    const defaultLayer = this.getDefaultLayer();
    if (defaultLayer) {
      this.assignActionToLayer(action.id, defaultLayer.id);
      // 更新动作的图层属性
      // 📝 注意：锁定状态归属于虚拟图层，不需要在 action 中设置
      action.virtualLayerId = defaultLayer.id;
      action.layerName = defaultLayer.name;
      action.layerVisible = defaultLayer.visible;
      action.layerOpacity = defaultLayer.opacity;
      return;
    }

    // 否则使用分组模式的标准处理逻辑
    this.handleGroupedMode(action);
  }

  /**
   * 处理独立模式：为每个动作创建独立虚拟图层
   */
  private handleIndividualMode(action: DrawAction): void {
    // 创建虚拟图层
    const layer: VirtualLayer = {
      id: `layer_${action.id}`,
      name: `动作_${action.id.slice(0, 8)}`,
      visible: true,
      opacity: 1.0,
      locked: false,
      created: action.timestamp,
      modified: action.timestamp,
      actionIds: [action.id],
      actionIdsSet: new Set([action.id]),
      zIndex: this.nextZIndex++,
      cacheDirty: true,
      cacheWidth: this.canvasWidth,
      cacheHeight: this.canvasHeight
    };
    
    // 设置动作的图层属性
    // 📝 注意：锁定状态归属于虚拟图层，不需要在 action 中设置
    action.virtualLayerId = layer.id;
    action.layerName = layer.name;
    action.layerVisible = layer.visible;
    action.layerOpacity = layer.opacity;
    action.layerCreated = layer.created;
    action.layerModified = layer.modified;
    
    // 保存虚拟图层
    this.virtualLayers.set(layer.id, layer);
    this.actionLayerMap.set(action.id, layer.id);
    
    // 性能优化：限制最大图层数量
    if (this.virtualLayers.size > this.maxLayers) {
      this.mergeOldestLayers();
    }
    
    logger.debug(`独立模式：为动作 ${action.id} 创建独立图层 ${layer.id}`);
  }

  /**
   * 处理分组模式：将动作添加到现有虚拟图层或创建新图层
   */
  private handleGroupedMode(action: DrawAction): void {
    let targetLayer = this.getActiveVirtualLayer();
    
    // 如果没有活动图层或需要创建新图层，则创建
    if (!targetLayer || this.shouldCreateNewGroupedLayer(action)) {
      targetLayer = this.createGroupedLayer(action);
    }
    
    // 将动作添加到虚拟图层
    targetLayer.actionIds.push(action.id);
    targetLayer.actionIdsSet.add(action.id);
    targetLayer.modified = action.timestamp;
    
    // 设置动作的图层属性
    // 📝 注意：锁定状态归属于虚拟图层，不需要在 action 中设置
    action.virtualLayerId = targetLayer.id;
    action.layerName = targetLayer.name;
    action.layerVisible = targetLayer.visible;
    action.layerOpacity = targetLayer.opacity;
    action.layerCreated = targetLayer.created;
    action.layerModified = targetLayer.modified;
    
    // 更新映射关系
    this.actionLayerMap.set(action.id, targetLayer.id);
    
    logger.debug(`分组模式：将动作 ${action.id} 添加到图层 ${targetLayer.id}`);
  }

  /**
   * 判断是否需要创建新的分组图层
   */
  private shouldCreateNewGroupedLayer(action: DrawAction): boolean {
    const activeLayer = this.getActiveVirtualLayer();
    if (!activeLayer) return true;
    
    // 时间间隔超过阈值
    const timeDiff = action.timestamp - activeLayer.modified;
    if (timeDiff > this.timeThreshold) return true;
    
    // 工具类型变化
    if (this.createLayerOnToolChange) {
      const lastAction = this.getLastActionInLayer(activeLayer.id);
      if (lastAction && lastAction.type !== action.type) return true;
    }
    
    // 图层动作数量过多
    if (activeLayer.actionIds.length >= this.maxActionsPerLayer) return true;
    
    return false;
  }

  /**
   * 创建分组虚拟图层
   */
  private createGroupedLayer(action: DrawAction): VirtualLayer {
    const layerId = this.generateLayerId();
    const layerName = this.generateLayerName(action);
    
    const layer: VirtualLayer = {
      id: layerId,
      name: layerName,
      visible: true,
      opacity: 1.0,
      locked: false,
      created: action.timestamp,
      modified: action.timestamp,
      actionIds: [],
      actionIdsSet: new Set(),
      zIndex: this.nextZIndex++,
      cacheDirty: true,
      cacheWidth: this.canvasWidth,
      cacheHeight: this.canvasHeight
    };
    
    this.virtualLayers.set(layerId, layer);
    this.activeLayerId = layerId;
    
    return layer;
  }

  /**
   * 获取图层中最后一个动作
   */
  private getLastActionInLayer(layerId: string): DrawAction | null {
    const layer = this.getVirtualLayer(layerId);
    if (!layer || layer.actionIds.length === 0) return null;
    
    // 如果没有HistoryManager引用，返回null
    if (!this.historyManager) {
      logger.debug('VirtualLayerManager: HistoryManager未设置，无法获取动作数据');
      return null;
    }
    
    // 获取图层中最后一个动作ID
    const lastActionId = layer.actionIds[layer.actionIds.length - 1];
    
    // 从HistoryManager获取动作
    const action = this.historyManager.getActionById(lastActionId);
    if (action) {
      logger.debug('获取图层最后一个动作:', layerId, 'actionId:', lastActionId);
    } else {
      logger.debug('图层最后一个动作不存在:', layerId, 'actionId:', lastActionId);
    }
    
    return action || null;
  }

  /**
   * 生成图层名称
   */
  private generateLayerName(action: DrawAction): string {
    const toolNames: Record<string, string> = {
      'pen': '画笔',
      'line': '直线',
      'rect': '矩形',
      'circle': '圆形',
      'polygon': '多边形',
      'text': '文字',
      'select': '选择',
      'transform': '变换',
      'eraser': '橡皮擦'
    };
    
    const toolName = toolNames[action.type] || action.type;
    const timestamp = new Date(action.timestamp).toLocaleTimeString();
    return `${toolName}_${timestamp}`;
  }

  /**
   * 合并最旧的图层（性能优化）
   * 注意：individual模式下不合并图层，而是删除最旧的图层
   */
  private mergeOldestLayers(): void {
    const layers = Array.from(this.virtualLayers.values())
      .sort((a, b) => a.created - b.created);
    
    if (layers.length <= 1) return;
    
    // individual模式：删除最旧的图层（保持一个图层一个action的规则）
    if (this.mode === 'individual') {
      const oldestLayer = layers[0];
      // 删除图层及其action映射
      oldestLayer.actionIds.forEach(actionId => {
        this.actionLayerMap.delete(actionId);
      });
      this.virtualLayers.delete(oldestLayer.id);
      logger.debug(`独立模式：删除最旧图层 ${oldestLayer.name}（保持一个图层一个action规则）`);
      return;
    }
    
    // grouped模式：合并前两个最旧的图层
    const oldestLayer = layers[0];
    const secondOldestLayer = layers[1];
    
    // 将第二个图层的动作移动到第一个图层
    secondOldestLayer.actionIds.forEach(actionId => {
      this.actionLayerMap.set(actionId, oldestLayer.id);
      oldestLayer.actionIds.push(actionId);
      oldestLayer.actionIdsSet.add(actionId);
    });
    
    // 删除第二个图层
    this.virtualLayers.delete(secondOldestLayer.id);
    
    // 更新第一个图层的修改时间
    oldestLayer.modified = Date.now();
    
    logger.debug(`分组模式：合并图层 ${secondOldestLayer.name} -> ${oldestLayer.name}`);
  }

  /**
   * 更新动作的虚拟图层属性
   */
  public updateActionLayerProperties(action: DrawAction): void {
    if (!action.virtualLayerId) return;

    const layer = this.getVirtualLayer(action.virtualLayerId);
    if (layer) {
      // 📝 注意：锁定状态归属于虚拟图层，不需要在 action 中设置
      action.layerName = layer.name;
      action.layerVisible = layer.visible;
      action.layerOpacity = layer.opacity;
      action.layerModified = Date.now();
    }
  }

  /**
   * 获取虚拟图层统计信息
   */
  public getVirtualLayerStats(): {
    totalLayers: number;
    visibleLayers: number;
    lockedLayers: number;
    totalActions: number;
  } {
    const now = Date.now();
    
    if (this.statsCache && (now - this.statsCache.lastUpdate) < 2000) {
      return {
        totalLayers: this.statsCache.totalLayers,
        visibleLayers: this.statsCache.visibleLayers,
        lockedLayers: this.statsCache.lockedLayers,
        totalActions: this.statsCache.totalActions
      };
    }

    // 重新计算统计信息
    let totalActions = 0;
    let visibleLayers = 0;
    let lockedLayers = 0;
    
    for (const layer of this.virtualLayers.values()) {
      totalActions += layer.actionIds.length;
      if (layer.visible) visibleLayers++;
      if (layer.locked) lockedLayers++;
    }

    // 更新缓存
    this.statsCache = {
      totalLayers: this.virtualLayers.size,
      visibleLayers,
      lockedLayers,
      totalActions,
      lastUpdate: now
    };

    return {
      totalLayers: this.statsCache.totalLayers,
      visibleLayers: this.statsCache.visibleLayers,
      lockedLayers: this.statsCache.lockedLayers,
      totalActions: this.statsCache.totalActions
    };
  }

  /**
   * 获取所有可见动作ID
   */
  public getVisibleActionIds(): string[] {
    const now = Date.now();
    
    if (this.visibleActionIdsCache && (now - this.visibleActionIdsCacheTime) < 2000) {
      return [...this.visibleActionIdsCache];
    }

    const visibleActionIds: string[] = [];
    
    for (const layer of this.virtualLayers.values()) {
      if (layer.visible) {
        visibleActionIds.push(...layer.actionIds);
      }
    }
    
    // 更新缓存
    this.visibleActionIdsCache = visibleActionIds;
    this.visibleActionIdsCacheTime = now;
    
    return [...visibleActionIds];
  }

  /**
   * 失效缓存
   */
  private invalidateCache(): void {
    this.statsCache = null;
    this.visibleActionIdsCache = null;
  }

  /**
   * 获取默认图层
   * 改进：优先查找名为"默认图层"的图层，否则返回 zIndex 最小的图层
   * 这比依赖 Map 插入顺序更可靠
   */
  private getDefaultLayer(): VirtualLayer | null {
    // 首先查找名为"默认图层"的图层
    for (const layer of this.virtualLayers.values()) {
      if (layer.name === '默认图层') {
        return layer;
      }
    }
    
    // 如果没有找到默认图层，返回 zIndex 最小的图层（最底层）
    // 这是按照图层层级关系获取的合理默认值
    const allLayers = this.getAllVirtualLayers(); // 已按 zIndex 排序
    if (allLayers.length > 0) {
      return allLayers[0];
    }
    
    // 最后的回退：返回 Map 中的第一个值
    return this.virtualLayers.values().next().value || null;
  }

  /**
   * 生成虚拟图层ID
   */
  private generateLayerId(): string {
    return `vlayer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 获取当前虚拟图层模式
   */
  public getMode(): VirtualLayerMode {
    return this.mode;
  }

  /**
   * 设置虚拟图层模式
   */
  public setMode(mode: VirtualLayerMode): void {
    if (this.mode === mode) return;
    
    logger.info(`切换虚拟图层模式: ${this.mode} -> ${mode}`);
    
    // 先切换模式，再转换图层结构（这样转换过程中的方法调用能正确检查模式）
    const oldMode = this.mode;
    this.mode = mode;
    
    try {
      if (mode === 'individual') {
        this.convertToIndividualMode();
      } else {
        this.convertToGroupedMode();
      }
    } catch (error) {
      // 如果转换失败，恢复原模式
      this.mode = oldMode;
      logger.error('切换虚拟图层模式失败，已恢复原模式:', error);
      throw error;
    }
    
    this.invalidateCache();
  }

  /**
   * 转换为独立模式：将分组图层拆分为独立图层
   */
  private convertToIndividualMode(): void {
    // 获取所有动作ID
    const allActionIds = Array.from(this.actionLayerMap.keys());
    
    // 清空现有虚拟图层和缓存
    this.clearAllLayerCaches();
    this.virtualLayers.clear();
    this.actionLayerMap.clear();
    
    // 为每个动作创建独立虚拟图层
    for (const actionId of allActionIds) {
      // 这里需要从外部获取动作数据来创建图层
      // 实际实现中需要从HistoryManager获取DrawAction
      const layer: VirtualLayer = {
        id: `layer_${actionId}`,
        name: `动作_${actionId.slice(0, 8)}`,
        visible: true,
        opacity: 1.0,
        locked: false,
        created: Date.now(),
        modified: Date.now(),
        actionIds: [actionId],
        actionIdsSet: new Set([actionId]),
        zIndex: this.nextZIndex++,
        cacheDirty: true,
        cacheWidth: this.canvasWidth,
        cacheHeight: this.canvasHeight
      };
      
      this.virtualLayers.set(layer.id, layer);
      this.actionLayerMap.set(actionId, layer.id);
    }
    
    // 设置第一个图层为活动图层
    const firstLayer = this.virtualLayers.values().next().value;
    if (firstLayer) {
      this.activeLayerId = firstLayer.id;
    }
    
    logger.info(`已转换为独立模式，创建了 ${this.virtualLayers.size} 个独立图层`);
  }

  /**
   * 转换为分组模式：将独立图层合并为分组图层
   */
  private convertToGroupedMode(): void {
    // 获取所有动作ID
    const allActionIds = Array.from(this.actionLayerMap.keys());
    
    // 清空现有虚拟图层
    this.virtualLayers.clear();
    this.actionLayerMap.clear();
    
    // 创建默认图层
    const defaultLayer = this.createVirtualLayer('默认图层');
    this.activeLayerId = defaultLayer.id;
    
    // 将所有动作分配到默认图层
    for (const actionId of allActionIds) {
      this.assignActionToLayer(actionId, defaultLayer.id);
    }
    
    logger.info(`已转换为分组模式，所有动作分配到默认图层`);
  }

  /**
   * 获取虚拟图层配置
   */
  public getConfig(): VirtualLayerConfig {
    return {
      mode: this.mode,
      maxLayers: this.maxLayers,
      defaultLayerName: this.defaultLayerName,
      maxActionsPerLayer: this.maxActionsPerLayer,
      timeThreshold: this.timeThreshold,
      createLayerOnToolChange: this.createLayerOnToolChange
    };
  }

  /**
   * 更新虚拟图层配置
   */
  public updateConfig(config: Partial<VirtualLayerConfig>): void {
    if (config.mode !== undefined) {
      this.setMode(config.mode);
    }
    if (config.maxLayers !== undefined) {
      this.maxLayers = config.maxLayers;
    }
    if (config.defaultLayerName !== undefined) {
      this.defaultLayerName = config.defaultLayerName;
    }
    if (config.maxActionsPerLayer !== undefined) {
      this.maxActionsPerLayer = config.maxActionsPerLayer;
    }
    if (config.timeThreshold !== undefined) {
      this.timeThreshold = config.timeThreshold;
    }
    if (config.createLayerOnToolChange !== undefined) {
      this.createLayerOnToolChange = config.createLayerOnToolChange;
    }
    
    logger.info('虚拟图层配置已更新');
  }

  // ============================================
  // 缓存管理方法
  // ============================================

  /**
   * 设置Canvas尺寸（用于创建缓存Canvas）
   */
  public setCanvasSize(width: number, height: number): void {
    if (this.canvasWidth === width && this.canvasHeight === height) {
      return; // 尺寸未变化，无需更新
    }

    this.canvasWidth = width;
    this.canvasHeight = height;

    // 更新所有图层的缓存尺寸并标记为过期
    for (const layer of this.virtualLayers.values()) {
      layer.cacheWidth = width;
      layer.cacheHeight = height;
      layer.cacheDirty = true;
      
      // 如果缓存Canvas存在但尺寸不匹配，清理它
      if (layer.cacheCanvas && 
          (layer.cacheCanvas.width !== width || layer.cacheCanvas.height !== height)) {
        this.clearLayerCache(layer.id);
      }
    }

    logger.debug('Canvas尺寸已更新:', { width, height });
  }

  /**
   * 创建或更新图层缓存Canvas
   */
  public createLayerCache(layerId: string, width: number, height: number): HTMLCanvasElement | null {
    const layer = this.getVirtualLayer(layerId);
    if (!layer) return null;

    // 如果缓存Canvas已存在且尺寸匹配，直接返回
    if (layer.cacheCanvas && 
        layer.cacheCanvas.width === width && 
        layer.cacheCanvas.height === height &&
        !layer.cacheDirty) {
      return layer.cacheCanvas;
    }

    // 创建新的离屏Canvas
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      logger.error('无法创建图层缓存Canvas的上下文');
      return null;
    }

    // 保存缓存
    layer.cacheCanvas = canvas;
    layer.cacheCtx = ctx;
    layer.cacheWidth = width;
    layer.cacheHeight = height;
    layer.cacheDirty = true; // 标记为需要渲染

    logger.debug('创建图层缓存Canvas:', layer.name, { width, height });
    return canvas;
  }

  /**
   * 获取图层缓存Canvas（如果不存在则创建）
   */
  public getLayerCache(layerId: string): HTMLCanvasElement | null {
    const layer = this.getVirtualLayer(layerId);
    if (!layer) return null;

    if (!layer.cacheCanvas || layer.cacheDirty) {
      // 如果缓存不存在或已过期，创建新的
      return this.createLayerCache(layerId, layer.cacheWidth || this.canvasWidth, layer.cacheHeight || this.canvasHeight);
    }

    return layer.cacheCanvas;
  }

  /**
   * 标记图层缓存为过期（需要重新渲染）
   */
  public markLayerCacheDirty(layerId: string): void {
    const layer = this.getVirtualLayer(layerId);
    if (layer) {
      layer.cacheDirty = true;
    this.invalidateCache();
    }
  }

  /**
   * 标记所有图层缓存为过期（用于 undo/redo 等全局操作）
   */
  public markAllLayersCacheDirty(): void {
    for (const layer of this.virtualLayers.values()) {
      layer.cacheDirty = true;
    }
    this.invalidateCache();
    logger.debug('所有图层缓存已标记为过期');
  }

  /**
   * 标记图层缓存为有效（已渲染完成）
   */
  public markLayerCacheValid(layerId: string): void {
    const layer = this.getVirtualLayer(layerId);
    if (layer) {
      layer.cacheDirty = false;
    }
  }

  /**
   * 清理图层缓存
   */
  public clearLayerCache(layerId: string): void {
    const layer = this.getVirtualLayer(layerId);
    if (layer) {
      if (layer.cacheCanvas) {
        // 清理Canvas内容
        const ctx = layer.cacheCtx;
        if (ctx) {
          ctx.clearRect(0, 0, layer.cacheCanvas.width, layer.cacheCanvas.height);
        }
      }
      layer.cacheDirty = true;
      logger.debug('清理图层缓存:', layer.name);
    }
  }

  /**
   * 清理所有图层缓存
   */
  public clearAllLayerCaches(): void {
    for (const layer of this.virtualLayers.values()) {
      this.clearLayerCache(layer.id);
    }
    logger.debug('清理所有图层缓存');
  }

  // ============================================
  // 图层复制方法
  // ============================================

  /**
   * 复制图层及其 action（individual 模式专用）
   * 
   * zIndex 处理策略（参考 Figma/Sketch 的实现）：
   * - 新图层 zIndex = 源图层 zIndex + 1
   * - 如果存在冲突（已有图层占用该 zIndex），将所有 >= 新 zIndex 的图层 zIndex 加 1
   * 
   * @param sourceLayerId - 源图层 ID
   * @param sourceAction - 源 action
   * @returns 新的图层和 action，如果失败返回 null
   */
  public duplicateLayerWithAction(
    sourceLayerId: string,
    sourceAction: DrawAction
  ): { layer: VirtualLayer; action: DrawAction } | null {
    const sourceLayer = this.getVirtualLayer(sourceLayerId);
    if (!sourceLayer) {
      logger.warn('复制失败：源图层不存在', sourceLayerId);
      return null;
    }

    // 检查图层数量限制
    if (this.virtualLayers.size >= this.maxLayers) {
      logger.warn('复制失败：已达到最大图层数量限制', this.maxLayers);
      return null;
    }

    // 计算新图层的 zIndex
    const newZIndex = sourceLayer.zIndex + 1;

    // 检查是否存在 zIndex 冲突，如果有则将所有 >= newZIndex 的图层 zIndex 加 1
    const conflictingLayers = Array.from(this.virtualLayers.values())
      .filter(layer => layer.zIndex >= newZIndex)
      .sort((a, b) => b.zIndex - a.zIndex); // 从大到小排序，避免覆盖

    if (conflictingLayers.length > 0) {
      logger.debug('复制图层：检测到 zIndex 冲突，调整其他图层', {
        newZIndex,
        conflictingCount: conflictingLayers.length
      });

      // 从大到小调整，避免冲突
      for (const layer of conflictingLayers) {
        const oldZIndex = layer.zIndex;
        layer.zIndex++;
        
        // 更新 nextZIndex 以确保后续创建的图层不会冲突
        if (layer.zIndex >= this.nextZIndex) {
          this.nextZIndex = layer.zIndex + 1;
        }
        
        // 如果是活动图层，更新动态图层
        if (this.activeLayerId === layer.id && this.canvasEngine) {
          this.updateDynamicLayerForLayer(layer, oldZIndex);
        }
      }
    }

    // 深拷贝 action 并生成新 ID
    const newActionId = `action-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const newAction: DrawAction = {
      ...sourceAction,
      id: newActionId,
      points: sourceAction.points.map(p => ({ ...p })), // 深拷贝点
      context: { ...sourceAction.context }, // 深拷贝上下文
      timestamp: Date.now(),
      virtualLayerId: undefined, // 稍后设置
      // 清除状态相关属性（新图形需要重新计算）
      selected: false,
      selectedActions: undefined,
      preRenderedCache: undefined,
      complexityScore: undefined, // 重新计算
      supportsCaching: undefined  // 重新计算
    };

    // 偏移复制的图形（避免完全重叠）
    const offset = 20;
    newAction.points = newAction.points.map(p => ({
      x: p.x + offset,
      y: p.y + offset
    }));

    // 创建新图层
    const layerId = this.generateLayerId();
    const now = Date.now();

    const newLayer: VirtualLayer = {
      id: layerId,
      name: `${sourceLayer.name} 副本`,
      visible: sourceLayer.visible,
      opacity: sourceLayer.opacity,
      locked: false, // 复制的图层默认不锁定
      created: now,
      modified: now,
      actionIds: [newActionId],
      actionIdsSet: new Set([newActionId]),
      zIndex: newZIndex,
      cacheDirty: true,
      cacheWidth: this.canvasWidth,
      cacheHeight: this.canvasHeight
    };

    // 更新 action 的 virtualLayerId
    newAction.virtualLayerId = layerId;

    // 注册图层和映射
    this.virtualLayers.set(layerId, newLayer);
    this.actionLayerMap.set(newActionId, layerId);

    // 更新 nextZIndex
    if (newZIndex >= this.nextZIndex) {
      this.nextZIndex = newZIndex + 1;
    }

    // 标记缓存过期
    this.invalidateCache();

    logger.debug('复制图层成功', {
      sourceLayerId,
      newLayerId: layerId,
      newActionId,
      newZIndex,
      offset
    });

    return { layer: newLayer, action: newAction };
  }

  // ============================================
  // 图层顺序管理方法
  // ============================================

  /**
   * 调整图层顺序（移动到指定位置）
   * @param layerId - 要移动的图层ID
   * @param newIndex - 新的位置索引（0为最底层）
   * @returns 是否成功
   */
  public reorderLayer(layerId: string, newIndex: number): boolean {
    const layer = this.getVirtualLayer(layerId);
    if (!layer) {
      logger.warn('图层不存在:', layerId);
      return false;
    }

    const allLayers = this.getAllVirtualLayers();
    if (newIndex < 0 || newIndex >= allLayers.length) {
      logger.warn('无效的图层索引:', newIndex);
      return false;
    }

    // 获取目标位置的zIndex
    const targetLayer = allLayers[newIndex];
    if (!targetLayer) return false;

    // 如果目标位置就是当前位置，无需移动
    if (targetLayer.id === layerId) {
      return true;
    }

    // 保存旧的动态图层信息（如果该图层是活动图层）
    const wasActive = this.activeLayerId === layerId;
    const oldZIndex = layer.zIndex;
    const oldDynamicLayerId = wasActive ? `selection-${oldZIndex}` : null;

    // 重新分配zIndex
    // 策略：将目标位置及其之后的所有图层zIndex+1，然后将当前图层设置为目标zIndex
    const targetZIndex = targetLayer.zIndex;
    
    // 如果向上移动（newIndex < currentIndex）
    const currentIndex = allLayers.findIndex(l => l.id === layerId);
    if (currentIndex < 0) return false;

    if (newIndex < currentIndex) {
      // 向上移动：将目标位置到当前位置之间的图层zIndex+1
      for (let i = newIndex; i < currentIndex; i++) {
        const affectedLayer = allLayers[i];
        const oldZIndex = affectedLayer.zIndex;
        affectedLayer.zIndex++;
        // 如果受影响图层是活动图层，更新动态图层
        if (this.activeLayerId === affectedLayer.id && this.canvasEngine) {
          this.updateDynamicLayerForLayer(affectedLayer, oldZIndex);
        }
      }
      layer.zIndex = targetZIndex;
    } else {
      // 向下移动：将当前位置到目标位置之间的图层zIndex-1
      for (let i = currentIndex + 1; i <= newIndex; i++) {
        const affectedLayer = allLayers[i];
        const oldZIndex = affectedLayer.zIndex;
        affectedLayer.zIndex--;
        // 如果受影响图层是活动图层，更新动态图层
        if (this.activeLayerId === affectedLayer.id && this.canvasEngine) {
          this.updateDynamicLayerForLayer(affectedLayer, oldZIndex);
        }
      }
      layer.zIndex = targetZIndex;
    }

    // 如果移动的图层是活动图层，更新动态图层和draw层拆分
    if (wasActive && this.canvasEngine && oldDynamicLayerId) {
      // 删除旧的动态图层
      this.canvasEngine.removeDynamicLayer(oldDynamicLayerId);
      // 创建新的动态图层
      const newZIndex = CanvasEngine.calculateDynamicLayerZIndex(layer.zIndex);
      const newDynamicLayerId = `selection-${layer.zIndex}`;
      this.canvasEngine.createDynamicLayer(newDynamicLayerId, newZIndex);
      logger.debug('更新活动图层的动态图层zIndex:', layer.name, 'newZIndex:', layer.zIndex);
      
      // 重新拆分draw层（因为选中图层的位置变化了）
      const allLayers = this.getAllVirtualLayers();
      const allLayerZIndices = allLayers.map(l => l.zIndex);
      try {
        this.canvasEngine.splitDrawLayer(layer.zIndex, allLayerZIndices);
        logger.debug('重新拆分draw层:', layer.name, 'newZIndex:', layer.zIndex);
      } catch (error) {
        logger.error('重新拆分draw层失败:', error);
        // 如果拆分失败，合并draw层以确保状态一致
        this.canvasEngine.mergeDrawLayers();
      }
    }

    // 标记缓存过期（因为顺序变化需要重绘）
    this.markLayerCacheDirty(layerId);
    this.invalidateCache();

    logger.debug('图层顺序已调整:', layer.name, `位置: ${newIndex}`);
    return true;
  }
  
  /**
   * 将图层移动到最顶层
   * @param layerId - 要移动的图层ID
   * @returns 是否成功
   */
  public moveLayerToTop(layerId: string): boolean {
    const allLayers = this.getAllVirtualLayers();
    if (allLayers.length === 0) return false;
    
    const currentIndex = allLayers.findIndex(l => l.id === layerId);
    if (currentIndex < 0) {
      logger.warn('moveLayerToTop: 图层不存在:', layerId);
      return false;
    }
    
    // 最顶层是数组的最后一个位置
    const topIndex = allLayers.length - 1;
    if (currentIndex === topIndex) {
      logger.debug('图层已在顶层，无需移动:', layerId);
      return true;
    }
    
    logger.info('移动图层到顶层:', layerId);
    return this.reorderLayer(layerId, topIndex);
  }
  
  /**
   * 将图层移动到最底层
   * @param layerId - 要移动的图层ID
   * @returns 是否成功
   */
  public moveLayerToBottom(layerId: string): boolean {
    const allLayers = this.getAllVirtualLayers();
    if (allLayers.length === 0) return false;
    
    const currentIndex = allLayers.findIndex(l => l.id === layerId);
    if (currentIndex < 0) {
      logger.warn('moveLayerToBottom: 图层不存在:', layerId);
      return false;
    }
    
    // 最底层是数组的第一个位置
    if (currentIndex === 0) {
      logger.debug('图层已在底层，无需移动:', layerId);
      return true;
    }
    
    logger.info('移动图层到底层:', layerId);
    return this.reorderLayer(layerId, 0);
  }

  /**
   * 更新图层的动态图层（用于图层顺序变化时）
   * 注意：此方法在zIndex已经更新后调用，所以需要传入旧的zIndex
   */
  private updateDynamicLayerForLayer(layer: VirtualLayer, oldZIndex: number): void {
    if (!this.canvasEngine) return;
    
    const oldDynamicLayerId = `selection-${oldZIndex}`;
    const newZIndex = CanvasEngine.calculateDynamicLayerZIndex(layer.zIndex);
    const newDynamicLayerId = `selection-${layer.zIndex}`;
    
    // 删除旧的动态图层
    this.canvasEngine.removeDynamicLayer(oldDynamicLayerId);
    
    // 创建新的动态图层
    this.canvasEngine.createDynamicLayer(newDynamicLayerId, newZIndex);
    
    logger.debug('更新图层的动态图层:', layer.name, 'oldZIndex:', oldZIndex, 'newZIndex:', layer.zIndex);
  }


  /**
   * 将图层上移一层
   */
  public moveLayerUp(layerId: string): boolean {
    const allLayers = this.getAllVirtualLayers();
    const currentIndex = allLayers.findIndex(l => l.id === layerId);
    if (currentIndex < 0 || currentIndex >= allLayers.length - 1) {
      return false; // 已经在最上层
    }
    return this.reorderLayer(layerId, currentIndex + 1);
  }

  /**
   * 将图层下移一层
   */
  public moveLayerDown(layerId: string): boolean {
    const allLayers = this.getAllVirtualLayers();
    const currentIndex = allLayers.findIndex(l => l.id === layerId);
    if (currentIndex <= 0) {
      return false; // 已经在最下层
    }
    return this.reorderLayer(layerId, currentIndex - 1);
  }

  // ============================================
  // 状态验证方法（用于调试和错误检测）
  // ============================================

  /**
   * 验证虚拟图层管理器的内部状态一致性
   * 用于调试和发现潜在的状态不一致问题
   * @returns 验证结果，包含是否有效和错误列表
   */
  public validateState(): { isValid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. 检查 actionLayerMap 与图层的一致性
    for (const [actionId, layerId] of this.actionLayerMap) {
      const layer = this.virtualLayers.get(layerId);
      if (!layer) {
        errors.push(`Action "${actionId}" 引用了不存在的图层 "${layerId}"`);
        continue;
      }
      if (!layer.actionIdsSet.has(actionId)) {
        errors.push(`Action "${actionId}" 在 actionLayerMap 中映射到图层 "${layerId}"，但不在该图层的 actionIdsSet 中`);
      }
    }

    // 2. 检查每个图层的 actionIds 与 actionIdsSet 一致性
    for (const layer of this.virtualLayers.values()) {
      // 检查数组和 Set 的大小是否一致
      if (layer.actionIds.length !== layer.actionIdsSet.size) {
        errors.push(`图层 "${layer.name}" (${layer.id}) 的 actionIds (${layer.actionIds.length}个) 与 actionIdsSet (${layer.actionIdsSet.size}个) 数量不一致`);
      }

      // 检查数组中的每个 ID 是否都在 Set 中
      for (const actionId of layer.actionIds) {
        if (!layer.actionIdsSet.has(actionId)) {
          errors.push(`图层 "${layer.name}" 的 actionIds 包含 "${actionId}"，但 actionIdsSet 中不存在`);
        }
      }

      // 检查 Set 中的每个 ID 是否都在 actionLayerMap 中映射到此图层
      for (const actionId of layer.actionIdsSet) {
        const mappedLayerId = this.actionLayerMap.get(actionId);
        if (mappedLayerId !== layer.id) {
          warnings.push(`图层 "${layer.name}" 的 actionIdsSet 包含 "${actionId}"，但 actionLayerMap 将其映射到 "${mappedLayerId || 'undefined'}"`);
        }
      }
    }

    // 3. 检查活动图层是否存在
    if (this.activeLayerId) {
      const activeLayer = this.virtualLayers.get(this.activeLayerId);
      if (!activeLayer) {
        errors.push(`活动图层 ID "${this.activeLayerId}" 对应的图层不存在`);
      } else if (activeLayer.locked) {
        warnings.push(`活动图层 "${activeLayer.name}" 处于锁定状态`);
      }
    }

    // 4. 检查 zIndex 唯一性
    const zIndexMap = new Map<number, string[]>();
    for (const layer of this.virtualLayers.values()) {
      const existing = zIndexMap.get(layer.zIndex) || [];
      existing.push(layer.id);
      zIndexMap.set(layer.zIndex, existing);
    }
    for (const [zIndex, layerIds] of zIndexMap) {
      if (layerIds.length > 1) {
        errors.push(`多个图层共享相同的 zIndex (${zIndex}): ${layerIds.join(', ')}`);
      }
    }

    // 5. 检查缓存状态
    const totalActionsInLayers = Array.from(this.virtualLayers.values())
      .reduce((sum, layer) => sum + layer.actionIds.length, 0);
    if (totalActionsInLayers !== this.actionLayerMap.size) {
      warnings.push(`图层中的总 action 数量 (${totalActionsInLayers}) 与 actionLayerMap 大小 (${this.actionLayerMap.size}) 不一致`);
    }

    // 6. individual 模式检查：每个图层应该只有一个 action
    if (this.mode === 'individual') {
      for (const layer of this.virtualLayers.values()) {
        if (layer.actionIds.length > 1) {
          warnings.push(`individual 模式下，图层 "${layer.name}" 包含 ${layer.actionIds.length} 个 actions（应该只有1个）`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 打印状态验证报告到控制台（便于调试）
   * 
   * 注意：此方法故意使用 console.group/log 而非 logger，
   * 因为它专门用于在开发者工具中提供格式化的分组输出。
   * 在生产环境中，应使用 validateState() 方法获取结果。
   */
  public printValidationReport(): void {
    const result = this.validateState();
    
    // 同时使用 logger 记录，方便在日志系统中追踪
    logger.info('VirtualLayerManager 状态验证', {
      isValid: result.isValid,
      errorCount: result.errors.length,
      warningCount: result.warnings.length
    });
    
    // 使用 logger 输出调试信息
    logger.debug('🔍 VirtualLayerManager 状态验证报告', {
      status: result.isValid ? '✅ 有效' : '❌ 无效',
      layerCount: this.virtualLayers.size,
      actionMapCount: this.actionLayerMap.size,
      currentMode: this.mode,
      activeLayer: this.activeLayerId || '无'
    });
    
    if (result.errors.length > 0) {
      result.errors.forEach(err => logger.error('VirtualLayerManager 错误:', err));
    }
    
    if (result.warnings.length > 0) {
      result.warnings.forEach(warn => logger.warn('VirtualLayerManager 警告:', warn));
    }
  }

  /**
   * 自动修复常见的状态不一致问题
   * 注意：此方法可能会导致数据丢失，谨慎使用
   * @returns 修复的问题数量
   */
  public autoRepairState(): number {
    let repairCount = 0;
    
    // 1. 修复 actionLayerMap 中引用不存在图层的映射
    const invalidMappings: string[] = [];
    for (const [actionId, layerId] of this.actionLayerMap) {
      if (!this.virtualLayers.has(layerId)) {
        invalidMappings.push(actionId);
      }
    }
    for (const actionId of invalidMappings) {
      this.actionLayerMap.delete(actionId);
      repairCount++;
      logger.warn(`autoRepairState: 删除了无效的 action 映射 "${actionId}"`);
    }

    // 2. 修复 actionIds 和 actionIdsSet 不一致的问题
    for (const layer of this.virtualLayers.values()) {
      // 以 actionIds 数组为准，重建 actionIdsSet
      if (layer.actionIds.length !== layer.actionIdsSet.size) {
        layer.actionIdsSet = new Set(layer.actionIds);
        repairCount++;
        logger.warn(`autoRepairState: 重建了图层 "${layer.name}" 的 actionIdsSet`);
      }
    }

    // 3. 如果活动图层不存在，设置为默认图层
    if (this.activeLayerId && !this.virtualLayers.has(this.activeLayerId)) {
      const defaultLayer = this.getDefaultLayer();
      if (defaultLayer) {
        this.activeLayerId = defaultLayer.id;
        repairCount++;
        logger.warn(`autoRepairState: 活动图层不存在，已切换到默认图层 "${defaultLayer.name}"`);
      }
    }

    if (repairCount > 0) {
      this.invalidateCache();
      logger.info(`autoRepairState: 共修复了 ${repairCount} 个问题`);
    }

    return repairCount;
  }
} 