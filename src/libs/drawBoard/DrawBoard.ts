import { CanvasEngine } from './core/CanvasEngine';
import { ToolManager } from './tools/ToolManager';
import { HistoryManager } from './history/HistoryManager';
import { EventManager } from './events/EventManager';
import { ShortcutManager } from './shortcuts/ShortcutManager';
import { ExportManager } from './utils/ExportManager';
import { SelectionManager } from './core/SelectionManager';
import { PerformanceManager, type PerformanceConfig, type MemoryStats } from './core/PerformanceManager';
import { ComplexityManager } from './core/ComplexityManager';
import { VirtualLayerManager, type VirtualLayer, type VirtualLayerMode, type VirtualLayerConfig } from './core/VirtualLayerManager';
import { DrawingHandler } from './handlers/DrawingHandler';
import { CursorHandler } from './handlers/CursorHandler';
import { StateHandler, type DrawBoardState } from './handlers/StateHandler';
import { PerformanceMode } from './tools/DrawTool';
import type { ToolType } from './tools/DrawTool';
import type { DrawAction } from './tools/DrawTool';
import type { DrawEvent } from './events/EventManager';
import type { StrokeConfig } from './tools/stroke/StrokeTypes';
import type { StrokePresetType } from './tools/StrokePresets';
import { ToolTypeGuards } from './tools/ToolInterfaces';
import { ErrorHandler, DrawBoardError, DrawBoardErrorCode, type DrawBoardErrorCode as DrawBoardErrorCodeType } from './utils/ErrorHandler';
import { LightweightResourceManager } from './utils/LightweightResourceManager';
import { logger } from './utils/Logger';

// API 模块
import { DrawBoardVirtualLayerAPI } from './api/DrawBoardVirtualLayerAPI';
import { DrawBoardSelectionAPI } from './api/DrawBoardSelectionAPI';
import { DrawBoardToolAPI } from './api/DrawBoardToolAPI';
import { DrawBoardHistoryAPI } from './api/DrawBoardHistoryAPI';

// 函数式编程模块
import { 
  validateAndCleanConfig, 
  calculateHistoryStats, 
  processStrokeData,
  createStateSnapshot,
  hasStateChanged,
  pipe,
  memoize
} from './functional';

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
    /** 虚拟图层模式，默认为单图层对应单个动作 */
    mode?: VirtualLayerMode;
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

  // ============================================
  // API 模块实例
  // ============================================
  
  /** 虚拟图层 API */
  private virtualLayerAPI!: DrawBoardVirtualLayerAPI;
  
  /** 选择操作 API */
  private selectionAPI!: DrawBoardSelectionAPI;
  
  /** 工具管理 API */
  private toolAPI!: DrawBoardToolAPI;
  
  /** 历史记录 API */
  private historyAPI!: DrawBoardHistoryAPI;

  /** 同步图层数据标志位 - 防止重复调用 syncLayerDataToSelectTool */
  private isSyncingLayerData: boolean = false;

  /**
   * 构造函数 - 初始化DrawBoard实例
   * 
   * @param container - Canvas容器元素，可以是HTMLCanvasElement或HTMLDivElement
   * @param config - 配置选项，包含历史记录大小、快捷键开关、运笔配置等
   */
  constructor(container: HTMLCanvasElement | HTMLDivElement, config: DrawBoardConfig = {}) {
    // 使用函数式配置验证和清理
    const { config: validatedConfig, validation } = validateAndCleanConfig(config);
    
    if (!validation.isValid) {
      logger.warn('配置验证失败，使用默认配置', validation.errors);
    }
    
    if (validation.warnings.length > 0) {
      logger.warn('配置警告', validation.warnings);
    }
    // 初始化错误处理
    this.errorHandler = ErrorHandler.getInstance();
    
    try {
      // 初始化核心组件（使用验证后的配置）
      this.initializeCoreComponents(container, validatedConfig);
      
      // 初始化处理器
      this.initializeHandlers();
      
      // 初始化 API 模块（需要在 handlers 初始化之后）
      this.initializeAPIModules();
      
      // 绑定事件
      this.bindEvents();
      
      // 启用快捷键（如果配置允许）
      if (validatedConfig.enableShortcuts !== false) {
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
    this.virtualLayerManager = new VirtualLayerManager(config.virtualLayerConfig, this.canvasEngine); // 虚拟图层管理器
    
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

    // 设置VirtualLayerManager的HistoryManager引用（用于获取动作数据）
    this.virtualLayerManager.setHistoryManager(this.historyManager);
    
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
      logger.info('EventManager 绑定到 interaction canvas', {
        canvas: interactionCanvas,
        width: interactionCanvas.width,
        height: interactionCanvas.height,
        offsetWidth: interactionCanvas.offsetWidth,
        offsetHeight: interactionCanvas.offsetHeight,
        pointerEvents: getComputedStyle(interactionCanvas).pointerEvents,
        zIndex: getComputedStyle(interactionCanvas).zIndex,
        display: getComputedStyle(interactionCanvas).display,
        visibility: getComputedStyle(interactionCanvas).visibility,
        opacity: getComputedStyle(interactionCanvas).opacity
      });
      
      // 验证interaction canvas是否可见且可交互
      const computedStyle = getComputedStyle(interactionCanvas);
      if (computedStyle.pointerEvents !== 'auto') {
        logger.warn('⚠️ Interaction canvas的pointer-events不是auto，可能无法接收事件！', {
          pointerEvents: computedStyle.pointerEvents
        });
      }
      if (computedStyle.display === 'none') {
        logger.warn('⚠️ Interaction canvas的display是none，可能无法接收事件！');
      }
      if (computedStyle.visibility === 'hidden') {
        logger.warn('⚠️ Interaction canvas的visibility是hidden，可能无法接收事件！');
      }
      
      this.eventManager = new EventManager(interactionCanvas);
      logger.info('✅ EventManager 已创建并绑定到 interaction canvas');
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

    // 注意：initializeHandlers() 和 bindEvents() 在构造函数中调用
    // 这里不再重复调用，避免重复初始化和事件绑定
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
   * 初始化 API 模块
   * 在 handlers 初始化之后调用，确保所有依赖都已就绪
   */
  private initializeAPIModules(): void {
    // 初始化虚拟图层 API
    this.virtualLayerAPI = new DrawBoardVirtualLayerAPI(
      this.virtualLayerManager,
      this.drawingHandler,
      this.toolManager,
      this.canvasEngine,
      (preserveSelection?: boolean) => this.syncLayerDataToSelectTool(preserveSelection)
    );

    // 初始化选择操作 API
    this.selectionAPI = new DrawBoardSelectionAPI(
      this.toolManager,
      this.historyManager,
      this.selectionManager,
      this.virtualLayerManager,
      this.drawingHandler,
      this.canvasEngine
    );

    // 初始化工具管理 API
    this.toolAPI = new DrawBoardToolAPI(
      this.toolManager,
      this.canvasEngine,
      this.complexityManager,
      () => this.syncLayerDataToSelectTool(),
      () => this.checkComplexityRecalculation(),
      () => this.updateCursor(),
      () => this.drawingHandler.forceRedraw(),
      () => this.drawingHandler.markNeedsClearSelectionUI()
    );

    // 初始化历史记录 API
    this.historyAPI = new DrawBoardHistoryAPI(
      this.historyManager,
      this.drawingHandler
    );

    logger.debug('API 模块初始化完成');
  }

  /**
   * 业务事件绑定和路由
   * 🔗 业务事件绑定：将 EventManager 的标准化事件绑定到具体业务处理方法
   * 🎨 绘制流程控制：handleDrawStart/Move/End 控制绘制的生命周期
   * 🧩 模块协调：协调 ToolManager、HistoryManager、DrawingHandler 等模块
   * 📊 状态管理：通过 StateHandler 管理和通知状态变化
   * 🔧 工具调度：根据当前工具类型调用相应的绘制逻辑
  */
  // 保存绑定后的函数引用，以便后续解绑
  private boundEventHandlers = {
    handleDrawStart: (event: DrawEvent) => this.handleDrawStart(event),
    handleDrawMove: (event: DrawEvent) => this.handleDrawMove(event),
    handleDrawEnd: (event: DrawEvent) => this.handleDrawEnd(event),
  };

  private bindEvents(): void {
    logger.info('DrawBoard.bindEvents: 开始绑定事件', {
      hasEventManager: !!this.eventManager,
      hasHandlers: {
        handleDrawStart: !!this.boundEventHandlers.handleDrawStart,
        handleDrawMove: !!this.boundEventHandlers.handleDrawMove,
        handleDrawEnd: !!this.boundEventHandlers.handleDrawEnd
      }
    });
    
    this.eventManager.on('mousedown', this.boundEventHandlers.handleDrawStart);
    this.eventManager.on('mousemove', this.boundEventHandlers.handleDrawMove);
    this.eventManager.on('mouseup', this.boundEventHandlers.handleDrawEnd);
    this.eventManager.on('touchstart', this.boundEventHandlers.handleDrawStart);
    this.eventManager.on('touchmove', this.boundEventHandlers.handleDrawMove);
    this.eventManager.on('touchend', this.boundEventHandlers.handleDrawEnd);
    
    // 验证事件绑定
    const eventManagerInternal = this.eventManager as unknown as { handlers?: Map<string, Array<unknown>> };
    const mousedownHandlers = eventManagerInternal.handlers?.get('mousedown');
    logger.info('DrawBoard.bindEvents: 事件绑定完成', {
      mousedownHandlersCount: mousedownHandlers?.length || 0,
      allEventTypes: Array.from(eventManagerInternal.handlers?.keys() || []),
      totalHandlers: Array.from(eventManagerInternal.handlers?.values() || []).reduce((sum: number, h: Array<unknown>) => sum + h.length, 0)
    });
  }

  /**
   * 解绑事件处理器
   */
  private unbindEvents(): void {
    if (this.eventManager) {
      this.eventManager.off('mousedown', this.boundEventHandlers.handleDrawStart);
      this.eventManager.off('mousemove', this.boundEventHandlers.handleDrawMove);
      this.eventManager.off('mouseup', this.boundEventHandlers.handleDrawEnd);
      this.eventManager.off('touchstart', this.boundEventHandlers.handleDrawStart);
      this.eventManager.off('touchmove', this.boundEventHandlers.handleDrawMove);
      this.eventManager.off('touchend', this.boundEventHandlers.handleDrawEnd);
    }
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

      // 复制/剪切/粘贴
      ...(isMac ? [
        { key: 'Meta+C', description: '复制选中内容', handler: () => this.copySelection(), priority: 8 },
        { key: 'Meta+X', description: '剪切选中内容', handler: () => this.cutSelection(), priority: 8 },
        { key: 'Meta+V', description: '粘贴', handler: () => this.pasteSelection(), priority: 8 }
      ] : [
        { key: 'Ctrl+C', description: '复制选中内容', handler: () => this.copySelection(), priority: 8 },
        { key: 'Ctrl+X', description: '剪切选中内容', handler: () => this.cutSelection(), priority: 8 },
        { key: 'Ctrl+V', description: '粘贴', handler: () => this.pasteSelection(), priority: 8 }
      ]),

      // 全选
      ...(isMac ? [
        { key: 'Meta+A', description: '全选', handler: () => this.selectAll(), priority: 7 }
      ] : [
        { key: 'Ctrl+A', description: '全选', handler: () => this.selectAll(), priority: 7 }
      ]),

      // 取消选择 / 取消拖拽
      { 
        key: 'Escape', 
        description: '取消选择/取消拖拽', 
        handler: () => {
          // 如果正在拖拽，取消拖拽；否则取消选择
          const currentTool = this.toolManager.getCurrentToolInstance();
          if (currentTool && ToolTypeGuards.isSelectTool(currentTool)) {
            if (currentTool.cancelDrag) {
              const wasDragging = currentTool.cancelDrag();
              if (wasDragging === true) {
                // 如果取消了拖拽，触发重绘
                this.drawingHandler.forceRedraw().catch(error => {
                  logger.error('重绘失败', error);
                });
                return;
              }
            }
          }
          // 否则取消选择
          this.clearSelection();
        }, 
        priority: 6 
      },

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

  private async handleDrawStart(event: DrawEvent): Promise<void> {
    logger.info('handleDrawStart 被调用', {
      tool: this.toolManager.getCurrentTool(),
      point: event.point
    });
    
    // 如果是选择工具，直接处理选择逻辑，不通过DrawingHandler
    if (this.toolManager.getCurrentTool() === 'select') {
      logger.info('检测到选择工具，开始处理');
      const currentTool = this.toolManager.getCurrentToolInstance();
      if (currentTool && ToolTypeGuards.isSelectTool(currentTool)) {
        logger.info('选择工具实例获取成功');
        
        // 注意：不要在handleMouseDown之前调用syncLayerDataToSelectTool
        // 因为syncLayerDataToSelectTool可能会清空选择（如果shouldClearSelection为true）
        // 先让handleMouseDown处理选择，然后再同步图层数据
        
        logger.info('调用 selectTool.handleMouseDown', { point: event.point });
        const result = currentTool.handleMouseDown(event.point);
        logger.info('selectTool.handleMouseDown 返回', { 
          result,
          selectedActionsCount: currentTool.getSelectedActions().length,
          selectedActionIds: currentTool.getSelectedActions().map(a => a.id)
        });
        
        // 重要：先同步图层数据（划分图层），然后再触发重绘（绘制选区和锚点）
        // 这样可以确保图层划分完成后再绘制，避免绘制时图层未划分的问题
        const mode = this.virtualLayerManager?.getMode();
        if (mode === 'individual') {
          const selectedActions = currentTool.getSelectedActions();
          if (selectedActions.length > 0) {
            logger.info('individual模式：选中了actions，先同步图层数据以触发图层拆分', {
              selectedActionsCount: selectedActions.length,
              selectedActionIds: selectedActions.map(a => a.id)
            });
            // 先同步图层数据，划分图层，保留选择
            // 同步完成后，会在图层划分完成后自动触发重绘
            this.syncLayerDataToSelectTool(true); // 使用preserveSelection=true保留选择
          } else {
            // 如果没有选中的actions，也需要同步图层数据（但不会触发图层拆分）
            this.syncLayerDataToSelectTool(false);
            // 没有选择时，也需要触发重绘以清除之前的选区和锚点
            this.drawingHandler.forceRedraw().catch(error => {
              logger.error('重绘失败', error);
            });
          }
        } else {
          // grouped模式：也需要同步图层数据（但不触发图层拆分）
          this.syncLayerDataToSelectTool(false);
          // grouped模式下，也需要触发重绘以显示选择框或锚点
          this.drawingHandler.forceRedraw().catch(error => {
            logger.error('重绘失败', error);
          });
        }
        
        this.updateCursor();
        return;
      } else {
        logger.warn('选择工具实例获取失败或类型不匹配', {
          currentTool: currentTool ? currentTool.getActionType() : 'null',
          expectedType: 'select'
        });
      }
    }
    
    // 其他工具走正常的绘制流程
    this.drawingHandler.handleDrawStart(event);
    this.updateCursor();
  }

  // 选择工具重绘节流
  private lastSelectToolRedrawTime: number = 0;
  private readonly SELECT_TOOL_REDRAW_INTERVAL = 16; // 约60fps

  private handleDrawMove(event: DrawEvent): void {
    // 如果是选择工具，直接处理选择逻辑
    if (this.toolManager.getCurrentTool() === 'select') {
      const currentTool = this.toolManager.getCurrentToolInstance();
      if (currentTool && ToolTypeGuards.isSelectTool(currentTool)) {
        // 注意：不要在 mousemove 时同步数据，这会导致选择被清空
        // 数据同步只在工具切换或图层切换时进行
        
        // 更新悬停锚点（用于光标更新和hover状态显示）
        let hoverChanged = false;
        if (currentTool.updateHoverAnchor) {
          const result = currentTool.updateHoverAnchor(event.point);
          hoverChanged = result === true; // 如果返回true，表示hover状态变化
        }
        
        const updatedActions = currentTool.handleMouseMove(event.point);
        
        // 节流重绘（避免过于频繁的重绘）
        const now = Date.now();
        if (now - this.lastSelectToolRedrawTime >= this.SELECT_TOOL_REDRAW_INTERVAL) {
          // 如果hover状态变化或拖拽中，都需要重绘
          // 注意：在拖拽过程中，不要更新HistoryManager，只在mouseUp时更新
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
        return;
      }
    }
    
    // 其他工具走正常的绘制流程
    this.drawingHandler.handleDrawMove(event);
    // 在绘制移动时也更新光标，提供实时反馈
    this.updateCursor();
  }

  /**
   * 处理绘制结束事件
   */
  private async handleDrawEnd(event: DrawEvent): Promise<void> {
    try {
      // 如果是选择工具，先处理选择工具的鼠标抬起事件
      if (this.toolManager.getCurrentTool() === 'select') {
        const currentTool = this.toolManager.getCurrentToolInstance();
        if (currentTool && ToolTypeGuards.isSelectTool(currentTool)) {
          const updatedActions = currentTool.handleMouseUp();
          
          // 如果返回了更新后的actions，更新HistoryManager和标记图层缓存过期
          if (updatedActions) {
            await this.handleUpdatedActions(updatedActions);
          }
        }
      }
      
      // 如果是选择工具，跳过DrawingHandler的handleDrawEnd（因为选择工具不创建DrawAction）
      if (this.toolManager.getCurrentTool() !== 'select') {
        await this.drawingHandler.handleDrawEnd(event);
      }
      
      // 如果当前是选择工具，同步图层数据并触发重绘
      if (this.toolManager.getCurrentTool() === 'select') {
        // 重要：在 individual 模式下，必须传 preserveSelection=true 以保留选择
        // 否则 syncLayerDataToSelectTool 会因为 hasActionsFromOtherLayer=true 而清空选择
        const mode = this.virtualLayerManager?.getMode();
        const preserveSelection = mode === 'individual';
        
        // 获取当前选择状态用于日志
        const currentTool = this.toolManager.getCurrentToolInstance();
        const selectedActionsBeforeSync = currentTool && ToolTypeGuards.isSelectTool(currentTool) 
          ? currentTool.getSelectedActions() 
          : [];
        
        logger.info('handleDrawEnd: 同步图层数据', {
          mode,
          preserveSelection,
          selectedActionsCountBeforeSync: selectedActionsBeforeSync.length,
          selectedActionIdsBeforeSync: selectedActionsBeforeSync.map(a => a.id)
        });
        
        this.syncLayerDataToSelectTool(preserveSelection);
        
        // 获取同步后的选择状态
        const selectedActionsAfterSync = currentTool && ToolTypeGuards.isSelectTool(currentTool) 
          ? currentTool.getSelectedActions() 
          : [];
        
        logger.info('handleDrawEnd: 同步完成，准备重绘', {
          selectedActionsCountAfterSync: selectedActionsAfterSync.length,
          selectedActionIdsAfterSync: selectedActionsAfterSync.map(a => a.id),
          selectionPreserved: selectedActionsBeforeSync.length === selectedActionsAfterSync.length
        });
        
        await this.drawingHandler.forceRedraw();
      }
      
      this.updateCursor();
    } catch (error) {
      logger.error('绘制结束事件处理失败', error);
    }
  }

  /**
   * 处理更新后的actions（拖拽锚点、变换等）
   */
  private async handleUpdatedActions(updatedActions: DrawAction | DrawAction[]): Promise<void> {
    try {
      const actions = Array.isArray(updatedActions) ? updatedActions : [updatedActions];
      
      // 更新HistoryManager
      for (const action of actions) {
        this.historyManager.updateAction(action);
        
        // 标记图层缓存过期
        if (action.virtualLayerId && this.virtualLayerManager) {
          this.virtualLayerManager.markLayerCacheDirty(action.virtualLayerId);
        }
      }
      
      // 触发重绘
      await this.drawingHandler.forceRedraw();
      
      logger.debug(`处理${actions.length}个更新后的actions`);
    } catch (error) {
      logger.error('处理更新后的actions失败', error);
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
    logger.info('DrawBoard.setTool: 切换工具', {
      toolType,
      currentTool: this.toolManager.getCurrentTool(),
      hasEventManager: !!this.eventManager
    });
    
    // 如果切换到select工具，先清理之前的绘制状态
    if (toolType === 'select') {
      // 清理DrawingHandler的绘制状态，避免isDrawing标志导致的问题
      if (this.drawingHandler && 'resetDrawingState' in this.drawingHandler) {
        (this.drawingHandler as { resetDrawingState: () => void }).resetDrawingState();
        logger.info('DrawBoard.setTool: 已清理DrawingHandler的绘制状态');
      }
      
      // 验证事件管理器状态
      if (this.eventManager) {
        const interactionLayer = this.canvasEngine.getLayer('interaction');
        if (interactionLayer) {
          logger.info('DrawBoard.setTool: 验证事件管理器绑定', {
            eventManagerExists: !!this.eventManager,
            interactionCanvas: interactionLayer.canvas,
            canvasWidth: interactionLayer.canvas.width,
            canvasHeight: interactionLayer.canvas.height,
            pointerEvents: getComputedStyle(interactionLayer.canvas).pointerEvents,
            zIndex: getComputedStyle(interactionLayer.canvas).zIndex
          });
        } else {
          logger.error('❌ DrawBoard.setTool: 无法获取interaction层！');
        }
      } else {
        logger.error('❌ DrawBoard.setTool: EventManager不存在！');
      }
    }
    
    const result = await this.toolAPI.setTool(toolType);
    
    // 确保鼠标样式正确更新
    this.updateCursor();
    
    logger.info('DrawBoard.setTool: 工具切换完成', {
      toolType,
      newTool: this.toolManager?.getCurrentTool(),
      toolInstance: !!this.toolManager?.getCurrentToolInstance()
    });
    
    return result;
  }

  /**
   * 同步图层数据到选择工具
   * @param preserveSelection 是否保留选择（individual模式下使用）
   */
  private syncLayerDataToSelectTool(preserveSelection: boolean = false): void {
    // 防重复调用机制：如果正在同步，跳过本次调用
    if (this.isSyncingLayerData) {
      logger.debug('syncLayerDataToSelectTool: 正在同步中，跳过重复调用', {
        preserveSelection
      });
      return;
    }
    
    this.isSyncingLayerData = true;
    
    try {
      // 检查 toolManager 是否存在
      if (!this.toolManager) {
        logger.warn('syncLayerDataToSelectTool: toolManager 不存在，跳过同步');
        this.isSyncingLayerData = false; // 重置标志位
        return;
      }
      
      const currentTool = this.toolManager.getCurrentToolInstance();
      if (currentTool && ToolTypeGuards.isSelectTool(currentTool)) {
        // 获取当前所有actions
        const allActions = this.historyManager.getAllActions();
        
        // 如果启用了虚拟图层，根据模式决定获取哪些actions
        let layerActions = allActions;
        if (this.virtualLayerManager) {
          const mode = this.virtualLayerManager.getMode();
          if (mode === 'individual') {
            // individual模式：可以选择所有图层的actions（每个图层只有一个action）
            // 所以直接使用所有actions
            // 注意：在individual模式下，即使action不在当前活动图层中，也应该包含在layerActions中
            // 这样setLayerActions就不会过滤掉选中的actions
            layerActions = allActions;
            logger.debug('syncLayerDataToSelectTool: individual模式，使用所有actions', {
              totalActions: allActions.length
            });
          } else {
            // grouped模式：只获取当前活动图层的actions
            const activeLayer = this.virtualLayerManager.getActiveVirtualLayer();
            if (activeLayer) {
              layerActions = allActions.filter((action: DrawAction) => 
                action.virtualLayerId === activeLayer.id
              );
            }
          }
        }
        
        // 图层切换时，清空选择
        // 注意：只有在图层真正切换时才清空选择
        // 这里我们通过检查当前图层的actions是否与选择工具中的actions不同来判断
        const activeLayer = this.virtualLayerManager?.getActiveVirtualLayer();
        const selectToolActions = currentTool.getSelectedActions();
        const currentLayerActionIds = new Set(layerActions.map((a: DrawAction) => a.id));
        
        // 如果选中的actions中有不属于当前图层的，说明图层切换了，需要清空选择
        // 注意：individual模式下，这个检查可能不适用，因为可以选择所有actions
        const mode = this.virtualLayerManager?.getMode();
        const hasActionsFromOtherLayer = mode === 'grouped' && selectToolActions.some((action: DrawAction) => !currentLayerActionIds.has(action.id));
        // 如果preserveSelection为true（individual模式下），不清空选择
        const shouldClearSelection = preserveSelection ? false : hasActionsFromOtherLayer;
        
        logger.info('syncLayerDataToSelectTool: 检查是否需要清空选择', {
          mode,
          preserveSelection,
          activeLayerId: activeLayer?.id,
          layerActionsCount: layerActions.length,
          selectedActionsCount: selectToolActions.length,
          selectedActionIds: selectToolActions.map(a => a.id),
          hasActionsFromOtherLayer,
          shouldClearSelection
        });
        
        currentTool.setLayerActions(layerActions, shouldClearSelection);
        
        logger.info('syncLayerDataToSelectTool: setLayerActions完成', {
          selectedActionsCountAfter: currentTool.getSelectedActions().length,
          selectedActionIdsAfter: currentTool.getSelectedActions().map(a => a.id)
        });
        
        // 如果清空了选择，也重置状态
        if (shouldClearSelection && currentTool.reset) {
          currentTool.reset();
        }
        
        // individual模式：当选中actions时，找到对应的虚拟图层并拆分
        if (mode === 'individual') {
          const selectedActions = currentTool.getSelectedActions();
          if (selectedActions.length > 0) {
            // 收集所有被选中的虚拟图层ID
            const selectedLayerIds = new Set<string>();
            for (const action of selectedActions) {
              if (action.virtualLayerId) {
                selectedLayerIds.add(action.virtualLayerId);
              }
            }
            
            logger.debug('individual模式：选中actions，找到对应的虚拟图层', {
              selectedActionsCount: selectedActions.length,
              selectedLayerIds: Array.from(selectedLayerIds),
              selectedLayerCount: selectedLayerIds.size
            });
            
            // 如果有选中的图层，需要拆分draw层
            // 对于多个图层的情况，我们选择zIndex最小的图层作为"选中图层"来拆分
            // 这样可以将所有选中的图层都放在selected层中
            if (selectedLayerIds.size > 0) {
              const allLayers = this.virtualLayerManager?.getAllVirtualLayers() || [];
              const selectedLayers = allLayers.filter(layer => selectedLayerIds.has(layer.id));
              
              if (selectedLayers.length > 0) {
                // 找到zIndex最小的选中图层作为拆分基准
                const minZIndexLayer = selectedLayers.reduce((min, layer) => 
                  layer.zIndex < min.zIndex ? layer : min
                );
                
                const currentActiveLayer = this.virtualLayerManager?.getActiveVirtualLayer();
                // 如果当前活动图层不是最小zIndex的图层，则切换
                if (!currentActiveLayer || currentActiveLayer.id !== minZIndexLayer.id) {
                  logger.debug('individual模式：选中actions，切换到最小zIndex的图层进行拆分', {
                    minZIndexLayerId: minZIndexLayer.id,
                    minZIndex: minZIndexLayer.zIndex,
                    selectedLayerIds: Array.from(selectedLayerIds)
                  });
                  
                  // 注意：在individual模式下，需要切换图层以进行图层拆分
                  // 先保存选中的actions，确保选择被保留
                  const selectedActionsBeforeSwitch = currentTool.getSelectedActions();
                  
                  // 重要：直接调用virtualLayerManager.setActiveVirtualLayer，避免触发syncLayerDataToSelectTool
                  // 因为当前已经在syncLayerDataToSelectTool中，如果通过virtualLayerAPI调用会触发重复调用
                  // 我们会在图层切换后手动更新SelectTool的状态，并确保选择被保留
                  // 注意：由于防重复调用机制，即使通过virtualLayerAPI调用，也会被跳过
                  // 所以直接调用virtualLayerManager更安全，避免不必要的同步
                  const switchSuccess = this.virtualLayerManager?.setActiveVirtualLayer(minZIndexLayer.id);
                  
                  if (switchSuccess) {
                    // 切换图层后，需要重新获取活动图层zIndex并更新SelectTool
                    const newActiveLayer = this.virtualLayerManager?.getActiveVirtualLayer();
                    if (newActiveLayer && currentTool.setCanvasEngine) {
                      const selectedLayerZIndex = newActiveLayer.zIndex;
                      logger.info('individual模式：更新SelectTool的selectedLayerZIndex', {
                        selectedLayerZIndex,
                        layerId: newActiveLayer.id,
                        selectedActionsCountBeforeSwitch: selectedActionsBeforeSwitch.length
                      });
                      currentTool.setCanvasEngine(this.canvasEngine, selectedLayerZIndex);
                      
                      // 重要：确保选择被保留
                      // 因为直接调用virtualLayerManager，不会触发syncLayerDataToSelectTool
                      // 所以选择应该还在，但为了安全，我们验证并恢复
                      const selectedActionsAfterSwitch = currentTool.getSelectedActions();
                      if (selectedActionsAfterSwitch.length === 0 && selectedActionsBeforeSwitch.length > 0) {
                        logger.warn('individual模式：选择在切换图层后丢失，立即恢复选择', {
                          selectedActionsCountBefore: selectedActionsBeforeSwitch.length,
                          selectedActionIdsBefore: selectedActionsBeforeSwitch.map(a => a.id)
                        });
                        if (currentTool.setSelectedActions) {
                          currentTool.setSelectedActions(selectedActionsBeforeSwitch);
                          logger.info('individual模式：已恢复选择', {
                            restoredCount: selectedActionsBeforeSwitch.length
                          });
                        }
                      } else if (selectedActionsAfterSwitch.length > 0) {
                        logger.debug('individual模式：选择已保留', {
                          selectedActionsCount: selectedActionsAfterSwitch.length
                        });
                      }
                    }
                  } else {
                    logger.warn('individual模式：切换图层失败', {
                      layerId: minZIndexLayer.id
                    });
                  }
                } else {
                  // 如果已经是活动图层，只需要更新SelectTool的selectedLayerZIndex
                  if (currentTool.setCanvasEngine) {
                    const selectedLayerZIndex = currentActiveLayer.zIndex;
                    logger.info('individual模式：当前图层已激活，更新SelectTool的selectedLayerZIndex', {
                      selectedLayerZIndex,
                      layerId: currentActiveLayer.id
                    });
                    currentTool.setCanvasEngine(this.canvasEngine, selectedLayerZIndex);
                  }
                }
              }
            }
          }
        }
        
        // 设置CanvasEngine和选中图层zIndex（用于动态图层）
        // 注意：必须在切换活动图层之后设置，确保zIndex是最新的
        // individual模式下，如果已经在上面设置过，这里会再次设置以确保一致性
        if (currentTool.setCanvasEngine) {
          const selectedLayerZIndex = this.virtualLayerManager?.getActiveVirtualLayerZIndex() ?? null;
          logger.debug('设置选择工具的CanvasEngine和selectedLayerZIndex', {
            selectedLayerZIndex,
            activeLayerId: this.virtualLayerManager?.getActiveVirtualLayer()?.id,
            mode
          });
          currentTool.setCanvasEngine(this.canvasEngine, selectedLayerZIndex);
        }
        
        // individual模式：图层划分完成后，触发重绘以确保drawSelectToolUI被调用
        // 注意：必须在设置CanvasEngine之后触发，确保SelectTool已更新
        // 使用Promise确保异步操作完成，而不是setTimeout
        if (mode === 'individual') {
          const selectedActions = currentTool.getSelectedActions();
          if (selectedActions.length > 0 && this.canvasEngine?.isDrawLayerSplit()) {
            logger.info('individual模式：图层划分完成，触发重绘以绘制选区和锚点', {
              selectedActionsCount: selectedActions.length,
              isDrawLayersInitialized: this.canvasEngine.isDrawLayersInitialized()
            });
            // 使用Promise确保图层初始化完成后再触发重绘
            // 注意：这里使用Promise.resolve().then()而不是setTimeout，确保在下一个事件循环中执行
            // 但不会阻塞当前执行，同时保证执行顺序
            // 注意：不需要在这里再次调用syncLayerDataToSelectTool，因为：
            // 1. syncLayerDataToSelectTool本身已经处理了图层划分和选择保留
            // 2. 如果在这里再次调用，会导致无限循环（syncLayerDataToSelectTool -> 图层划分 -> 重绘 -> syncLayerDataToSelectTool）
            Promise.resolve().then(async () => {
              try {
                // 直接触发重绘，重绘过程中会确保图层初始化完成
                // DrawingHandler.ensureLayersInitialized()会在重绘时自动处理初始化
                // drawSelectToolUI会在重绘时被调用，此时选择已经被syncLayerDataToSelectTool保留了
                await this.drawingHandler.forceRedraw();
                logger.debug('individual模式：重绘完成，选区和锚点已绘制');
              } catch (error) {
                logger.error('individual模式：重绘失败', error);
              }
            }).catch(error => {
              logger.error('individual模式：Promise链错误', error);
            });
          }
        }
        
        logger.debug(`同步${layerActions.length}个actions到选择工具`, {
          mode,
          selectedLayerZIndex: this.virtualLayerManager?.getActiveVirtualLayerZIndex() ?? null,
          clearedSelection: shouldClearSelection
        });
      }
    } catch (error) {
      logger.error('同步图层数据到选择工具失败', error);
    } finally {
      // 重置同步标志位，允许下次调用
      this.isSyncingLayerData = false;
    }
  }

  /**
   * 初始化默认工具（异步初始化常用工具）
   */
  public async initializeDefaultTools(): Promise<void> {
    return this.toolAPI.initializeDefaultTools();
  }

  /**
   * 预加载工具（后台加载，不阻塞UI）
   */
  public async preloadTool(type: ToolType): Promise<void> {
    return this.toolAPI.preloadTool(type);
  }

  /**
   * 预加载多个工具
   */
  public async preloadTools(types: ToolType[]): Promise<void> {
    return this.toolAPI.preloadTools(types);
  }

  /**
   * 获取工具加载状态
   */
  public getToolLoadingState(): 'idle' | 'loading' | 'ready' | 'error' {
    return this.toolAPI.getToolLoadingState();
  }

  /**
   * 获取工具元数据
   */
  public getToolMetadata(type: ToolType) {
    return this.toolAPI.getToolMetadata(type);
  }

  /**
   * 获取当前工具
   */
  public getCurrentTool(): ToolType {
    return this.toolAPI.getCurrentTool();
  }
  
  /**
   * 设置颜色
   * @param color 颜色
   */
  public setColor(color: string): void {
    this.toolAPI.setColor(color);
  }
  
  /**
   * 设置线宽
   * @param width 线宽
   */
  public setLineWidth(width: number): void {
    this.toolAPI.setLineWidth(width);
  }

  // ============================================
  // 公共API - 运笔效果
  // ============================================

  /**
   * 设置运笔效果配置
   * @param config 运笔效果配置
   */
  public async setStrokeConfig(config: Partial<StrokeConfig>): Promise<void> {
    return this.toolAPI?.setStrokeConfig(config);
  }

  /**
   * 获取运笔效果配置
   * @returns 运笔效果配置或null
   */
  public async getStrokeConfig(): Promise<StrokeConfig | null> {
    return this.toolAPI.getStrokeConfig();
  }

  /**
   * 设置运笔预设
   * @param preset 运笔预设
   */
  public async setStrokePreset(preset: StrokePresetType): Promise<void> {
    return this.toolAPI.setStrokePreset(preset);
  }

  /**
   * 获取当前笔刷预设
   * @returns 当前笔刷预设类型或null
   */
  public async getCurrentStrokePreset(): Promise<StrokePresetType | null> {
    return this.toolAPI.getCurrentStrokePreset();
  }

  // ============================================
  // 公共API - 历史记录管理
  // ============================================

  public async undo(): Promise<boolean> {
    return this.historyAPI.undo();
  }

  public async redo(): Promise<boolean> {
    return this.historyAPI.redo();
  }

  public async clear(): Promise<void> {
    return this.historyAPI.clear();
  }

  public canUndo(): boolean {
    return this.historyAPI.canUndo();
  }

  public canRedo(): boolean {
    return this.historyAPI.canRedo();
  }

  // ============================================
  // 公共API - 选择操作
  // ============================================

  /**
   * 清除选择
   */
  public async clearSelection(): Promise<void> {
    return this.selectionAPI.clearSelection();
  }

  /**
   * 删除选择
   */
  public async deleteSelection(): Promise<void> {
    return this.selectionAPI.deleteSelection();
  }

  /**
   * 复制选择
   */
  public copySelection(): DrawAction[] {
    return this.selectionAPI.copySelection();
  }

  /**
   * 剪切选择
   */
  public async cutSelection(): Promise<DrawAction[]> {
    return this.selectionAPI.cutSelection();
  }

  /**
   * 粘贴选择
   * @param offsetX 水平偏移量，默认10px
   * @param offsetY 垂直偏移量，默认10px
   */
  public async pasteSelection(offsetX: number = 10, offsetY: number = 10): Promise<DrawAction[]> {
    return this.selectionAPI.pasteSelection(offsetX, offsetY);
  }

  /**
   * 检查剪贴板是否有数据
   */
  public hasClipboardData(): boolean {
    return this.selectionAPI.hasClipboardData();
  }

  /**
   * 全选所有内容
   */
  public selectAll(): void {
    // 切换到选择工具
    this.setTool('select');
    // 然后调用 API 的全选方法
    this.selectionAPI.selectAll();
  }

  /**
   * 是否有选择
   */
  public hasSelection(): boolean {
    return this.selectionAPI.hasSelection();
  }

  /**
   * 获取选择
   */
  public getSelectedActions(): DrawAction[] {
    return this.selectionAPI.getSelectedActions();
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
    // 检查工具管理器是否已初始化
    if (!this.toolManager) {
      return; // 如果未初始化，直接返回
    }
    
    const currentTool = this.toolManager.getCurrentTool();
    
    // 如果是选择工具，从选择工具获取光标样式
    if (currentTool === 'select') {
      const currentToolInstance = this.toolManager.getCurrentToolInstance();
      if (currentToolInstance && ToolTypeGuards.isSelectTool(currentToolInstance)) {
        // 注意：这里无法获取当前鼠标位置，所以不传point参数
        // 光标更新会在handleDrawMove中通过updateHoverAnchor更新
        const cursor = currentToolInstance.getCurrentCursor();
        if (this.cursorHandler) {
          this.cursorHandler.setCursor(cursor);
        }
        return;
      }
    }
    
    // 检查 canvasEngine 和 drawingHandler 是否已初始化
    if (!this.canvasEngine || !this.drawingHandler || !this.cursorHandler) {
      return; // 如果未初始化，直接返回
    }
    
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
    return this.historyAPI.getHistory();
  }

  /**
   * 获取历史记录统计信息（使用函数式编程）
   */
  public getHistoryStats() {
    const history = this.historyManager.getHistory();
    return calculateHistoryStats(history);
  }

  /**
   * 处理绘制数据（使用函数式编程）
   */
  public processDrawData(points: Array<{ x: number; y: number; pressure?: number; timestamp: number }>) {
    return processStrokeData(points);
  }

  /**
   * 创建状态快照（使用函数式编程）
   */
  public createSnapshot() {
    const state = this.getState();
    return createStateSnapshot(state);
  }

  /**
   * 检查状态是否发生变化（使用函数式编程）
   */
  public checkStateChange(oldState: DrawBoardState, newState: DrawBoardState) {
    return hasStateChanged(oldState, newState);
  }

  /**
   * 使用管道处理数据（使用函数式编程）
   */
  public processDataWithPipeline<T extends Record<string, unknown>>(data: T) {
    return pipe(
      (d: T) => ({ ...d, processed: true }),
      (d: T) => ({ ...d, timestamp: Date.now() })
    )(data);
  }

  /**
   * 记忆化计算（使用函数式编程）
   */
  public memoizedCalculation = memoize((input: number) => {
    return input * input + 1;
  });

  /**
   * 获取工具名称列表
   */
  public getToolNames(): Array<{ type: ToolType; name: string }> {
    return this.toolAPI.getToolNames();
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
    return this.virtualLayerAPI.createVirtualLayer(name);
  }

  /**
   * 删除虚拟图层
   */
  public deleteVirtualLayer(layerId: string): boolean {
    return this.virtualLayerAPI.deleteVirtualLayer(layerId);
  }

  /**
   * 设置活动虚拟图层
   */
  public setActiveVirtualLayer(layerId: string): boolean {
    return this.virtualLayerAPI.setActiveVirtualLayer(layerId);
  }

  /**
   * 获取活动虚拟图层
   */
  public getActiveVirtualLayer(): VirtualLayer | null {
    return this.virtualLayerAPI.getActiveVirtualLayer();
  }

  /**
   * 获取指定虚拟图层
   */
  public getVirtualLayer(layerId: string): VirtualLayer | null {
    return this.virtualLayerAPI.getVirtualLayer(layerId);
  }

  /**
   * 获取所有虚拟图层
   */
  public getAllVirtualLayers(): VirtualLayer[] {
    return this.virtualLayerAPI.getAllVirtualLayers();
  }

  /**
   * 设置虚拟图层可见性
   */
  public async setVirtualLayerVisible(layerId: string, visible: boolean): Promise<boolean> {
    return this.virtualLayerAPI.setVirtualLayerVisible(layerId, visible);
  }

  /**
   * 设置虚拟图层透明度
   * @param layerId 图层ID
   * @param opacity 透明度 (0-1)
   */
  public async setVirtualLayerOpacity(layerId: string, opacity: number): Promise<boolean> {
    return this.virtualLayerAPI.setVirtualLayerOpacity(layerId, opacity);
  }

  /**
   * 设置虚拟图层锁定状态
   */
  public setVirtualLayerLocked(layerId: string, locked: boolean): boolean {
    return this.virtualLayerAPI.setVirtualLayerLocked(layerId, locked);
  }

  /**
   * 重命名虚拟图层
   */
  public renameVirtualLayer(layerId: string, newName: string): boolean {
    return this.virtualLayerAPI.renameVirtualLayer(layerId, newName);
  }

  /**
   * 获取虚拟图层统计信息
   */
  public getVirtualLayerStats() {
    return this.virtualLayerAPI.getVirtualLayerStats();
  }

  /**
   * 获取当前虚拟图层模式
   */
  public getVirtualLayerMode(): VirtualLayerMode {
    return this.virtualLayerAPI.getVirtualLayerMode();
  }

  /**
   * 设置虚拟图层模式
   */
  public setVirtualLayerMode(mode: VirtualLayerMode): void {
    this.virtualLayerAPI.setVirtualLayerMode(mode);
  }

  /**
   * 获取虚拟图层配置
   */
  public getVirtualLayerConfig() {
    return this.virtualLayerAPI.getVirtualLayerConfig();
  }

  /**
   * 更新虚拟图层配置
   */
  public updateVirtualLayerConfig(config: Partial<VirtualLayerConfig>): void {
    this.virtualLayerAPI.updateVirtualLayerConfig(config);
  }

  // ============================================
  // 图层顺序管理API
  // ============================================

  /**
   * 调整图层顺序（移动到指定位置）
   * @param layerId - 要移动的图层ID
   * @param newIndex - 新的位置索引（0为最底层）
   * @returns 是否成功
   */
  public reorderVirtualLayer(layerId: string, newIndex: number): boolean {
    return this.virtualLayerAPI.reorderVirtualLayer(layerId, newIndex);
  }

  /**
   * 将图层移到最上层
   */
  public moveVirtualLayerToTop(layerId: string): boolean {
    return this.virtualLayerAPI.moveVirtualLayerToTop(layerId);
  }

  /**
   * 将图层移到最下层
   */
  public moveVirtualLayerToBottom(layerId: string): boolean {
    return this.virtualLayerAPI.moveVirtualLayerToBottom(layerId);
  }

  /**
   * 将图层上移一层
   */
  public moveVirtualLayerUp(layerId: string): boolean {
    return this.virtualLayerAPI.moveVirtualLayerUp(layerId);
  }

  /**
   * 将图层下移一层
   */
  public moveVirtualLayerDown(layerId: string): boolean {
    return this.virtualLayerAPI.moveVirtualLayerDown(layerId);
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
      logger.info('🗑️ 开始销毁DrawBoard实例...');
      
      // 1. 解绑事件处理器（在销毁 EventManager 之前）
      this.unbindEvents();
      
      // 2. 停止所有事件监听
      if (this.eventManager) {
        this.eventManager.destroy();
        logger.debug('✅ EventManager已销毁');
      }
      
      // 3. 清理快捷键
      if (this.shortcutManager && typeof this.shortcutManager.destroy === 'function') {
        this.shortcutManager.destroy();
        logger.debug('✅ ShortcutManager已销毁');
      }
      
      // 4. 清理CanvasEngine
      if (this.canvasEngine) {
        this.canvasEngine.destroy();
        logger.debug('✅ CanvasEngine已销毁');
      }
      
      // 5. 清理VirtualLayerManager
      if (this.virtualLayerManager && typeof this.virtualLayerManager.destroy === 'function') {
        this.virtualLayerManager.destroy();
        logger.debug('✅ VirtualLayerManager已销毁');
      }
      
      // 6. 清理DrawingHandler（如果有dispose方法）
      if (this.drawingHandler && 'dispose' in this.drawingHandler && typeof this.drawingHandler.dispose === 'function') {
        this.drawingHandler.dispose();
        logger.debug('✅ DrawingHandler已清理');
      }
      
      // 7. 清理CursorHandler（如果有dispose方法）
      if (this.cursorHandler && 'dispose' in this.cursorHandler && typeof this.cursorHandler.dispose === 'function') {
        this.cursorHandler.dispose();
        logger.debug('✅ CursorHandler已清理');
      }
      
      // 8. 清理StateHandler（如果有dispose方法）
      if (this.stateHandler && 'dispose' in this.stateHandler && typeof this.stateHandler.dispose === 'function') {
        this.stateHandler.dispose();
        logger.debug('✅ StateHandler已清理');
      }
      
      // 9. 销毁所有资源管理器
      if (this.resourceManager) {
        await this.resourceManager.destroy();
        logger.debug('✅ ResourceManager已销毁');
      }
      
      // 10. 从静态单例映射中移除实例
      if (this.container) {
        DrawBoard.instances.delete(this.container);
        logger.debug('✅ DrawBoard instance removed from static registry');
      }
      
      // 11. 清理所有引用
      this.container = null as unknown as HTMLElement;
      this.canvasEngine = null as unknown as CanvasEngine;
      this.toolManager = null as unknown as ToolManager;
      this.historyManager = null as unknown as HistoryManager;
      this.eventManager = null as unknown as EventManager;
      this.shortcutManager = null as unknown as ShortcutManager;
      this.exportManager = null as unknown as ExportManager;
      this.selectionManager = null as unknown as SelectionManager;
      this.performanceManager = null as unknown as PerformanceManager;
      this.complexityManager = null as unknown as ComplexityManager;
      this.virtualLayerManager = null as unknown as VirtualLayerManager;
      this.drawingHandler = null as unknown as DrawingHandler;
      this.cursorHandler = null as unknown as CursorHandler;
      this.stateHandler = null as unknown as StateHandler;
      this.resourceManager = undefined;
      
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
   * 注意：此方法通过箭头函数传递给 toolAPI，实际在使用中
   */
  private async checkComplexityRecalculation(): Promise<void> {
    // 检查复杂度管理器是否已初始化
    if (!this.complexityManager) {
      return; // 如果未初始化，直接返回
    }
    
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
    if (currentToolInstance && ToolTypeGuards.isSelectTool(currentToolInstance)) {
      if (currentToolInstance.getDebugInfo) {
        selectToolDebugInfo = currentToolInstance.getDebugInfo();
      }
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
    if (currentTool && ToolTypeGuards.isSelectTool(currentTool)) {
      if (currentTool.forceUpdate) {
        currentTool.forceUpdate();
      }
    }
    
    logger.debug('强制同步选择工具数据完成', this.getSelectionDebugInfo());
  }
} 