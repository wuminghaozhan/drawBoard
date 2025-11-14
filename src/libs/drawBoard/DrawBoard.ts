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
import type { Point } from './core/CanvasEngine';
import type { StrokeConfig } from './tools/stroke/StrokeTypes';
import type { StrokePresetType } from './tools/StrokePresets';
import { ErrorHandler, DrawBoardError, DrawBoardErrorCode, type DrawBoardErrorCode as DrawBoardErrorCodeType } from './utils/ErrorHandler';
import { LightweightResourceManager } from './utils/LightweightResourceManager';
import { logger } from './utils/Logger';
import { BoundsValidator, type Bounds as BoundsType } from './utils/BoundsValidator';

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

  /** 剪贴板存储 - 存储复制的动作 */
  private clipboard: DrawAction[] = [];

  /** 容器元素引用 */
  private container!: HTMLElement;

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
      logger.debug('EventManager 绑定到 interaction canvas', {
        canvas: interactionCanvas,
        width: interactionCanvas.width,
        height: interactionCanvas.height,
        offsetWidth: interactionCanvas.offsetWidth,
        offsetHeight: interactionCanvas.offsetHeight,
        pointerEvents: getComputedStyle(interactionCanvas).pointerEvents,
        zIndex: getComputedStyle(interactionCanvas).zIndex
      });
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

    logger.info('=== DrawBoard 初始化完成 ===');
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
    logger.debug('handleDrawStart 被调用', {
      tool: this.toolManager.getCurrentTool(),
      point: event.point
    });
    
    // 如果是选择工具，直接处理选择逻辑，不通过DrawingHandler
    if (this.toolManager.getCurrentTool() === 'select') {
      logger.debug('检测到选择工具，开始处理');
      const currentTool = this.toolManager.getCurrentToolInstance();
      if (currentTool && currentTool.getActionType() === 'select') {
        logger.debug('选择工具实例获取成功，开始同步数据');
        // 确保选择工具的数据已同步
        this.syncLayerDataToSelectTool();
        
        const selectTool = currentTool as unknown as { 
          handleMouseDown: (point: Point) => 'select' | 'transform' | 'move' | 'box-select' | 'anchor-drag' | null;
        };
        logger.debug('调用 selectTool.handleMouseDown', { point: event.point });
        const result = selectTool.handleMouseDown(event.point);
        logger.debug('selectTool.handleMouseDown 返回', { result });
        
        // 触发重绘以显示选择框或锚点
        this.drawingHandler.forceRedraw();
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
      if (currentTool && currentTool.getActionType() === 'select') {
        // 注意：不要在 mousemove 时同步数据，这会导致选择被清空
        // 数据同步只在工具切换或图层切换时进行
        
        const selectTool = currentTool as unknown as { 
          handleMouseMove: (point: Point) => DrawAction | DrawAction[] | null;
          updateHoverAnchor?: (point: Point) => void;
        };
        
        // 更新悬停锚点（用于光标更新）
        if (selectTool.updateHoverAnchor) {
          selectTool.updateHoverAnchor(event.point);
        }
        
        const updatedActions = selectTool.handleMouseMove(event.point);
        
        // 节流重绘（避免过于频繁的重绘）
        const now = Date.now();
        if (now - this.lastSelectToolRedrawTime >= this.SELECT_TOOL_REDRAW_INTERVAL) {
          // 如果返回了更新后的actions（拖拽中），触发重绘
          // 注意：在拖拽过程中，不要更新HistoryManager，只在mouseUp时更新
          if (updatedActions) {
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
        if (currentTool && currentTool.getActionType() === 'select') {
          const selectTool = currentTool as unknown as { 
            handleMouseUp: () => DrawAction | DrawAction[] | null;
          };
          const updatedActions = selectTool.handleMouseUp();
          
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
        this.syncLayerDataToSelectTool();
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
        const selectTool = currentTool as unknown as { 
          setLayerActions: (actions: DrawAction[], clearSelection?: boolean) => void;
          setCanvasEngine?: (canvasEngine: CanvasEngine, selectedLayerZIndex?: number | null) => void;
          reset?: () => void;
          getSelectedActions?: () => DrawAction[];
        };
        
        // 图层切换时，清空选择
        // 注意：只有在图层真正切换时才清空选择
        // 这里我们通过检查当前图层的actions是否与选择工具中的actions不同来判断
        const activeLayer = this.virtualLayerManager?.getActiveVirtualLayer();
        const selectToolActions = selectTool.getSelectedActions ? selectTool.getSelectedActions() : [];
        const currentLayerActionIds = new Set(layerActions.map((a: DrawAction) => a.id));
        
        // 如果选中的actions中有不属于当前图层的，说明图层切换了，需要清空选择
        const hasActionsFromOtherLayer = selectToolActions.some((action: DrawAction) => !currentLayerActionIds.has(action.id));
        const shouldClearSelection = hasActionsFromOtherLayer;
        
        logger.debug('syncLayerDataToSelectTool: 检查是否需要清空选择', {
          activeLayerId: activeLayer?.id,
          layerActionsCount: layerActions.length,
          selectedActionsCount: selectToolActions.length,
          hasActionsFromOtherLayer,
          shouldClearSelection
        });
        
        selectTool.setLayerActions(layerActions, shouldClearSelection);
        
        // 如果清空了选择，也重置状态
        if (shouldClearSelection && selectTool.reset) {
          selectTool.reset();
        }
        
        // 设置CanvasEngine和选中图层zIndex（用于动态图层）
        if (selectTool.setCanvasEngine) {
          const selectedLayerZIndex = this.virtualLayerManager?.getActiveVirtualLayerZIndex() ?? null;
          selectTool.setCanvasEngine(this.canvasEngine, selectedLayerZIndex);
        }
        
        logger.debug(`同步${layerActions.length}个actions到选择工具`, {
          selectedLayerZIndex: this.virtualLayerManager?.getActiveVirtualLayerZIndex() ?? null,
          clearedSelection: shouldClearSelection
        });
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
    logger.debug('🔄 开始执行撤销操作...');
    
    // 检查是否可以撤销
    const canUndo = this.canUndo();
    logger.debug('🔄 是否可以撤销:', canUndo);
    
    if (!canUndo) {
      logger.debug('❌ 无法撤销：没有可撤销的操作');
      return false;
    }
    
    // 获取当前历史记录状态
    const historyCount = this.historyManager.getHistoryCount();
    const allActions = this.historyManager.getAllActions();
    logger.debug('🔄 当前历史记录状态:', {
      historyCount,
      allActionsCount: allActions.length,
      canUndo: this.canUndo(),
      canRedo: this.canRedo()
    });
    
    // 执行撤销
    const action = this.historyManager.undo();
    logger.debug('🔄 撤销结果:', {
      action: action ? {
        id: action.id,
        type: action.type,
        points: action.points?.length || 0
      } : null
    });
    
    if (action) {
      logger.debug('✅ 撤销成功，开始重绘...');
      // 标记离屏缓存过期（历史记录已变化）
      this.drawingHandler.invalidateOffscreenCache();
      await this.drawingHandler.forceRedraw();
      logger.debug('✅ 重绘完成');
      return true;
    } else {
      logger.warn('❌ 撤销失败：没有返回action');
      return false;
    }
  }

  public async redo(): Promise<boolean> {
    logger.debug('🔄 开始执行重做操作...');
    
    // 检查是否可以重做
    const canRedo = this.canRedo();
    logger.debug('🔄 是否可以重做:', canRedo);
    
    if (!canRedo) {
      logger.debug('❌ 无法重做：没有可重做的操作');
      return false;
    }
    
    // 执行重做
    const action = this.historyManager.redo();
    logger.debug('🔄 重做结果:', {
      action: action ? {
        id: action.id,
        type: action.type,
        points: action.points?.length || 0
      } : null
    });
    
    if (action) {
      logger.debug('✅ 重做成功，开始重绘...');
      // 标记离屏缓存过期（历史记录已变化）
      this.drawingHandler.invalidateOffscreenCache();
      await this.drawingHandler.forceRedraw();
      logger.debug('✅ 重绘完成');
      return true;
    } else {
      logger.warn('❌ 重做失败：没有返回action');
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
    const copiedActions: DrawAction[] = [];
    
    // 优先从SelectTool获取
    const currentTool = this.toolManager.getCurrentToolInstance();
    if (currentTool && currentTool.getActionType() === 'select') {
      const selectTool = currentTool as unknown as { copySelectedActions: () => DrawAction[] };
      copiedActions.push(...selectTool.copySelectedActions());
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
      this.historyManager.addAction(action);
      
      // 分配到虚拟图层
      if (this.virtualLayerManager) {
        this.virtualLayerManager.handleNewAction(action);
      }
    }

    // 如果当前是选择工具，选中粘贴的内容
    const currentTool = this.toolManager.getCurrentToolInstance();
    if (currentTool && currentTool.getActionType() === 'select') {
      const selectTool = currentTool as unknown as { 
        pasteActions: (actions: DrawAction[], offsetX: number, offsetY: number) => DrawAction[];
        setSelectedActions: (actions: DrawAction[]) => void;
      };
      
      if (selectTool.pasteActions) {
        selectTool.pasteActions(pastedActions, 0, 0);
      } else if (selectTool.setSelectedActions) {
        selectTool.setSelectedActions(pastedActions);
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
  public selectAll(): void {
    // 获取所有历史动作
    const allActions = this.historyManager.getAllActions();
    
    if (allActions.length === 0) {
      logger.debug('没有可选择的动作');
      return;
    }
    
    // 切换到选择工具
    this.setTool('select');
    
    // 获取选择工具实例
    const currentTool = this.toolManager.getCurrentToolInstance();
    if (currentTool && currentTool.getActionType() === 'select') {
      const selectTool = currentTool as unknown as { 
        setSelectedActions: (actions: DrawAction[]) => void;
        setLayerActions: (actions: DrawAction[], clearSelection: boolean) => void;
      };
      
      // 设置所有动作为选中状态
      if (selectTool.setSelectedActions) {
        selectTool.setSelectedActions(allActions);
      }
      
      // 更新图层动作列表（确保选择工具知道所有动作）
      if (selectTool.setLayerActions) {
        selectTool.setLayerActions(allActions, false);
      }
    }
    
    // 触发重绘
    this.drawingHandler.forceRedraw();
    
    logger.debug('已全选', { count: allActions.length });
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
    
    // 如果是选择工具，从选择工具获取光标样式
    if (currentTool === 'select') {
      const currentToolInstance = this.toolManager.getCurrentToolInstance();
      if (currentToolInstance && currentToolInstance.getActionType() === 'select') {
        const selectTool = currentToolInstance as unknown as { 
          getCurrentCursor: (point?: Point) => string;
        };
        // 注意：这里无法获取当前鼠标位置，所以不传point参数
        // 光标更新会在handleDrawMove中通过updateHoverAnchor更新
        const cursor = selectTool.getCurrentCursor();
        this.cursorHandler.setCursor(cursor);
        return;
      }
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
    return this.historyManager.getHistory();
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
    
    if (!success) return false;
    
    // 如果当前是选择工具，同步图层数据
    if (this.toolManager.getCurrentTool() === 'select') {
      this.syncLayerDataToSelectTool();
    }
    
    // 优化：如果draw层已拆分，只重绘对应的draw层
    if (this.canvasEngine.isDrawLayerSplit() && this.virtualLayerManager) {
      const changedLayer = this.virtualLayerManager.getVirtualLayer(layerId);
      const activeLayer = this.virtualLayerManager.getActiveVirtualLayer();
      
      if (changedLayer && activeLayer) {
        const selectedZIndex = activeLayer.zIndex;
        const changedZIndex = changedLayer.zIndex;
        
        if (changedZIndex === selectedZIndex) {
          // 变化的图层是选中图层，只重绘selected层
          this.drawingHandler.forceRedraw();
        } else if (changedZIndex < selectedZIndex) {
          // 变化的图层在下层，只重绘bottom层
          this.drawingHandler.redrawBottomLayers(selectedZIndex).catch(error => {
            logger.error('重绘bottom层失败', error);
            this.drawingHandler.forceRedraw();
          });
        } else {
          // 变化的图层在上层，只重绘top层
          this.drawingHandler.redrawTopLayers(selectedZIndex).catch(error => {
            logger.error('重绘top层失败', error);
            this.drawingHandler.forceRedraw();
          });
        }
      } else {
        // 无法确定图层位置，使用全量重绘
        this.drawingHandler.forceRedraw();
      }
    } else {
      // draw层未拆分，使用全量重绘
      this.drawingHandler.forceRedraw();
    }
    
    return success;
  }

  /**
   * 设置虚拟图层透明度
   */
  public setVirtualLayerOpacity(layerId: string, opacity: number): boolean {
    const success = this.virtualLayerManager.setVirtualLayerOpacity(layerId, opacity);
    
    if (!success) return false;
    
    // 优化：如果draw层已拆分，只重绘对应的draw层
    if (this.canvasEngine.isDrawLayerSplit() && this.virtualLayerManager) {
      const changedLayer = this.virtualLayerManager.getVirtualLayer(layerId);
      const activeLayer = this.virtualLayerManager.getActiveVirtualLayer();
      
      if (changedLayer && activeLayer) {
        const selectedZIndex = activeLayer.zIndex;
        const changedZIndex = changedLayer.zIndex;
        
        if (changedZIndex === selectedZIndex) {
          // 变化的图层是选中图层，只重绘selected层
          this.drawingHandler.forceRedraw();
        } else if (changedZIndex < selectedZIndex) {
          // 变化的图层在下层，只重绘bottom层
          this.drawingHandler.redrawBottomLayers(selectedZIndex).catch(error => {
            logger.error('重绘bottom层失败', error);
            this.drawingHandler.forceRedraw();
          });
        } else {
          // 变化的图层在上层，只重绘top层
          this.drawingHandler.redrawTopLayers(selectedZIndex).catch(error => {
            logger.error('重绘top层失败', error);
            this.drawingHandler.forceRedraw();
          });
        }
      } else {
        // 无法确定图层位置，使用全量重绘
        this.drawingHandler.forceRedraw();
      }
    } else {
      // draw层未拆分，使用全量重绘
      this.drawingHandler.forceRedraw();
    }
    
    return success;
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

  /**
   * 获取当前虚拟图层模式
   */
  public getVirtualLayerMode(): VirtualLayerMode {
    return this.virtualLayerManager.getMode();
  }

  /**
   * 设置虚拟图层模式
   */
  public setVirtualLayerMode(mode: VirtualLayerMode): void {
    this.virtualLayerManager.setMode(mode);
  }

  /**
   * 获取虚拟图层配置
   */
  public getVirtualLayerConfig() {
    return this.virtualLayerManager.getConfig();
  }

  /**
   * 更新虚拟图层配置
   */
  public updateVirtualLayerConfig(config: Partial<VirtualLayerConfig>): void {
    this.virtualLayerManager.updateConfig(config);
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
    const success = this.virtualLayerManager.reorderLayer(layerId, newIndex);
    if (success) {
      // 触发重绘
      this.drawingHandler.forceRedraw();
    }
    return success;
  }

  /**
   * 将图层移到最上层
   */
  public moveVirtualLayerToTop(layerId: string): boolean {
    const success = this.virtualLayerManager.moveLayerToTop(layerId);
    if (success) {
      this.drawingHandler.forceRedraw();
    }
    return success;
  }

  /**
   * 将图层移到最下层
   */
  public moveVirtualLayerToBottom(layerId: string): boolean {
    const success = this.virtualLayerManager.moveLayerToBottom(layerId);
    if (success) {
      this.drawingHandler.forceRedraw();
    }
    return success;
  }

  /**
   * 将图层上移一层
   */
  public moveVirtualLayerUp(layerId: string): boolean {
    const success = this.virtualLayerManager.moveLayerUp(layerId);
    if (success) {
      this.drawingHandler.forceRedraw();
    }
    return success;
  }

  /**
   * 将图层下移一层
   */
  public moveVirtualLayerDown(layerId: string): boolean {
    const success = this.virtualLayerManager.moveLayerDown(layerId);
    if (success) {
      this.drawingHandler.forceRedraw();
    }
    return success;
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
      
      // 1. 停止所有事件监听
      if (this.eventManager) {
        this.eventManager.destroy();
        logger.debug('✅ EventManager已销毁');
      }
      
      // 2. 清理快捷键
      if (this.shortcutManager && typeof this.shortcutManager.destroy === 'function') {
        this.shortcutManager.destroy();
        logger.debug('✅ ShortcutManager已销毁');
      }
      
      // 3. 清理CanvasEngine
      if (this.canvasEngine) {
        this.canvasEngine.destroy();
        logger.debug('✅ CanvasEngine已销毁');
      }
      
      // 4. 清理VirtualLayerManager
      if (this.virtualLayerManager && typeof this.virtualLayerManager.destroy === 'function') {
        this.virtualLayerManager.destroy();
        logger.debug('✅ VirtualLayerManager已销毁');
      }
      
      // 5. 清理DrawingHandler（如果有dispose方法）
      if (this.drawingHandler && 'dispose' in this.drawingHandler && typeof this.drawingHandler.dispose === 'function') {
        this.drawingHandler.dispose();
        logger.debug('✅ DrawingHandler已清理');
      }
      
      // 6. 清理CursorHandler（如果有dispose方法）
      if (this.cursorHandler && 'dispose' in this.cursorHandler && typeof this.cursorHandler.dispose === 'function') {
        this.cursorHandler.dispose();
        logger.debug('✅ CursorHandler已清理');
      }
      
      // 7. 清理StateHandler（如果有dispose方法）
      if (this.stateHandler && 'dispose' in this.stateHandler && typeof this.stateHandler.dispose === 'function') {
        this.stateHandler.dispose();
        logger.debug('✅ StateHandler已清理');
      }
      
      // 8. 销毁所有资源管理器
      if (this.resourceManager) {
        await this.resourceManager.destroy();
        logger.debug('✅ ResourceManager已销毁');
      }
      
      // 9. 从静态单例映射中移除实例
      if (this.container) {
        DrawBoard.instances.delete(this.container);
        logger.debug('✅ DrawBoard instance removed from static registry');
      }
      
      // 10. 清理所有引用
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