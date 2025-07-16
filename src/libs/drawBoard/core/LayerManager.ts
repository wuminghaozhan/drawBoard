import type { DrawAction } from '../tools/DrawTool';
import { logger } from '../utils/Logger';

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  locked: boolean;
  actions: DrawAction[];
  created: number;
  modified: number;
}

export interface LayerManagerConfig {
  maxLayers?: number;
  defaultLayerName?: string;
}

export interface LayerExportData {
  version: string;
  activeLayerId: string;
  layers: Array<Layer & { [key: string]: unknown }>;
}

/**
 * 图层管理器 - 支持多图层绘制功能
 * 
 * 功能特性：
 * - 多图层管理
 * - 图层可见性控制
 * - 图层透明度调整
 * - 图层锁定/解锁
 * - 图层重新排序
 * - 图层合并
 * - 图层导入/导出
 */
export class LayerManager {
  private layers: Layer[] = [];
  private activeLayerId: string = '';
  private maxLayers: number = 20;
  private defaultLayerName: string = '图层';

  constructor(config: LayerManagerConfig = {}) {
    this.maxLayers = config.maxLayers || 20;
    this.defaultLayerName = config.defaultLayerName || '图层';
    
    // 创建默认图层
    this.createDefaultLayer();
  }

  /**
   * 创建默认图层
   */
  private createDefaultLayer(): void {
    const defaultLayer = this.createLayer('背景图层');
    this.activeLayerId = defaultLayer.id;
  }

  /**
   * 创建新图层
   */
  public createLayer(name?: string): Layer {
    if (this.layers.length >= this.maxLayers) {
      throw new Error(`已达到最大图层数量限制: ${this.maxLayers}`);
    }

    const layerId = this.generateLayerId();
    const layerName = name || `${this.defaultLayerName} ${this.layers.length + 1}`;
    const now = Date.now();

    const newLayer: Layer = {
      id: layerId,
      name: layerName,
      visible: true,
      opacity: 1.0,
      locked: false,
      actions: [],
      created: now,
      modified: now
    };

    this.layers.push(newLayer);
    logger.debug('创建新图层:', newLayer.name, layerId);
    
    return newLayer;
  }

  /**
   * 删除图层
   */
  public deleteLayer(layerId: string): boolean {
    // 不能删除最后一个图层
    if (this.layers.length <= 1) {
      logger.warn('不能删除最后一个图层');
      return false;
    }

    const layerIndex = this.layers.findIndex(layer => layer.id === layerId);
    if (layerIndex === -1) {
      logger.warn('图层不存在:', layerId);
      return false;
    }

    const deletedLayer = this.layers[layerIndex];
    this.layers.splice(layerIndex, 1);

    // 如果删除的是当前激活图层，切换到相邻图层
    if (this.activeLayerId === layerId) {
      const newActiveIndex = Math.min(layerIndex, this.layers.length - 1);
      this.activeLayerId = this.layers[newActiveIndex].id;
    }

    logger.debug('删除图层:', deletedLayer.name);
    return true;
  }

  /**
   * 设置活动图层
   */
  public setActiveLayer(layerId: string): boolean {
    const layer = this.getLayer(layerId);
    if (!layer) {
      logger.warn('图层不存在:', layerId);
      return false;
    }

    if (layer.locked) {
      logger.warn('图层已锁定，无法激活:', layer.name);
      return false;
    }

    this.activeLayerId = layerId;
    logger.debug('切换到图层:', layer.name);
    return true;
  }

  /**
   * 获取活动图层
   */
  public getActiveLayer(): Layer | null {
    return this.getLayer(this.activeLayerId);
  }

  /**
   * 获取指定图层
   */
  public getLayer(layerId: string): Layer | null {
    return this.layers.find(layer => layer.id === layerId) || null;
  }

  /**
   * 获取所有图层
   */
  public getAllLayers(): Layer[] {
    return [...this.layers];
  }

  /**
   * 获取可见图层
   */
  public getVisibleLayers(): Layer[] {
    return this.layers.filter(layer => layer.visible);
  }

  /**
   * 设置图层可见性
   */
  public setLayerVisible(layerId: string, visible: boolean): boolean {
    const layer = this.getLayer(layerId);
    if (!layer) return false;

    layer.visible = visible;
    layer.modified = Date.now();
    logger.debug('设置图层可见性:', layer.name, visible);
    return true;
  }

  /**
   * 设置图层透明度
   */
  public setLayerOpacity(layerId: string, opacity: number): boolean {
    const layer = this.getLayer(layerId);
    if (!layer) return false;

    layer.opacity = Math.max(0, Math.min(1, opacity));
    layer.modified = Date.now();
    logger.debug('设置图层透明度:', layer.name, layer.opacity);
    return true;
  }

  /**
   * 设置图层锁定状态
   */
  public setLayerLocked(layerId: string, locked: boolean): boolean {
    const layer = this.getLayer(layerId);
    if (!layer) return false;

    layer.locked = locked;
    layer.modified = Date.now();
    logger.debug('设置图层锁定:', layer.name, locked);
    return true;
  }

  /**
   * 重命名图层
   */
  public renameLayer(layerId: string, newName: string): boolean {
    const layer = this.getLayer(layerId);
    if (!layer) return false;

    const oldName = layer.name;
    layer.name = newName.trim() || oldName;
    layer.modified = Date.now();
    logger.debug('重命名图层:', oldName, '->', layer.name);
    return true;
  }

  /**
   * 移动图层顺序
   */
  public moveLayer(layerId: string, newIndex: number): boolean {
    const currentIndex = this.layers.findIndex(layer => layer.id === layerId);
    if (currentIndex === -1) return false;

    const targetIndex = Math.max(0, Math.min(this.layers.length - 1, newIndex));
    if (currentIndex === targetIndex) return true;

    const [movedLayer] = this.layers.splice(currentIndex, 1);
    this.layers.splice(targetIndex, 0, movedLayer);
    
    movedLayer.modified = Date.now();
    logger.debug('移动图层:', movedLayer.name, currentIndex, '->', targetIndex);
    return true;
  }

  /**
   * 复制图层
   */
  public duplicateLayer(layerId: string): Layer | null {
    const sourceLayer = this.getLayer(layerId);
    if (!sourceLayer) return null;

    const newLayer = this.createLayer(`${sourceLayer.name} 副本`);
    
    // 复制图层内容
    newLayer.opacity = sourceLayer.opacity;
    newLayer.visible = sourceLayer.visible;
    newLayer.actions = sourceLayer.actions.map(action => ({
      ...action,
      id: this.generateActionId()
    }));

    logger.debug('复制图层:', sourceLayer.name, '->', newLayer.name);
    return newLayer;
  }

  /**
   * 合并图层
   */
  public mergeLayers(sourceLayerId: string, targetLayerId: string): boolean {
    const sourceLayer = this.getLayer(sourceLayerId);
    const targetLayer = this.getLayer(targetLayerId);
    
    if (!sourceLayer || !targetLayer || sourceLayerId === targetLayerId) {
      return false;
    }

    // 将源图层的动作添加到目标图层
    targetLayer.actions.push(...sourceLayer.actions);
    targetLayer.modified = Date.now();

    // 删除源图层
    this.deleteLayer(sourceLayerId);
    
    logger.debug('合并图层:', sourceLayer.name, '->', targetLayer.name);
    return true;
  }

  /**
   * 添加动作到活动图层
   */
  public addActionToActiveLayer(action: DrawAction): boolean {
    const activeLayer = this.getActiveLayer();
    if (!activeLayer || activeLayer.locked) {
      logger.warn('无法添加动作：图层不存在或已锁定');
      return false;
    }

    activeLayer.actions.push(action);
    activeLayer.modified = Date.now();
    return true;
  }

  /**
   * 从活动图层移除动作
   */
  public removeActionFromActiveLayer(actionId: string): boolean {
    const activeLayer = this.getActiveLayer();
    if (!activeLayer || activeLayer.locked) {
      return false;
    }

    const actionIndex = activeLayer.actions.findIndex(action => action.id === actionId);
    if (actionIndex === -1) return false;

    activeLayer.actions.splice(actionIndex, 1);
    activeLayer.modified = Date.now();
    return true;
  }

  /**
   * 获取所有可见图层的动作
   */
  public getAllVisibleActions(): DrawAction[] {
    const actions: DrawAction[] = [];
    
    for (const layer of this.layers) {
      if (layer.visible) {
        actions.push(...layer.actions);
      }
    }
    
    return actions.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * 清空图层
   */
  public clearLayer(layerId: string): boolean {
    const layer = this.getLayer(layerId);
    if (!layer || layer.locked) return false;

    layer.actions = [];
    layer.modified = Date.now();
    logger.debug('清空图层:', layer.name);
    return true;
  }

  /**
   * 清空所有图层
   */
  public clearAllLayers(): void {
    for (const layer of this.layers) {
      if (!layer.locked) {
        layer.actions = [];
        layer.modified = Date.now();
      }
    }
    logger.debug('清空所有图层');
  }

  /**
   * 获取图层统计信息
   */
  public getLayerStats(): {
    totalLayers: number;
    visibleLayers: number;
    lockedLayers: number;
    totalActions: number;
  } {
    return {
      totalLayers: this.layers.length,
      visibleLayers: this.layers.filter(l => l.visible).length,
      lockedLayers: this.layers.filter(l => l.locked).length,
      totalActions: this.layers.reduce((sum, l) => sum + l.actions.length, 0)
    };
  }

  /**
   * 导出图层数据
   */
  public exportLayers(): LayerExportData {
    return {
      version: '1.0',
      activeLayerId: this.activeLayerId,
      layers: this.layers.map(layer => ({
        ...layer,
        // 可以在这里添加额外的序列化逻辑
      }))
    };
  }

  /**
   * 导入图层数据
   */
  public importLayers(data: LayerExportData): boolean {
    try {
      if (!data || !data.layers || !Array.isArray(data.layers)) {
        throw new Error('无效的图层数据格式');
      }

      this.layers = data.layers.map((layerData: Partial<Layer>) => ({
        id: layerData.id || this.generateLayerId(),
        name: layerData.name || '导入图层',
        visible: layerData.visible !== false,
        opacity: Math.max(0, Math.min(1, layerData.opacity || 1)),
        locked: layerData.locked || false,
        actions: layerData.actions || [],
        created: layerData.created || Date.now(),
        modified: layerData.modified || Date.now()
      }));

      // 设置活动图层
      if (data.activeLayerId && this.getLayer(data.activeLayerId)) {
        this.activeLayerId = data.activeLayerId;
      } else if (this.layers.length > 0) {
        this.activeLayerId = this.layers[0].id;
      }

      logger.debug('导入图层数据:', this.layers.length, '个图层');
      return true;
    } catch (error) {
      logger.error('导入图层数据失败:', error);
      return false;
    }
  }

  /**
   * 生成图层ID
   */
  private generateLayerId(): string {
    return `layer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 生成动作ID
   */
  private generateActionId(): string {
    return `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 销毁图层管理器
   */
  public destroy(): void {
    this.layers = [];
    this.activeLayerId = '';
    logger.debug('图层管理器已销毁');
  }
} 