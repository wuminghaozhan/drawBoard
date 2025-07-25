import type { DrawAction } from '../tools/DrawTool';
import { logger } from '../utils/Logger';

/**
 * 虚拟图层接口
 * 定义了一个虚拟图层的属性
 */
export interface VirtualLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  locked: boolean;
  created: number;
  modified: number;
  actionIds: string[]; // 属于该虚拟图层的动作ID列表
  actionIdsSet: Set<string>; // 优化：使用Set进行快速查找
}

/**
 * 虚拟图层管理器配置
 */
export interface VirtualLayerConfig {
  maxLayers?: number;
  defaultLayerName?: string;
  autoCreateLayer?: boolean;
  /** 每个图层最大动作数，默认为1000 */
  maxActionsPerLayer?: number;
  /** 清理间隔，默认为100次操作 */
  cleanupInterval?: number;
  /** 缓存过期时间，默认为2000ms */
  cacheExpirationTime?: number;
  /** 是否启用异步清理，默认为true */
  enableAsyncCleanup?: boolean;
}

/**
 * 虚拟图层管理器
 * 
 * 功能特性：
 * - 将每个 DrawAction 视为虚拟图层
 * - 支持动作分组到虚拟图层
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
 * - 智能缓存策略，根据内存压力调整
 * - 异步清理机制，避免阻塞主线程
 * - 批量操作优化
 */
export class VirtualLayerManager {
  private virtualLayers: Map<string, VirtualLayer> = new Map();
  private actionLayerMap: Map<string, string> = new Map(); // actionId -> layerId
  private activeLayerId: string = '';
  private maxLayers: number = 50;
  private defaultLayerName: string = '虚拟图层';
  private autoCreateLayer: boolean = true; // 是否自动创建图层
  
  // 性能优化：缓存统计信息
  private statsCache: {
    totalLayers: number;
    visibleLayers: number;
    lockedLayers: number;
    totalActions: number;
    lastUpdate: number;
  } | null = null;
  
  // 性能优化：缓存可见动作ID
  private visibleActionIdsCache: string[] | null = null;
  private visibleActionIdsCacheTime: number = 0;
  
  // 清理配置
  private maxActionsPerLayer: number = 1000; // 每个图层最大动作数
  private cleanupInterval: number = 100; // 每100次操作清理一次
  private operationCount: number = 0;
  private cacheExpirationTime: number = 2000; // 缓存过期时间
  private enableAsyncCleanup: boolean = true; // 是否启用异步清理
  
  // 性能优化：批量操作支持
  private pendingOperations: Array<() => void> = [];
  private batchMode: boolean = false;
  private batchTimeoutId: number | null = null;

  constructor(config: VirtualLayerConfig = {}) {
    this.maxLayers = config.maxLayers || 50; // 最大图层数
    this.defaultLayerName = config.defaultLayerName || '虚拟图层'; // 默认图层名称
    this.autoCreateLayer = config.autoCreateLayer !== false; // 是否自动创建图层
    this.maxActionsPerLayer = config.maxActionsPerLayer || 1000; // 每个图层最大动作数
    this.cleanupInterval = config.cleanupInterval || 100; // 每100次操作清理一次
    this.cacheExpirationTime = config.cacheExpirationTime || 2000; // 缓存过期时间
    this.enableAsyncCleanup = config.enableAsyncCleanup !== false; // 是否启用异步清理
    
    // 创建默认虚拟图层
    this.createDefaultLayer();
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
      actionIdsSet: new Set<string>() // 优化：使用Set进行快速查找
    };

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

    // 将该图层的动作移动到默认图层
    const defaultLayer = this.getDefaultLayer();
    // TODO：不理解为什么要放到默认图层，难道是怕删除图层后，动作找不到归属？
    if (defaultLayer && layer.actionIds.length > 0) {
      // 优化：批量操作
      this.batchOperation(() => {
        layer.actionIds.forEach(actionId => {
          this.actionLayerMap.set(actionId, defaultLayer.id);
          defaultLayer.actionIds.push(actionId);
          defaultLayer.actionIdsSet.add(actionId); // 同步更新Set
        });
        defaultLayer.modified = Date.now();
      });
    }

    // 删除图层
    this.virtualLayers.delete(layerId);

    // 如果删除的是当前激活图层，切换到默认图层
    if (this.activeLayerId === layerId) {
      this.activeLayerId = defaultLayer?.id || '';
    }

    logger.debug('删除虚拟图层:', layer.name);
    return true;
  }

  /**
   * 设置活动虚拟图层
   */
  public setActiveVirtualLayer(layerId: string): boolean {
    const layer = this.getVirtualLayer(layerId);
    if (!layer) {
      logger.warn('虚拟图层不存在:', layerId);
      return false;
    }

    if (layer.locked) {
      logger.warn('虚拟图层已锁定，无法激活:', layer.name);
      return false;
    }

    this.activeLayerId = layerId;
    logger.debug('切换到虚拟图层:', layer.name);
    return true;
  }

  /**
   * 获取活动虚拟图层
   */
  public getActiveVirtualLayer(): VirtualLayer | null {
    return this.getVirtualLayer(this.activeLayerId);
  }

  /**
   * 获取指定虚拟图层
   */
  public getVirtualLayer(layerId: string): VirtualLayer | null {
    return this.virtualLayers.get(layerId) || null;
  }

  /**
   * 获取所有虚拟图层
   */
  public getAllVirtualLayers(): VirtualLayer[] {
    return Array.from(this.virtualLayers.values());
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
    this.invalidateCache(); // 失效缓存
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
    this.invalidateCache(); // 失效缓存
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
    this.invalidateCache(); // 失效缓存
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
    this.invalidateCache(); // 失效缓存
    logger.debug('重命名虚拟图层:', oldName, '->', layer.name);
    return true;
  }

  /**
   * 将动作分配到虚拟图层（优化版本）
   */
  public assignActionToLayer(actionId: string, layerId: string): boolean {
    const layer = this.getVirtualLayer(layerId);
    if (!layer || layer.locked) {
      logger.warn('无法分配动作：虚拟图层不存在或已锁定');
      return false;
    }

    // 优化：使用Set进行O(1)查找
    const oldLayerId = this.actionLayerMap.get(actionId);
    if (oldLayerId) {
      const oldLayer = this.getVirtualLayer(oldLayerId);
      if (oldLayer) {
        // 优化：使用Set进行快速删除
        if (oldLayer.actionIdsSet.has(actionId)) {
          const index = oldLayer.actionIds.indexOf(actionId);
          if (index > -1) {
            oldLayer.actionIds.splice(index, 1);
            oldLayer.actionIdsSet.delete(actionId); // 同步更新Set
            oldLayer.modified = Date.now();
          }
        }
      }
    }

    // 添加到新图层
    this.actionLayerMap.set(actionId, layerId);
    // 优化：使用Set进行快速检查
    if (!layer.actionIdsSet.has(actionId)) {
      layer.actionIds.push(actionId);
      layer.actionIdsSet.add(actionId); // 同步更新Set
      layer.modified = Date.now();
    }

    // 性能优化：增加操作计数并检查清理
    this.operationCount++;
    if (this.operationCount % this.cleanupInterval === 0) {
      this.scheduleCleanup(); // 优化：异步清理
    }

    // 失效缓存
    this.invalidateCache();

    logger.debug('分配动作到虚拟图层:', actionId, '->', layer.name);
    return true;
  }

  /**
   * 批量分配动作到图层（新增优化方法）
   */
  public assignActionsToLayer(actionIds: string[], layerId: string): boolean {
    const layer = this.getVirtualLayer(layerId);
    if (!layer || layer.locked) {
      logger.warn('无法分配动作：虚拟图层不存在或已锁定');
      return false;
    }

    // 批量操作优化
    this.batchOperation(() => {
      for (const actionId of actionIds) {
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
            }
          }
        }

        // 添加到新图层
        this.actionLayerMap.set(actionId, layerId);
        if (!layer.actionIdsSet.has(actionId)) {
          layer.actionIds.push(actionId);
          layer.actionIdsSet.add(actionId);
        }
      }
      layer.modified = Date.now();
    });

    // 失效缓存
    this.invalidateCache();
    logger.debug(`批量分配 ${actionIds.length} 个动作到虚拟图层:`, layer.name);
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
   * 处理新动作（自动分配到当前活动图层）
   */
  public handleNewAction(action: DrawAction): void {
    // TODO：逻辑不一致：autoCreateLayer=false 时，动作不分配图层但仍在历史记录中
    // TODO：用户体验混乱：用户可能期望禁用图层功能时完全禁用
    // TODO：代码可读性差：这个检查的逻辑不够清晰，需要优化
    if (!this.autoCreateLayer) return;

    // 如果动作没有指定虚拟图层，自动分配到当前活动图层
    if (!action.virtualLayerId) {
      const activeLayer = this.getActiveVirtualLayer();
      if (activeLayer) {
        action.virtualLayerId = activeLayer.id;
        action.layerName = activeLayer.name;
        action.layerVisible = activeLayer.visible;
        action.layerOpacity = activeLayer.opacity;
        action.layerLocked = activeLayer.locked;
        action.layerCreated = activeLayer.created;
        action.layerModified = Date.now();

        // 添加到图层
        this.assignActionToLayer(action.id, activeLayer.id);
      }
    }
  }

  /**
   * 更新动作的虚拟图层属性
   */
  public updateActionLayerProperties(action: DrawAction): void {
    if (!action.virtualLayerId) return;

    const layer = this.getVirtualLayer(action.virtualLayerId);
    if (layer) {
      action.layerName = layer.name;
      action.layerVisible = layer.visible;
      action.layerOpacity = layer.opacity;
      action.layerLocked = layer.locked;
      action.layerModified = Date.now();
    }
  }

  /**
   * 获取虚拟图层统计信息（优化版本）
   */
  public getVirtualLayerStats(): {
    totalLayers: number;
    visibleLayers: number;
    lockedLayers: number;
    totalActions: number;
  } {
    // 优化：智能缓存策略，根据内存压力调整缓存时间
    const now = Date.now();
    const cacheTime = this.getCacheExpirationTime();
    
    if (this.statsCache && (now - this.statsCache.lastUpdate) < cacheTime) {
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
   * 获取所有可见动作ID（性能优化版本）
   */
  public getVisibleActionIds(): string[] {
    const now = Date.now();
    const cacheTime = this.getCacheExpirationTime();
    
    if (this.visibleActionIdsCache && (now - this.visibleActionIdsCacheTime) < cacheTime) {
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
   * 批量操作支持（新增优化方法）
   */
  public startBatchOperation(): void {
    this.batchMode = true;
    this.pendingOperations = [];
  }

  public endBatchOperation(): void {
    this.batchMode = false;
    
    // 执行所有待处理的操作
    for (const operation of this.pendingOperations) {
      operation();
    }
    this.pendingOperations = [];
    
    // 失效缓存
    this.invalidateCache();
  }

  /**
   * 批量操作内部方法
   */
  private batchOperation(operation: () => void): void {
    if (this.batchMode) {
      this.pendingOperations.push(operation);
    } else {
      operation();
    }
  }

  /**
   * 智能缓存过期时间（新增优化方法）
   */
  private getCacheExpirationTime(): number {
    // 根据内存压力调整缓存时间
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      const memory = (performance as Performance & { memory: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
      const memoryPressure = memory.usedJSHeapSize / memory.jsHeapSizeLimit;
      
      // 内存压力大时，减少缓存时间
      if (memoryPressure > 0.8) {
        return 500; // 500ms
      } else if (memoryPressure > 0.6) {
        return 1000; // 1s
      }
    }
    
    return this.cacheExpirationTime;
  }

  /**
   * 失效缓存
   */
  private invalidateCache(): void {
    this.statsCache = null;
    this.visibleActionIdsCache = null;
  }

  /**
   * 异步清理调度（优化版本）
   */
  private scheduleCleanup(): void {
    if (!this.enableAsyncCleanup) {
      this.performCleanup();
      return;
    }

    // 使用requestIdleCallback或setTimeout进行异步清理
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => this.performCleanup(), { timeout: 1000 });
    } else {
      setTimeout(() => this.performCleanup(), 0);
    }
  }

  /**
   * 执行清理操作（优化版本）
   */
  private performCleanup(): void {
    // 清理过大的图层
    for (const layer of this.virtualLayers.values()) {
      if (layer.actionIds.length > this.maxActionsPerLayer) {
        // 保留最新的动作，删除旧的
        const excessCount = layer.actionIds.length - this.maxActionsPerLayer;
        const removedIds = layer.actionIds.splice(0, excessCount);
        
        // 同步更新Set
        for (const id of removedIds) {
          layer.actionIdsSet.delete(id);
        }
        
        layer.modified = Date.now();
        logger.debug(`清理图层 ${layer.name}，删除了 ${excessCount} 个旧动作`);
      }
    }

    // 清理孤立的动作映射（动作已不存在但映射还在）
    const validActionIds = new Set<string>();
    for (const layer of this.virtualLayers.values()) {
      layer.actionIds.forEach(id => validActionIds.add(id));
    }

    let cleanedCount = 0;
    for (const [actionId] of this.actionLayerMap) {
      if (!validActionIds.has(actionId)) {
        this.actionLayerMap.delete(actionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug(`清理了 ${cleanedCount} 个孤立的动作映射`);
    }
  }

  /**
   * 获取默认图层
   */
  private getDefaultLayer(): VirtualLayer | null {
    return this.virtualLayers.values().next().value || null;
  }

  /**
   * 生成虚拟图层ID
   */
  private generateLayerId(): string {
    return `vlayer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 销毁虚拟图层管理器
   */
  public destroy(): void {
    // 清理批量操作
    if (this.batchTimeoutId) {
      clearTimeout(this.batchTimeoutId);
      this.batchTimeoutId = null;
    }
    
    this.virtualLayers.clear();
    this.actionLayerMap.clear();
    this.activeLayerId = '';
    this.pendingOperations = [];
    this.batchMode = false;
    
    logger.debug('虚拟图层管理器已销毁');
  }
} 