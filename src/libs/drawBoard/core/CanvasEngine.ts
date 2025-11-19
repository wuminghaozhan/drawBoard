export interface Point {
  x: number;
  y: number;
  timestamp?: number; // 添加可选的时间戳字段
}

export interface DrawContext {
  strokeStyle: string;
  lineWidth: number;
  fillStyle: string;
}

export interface CanvasLayer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  visible: boolean;
}

import { logger } from '../utils/Logger';

export class CanvasEngine {
  protected container: HTMLDivElement;
  protected layers: Map<string, CanvasLayer> = new Map();
  protected context: DrawContext;
  protected width: number = 0;
  protected height: number = 0;
  private contextCache: Map<string, DrawContext> = new Map();
  // 动态图层：用于选中虚拟图层的交互元素
  private dynamicLayers: Map<string, CanvasLayer> = new Map();
  // 动态draw层：用于拆分draw层，实现性能优化
  private dynamicDrawLayers: Map<string, CanvasLayer> = new Map();
  // 当前draw层拆分状态
  private drawLayerSplitState: {
    isSplit: boolean;
    selectedLayerZIndex: number | null;
    bottomLayerId: string | null;
    selectedLayerId: string | null;
    topLayerId: string | null;
    initialized: boolean; // 是否已初始化绘制bottom和top层
  } = {
    isSplit: false,
    selectedLayerZIndex: null,
    bottomLayerId: null,
    selectedLayerId: null,
    topLayerId: null,
    initialized: false
  };
  // 防止多次初始化resize
  private resizeScheduled: boolean = false;
  
  // 跟踪正在使用的draw层（防止在绘制时删除）
  private drawLayersInUse: Set<string> = new Set();

  constructor(container: HTMLCanvasElement | HTMLDivElement) {
    logger.debug('🔧 CanvasEngine constructor called with:', container);
    
    if (container instanceof HTMLDivElement) {
      this.container = container;
      
      // 🧹 清理现有canvas（每次都清理，确保干净的状态）
      const existingCanvases = this.container.querySelectorAll('canvas');
      if (existingCanvases.length > 0) {
        logger.debug(`🧹 Removing ${existingCanvases.length} existing canvas elements`);
        Array.from(existingCanvases).forEach(c => c.remove());
      }
      
      // 确保容器有正确的样式，只有static时才改变position
      const currentPosition = getComputedStyle(this.container).position;
      if (currentPosition === 'static') {
        this.container.style.position = 'relative';
      }
    } else {
      // 创建容器
      this.container = document.createElement('div');
      this.container.style.position = 'relative';
      // 替换原始canvas
      container.parentNode?.replaceChild(this.container, container);
    }
    
    this.context = {
      strokeStyle: '#000000',
      lineWidth: 2,
      fillStyle: '#000000'
    };
    
    this.createLayers();
    
    // 立即调用resize，不使用setTimeout延迟
    this.initializeCanvasSize();
  }

  /**
   * 初始化Canvas尺寸
   * 确保容器尺寸准备就绪后再设置Canvas
   */
  private initializeCanvasSize(): void {
    // 防止多次调用
    if (this.resizeScheduled) {
      logger.debug('resize已调度，跳过重复调用');
      return;
    }
    
    logger.debug('initializeCanvasSize', this.container.offsetWidth, this.container.offsetHeight);
    
    // 检查容器是否已有尺寸
    if (this.container.offsetWidth > 0 && this.container.offsetHeight > 0) {
      this.resize();
    } else {
      // 如果容器尺寸为0，使用requestAnimationFrame等待下一帧
      this.resizeScheduled = true;
      requestAnimationFrame(() => {
        this.resizeScheduled = false;
        if (this.container.offsetWidth > 0 && this.container.offsetHeight > 0) {
          this.resize();
        } else {
          // 再次失败则使用默认尺寸
          logger.warn('容器尺寸仍为0，使用默认尺寸');
          this.container.style.width = '800px';
          this.container.style.height = '600px';
          this.resize();
        }
      });
    }
  }

  private createLayers(): void {
    // 背景层 - 用于网格、背景色等
    this.createLayer('background', 0);
    // 绘制层 - 用于历史记录和最终绘制
    this.createLayer('draw', 1);
    // 交互层 - 用于实时预览、选择框等
    this.createLayer('interaction', 2);
  }

  private createLayer(name: string, zIndex: number): void {
    logger.debug('Creating layer:', name, 'with z-index:', zIndex);
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    
    if (!ctx) {
      logger.error('Failed to get 2D context for layer:', name);
      return;
    }
    
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.bottom = '0';
    canvas.style.right = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = zIndex.toString();
    canvas.style.backgroundColor = 'transparent'; // 确保背景透明
    
    // 交互层需要接收事件
    if (name === 'interaction') {
      canvas.style.pointerEvents = 'auto';
      logger.debug('Interaction layer created with pointer-events: auto', {
        canvas,
        width: canvas.width,
        height: canvas.height,
        zIndex: canvas.style.zIndex
      });
    }
    
    this.container.appendChild(canvas);
    logger.debug('Canvas appended to container for layer:', name);
    
    this.layers.set(name, {
      canvas,
      ctx,
      visible: true
    });
    
    logger.debug('Layer created successfully:', name);
  }

  /**
   * 设置上下文
   */
  protected setupContext(ctx: CanvasRenderingContext2D, layerName?: string): void {
    // 如果有层名，检查缓存
    if (layerName) {
      const cached = this.contextCache.get(layerName);
      if (cached && this.contextEquals(cached, this.context)) {
        return; // 上下文未变化，跳过设置
      }
      // 更新缓存
      this.contextCache.set(layerName, { ...this.context });
    }

    ctx.strokeStyle = this.context.strokeStyle;
    ctx.lineWidth = this.context.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.fillStyle = this.context.fillStyle;
  }

  /**
   * 比较两个上下文是否相等
   */
  private contextEquals(a: DrawContext, b: DrawContext): boolean {
    return a.strokeStyle === b.strokeStyle && 
           a.lineWidth === b.lineWidth && 
           a.fillStyle === b.fillStyle;
  }

  /**
   * 设置上下文
   */
  public setContext(context: Partial<DrawContext>): void {
    const newContext = { ...this.context, ...context };
    
    // 检查是否真的有变化
    if (this.contextEquals(this.context, newContext)) {
      return;
    }

    this.context = newContext;
    
    // 只更新需要更新的层
    this.layers.forEach((layer, name) => {
      this.setupContext(layer.ctx, name);
    });
  }

  /**
   * 为特定层设置上下文（性能优化）
   */
  public setContextForLayer(layerName: string, context: Partial<DrawContext>): void {
    const layer = this.layers.get(layerName);
    if (!layer) return;

    const layerContext = { ...this.context, ...context };
    const cached = this.contextCache.get(layerName);
    
    if (cached && this.contextEquals(cached, layerContext)) {
      return; // 上下文未变化
    }

    // 临时设置层上下文
    layer.ctx.strokeStyle = layerContext.strokeStyle;
    layer.ctx.lineWidth = layerContext.lineWidth;
    layer.ctx.lineCap = 'round';
    layer.ctx.lineJoin = 'round';
    layer.ctx.fillStyle = layerContext.fillStyle;

    // 更新缓存
    this.contextCache.set(layerName, layerContext);
  }

  /**
   * 获取上下文
   */
  public getContext(): DrawContext {
    return { ...this.context };
  }

  /**
   * 清除画布
   */
  public clear(layerName?: string): void {
    if (layerName) {
      const layer = this.layers.get(layerName);
      if (layer) {
        layer.ctx.clearRect(0, 0, this.width, this.height);
      }
    } else {
      // 清除所有层
      this.layers.forEach(layer => {
        layer.ctx.clearRect(0, 0, this.width, this.height);
      });
    }
  }

  /**
   * 调整画布大小
   */
  public resize(): void {
    const container = this.container;
    const newWidth = container.offsetWidth;
    const newHeight = container.offsetHeight;
    
    logger.debug('CanvasEngine resize:', newWidth, 'x', newHeight);
    
    // 🔒 防止0尺寸导致canvas清空
    if (newWidth <= 0 || newHeight <= 0) {
      logger.warn('⚠️ Container size is 0, skipping resize to prevent canvas clearing');
      return;
    }
    
    // 🔒 防止重复resize相同尺寸
    if (this.width === newWidth && this.height === newHeight) {
      logger.debug('✅ Size unchanged, skipping resize');
      return;
    }
    
    this.width = newWidth;
    this.height = newHeight;
    
    // 调整固定图层尺寸
    this.layers.forEach((layer, name) => {
      layer.canvas.width = this.width;
      layer.canvas.height = this.height;
      // resize时需要重新设置上下文，清除缓存
      this.contextCache.delete(name);
      this.setupContext(layer.ctx, name);
    });
    
    // 调整动态图层尺寸
    this.dynamicLayers.forEach((layer) => {
      layer.canvas.width = this.width;
      layer.canvas.height = this.height;
    });
    
    // 调整动态draw层尺寸
    this.dynamicDrawLayers.forEach((layer) => {
      layer.canvas.width = this.width;
      layer.canvas.height = this.height;
    });
  }

  public getLayer(name: string): CanvasLayer | undefined {
    return this.layers.get(name);
  }

  public getDrawLayer(): CanvasRenderingContext2D {
    return this.layers.get('draw')!.ctx;
  }

  public getInteractionLayer(): CanvasRenderingContext2D {
    return this.layers.get('interaction')!.ctx;
  }

  public getBackgroundLayer(): CanvasRenderingContext2D {
    return this.layers.get('background')!.ctx;
  }

  public getCanvas(): HTMLCanvasElement {
    // 返回绘制层作为主canvas（兼容性）
    return this.layers.get('draw')!.canvas;
  }

  public getContext2D(): CanvasRenderingContext2D {
    // 返回绘制层上下文（兼容性）
    return this.layers.get('draw')!.ctx;
  }

  /**
   * 获取容器元素
   */
  public getContainer(): HTMLDivElement {
    return this.container;
  }



  public setLayerVisible(name: string, visible: boolean): void {
    const layer = this.layers.get(name);
    if (layer) {
      layer.visible = visible;
      layer.canvas.style.display = visible ? 'block' : 'none';
    }
  }

  /**
   * 绘制网格
   */
  public drawGrid(gridSize: number = 20, color: string = '#f0f0f0'): void {
    const ctx = this.getBackgroundLayer();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    
    // 绘制垂直线
    for (let x = 0; x <= this.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
      ctx.stroke();
    }
    
    // 绘制水平线
    for (let y = 0; y <= this.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
      ctx.stroke();
    }
  }

  // ============================================
  // 动态图层管理（用于选中虚拟图层的交互元素）
  // ============================================

  // 动态图层 zIndex 计算常量（优化版）
  private static readonly BASE_ZINDEX = 100; // interaction层基础zIndex
  private static readonly MAX_DYNAMIC_LAYER_ZINDEX = 1000; // 最大zIndex限制
  private static readonly ZINDEX_STEP = 2; // zIndex步长

  /**
   * 计算动态图层的zIndex（优化版）
   * 公式：BASE_ZINDEX + virtualLayerZIndex * ZINDEX_STEP
   * 例如：虚拟图层zIndex=0 → 动态图层zIndex=100
   *      虚拟图层zIndex=1 → 动态图层zIndex=102
   *      虚拟图层zIndex=2 → 动态图层zIndex=104
   * @param virtualLayerZIndex 虚拟图层的zIndex
   * @returns 计算后的zIndex（不超过最大值）
   */
  public static calculateDynamicLayerZIndex(virtualLayerZIndex: number): number {
    const calculatedZIndex = CanvasEngine.BASE_ZINDEX + virtualLayerZIndex * CanvasEngine.ZINDEX_STEP;
    return Math.min(calculatedZIndex, CanvasEngine.MAX_DYNAMIC_LAYER_ZINDEX);
  }

  /**
   * 创建动态图层（用于选中图层的交互元素）
   * @param layerId 动态图层ID（通常基于虚拟图层ID）
   * @param zIndex z-index值，应该位于虚拟图层和上一层之间
   * @returns 创建的CanvasLayer
   */
  public createDynamicLayer(layerId: string, zIndex: number): CanvasLayer {
    // 如果已存在，先删除
    if (this.dynamicLayers.has(layerId)) {
      this.removeDynamicLayer(layerId);
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      logger.error('Failed to get 2D context for dynamic layer:', layerId);
      throw new Error(`无法创建动态图层 ${layerId} 的2D上下文`);
    }

    // 设置Canvas样式
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.bottom = '0';
    canvas.style.right = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    // 动态图层不接收事件，事件由 interaction 层统一处理
    // 这样可以避免动态图层遮挡 interaction 层
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = zIndex.toString();
    canvas.style.backgroundColor = 'transparent';
    logger.debug('创建动态图层', {
      layerId,
      zIndex,
      pointerEvents: canvas.style.pointerEvents,
      canvas
    });

    // 设置Canvas尺寸
    canvas.width = this.width || this.container.offsetWidth || 800;
    canvas.height = this.height || this.container.offsetHeight || 600;

    // 插入到容器中（需要按zIndex顺序插入）
    this.insertCanvasByZIndex(canvas, zIndex);

    const layer: CanvasLayer = {
      canvas,
      ctx,
      visible: true
    };

    this.dynamicLayers.set(layerId, layer);
    logger.debug('创建动态图层:', layerId, 'zIndex:', zIndex);
    
    return layer;
  }

  /**
   * 按zIndex顺序插入Canvas元素
   */
  private insertCanvasByZIndex(canvas: HTMLCanvasElement, zIndex: number): void {
    const allCanvases = Array.from(this.container.querySelectorAll('canvas'));
    
    // 找到应该插入的位置（zIndex大于当前zIndex的第一个元素之前）
    let insertBefore: Node | null = null;
    for (const existingCanvas of allCanvases) {
      const existingZIndex = parseInt(existingCanvas.style.zIndex || '0', 10);
      if (existingZIndex > zIndex) {
        insertBefore = existingCanvas;
        break;
      }
    }

    if (insertBefore) {
      this.container.insertBefore(canvas, insertBefore);
    } else {
      this.container.appendChild(canvas);
    }
  }

  /**
   * 删除动态图层
   * @param layerId 动态图层ID
   */
  public removeDynamicLayer(layerId: string): void {
    const layer = this.dynamicLayers.get(layerId);
    if (layer) {
      if (layer.canvas.parentNode) {
        layer.canvas.parentNode.removeChild(layer.canvas);
      }
      this.dynamicLayers.delete(layerId);
      logger.debug('删除动态图层:', layerId);
    }
  }

  /**
   * 获取选中图层的交互层Canvas上下文
   * 如果不存在则创建，zIndex位于虚拟图层和上一层之间（使用优化后的计算公式）
   * @param virtualLayerZIndex 虚拟图层的zIndex
   * @returns Canvas上下文
   */
  public getSelectionLayerForVirtualLayer(virtualLayerZIndex: number): CanvasRenderingContext2D {
    const layerId = `selection-${virtualLayerZIndex}`;
    let layer = this.dynamicLayers.get(layerId);

    if (!layer) {
      // 使用优化后的zIndex计算公式：BASE_ZINDEX + virtualLayerZIndex * ZINDEX_STEP
      const zIndex = CanvasEngine.calculateDynamicLayerZIndex(virtualLayerZIndex);
      layer = this.createDynamicLayer(layerId, zIndex);
    }

    return layer.ctx;
  }

  /**
   * 更新动态图层的zIndex
   * @param layerId 动态图层ID
   * @param newZIndex 新的zIndex值
   */
  public updateDynamicLayerZIndex(layerId: string, newZIndex: number): void {
    const layer = this.dynamicLayers.get(layerId);
    if (layer) {
      layer.canvas.style.zIndex = newZIndex.toString();
      // 重新插入以保持顺序
      if (layer.canvas.parentNode) {
        layer.canvas.parentNode.removeChild(layer.canvas);
      }
      this.insertCanvasByZIndex(layer.canvas, newZIndex);
      logger.debug('更新动态图层zIndex:', layerId, 'newZIndex:', newZIndex);
    }
  }

  /**
   * 清除动态图层内容
   * @param layerId 动态图层ID，如果不提供则清除所有动态图层
   */
  public clearDynamicLayer(layerId?: string): void {
    if (layerId) {
      const layer = this.dynamicLayers.get(layerId);
      if (layer) {
        layer.ctx.clearRect(0, 0, this.width, this.height);
      }
    } else {
      // 清除所有动态图层
      this.dynamicLayers.forEach((layer) => {
        layer.ctx.clearRect(0, 0, this.width, this.height);
      });
    }
  }

  /**
   * 获取所有动态图层
   */
  public getAllDynamicLayers(): Map<string, CanvasLayer> {
    return new Map(this.dynamicLayers);
  }

  // ============================================
  // 动态Draw层管理（用于性能优化）
  // ============================================

  /**
   * Draw层zIndex常量
   */
  private static readonly DRAW_LAYER_Z_INDEX = {
    BOTTOM: 1,
    SELECTED: 2,
    TOP: 3
  } as const;

  /**
   * 拆分draw层：根据选中图层位置动态拆分draw层
   * @param selectedLayerZIndex 选中虚拟图层的zIndex
   * @param allLayerZIndices 所有虚拟图层的zIndex数组（已排序）
   * @returns 拆分结果信息
   */
  public splitDrawLayer(selectedLayerZIndex: number, allLayerZIndices: number[]): {
    hasBottom: boolean;
    hasTop: boolean;
    bottomZIndex: number;
    selectedZIndex: number;
    topZIndex: number;
  } {
    // 参数验证
    if (!Array.isArray(allLayerZIndices)) {
      logger.error('splitDrawLayer: allLayerZIndices必须是数组', { allLayerZIndices });
      throw new Error('allLayerZIndices必须是数组');
    }

    if (allLayerZIndices.length === 0) {
      logger.warn('splitDrawLayer: 图层数组为空，无法拆分');
      return {
        hasBottom: false,
        hasTop: false,
        bottomZIndex: CanvasEngine.DRAW_LAYER_Z_INDEX.BOTTOM,
        selectedZIndex: CanvasEngine.DRAW_LAYER_Z_INDEX.SELECTED,
        topZIndex: CanvasEngine.DRAW_LAYER_Z_INDEX.TOP
      };
    }

    if (!allLayerZIndices.includes(selectedLayerZIndex)) {
      logger.warn('splitDrawLayer: 选中的图层zIndex不在图层数组中', {
        selectedLayerZIndex,
        allLayerZIndices
      });
      // 不抛出错误，允许继续执行（可能是图层刚被删除的情况）
    }

    // 如果已经拆分且选中图层相同，不需要重新拆分
    // 但需要检查初始化状态
    if (this.drawLayerSplitState.isSplit && 
        this.drawLayerSplitState.selectedLayerZIndex === selectedLayerZIndex) {
      // 如果未初始化，记录警告（调用者应该触发初始化）
      if (!this.drawLayerSplitState.initialized) {
        logger.debug('draw层已拆分但未初始化，需要初始化', {
          selectedLayerZIndex
        });
      }
      return {
        hasBottom: this.drawLayerSplitState.bottomLayerId !== null,
        hasTop: this.drawLayerSplitState.topLayerId !== null,
        bottomZIndex: CanvasEngine.DRAW_LAYER_Z_INDEX.BOTTOM,
        selectedZIndex: CanvasEngine.DRAW_LAYER_Z_INDEX.SELECTED,
        topZIndex: CanvasEngine.DRAW_LAYER_Z_INDEX.TOP
      };
    }

    // 先清除之前的拆分状态
    this.mergeDrawLayers();

    // 判断是否有下层和上层图层
    // 注意：如果只有1个图层，hasBottom和hasTop都为false，只会创建selected层
    const hasBottom = allLayerZIndices.some(zIndex => zIndex < selectedLayerZIndex);
    const hasTop = allLayerZIndices.some(zIndex => zIndex > selectedLayerZIndex);

    // 隐藏原始draw层
    const originalDrawLayer = this.layers.get('draw');
    if (originalDrawLayer) {
      originalDrawLayer.canvas.style.display = 'none';
    }

    // zIndex分配：使用常量
    const bottomZIndex = CanvasEngine.DRAW_LAYER_Z_INDEX.BOTTOM;
    const selectedZIndex = CanvasEngine.DRAW_LAYER_Z_INDEX.SELECTED;
    const topZIndex = CanvasEngine.DRAW_LAYER_Z_INDEX.TOP;

    // 创建下层draw层（如果有下层图层）
    if (hasBottom) {
      const bottomLayerId = 'draw-bottom';
      this.createDynamicDrawLayer(bottomLayerId, bottomZIndex);
      this.drawLayerSplitState.bottomLayerId = bottomLayerId;
    }

    // 创建选中图层draw层
    const selectedLayerId = 'draw-selected';
    this.createDynamicDrawLayer(selectedLayerId, selectedZIndex);
    this.drawLayerSplitState.selectedLayerId = selectedLayerId;

    // 创建上层draw层（如果有上层图层）
    if (hasTop) {
      const topLayerId = 'draw-top';
      this.createDynamicDrawLayer(topLayerId, topZIndex);
      this.drawLayerSplitState.topLayerId = topLayerId;
    }

    // 更新拆分状态
    this.drawLayerSplitState.isSplit = true;
    this.drawLayerSplitState.selectedLayerZIndex = selectedLayerZIndex;
    this.drawLayerSplitState.initialized = false; // 标记需要初始化

    logger.debug('拆分draw层完成', {
      selectedLayerZIndex,
      hasBottom,
      hasTop,
      bottomZIndex,
      selectedZIndex,
      topZIndex
    });

    return {
      hasBottom,
      hasTop,
      bottomZIndex,
      selectedZIndex,
      topZIndex
    };
  }

  /**
   * 合并draw层：将所有动态draw层合并回统一的draw层
   */
  public mergeDrawLayers(): void {
    if (!this.drawLayerSplitState.isSplit) {
      return; // 已经合并，无需操作
    }

    // 检查是否有绘制操作正在进行
    const layersToRemove = [
      this.drawLayerSplitState.bottomLayerId,
      this.drawLayerSplitState.selectedLayerId,
      this.drawLayerSplitState.topLayerId
    ].filter(Boolean) as string[];

    const inUse = layersToRemove.some(id => this.drawLayersInUse.has(id));
    if (inUse) {
      logger.warn('有绘制操作正在进行，延迟合并draw层', {
        layersInUse: layersToRemove.filter(id => this.drawLayersInUse.has(id))
      });
      // 延迟合并（异步，不阻塞）
      setTimeout(() => {
        // 再次检查
        const stillInUse = layersToRemove.some(id => this.drawLayersInUse.has(id));
        if (!stillInUse && this.drawLayerSplitState.isSplit) {
          this.mergeDrawLayers();
        }
      }, 100);
      return;
    }

    // 删除所有动态draw层
    if (this.drawLayerSplitState.bottomLayerId) {
      this.removeDynamicDrawLayer(this.drawLayerSplitState.bottomLayerId);
    }
    if (this.drawLayerSplitState.selectedLayerId) {
      this.removeDynamicDrawLayer(this.drawLayerSplitState.selectedLayerId);
    }
    if (this.drawLayerSplitState.topLayerId) {
      this.removeDynamicDrawLayer(this.drawLayerSplitState.topLayerId);
    }

    // 显示原始draw层
    const originalDrawLayer = this.layers.get('draw');
    if (originalDrawLayer) {
      originalDrawLayer.canvas.style.display = 'block';
    }

    // 重置拆分状态
    this.drawLayerSplitState = {
      isSplit: false,
      selectedLayerZIndex: null,
      bottomLayerId: null,
      selectedLayerId: null,
      topLayerId: null,
      initialized: false
    };

    logger.debug('合并draw层完成');
  }

  /**
   * 创建动态draw层
   * @param layerId 动态draw层ID
   * @param zIndex z-index值
   * @returns 创建的CanvasLayer
   */
  private createDynamicDrawLayer(layerId: string, zIndex: number): CanvasLayer {
    // 如果已存在，先删除
    if (this.dynamicDrawLayers.has(layerId)) {
      this.removeDynamicDrawLayer(layerId);
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      logger.error('Failed to get 2D context for dynamic draw layer:', layerId);
      throw new Error(`无法创建动态draw层 ${layerId} 的2D上下文`);
    }

    // 设置Canvas样式
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.bottom = '0';
    canvas.style.right = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = zIndex.toString();
    canvas.style.backgroundColor = 'transparent';

    // 设置Canvas尺寸
    canvas.width = this.width || this.container.offsetWidth || 800;
    canvas.height = this.height || this.container.offsetHeight || 600;

    // 插入到容器中（需要按zIndex顺序插入）
    this.insertCanvasByZIndex(canvas, zIndex);

    const layer: CanvasLayer = {
      canvas,
      ctx,
      visible: true
    };

    this.dynamicDrawLayers.set(layerId, layer);
    logger.debug('创建动态draw层:', layerId, 'zIndex:', zIndex);
    
    return layer;
  }

  /**
   * 删除动态draw层
   * @param layerId 动态draw层ID
   */
  private removeDynamicDrawLayer(layerId: string): void {
    const layer = this.dynamicDrawLayers.get(layerId);
    if (layer) {
      if (layer.canvas.parentNode) {
        layer.canvas.parentNode.removeChild(layer.canvas);
      }
      this.dynamicDrawLayers.delete(layerId);
      logger.debug('删除动态draw层:', layerId);
    }
  }

  /**
   * 获取选中图层的draw层上下文
   * @returns Canvas上下文，如果未拆分则返回null
   */
  public getSelectedLayerDrawContext(): CanvasRenderingContext2D | null {
    if (!this.drawLayerSplitState.isSplit || !this.drawLayerSplitState.selectedLayerId) {
      return null;
    }
    const layer = this.dynamicDrawLayers.get(this.drawLayerSplitState.selectedLayerId);
    return layer ? layer.ctx : null;
  }

  /**
   * 获取下层图层的draw层上下文
   * @returns Canvas上下文，如果没有下层则返回null
   */
  public getBottomLayersDrawContext(): CanvasRenderingContext2D | null {
    if (!this.drawLayerSplitState.isSplit || !this.drawLayerSplitState.bottomLayerId) {
      return null;
    }
    const layer = this.dynamicDrawLayers.get(this.drawLayerSplitState.bottomLayerId);
    return layer ? layer.ctx : null;
  }

  /**
   * 获取上层图层的draw层上下文
   * @returns Canvas上下文，如果没有上层则返回null
   */
  public getTopLayersDrawContext(): CanvasRenderingContext2D | null {
    if (!this.drawLayerSplitState.isSplit || !this.drawLayerSplitState.topLayerId) {
      return null;
    }
    const layer = this.dynamicDrawLayers.get(this.drawLayerSplitState.topLayerId);
    return layer ? layer.ctx : null;
  }

  /**
   * 检查draw层是否已拆分
   */
  public isDrawLayerSplit(): boolean {
    return this.drawLayerSplitState.isSplit;
  }

  /**
   * 获取当前选中的图层zIndex（如果已拆分）
   */
  public getSelectedLayerZIndex(): number | null {
    return this.drawLayerSplitState.selectedLayerZIndex;
  }
  
  /**
   * 标记draw层已初始化
   */
  public markDrawLayersInitialized(): void {
    this.drawLayerSplitState.initialized = true;
  }
  
  /**
   * 检查draw层是否已初始化
   */
  public isDrawLayersInitialized(): boolean {
    return this.drawLayerSplitState.initialized;
  }

  /**
   * 标记draw层正在使用（防止在绘制时被删除）
   * @param layerId draw层ID
   */
  public markDrawLayerInUse(layerId: string): void {
    this.drawLayersInUse.add(layerId);
  }

  /**
   * 取消标记draw层正在使用
   * @param layerId draw层ID
   */
  public unmarkDrawLayerInUse(layerId: string): void {
    this.drawLayersInUse.delete(layerId);
  }

  /**
   * 验证draw层拆分状态的一致性（用于调试）
   * @returns 状态是否一致
   */
  public validateDrawLayerState(): boolean {
    if (!this.drawLayerSplitState.isSplit) {
      // 未拆分时，应该没有动态draw层
      if (this.dynamicDrawLayers.size > 0) {
        logger.warn('状态不一致: 未拆分但存在动态draw层', {
          dynamicDrawLayersCount: this.dynamicDrawLayers.size
        });
        return false;
      }
      return true;
    }

    // 已拆分时，验证状态
    const hasBottom = this.drawLayerSplitState.bottomLayerId !== null;
    const hasTop = this.drawLayerSplitState.topLayerId !== null;
    const hasSelected = this.drawLayerSplitState.selectedLayerId !== null;

    // 必须要有selected层
    if (!hasSelected) {
      logger.warn('状态不一致: 已拆分但没有selected层');
      return false;
    }

    // 验证DOM元素存在
    if (hasBottom && !this.dynamicDrawLayers.has(this.drawLayerSplitState.bottomLayerId!)) {
      logger.warn('状态不一致: bottom层ID存在但DOM元素不存在', {
        bottomLayerId: this.drawLayerSplitState.bottomLayerId
      });
      return false;
    }

    if (hasSelected && !this.dynamicDrawLayers.has(this.drawLayerSplitState.selectedLayerId!)) {
      logger.warn('状态不一致: selected层ID存在但DOM元素不存在', {
        selectedLayerId: this.drawLayerSplitState.selectedLayerId
      });
      return false;
    }

    if (hasTop && !this.dynamicDrawLayers.has(this.drawLayerSplitState.topLayerId!)) {
      logger.warn('状态不一致: top层ID存在但DOM元素不存在', {
        topLayerId: this.drawLayerSplitState.topLayerId
      });
      return false;
    }

    // 验证原始draw层已隐藏
    const originalDrawLayer = this.layers.get('draw');
    if (originalDrawLayer && originalDrawLayer.canvas.style.display !== 'none') {
      logger.warn('状态不一致: 已拆分但原始draw层未隐藏');
      return false;
    }

    return true;
  }

  /**
   * 销毁CanvasEngine，清理所有资源
   */
  public destroy(): void {
    logger.info('🗑️ Destroying CanvasEngine...');
    
    // 清理所有固定canvas元素
    this.layers.forEach((layer, name) => {
      logger.debug(`  Removing layer: ${name}`);
      if (layer.canvas.parentNode) {
        layer.canvas.parentNode.removeChild(layer.canvas);
      }
    });
    
    // 清理所有动态canvas元素
    this.dynamicLayers.forEach((layer, layerId) => {
      logger.debug(`  Removing dynamic layer: ${layerId}`);
      if (layer.canvas.parentNode) {
        layer.canvas.parentNode.removeChild(layer.canvas);
      }
    });
    
    // 清理所有动态draw层
    this.dynamicDrawLayers.forEach((layer, layerId) => {
      logger.debug(`  Removing dynamic draw layer: ${layerId}`);
      if (layer.canvas.parentNode) {
        layer.canvas.parentNode.removeChild(layer.canvas);
      }
    });
    
    // 清理映射
    this.layers.clear();
    this.dynamicLayers.clear();
    this.dynamicDrawLayers.clear();
    
    // 清理上下文缓存
    this.contextCache.clear();
    
    logger.info('✅ CanvasEngine destroyed successfully');
  }
} 