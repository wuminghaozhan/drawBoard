import { CanvasEngine } from './core/CanvasEngine';
import { ToolManager } from './tools/ToolManager';
import { HistoryManager } from './history/HistoryManager';
import { EventManager } from './events/EventManager';
import { ShortcutManager } from './shortcuts/ShortcutManager';
import { ExportManager } from './utils/ExportManager';
import { SelectionManager } from './core/SelectionManager';
import { PerformanceManager, type PerformanceConfig, type MemoryStats } from './core/PerformanceManager';
import { ComplexityManager } from './core/ComplexityManager';
import { VirtualLayerManager, type VirtualLayer } from './core/VirtualLayerManager';
import { DrawingHandler } from './handlers/DrawingHandler';
import { CursorHandler } from './handlers/CursorHandler';
import { StateHandler, type DrawBoardState } from './handlers/StateHandler';
import { PerformanceMode } from './tools/DrawTool';
import type { ToolType } from './tools/DrawTool';
import type { DrawAction } from './tools/DrawTool';
import type { DrawEvent } from './events/EventManager';
import type { StrokeConfig } from './tools/stroke/StrokeTypes';
import type { StrokePresetType } from './tools/StrokePresets';
import { ErrorHandler, DrawBoardError, DrawBoardErrorCode, type DrawBoardErrorCode as DrawBoardErrorCodeType } from './utils/ErrorHandler';
import { LightweightResourceManager } from './utils/LightweightResourceManager';
import { logger } from './utils/Logger';

/**
 * DrawBoard 配置接口
 * 定义了画板初始化时的各种配置选项
 */
export interface DrawBoardConfig {
  /** 历史记录最大数量，默认为50 */
  maxHistorySize?: number;
  /** 是否启用快捷键，默认为true */
  enableShortcuts?: boolean;
  /** 画板背景色，默认为透明 */
  backgroundColor?: string;
  /** 是否启用触摸支持，默认为true */
  enableTouch?: boolean;
  /** 运笔效果配置 */
  strokeConfig?: Partial<StrokeConfig>;
  /** 性能配置 */
  performanceConfig?: Partial<PerformanceConfig>;
  /** 虚拟图层配置 */
  virtualLayerConfig?: {
    /** 最大图层数量，默认为50 */
    maxLayers?: number;
    /** 默认图层名称，默认为'虚拟图层' */
    defaultLayerName?: string;
    /** 是否自动创建图层，默认为true */
    autoCreateLayer?: boolean;
    /** 每个图层最大动作数，默认为1000 */
    maxActionsPerLayer?: number;
    /** 清理间隔，默认为100次操作 */
    cleanupInterval?: number;
  };
}

/**
 * DrawBoard 主类 - Canvas画板的核心控制器
 * 
 * 这是整个画板系统的门面类，负责协调各个子系统的工作：
 * - 提供统一的公共API接口
 * - 协调各个处理器和管理器
 * - 处理初始化和配置
 * - 管理生命周期
 * 
 * 重构后的架构：
 * - DrawingHandler: 处理绘制逻辑
 * - CursorHandler: 处理鼠标样式
 * - StateHandler: 处理状态管理
 * - 各种Manager: 处理具体功能模块
 * 
 * @example
 * ```typescript
 * // 基础使用
 * const drawBoard = new DrawBoard(container);
 * 
 * // 带配置的使用
 * const drawBoard = new DrawBoard(container, {
 *   maxHistorySize: 200,
 *   enableShortcuts: true,
 *   strokeConfig: {
 *     enablePressure: true,
 *     pressureSensitivity: 0.8
 *   }
 * });
 * 
 * // 设置工具和属性
 * drawBoard.setTool('pen');
 * drawBoard.setColor('#ff0000');
 * drawBoard.setLineWidth(3);
 * 
 * // 使用预设
 * drawBoard.setStrokePreset('brush');
 * ```
 */
export class DrawBoard {
  // ============================================
  // 静态单例管理
  // ============================================
  
  /** 容器到DrawBoard实例的映射，确保每个容器只有一个实例 */
  private static instances: WeakMap<HTMLElement, DrawBoard> = new WeakMap();
  
  /**
   * 获取或创建DrawBoard实例（单例模式）
   */
  public static getInstance(container: HTMLCanvasElement | HTMLDivElement, config?: Partial<DrawBoardConfig>): DrawBoard {
    const existingInstance = DrawBoard.instances.get(container);
    
    if (existingInstance) {
      // 检查实例是否仍然有效
      try {
        // 尝试访问实例属性来验证其有效性
        if (existingInstance.container && existingInstance.canvasEngine) {
          logger.debug('🔍 返回现有DrawBoard实例');
          return existingInstance;
        }
      } catch {
        logger.warn('现有实例无效，将创建新实例');
        DrawBoard.instances.delete(container);
      }
    }
    
    logger.info('🔧 Creating new DrawBoard instance for container');
    const newInstance = new DrawBoard(container, config);
    DrawBoard.instances.set(container, newInstance);
    
    return newInstance;
  }

  /**
   * 销毁指定容器的DrawBoard实例
   */
  public static destroyInstance(container: HTMLElement): boolean {
    const instance = DrawBoard.instances.get(container);
    if (instance) {
      instance.destroy();
      DrawBoard.instances.delete(container);
      logger.info('✅ DrawBoard instance destroyed and removed from registry');
      return true;
    }
    return false;
  }

  // ============================================
  // 错误处理和资源管理
  // ============================================
  
  /** 错误处理器实例 */
  private errorHandler: ErrorHandler;
  
  /** 资源管理器实例 */
  private resourceManager?: LightweightResourceManager;

  // ============================================
  // 核心管理器实例
  // ============================================
  
  /** Canvas引擎 - 管理多层Canvas的渲染和交互 */
  private canvasEngine!: CanvasEngine;
  
  /** 工具管理器 - 管理所有绘制工具的切换和状态 */
  private toolManager!: ToolManager;
  
  /** 历史记录管理器 - 管理撤销/重做功能 */
  private historyManager!: HistoryManager;
  
  /** 事件管理器 - 处理鼠标、触摸等输入事件 */
  private eventManager!: EventManager;
  
  /** 快捷键管理器 - 管理键盘快捷键 */
  private shortcutManager!: ShortcutManager;
  
  /** 导出管理器 - 处理图像导出功能 */
  private exportManager!: ExportManager;
  
  /** 选择管理器 - 管理选择区域和选中内容 */
  private selectionManager!: SelectionManager;

  /** 性能管理器 - 管理预渲染缓存和性能优化 */
  private performanceManager!: PerformanceManager;

  /** 复杂度管理器 - 管理绘制动作的复杂度评分 */
  private complexityManager!: ComplexityManager;

  /** 虚拟图层管理器 - 管理虚拟图层 */
  private virtualLayerManager!: VirtualLayerManager;

  // ============================================
  // 处理器实例
  // ============================================

  /** 绘制处理器 - 处理绘制相关逻辑 */
  private drawingHandler!: DrawingHandler;

  /** 鼠标样式处理器 - 处理鼠标样式管理 */
  private cursorHandler!: CursorHandler;

  /** 状态处理器 - 处理状态管理 */
  private stateHandler!: StateHandler;

  /** 容器元素引用 */
  private container!: HTMLElement;

  /**
   * 构造函数 - 初始化DrawBoard实例
   * 
   * @param container - Canvas容器元素，可以是HTMLCanvasElement或HTMLDivElement
   * @param config - 配置选项，包含历史记录大小、快捷键开关、运笔配置等
   */
  constructor(container: HTMLCanvasElement | HTMLDivElement, config: DrawBoardConfig = {}) {
    // 初始化错误处理
    this.errorHandler = ErrorHandler.getInstance();
    
    try {
      // 初始化核心组件
      this.initializeCoreComponents(container, config);
      
      // 初始化处理器
      this.initializeHandlers();
      
      // 绑定事件
      this.bindEvents();
      
      // 启用快捷键（如果配置允许）
      if (config.enableShortcuts !== false) {
        this.enableShortcuts();
      }
      
      logger.info('=== DrawBoard 初始化完成 ===');
      
    } catch (error) {
      logger.error('DrawBoard初始化失败:', error);
      
      // 使用错误处理系统
      const drawBoardError = DrawBoardError.fromError(
        error as Error,
        DrawBoardErrorCode.INITIALIZATION_FAILED,
        { container, config }
      );
      
      // 异步处理错误，避免在构造函数中阻塞
      this.errorHandler.handle(drawBoardError);
      
      throw new Error(`DrawBoard初始化失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }




  // ============================================
  // 初始化方法
  // ============================================

  private initializeCoreComponents(container: HTMLCanvasElement | HTMLDivElement, config: DrawBoardConfig): void {

    this.canvasEngine = new CanvasEngine(container); // Canvas引擎
    
    // 直接初始化工具管理器（无需异步）
    this.toolManager = new ToolManager(); // 工具管理器
    
    this.historyManager = new HistoryManager(); // 历史记录管理器
    this.selectionManager = new SelectionManager(); // 选择管理器
    this.performanceManager = new PerformanceManager(config.performanceConfig); // 性能管理器
    this.complexityManager = new ComplexityManager(); // 复杂度管理器
    this.virtualLayerManager = new VirtualLayerManager(config.virtualLayerConfig); // 虚拟图层管理器
    
    // 设置PerformanceManager的DrawBoard引用，用于自动触发复杂度重新计算
    this.performanceManager.setDrawBoard(this);
    
    // 设置ComplexityManager的依赖关系
    this.complexityManager.setDependencies(
      this.historyManager, 
      this.performanceManager as unknown as {
        getMemoryStats(): { cacheHitRate: number; underMemoryPressure: boolean }; 
        updateConfig(config: { complexityThreshold: number }): void; 
        stats: { totalDrawCalls: number }
      }
    );

    // VirtualLayerManager 不需要外部依赖，它是独立的
    
    // 保存容器元素引用
    this.container = container instanceof HTMLCanvasElement ? container : container;
    
    // 事件管理器绑定到交互层
    const interactionCanvas = this.canvasEngine.getLayer('interaction')?.canvas;
    
    if (!interactionCanvas) {
      logger.error('交互层canvas未找到');
      this.eventManager = new EventManager(
        container instanceof HTMLCanvasElement ? container : document.createElement('canvas')
      );
    } else {
      this.eventManager = new EventManager(interactionCanvas);
    }
    
    this.shortcutManager = new ShortcutManager();
    this.exportManager = new ExportManager(this.canvasEngine.getCanvas());

    // 配置
    if (config.maxHistorySize) {
      this.historyManager.setMaxHistorySize(config.maxHistorySize);
    }

    // 配置运笔效果
    if (config.strokeConfig) {
      this.setStrokeConfig(config.strokeConfig);
    }

    // 初始化处理器
    this.initializeHandlers();

    // 绑定事件
    this.bindEvents();

    // 启用快捷键
    if (config.enableShortcuts !== false) {
      this.enableShortcuts();
    }

    console.log('=== DrawBoard 初始化完成 ===');
  }

  private initializeHandlers(): void {
    // 首先初始化状态处理器（不依赖其他处理器）
    this.stateHandler = new StateHandler(
      this.toolManager,
      this.historyManager,
      this.selectionManager,
      this.performanceManager
    );

    // 然后初始化绘制处理器（可以安全地使用stateHandler）
    this.drawingHandler = new DrawingHandler(
      this.canvasEngine,
      this.toolManager,
      this.historyManager,
      () => this.stateHandler.emitStateChange(),
      this.virtualLayerManager
    );

    // 最后将drawingHandler设置给stateHandler
    this.stateHandler.setDrawingHandler(this.drawingHandler);

    // 初始化鼠标样式处理器 - 使用与EventManager相同的interactionCanvas
    const interactionCanvas = this.canvasEngine.getLayer('interaction')?.canvas;
    if (!interactionCanvas) {
      logger.warn('交互层canvas未找到，CursorHandler将使用容器元素');
      this.cursorHandler = new CursorHandler(this.container);
    } else {
      this.cursorHandler = new CursorHandler(this.container, interactionCanvas);
    }
  }

  /**
   * 业务事件绑定和路由
   * 🔗 业务事件绑定：将 EventManager 的标准化事件绑定到具体业务处理方法
   * 🎨 绘制流程控制：handleDrawStart/Move/End 控制绘制的生命周期
   * 🧩 模块协调：协调 ToolManager、HistoryManager、DrawingHandler 等模块
   * 📊 状态管理：通过 StateHandler 管理和通知状态变化
   * 🔧 工具调度：根据当前工具类型调用相应的绘制逻辑
  */
  private bindEvents(): void {
    this.eventManager.on('mousedown', this.handleDrawStart.bind(this));
    this.eventManager.on('mousemove', this.handleDrawMove.bind(this));
    this.eventManager.on('mouseup', this.handleDrawEnd.bind(this));
    this.eventManager.on('touchstart', this.handleDrawStart.bind(this));
    this.eventManager.on('touchmove', this.handleDrawMove.bind(this));
    this.eventManager.on('touchend', this.handleDrawEnd.bind(this));
  }



  // ============================================
  // 配置和快捷键管理
  // ============================================

  /**
   * 启用快捷键
   */
  private enableShortcuts(): void {
    if (this.shortcutManager) {
      this.shortcutManager.enable();
      
      // 注册默认快捷键
      this.registerDefaultShortcuts();
      
      // logger.debug('快捷键已启用'); // logger is not defined in this file
    }
  }

  /**
   * 注册默认快捷键
   */
  private registerDefaultShortcuts(): void {
    if (!this.shortcutManager) return;

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    logger.info(`🖥️ 注册快捷键 - 检测到操作系统: ${isMac ? 'Mac' : '其他'}`);

    // 定义快捷键配置
    const shortcutConfigs = [
      // 撤销/重做
      ...(isMac ? [
        { key: 'Meta+Z', description: '撤销', handler: () => this.undo(), priority: 10 },
        { key: 'Meta+Shift+Z', description: '重做', handler: () => this.redo(), priority: 10 }
      ] : [
        { key: 'Ctrl+Z', description: '撤销', handler: () => this.undo(), priority: 10 },
        { key: 'Ctrl+Y', description: '重做', handler: () => this.redo(), priority: 10 },
        { key: 'Ctrl+Shift+Z', description: '重做 (备用)', handler: () => this.redo(), priority: 10 }
      ]),

      // 删除
      { key: 'Delete', description: '删除选中内容', handler: () => this.deleteSelection(), priority: 9 },
      { key: 'Backspace', description: '删除选中内容', handler: () => this.deleteSelection(), priority: 9 },

      // 复制
      ...(isMac ? [
        { key: 'Meta+C', description: '复制选中内容', handler: () => this.copySelection(), priority: 8 }
      ] : [
        { key: 'Ctrl+C', description: '复制选中内容', handler: () => this.copySelection(), priority: 8 }
      ]),

      // 全选
      ...(isMac ? [
        { key: 'Meta+A', description: '全选', handler: () => this.setTool('select'), priority: 7 }
      ] : [
        { key: 'Ctrl+A', description: '全选', handler: () => this.setTool('select'), priority: 7 }
      ]),

      // 取消选择
      { key: 'Escape', description: '取消选择', handler: () => this.clearSelection(), priority: 6 },

      // 保存
      ...(isMac ? [
        { key: 'Meta+S', description: '保存为图片', handler: () => this.saveAsImage(), priority: 5 },
        { key: 'Meta+Shift+S', description: '另存为JPEG', handler: () => this.saveAsJPEG(), priority: 5 }
      ] : [
        { key: 'Ctrl+S', description: '保存为图片', handler: () => this.saveAsImage(), priority: 5 },
        { key: 'Ctrl+Shift+S', description: '另存为JPEG', handler: () => this.saveAsJPEG(), priority: 5 }
      ])
    ];

    const successCount = this.shortcutManager.registerBatch(shortcutConfigs);
    logger.info(`✅ 已注册 ${successCount} 个默认快捷键 (${isMac ? 'Mac' : 'Windows/Linux'} 模式)`);
  }

  /**
   * 设置当前工具
   */
  public async setCurrentTool(toolType: ToolType): Promise<void> {
    await this.toolManager.setCurrentTool(toolType);
  }

  // ============================================
  // 事件处理
  // ============================================

  private handleDrawStart(event: DrawEvent): void {
    this.drawingHandler.handleDrawStart(event);
    this.updateCursor();
  }

  private handleDrawMove(event: DrawEvent): void {
    this.drawingHandler.handleDrawMove(event);
    // 在绘制移动时也更新光标，提供实时反馈
    this.updateCursor();
  }

  /**
   * 处理绘制结束事件
   */
  private async handleDrawEnd(event: DrawEvent): Promise<void> {
    try {
      await this.drawingHandler.handleDrawEnd(event);
      
      // 如果当前是选择工具，同步图层数据
      if (this.toolManager.getCurrentTool() === 'select') {
        this.syncLayerDataToSelectTool();
      }
      
      this.updateCursor();
    } catch (error) {
      logger.error('绘制结束事件处理失败', error);
    }
  }

  // ============================================
  // 公共API - 工具管理
  // ============================================
  
  /**
   * 设置当前工具（异步版本，支持重量级工具）
   * @param type 工具类型
   */
  public async setTool(toolType: ToolType): Promise<void> {
    await this.toolManager.setCurrentTool(toolType);
    
    // 切换到选择工具时，同步图层数据
    if (toolType === 'select') {
      this.syncLayerDataToSelectTool();
    }
    
    // 切换到复杂工具时检查复杂度
    if (['brush', 'pen'].includes(toolType)) {
      await this.checkComplexityRecalculation();
    }
    
    this.updateCursor();
  }

  /**
   * 同步图层数据到选择工具
   */
  private syncLayerDataToSelectTool(): void {
    try {
      const currentTool = this.toolManager.getCurrentToolInstance();
      if (currentTool && currentTool.getActionType() === 'select') {
        // 获取当前所有actions
        const allActions = this.historyManager.getAllActions();
        
        // 如果启用了虚拟图层，只获取当前活动图层的actions
        let layerActions = allActions;
        if (this.virtualLayerManager) {
          const activeLayer = this.virtualLayerManager.getActiveVirtualLayer();
          if (activeLayer) {
            layerActions = allActions.filter((action: DrawAction) => 
              action.virtualLayerId === activeLayer.id
            );
          }
        }
        
        // 设置到选择工具
        const selectTool = currentTool as unknown as { setLayerActions: (actions: DrawAction[]) => void };
        selectTool.setLayerActions(layerActions);
        logger.debug(`同步${layerActions.length}个actions到选择工具`);
      }
    } catch (error) {
      logger.error('同步图层数据到选择工具失败', error);
    }
  }

  /**
   * 初始化默认工具（异步初始化常用工具）
   */
  public async initializeDefaultTools(): Promise<void> {
    // 预加载常用工具
    await this.toolManager.setCurrentTool('pen');
          logger.info('默认工具初始化完成');
  }

  /**
   * 预加载工具（后台加载，不阻塞UI）
   */
  public async preloadTool(type: ToolType): Promise<void> {
    await this.toolManager.preloadTool(type);
  }

  /**
   * 预加载多个工具
   */
  public async preloadTools(types: ToolType[]): Promise<void> {
    await this.toolManager.preloadTools(types);
  }

  /**
   * 获取工具加载状态
   */
  public getToolLoadingState(): 'idle' | 'loading' | 'ready' | 'error' {
    return this.toolManager.getLoadingState();
  }

  /**
   * 获取工具元数据
   */
  public getToolMetadata(type: ToolType) {
    return this.toolManager.getToolMetadata(type);
  }

  /**
   * 获取当前工具
   */
  public getCurrentTool(): ToolType {
    return this.toolManager.getCurrentTool();
  }
  
  /**
   * 设置颜色
   * @param color 颜色
   */
  public setColor(color: string): void {
    this.canvasEngine.setContext({ strokeStyle: color, fillStyle: color });
    // 颜色改变不需要重绘，只影响后续绘制
  }
  
  /**
   * 设置线宽
   * @param width 线宽
   */
  public setLineWidth(width: number): void {
    this.canvasEngine.setContext({ lineWidth: width });
    this.updateCursor();
    // 线宽改变不需要重绘，只影响后续绘制
  }

  // ============================================
  // 公共API - 运笔效果
  // ============================================

  /**
   * 设置运笔效果配置
   * @param config 运笔效果配置
   */
  public async setStrokeConfig(config: Partial<StrokeConfig>): Promise<void> {
    const penTool = await this.toolManager.getTool('pen');
    if (penTool && 'setStrokeConfig' in penTool) {
      (penTool as { setStrokeConfig: (config: Partial<StrokeConfig>) => void }).setStrokeConfig(config);
      // 配置改变不需要重绘，只影响后续绘制
    }
  }

  /**
   * 获取运笔效果配置
   * @returns 运笔效果配置或null
   */
  public async getStrokeConfig(): Promise<StrokeConfig | null> {
    const penTool = await this.toolManager.getTool('pen');
    if (penTool && 'getStrokeConfig' in penTool) {
      return (penTool as { getStrokeConfig: () => StrokeConfig }).getStrokeConfig();
    }
    return null;
  }

  /**
   * 设置运笔预设
   * @param preset 运笔预设
   */
  public async setStrokePreset(preset: StrokePresetType): Promise<void> {
    const penTool = await this.toolManager.getTool('pen');
    if (penTool && 'setPreset' in penTool) {
      (penTool as { setPreset: (preset: StrokePresetType) => void }).setPreset(preset);
      // 预设改变不需要重绘，只影响后续绘制
    }
  }

  /**
   * 获取当前笔刷预设
   * @returns 当前笔刷预设类型或null
   */
  public async getCurrentStrokePreset(): Promise<StrokePresetType | null> {
    const penTool = await this.toolManager.getTool('pen');
    if (penTool && 'getCurrentPreset' in penTool) {
      return (penTool as { getCurrentPreset: () => StrokePresetType | null }).getCurrentPreset();
    }
    return null;
  }

  // ============================================
  // 公共API - 历史记录管理
  // ============================================

  public async undo(): Promise<boolean> {
    console.log('🔄 开始执行撤销操作...');
    
    // 检查是否可以撤销
    const canUndo = this.canUndo();
    console.log('🔄 是否可以撤销:', canUndo);
    
    if (!canUndo) {
      console.log('❌ 无法撤销：没有可撤销的操作');
      return false;
    }
    
    // 获取当前历史记录状态
    const historyCount = this.historyManager.getHistoryCount();
    const allActions = this.historyManager.getAllActions();
    console.log('🔄 当前历史记录状态:', {
      historyCount,
      allActionsCount: allActions.length,
      canUndo: this.canUndo(),
      canRedo: this.canRedo()
    });
    
    // 执行撤销
    const action = this.historyManager.undo();
    console.log('🔄 撤销结果:', {
      action: action ? {
        id: action.id,
        type: action.type,
        points: action.points?.length || 0
      } : null
    });
    
    if (action) {
      console.log('✅ 撤销成功，开始重绘...');
      await this.drawingHandler.forceRedraw();
      console.log('✅ 重绘完成');
      return true;
    } else {
      console.log('❌ 撤销失败：没有返回action');
      return false;
    }
  }

  public async redo(): Promise<boolean> {
    console.log('🔄 开始执行重做操作...');
    
    // 检查是否可以重做
    const canRedo = this.canRedo();
    console.log('🔄 是否可以重做:', canRedo);
    
    if (!canRedo) {
      console.log('❌ 无法重做：没有可重做的操作');
      return false;
    }
    
    // 执行重做
    const action = this.historyManager.redo();
    console.log('🔄 重做结果:', {
      action: action ? {
        id: action.id,
        type: action.type,
        points: action.points?.length || 0
      } : null
    });
    
    if (action) {
      console.log('✅ 重做成功，开始重绘...');
      await this.drawingHandler.forceRedraw();
      console.log('✅ 重绘完成');
      return true;
    } else {
      console.log('❌ 重做失败：没有返回action');
      return false;
    }
  }

  public async clear(): Promise<void> {
    this.historyManager.clear();
    await this.drawingHandler.forceRedraw();
  }

  public canUndo(): boolean {
    return this.historyManager.canUndo();
  }

  public canRedo(): boolean {
    return this.historyManager.canRedo();
  }

  // ============================================
  // 公共API - 选择操作
  // ============================================

  /**
   * 清除选择
   */
  public async clearSelection(): Promise<void> {
    // 清除SelectionManager的选择
    this.selectionManager.clearSelection();
    
    // 清除SelectTool的选择
    const currentTool = this.toolManager.getCurrentToolInstance();
    if (currentTool && currentTool.getActionType() === 'select') {
      const selectTool = currentTool as unknown as { clearSelection: () => void };
      selectTool.clearSelection();
    }
    
    await this.drawingHandler.forceRedraw();
  }

  /**
   * 删除选择
   */
  public async deleteSelection(): Promise<void> {
    // 从SelectTool获取选中的actions
    let selectedActions: DrawAction[] = [];
    const currentTool = this.toolManager.getCurrentToolInstance();
    if (currentTool && currentTool.getActionType() === 'select') {
      const selectTool = currentTool as unknown as { getSelectedActions: () => DrawAction[] };
      selectedActions = selectTool.getSelectedActions();
    }
    
    // 如果没有从SelectTool获取到，则从SelectionManager获取
    if (selectedActions.length === 0 && this.selectionManager.hasSelection()) {
      selectedActions = this.selectionManager.getSelectedActions().map(item => item.action);
    }
    
    // 删除选中的actions
    if (selectedActions.length > 0) {
      selectedActions.forEach(action => {
        this.historyManager.removeActionById(action.id);
      });
      
      // 清除选择状态
      this.selectionManager.clearSelection();
      if (currentTool && currentTool.getActionType() === 'select') {
        const selectTool = currentTool as unknown as { clearSelection: () => void };
        selectTool.clearSelection();
      }
      
      await this.drawingHandler.forceRedraw();
    }
  }

  /**
   * 复制选择
   */
  public copySelection(): DrawAction[] {
    // 优先从SelectTool获取
    const currentTool = this.toolManager.getCurrentToolInstance();
    if (currentTool && currentTool.getActionType() === 'select') {
      const selectTool = currentTool as unknown as { copySelectedActions: () => DrawAction[] };
      return selectTool.copySelectedActions();
    }
    
    // 从SelectionManager获取
    if (this.selectionManager.hasSelection()) {
      return this.selectionManager.copySelectedActions();
    }
    
    return [];
  }

  /**
   * 是否有选择
   */
  public hasSelection(): boolean {
    // 检查SelectTool
    const currentTool = this.toolManager.getCurrentToolInstance();
    if (currentTool && currentTool.getActionType() === 'select') {
      const selectTool = currentTool as unknown as { getSelectedActions: () => DrawAction[] };
      const selectedActions = selectTool.getSelectedActions();
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
    if (currentTool && currentTool.getActionType() === 'select') {
      const selectTool = currentTool as unknown as { getSelectedActions: () => DrawAction[] };
      return selectTool.getSelectedActions();
    }
    
    // 从SelectionManager获取
    return this.selectionManager.getSelectedActions().map(item => item.action);
  }

  // ============================================
  // 公共API - 鼠标样式
  // ============================================

  /**
   * 设置鼠标样式
   * @param cursor 鼠标样式
   */
  public setCursor(cursor: string): void {
    this.cursorHandler.setCursor(cursor);
  }

  /**
   * 更新鼠标样式
   */
  private updateCursor(): void {
    const currentTool = this.toolManager.getCurrentTool();
    const lineWidth = this.canvasEngine.getContext().lineWidth;
    
    // 获取真实的绘制状态
    const isDrawing = this.drawingHandler.getIsDrawing();
    
    this.cursorHandler.updateCursor(currentTool, isDrawing, lineWidth);
  }

  // ============================================
  // 公共API - 状态管理
  // ============================================

  /**
   * 获取状态
   */
  public getState(): DrawBoardState {
    return this.stateHandler.getState();
  }

  /**
   * 监听状态变化
   */
  public onStateChange(callback: (state: DrawBoardState) => void): () => void {
    return this.stateHandler.onStateChange(callback);
  }

  // ============================================
  // 公共API - 布局和显示
  // ============================================
  
  /**
   * 调整画布大小
   */
  public async resize(): Promise<void> {
    this.canvasEngine.resize();
    await this.drawingHandler.forceRedraw();
  }

  /**
   * 显示网格
   */
  public showGrid(show: boolean = true, gridSize: number = 20): void {
    if (show) {
      this.canvasEngine.drawGrid(gridSize);
    } else {
      this.canvasEngine.clear('background');
    }
  }

  /**
   * 设置图层可见性
   */
  public setLayerVisible(layerName: string, visible: boolean): void {
    this.canvasEngine.setLayerVisible(layerName, visible);
  }

  /**
   * 获取图层上下文
   */
  public getLayerContext(layerName: string): CanvasRenderingContext2D | null {
    const layer = this.canvasEngine.getLayer(layerName);
    return layer?.ctx || null;
  }

  // ============================================
  // 公共API - 导出功能
  // ============================================

  public saveAsImage(filename?: string): void {
    this.exportManager.saveAsImage(filename);
  }

  public saveAsJPEG(filename?: string, quality?: number): void {
    this.exportManager.saveAsJPEG(filename, quality);
  }

  public copyToClipboard(): Promise<boolean> {
    return this.exportManager.copyToClipboard();
  }

  public getDataURL(type?: string, quality?: number): string {
    return this.exportManager.getDataURL(type, quality);
  }

  // ============================================
  // 公共API - 性能管理
  // ============================================

  public async setPerformanceMode(mode: PerformanceMode): Promise<void> {
    this.performanceManager.setPerformanceMode(mode);
    // 性能模式改变可能影响缓存，需要重绘历史
    await this.drawingHandler.forceRedraw();
  }

  public updatePerformanceConfig(config: Partial<PerformanceConfig>): void {
    this.performanceManager.updateConfig(config);
  }

  public getPerformanceStats(): MemoryStats {
    return this.performanceManager.getMemoryStats();
  }

  public async clearPerformanceCache(): Promise<void> {
    this.performanceManager.clearAllCaches();
    // 清除缓存后需要重绘历史
    await this.drawingHandler.forceRedraw();
  }

  public async recalculateComplexity(): Promise<void> {
    // 委托给复杂度管理器
    this.complexityManager.recalculateAllComplexities();
    
    // 强制重绘以应用新的复杂度评估
    await this.drawingHandler.forceRedraw();
  }

  public async setForceRealTimeRender(enabled: boolean = true): Promise<void> {
    // 设置强制实时渲染模式
    if (this.performanceManager) {
      // 可以通过performanceManager设置强制实时渲染
      this.performanceManager.setForceRealTimeRender(enabled);
    }
    
    // 如果启用强制实时渲染，立即重绘
    if (enabled) {
      await this.drawingHandler.forceRedraw();
    }
  }

  // ============================================
  // 公共API - 其他工具函数
  // ============================================

  /**
   * 获取历史记录
   */
  public getHistory(): DrawAction[] {
    return this.historyManager.getHistory();
  }

  /**
   * 获取工具名称列表
   */
  public getToolNames(): Array<{ type: ToolType; name: string }> {
    return this.toolManager.getToolNames();
  }

  /**
   * 获取快捷键列表
   */
  public getShortcuts(): Array<{ key: string; description: string }> {
    return this.shortcutManager.getShortcuts().map(s => ({
      key: s.key,
      description: s.description
    }));
  }

  /**
   * 获取工具管理器实例
   */
  public getToolManager(): ToolManager {
    return this.toolManager;
  }

  /**
   * 获取快捷键管理器实例
   */
  public getShortcutManager(): ShortcutManager {
    return this.shortcutManager;
  }

  /**
   * 获取历史管理器实例
   */
  public getHistoryManager(): HistoryManager {
    return this.historyManager;
  }

  /**
   * 获取复杂度管理器实例
   */
  public getComplexityManager(): ComplexityManager {
    return this.complexityManager;
  }

  // ============================================
  // 复杂度管理
  // ============================================
  /**
   * 获取复杂度统计信息
   */
  public getComplexityStats(): import('./core/ComplexityManager').ComplexityStats {
    return this.complexityManager.getStats();
  }

  /**
   * 更新复杂度配置
   */
  public updateComplexityConfig(config: Partial<import('./core/ComplexityManager').ComplexityConfig>): void {
    this.complexityManager.updateConfig(config);
  }

  /**
   * 清除复杂度缓存
   */
  public clearComplexityCache(): void {
    this.complexityManager.clearCache();
  }

  // ============================================
  // 虚拟图层管理
  // ============================================

  /**
   * 创建虚拟图层
   */
  public createVirtualLayer(name?: string): VirtualLayer {
    return this.virtualLayerManager.createVirtualLayer(name);
  }

  /**
   * 删除虚拟图层
   */
  public deleteVirtualLayer(layerId: string): boolean {
    return this.virtualLayerManager.deleteVirtualLayer(layerId);
  }

  /**
   * 设置活动虚拟图层
   */
  public setActiveVirtualLayer(layerId: string): boolean {
    const success = this.virtualLayerManager.setActiveVirtualLayer(layerId);
    
    // 如果当前是选择工具，同步新图层的数据
    if (success && this.toolManager.getCurrentTool() === 'select') {
      this.syncLayerDataToSelectTool();
    }
    
    return success;
  }

  /**
   * 获取活动虚拟图层
   */
  public getActiveVirtualLayer(): VirtualLayer | null {
    return this.virtualLayerManager.getActiveVirtualLayer();
  }

  /**
   * 获取指定虚拟图层
   */
  public getVirtualLayer(layerId: string): VirtualLayer | null {
    return this.virtualLayerManager.getVirtualLayer(layerId);
  }

  /**
   * 获取所有虚拟图层
   */
  public getAllVirtualLayers(): VirtualLayer[] {
    return this.virtualLayerManager.getAllVirtualLayers();
  }

  /**
   * 设置虚拟图层可见性
   */
  public setVirtualLayerVisible(layerId: string, visible: boolean): boolean {
    const success = this.virtualLayerManager.setVirtualLayerVisible(layerId, visible);
    
    // 如果当前是选择工具，同步图层数据
    if (success && this.toolManager.getCurrentTool() === 'select') {
      this.syncLayerDataToSelectTool();
    }
    
    return success;
  }

  /**
   * 设置虚拟图层透明度
   */
  public setVirtualLayerOpacity(layerId: string, opacity: number): boolean {
    return this.virtualLayerManager.setVirtualLayerOpacity(layerId, opacity);
  }

  /**
   * 设置虚拟图层锁定状态
   */
  public setVirtualLayerLocked(layerId: string, locked: boolean): boolean {
    return this.virtualLayerManager.setVirtualLayerLocked(layerId, locked);
  }

  /**
   * 重命名虚拟图层
   */
  public renameVirtualLayer(layerId: string, newName: string): boolean {
    return this.virtualLayerManager.renameVirtualLayer(layerId, newName);
  }

  /**
   * 获取虚拟图层统计信息
   */
  public getVirtualLayerStats() {
    return this.virtualLayerManager.getVirtualLayerStats();
  }

  // ============================================
  // 错误处理和资源管理API
  // ============================================

  /**
   * 获取错误统计信息
   */
  public getErrorStats() {
    return this.errorHandler.getErrorStats();
  }

  /**
   * 获取错误历史
   */
  public getErrorHistory() {
    return this.errorHandler.getErrorHistory();
  }

  /**
   * 清空错误历史
   */
  public clearErrorHistory(): void {
    this.errorHandler.clearErrorHistory();
  }

  /**
   * 订阅错误事件
   */
  public onError(code: DrawBoardErrorCodeType, callback: (error: DrawBoardError) => void): () => void {
    return this.errorHandler.onError(code, callback);
  }

  /**
   * 获取资源统计信息
   */
  public getResourceStats() {
    if (!this.resourceManager) {
      return { total: 0, hasResources: false };
    }
    return {
      total: this.resourceManager.getResourceCount(),
      hasResources: this.resourceManager.hasResources()
    };
  }

  /**
   * 检查资源泄漏
   */
  public checkResourceLeaks() {
    if (!this.resourceManager) {
      return { hasLeaks: false, leakedResources: [], recommendations: [] };
    }
    const hasResources = this.resourceManager.hasResources();
    return {
      hasLeaks: hasResources,
      leakedResources: hasResources ? ['DrawBoard resources'] : [],
      recommendations: hasResources ? ['建议调用destroy()方法清理资源'] : []
    };
  }

  /**
   * 清理已销毁的资源
   */
  public cleanupDestroyedResources(): void {
    // 轻量级资源管理器不需要手动清理
    logger.info('轻量级资源管理器无需手动清理');
  }

  // ============================================
  // 生命周期管理
  // ============================================

  /**
   * 销毁DrawBoard实例
   */
  public async destroy(): Promise<void> {
    try {
      // 从静态单例映射中移除实例
      if (this.container) {
        DrawBoard.instances.delete(this.container);
        logger.info('✅ DrawBoard instance removed from static registry');
      }
      
      // 销毁所有资源
      if (this.resourceManager) {
        await this.resourceManager.destroy();
      }
      
      // 清理容器引用
      this.container = null as unknown as HTMLElement;
      
      logger.info('✅ DrawBoard销毁完成');
      
    } catch (error) {
      logger.error('DrawBoard销毁失败:', error);
      
      // 使用错误处理系统
      const drawBoardError = DrawBoardError.fromError(
        error as Error,
        DrawBoardErrorCode.RESOURCE_DESTROY_FAILED,
        { container: this.container }
      );
      
      await this.errorHandler.handle(drawBoardError);
    }
  }





  // ============================================
  // 复杂度自动管理
  // ============================================

  /**
   * 检查是否需要重新计算复杂度
   */
  private async checkComplexityRecalculation(): Promise<void> {
    // 委托给复杂度管理器检查
    if (this.complexityManager.shouldRecalculate()) {
      await this.recalculateComplexity();
    }
  }

  /**
   * 获取选择功能调试信息
   */
  public getSelectionDebugInfo(): {
    currentTool: ToolType;
    hasSelection: boolean;
    selectedActionsCount: number;
    selectionManagerHasSelection: boolean;
    selectToolDebugInfo?: {
      allActionsCount: number;
      selectedActionsCount: number;
      isTransformMode: boolean;
      isSelecting: boolean;
      isDraggingAnchor: boolean;
      anchorPointsCount: number;
      boundsCacheSize: number;
    };
  } {
    const currentTool = this.toolManager.getCurrentTool();
    const hasSelection = this.hasSelection();
    const selectedActions = this.getSelectedActions();
    
    let selectToolDebugInfo: {
      allActionsCount: number;
      selectedActionsCount: number;
      isTransformMode: boolean;
      isSelecting: boolean;
      isDraggingAnchor: boolean;
      anchorPointsCount: number;
      boundsCacheSize: number;
    } | undefined = undefined;
    
    const currentToolInstance = this.toolManager.getCurrentToolInstance();
    if (currentToolInstance && currentToolInstance.getActionType() === 'select') {
      const selectTool = currentToolInstance as unknown as { 
        getDebugInfo: () => {
          allActionsCount: number;
          selectedActionsCount: number;
          isTransformMode: boolean;
          isSelecting: boolean;
          isDraggingAnchor: boolean;
          anchorPointsCount: number;
          boundsCacheSize: number;
        }
      };
      selectToolDebugInfo = selectTool.getDebugInfo();
    }
    
    return {
      currentTool,
      hasSelection,
      selectedActionsCount: selectedActions.length,
      selectionManagerHasSelection: this.selectionManager.hasSelection(),
      selectToolDebugInfo
    };
  }

  /**
   * 强制同步选择工具数据
   */
  public forceSyncSelectToolData(): void {
    this.syncLayerDataToSelectTool();
    
    // 强制更新选择工具状态
    const currentTool = this.toolManager.getCurrentToolInstance();
    if (currentTool && currentTool.getActionType() === 'select') {
      const selectTool = currentTool as unknown as { forceUpdate: () => void };
      selectTool.forceUpdate();
    }
    
    logger.debug('强制同步选择工具数据完成', this.getSelectionDebugInfo());
  }
} 