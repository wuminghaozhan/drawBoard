import { CanvasEngine } from './core/CanvasEngine';
import { ToolManager } from './tools/ToolManager';
import { HistoryManager } from './history/HistoryManager';
import { EventManager } from './infrastructure/events/EventManager';
import { ShortcutManager } from './shortcuts/ShortcutManager';
import { ExportManager } from './utils/ExportManager';
import { CoreSelectionManager } from './core/CoreSelectionManager';
import { PerformanceManager, type PerformanceConfig, type MemoryStats } from './core/PerformanceManager';
import { ComplexityManager } from './core/ComplexityManager';
import { VirtualLayerManager, type VirtualLayer, type VirtualLayerMode, type VirtualLayerConfig } from './core/VirtualLayerManager';
import { DrawingHandler } from './handlers/DrawingHandler';
import { CursorHandler } from './handlers/CursorHandler';
import { StateHandler, type DrawBoardState } from './handlers/StateHandler';
import { SelectToolCoordinator } from './handlers/SelectToolCoordinator';
import { InitializationManager } from './core/InitializationManager';
import { PerformanceMode } from './tools/DrawTool';
import type { ToolType } from './tools/DrawTool';
import type { DrawAction } from './tools/DrawTool';
import type { DrawEvent } from './infrastructure/events/EventManager';
import type { StrokeConfig } from './tools/stroke/StrokeTypes';
import type { StrokePresetType } from './tools/StrokePresets';
import { ToolTypeGuards } from './tools/ToolInterfaces';
import { ErrorHandler, DrawBoardError, DrawBoardErrorCode, type DrawBoardErrorCode as DrawBoardErrorCodeType } from './infrastructure/error/ErrorHandler';
import { LightweightResourceManager } from './utils/LightweightResourceManager';
import { logger } from './infrastructure/logging/Logger';
import { EventBus } from './infrastructure/events/EventBus';
import type { TextAction } from './types/TextTypes';

// API 模块
import { DrawBoardVirtualLayerAPI } from './api/DrawBoardVirtualLayerAPI';
import { DrawBoardSelectionAPI } from './api/DrawBoardSelectionAPI';
import { DrawBoardToolAPI } from './api/DrawBoardToolAPI';
import { DrawBoardHistoryAPI } from './api/DrawBoardHistoryAPI';
import { DrawBoardDataAPI } from './api/DrawBoardDataAPI';
import type { ToolAPIConfig, HistoryAPIConfig, VirtualLayerAPIConfig, DataAPIConfig } from './api/APIConfig';

// 函数式编程模块（直接从子模块导入以避免循环依赖）
import { 
  calculateHistoryStats, 
  processStrokeData,
  pipe,
  memoize,
  hasStateChanged
} from './functional/DataProcessor';
import { validateAndCleanConfig } from './functional/ConfigManager';
import { createStateSnapshot } from './functional/StateManager';

/**
 * 渲染优化配置接口
 */
export interface OptimizationConfig {
  /** 
   * 是否启用脏矩形优化
   * 启用后，拖拽/变换时只重绘变化的区域
   * @default true
   */
  enableDirtyRect?: boolean;
  
  /** 
   * 是否启用动态图层拆分
   * 启用后，选择元素时会将 draw 层拆分为 bottom/selected/top 三层
   * 注意：此功能会增加内存占用和初始化开销，一般不需要启用
   * @default false
   */
  enableDynamicLayerSplit?: boolean;
  
  /**
   * 动态拆分阈值：只有当 bottom/top 层元素数量超过此值时才启用拆分
   * 仅在 enableDynamicLayerSplit 为 true 时生效
   * @default 100
   */
  dynamicSplitThreshold?: number;
}

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
  /** 
   * 渲染优化配置
   * 控制脏矩形算法和动态图层拆分等优化策略
   */
  optimizationConfig?: OptimizationConfig;
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
  private selectionManager!: CoreSelectionManager;

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

  /** SelectTool 协调器 - 处理选择工具的协调逻辑 */
  private selectToolCoordinator!: SelectToolCoordinator;
  
  /** 事件总线 - 组件间解耦通信 */
  private eventBus: EventBus;

  /** EventBus 事件取消订阅函数列表 */
  private eventUnsubscribers: Array<() => void> = [];

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
  
  /** 数据导入导出 API */
  private dataAPI!: DrawBoardDataAPI;

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
    
    // 初始化事件总线
    this.eventBus = new EventBus();
    
    try {
      // 🔧 使用 InitializationManager 统一初始化
      const coreComponents = InitializationManager.initializeCoreComponents(container, validatedConfig);
      
      // 保存容器元素引用
      this.container = container instanceof HTMLCanvasElement ? container : container;
      
      // 赋值核心组件
      this.canvasEngine = coreComponents.canvasEngine;
      this.toolManager = coreComponents.toolManager;
      this.historyManager = coreComponents.historyManager;
      this.selectionManager = coreComponents.selectionManager;
      this.performanceManager = coreComponents.performanceManager;
      this.complexityManager = coreComponents.complexityManager;
      this.virtualLayerManager = coreComponents.virtualLayerManager;
      this.eventManager = coreComponents.eventManager;
      this.shortcutManager = coreComponents.shortcutManager;
      this.exportManager = coreComponents.exportManager;
      this.resourceManager = coreComponents.resourceManager;
      
      // 初始化处理器
      // 🔧 注意：onStateChange 回调需要在 stateHandler 赋值后才能使用
      // 所以先创建一个临时变量存储 stateHandler，然后在回调中使用
      let stateHandlerRef: StateHandler | null = null;
      const handlers = InitializationManager.initializeHandlers(
        coreComponents,
        () => {
          // 在 stateHandler 赋值后，回调才能正常工作
          if (stateHandlerRef) {
            stateHandlerRef.emitStateChange();
          }
        },
        this.eventBus
      );
      
      this.drawingHandler = handlers.drawingHandler;
      this.cursorHandler = handlers.cursorHandler;
      this.stateHandler = handlers.stateHandler;
      stateHandlerRef = handlers.stateHandler; // 设置引用，使回调可以工作
      this.selectToolCoordinator = handlers.selectToolCoordinator;
      
      // 设置依赖关系
      InitializationManager.setupDependencies(coreComponents, handlers, this);
      
      // 配置运笔效果
      if (validatedConfig.strokeConfig) {
        this.setStrokeConfig(validatedConfig.strokeConfig);
      }
      
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
  // 初始化方法（已迁移到 InitializationManager）
  // ============================================

  /**
   * 初始化 API 模块
   * 在 handlers 初始化之后调用，确保所有依赖都已就绪
   */
  private initializeAPIModules(): void {
    // 🔧 使用配置对象替代多个回调参数
    const toolAPIConfig: ToolAPIConfig = {
      syncLayerDataToSelectTool: () => this.selectToolCoordinator.syncLayerDataToSelectTool(false),
      checkComplexityRecalculation: () => this.checkComplexityRecalculation(),
      updateCursor: () => this.updateCursor(),
      forceRedraw: () => this.drawingHandler.forceRedraw(),
      markNeedsClearSelectionUI: () => this.drawingHandler.markNeedsClearSelectionUI()
    };
    
    const historyAPIConfig: HistoryAPIConfig = {
      syncLayerDataToSelectTool: () => this.selectToolCoordinator.syncLayerDataToSelectTool(false)
    };
    
    const virtualLayerAPIConfig: VirtualLayerAPIConfig = {
      syncLayerDataToSelectTool: (preserveSelection?: boolean) => 
        this.selectToolCoordinator.syncLayerDataToSelectTool(preserveSelection ?? false)
    };
    
    const dataAPIConfig: DataAPIConfig = {
      applyActions: (actions) => {
        for (const action of actions) {
          this.historyManager.addAction(action);
          this.virtualLayerManager.handleNewAction(action);
        }
      },
      rebuildLayers: (layers) => {
        // 图层信息已通过 action.virtualLayerId 关联，此处可扩展
        logger.debug('图层数据已加载', { count: layers.length });
      },
      redraw: async () => {
        this.drawingHandler.invalidateOffscreenCache(true);
        await this.drawingHandler.forceRedraw();
      }
    };
    
    // 初始化虚拟图层 API
    this.virtualLayerAPI = new DrawBoardVirtualLayerAPI(
      this.virtualLayerManager,
      this.drawingHandler,
      this.toolManager,
      this.canvasEngine,
      virtualLayerAPIConfig
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
      toolAPIConfig
    );

    // 初始化历史记录 API
    this.historyAPI = new DrawBoardHistoryAPI(
      this.historyManager,
      this.drawingHandler,
      this.toolManager,
      historyAPIConfig
    );

    // 初始化数据导入导出 API
    this.dataAPI = new DrawBoardDataAPI(
      this.historyManager,
      this.virtualLayerManager,
      this.canvasEngine
    );
    
    // 设置数据加载回调
    this.dataAPI.setDataLoadCallback(dataAPIConfig);

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
    handleDoubleClick: (event: DrawEvent) => this.handleDoubleClick(event),
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
    this.eventManager.on('dblclick', this.boundEventHandlers.handleDoubleClick);
    
    // 绑定键盘事件（用于折线工具）
    this.bindKeyboardEvents();
    
    // 验证事件绑定
    const eventManagerInternal = this.eventManager as unknown as { handlers?: Map<string, Array<unknown>> };
    const mousedownHandlers = eventManagerInternal.handlers?.get('mousedown');
    logger.info('DrawBoard.bindEvents: 事件绑定完成', {
      mousedownHandlersCount: mousedownHandlers?.length || 0,
      allEventTypes: Array.from(eventManagerInternal.handlers?.keys() || []),
      totalHandlers: Array.from(eventManagerInternal.handlers?.values() || []).reduce((sum: number, h: Array<unknown>) => sum + h.length, 0)
    });

    // 监听工具栏样式变更事件
    this.eventUnsubscribers.push(
      this.eventBus.on('toolbar:stroke-color', ({ color }) => {
        this.updateSelectionStyle({ strokeStyle: color });
      })
    );
    this.eventUnsubscribers.push(
      this.eventBus.on('toolbar:fill-color', ({ color }) => {
        this.updateSelectionStyle({ fillStyle: color });
      })
    );
    this.eventUnsubscribers.push(
      this.eventBus.on('toolbar:line-width', ({ width }) => {
        this.updateSelectionStyle({ lineWidth: width });
      })
    );
    
    // 监听文本样式变更事件
    this.eventUnsubscribers.push(
      this.eventBus.on('toolbar:text-color', ({ color }) => {
        this.updateTextStyle({ color });
      })
    );
    this.eventUnsubscribers.push(
      this.eventBus.on('toolbar:font-size', ({ size }) => {
        this.updateTextStyle({ fontSize: size });
      })
    );
    this.eventUnsubscribers.push(
      this.eventBus.on('toolbar:font-weight', ({ weight }) => {
        this.updateTextStyle({ fontWeight: weight });
      })
    );

    // 监听工具栏删除和复制事件
    this.eventUnsubscribers.push(
      this.eventBus.on('toolbar:delete', () => {
        this.deleteSelection();
      })
    );
    this.eventUnsubscribers.push(
      this.eventBus.on('toolbar:duplicate', () => {
        this.duplicateSelection();
      })
    );
    
    // 监听图层移动事件
    this.eventUnsubscribers.push(
      this.eventBus.on('toolbar:move-to-top', () => {
        this.moveSelectionToTop();
      })
    );
    this.eventUnsubscribers.push(
      this.eventBus.on('toolbar:move-to-bottom', () => {
        this.moveSelectionToBottom();
      })
    );
    
    // 监听锁定/解锁事件
    this.eventUnsubscribers.push(
      this.eventBus.on('toolbar:toggle-lock', ({ locked }) => {
        this.toggleSelectionLock(locked);
      })
    );
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
      this.eventManager.off('dblclick', this.boundEventHandlers.handleDoubleClick);
    }
  }



  // ============================================
  // 配置和快捷键管理
  // ============================================

  /**
   * 绑定键盘事件（用于折线工具等）
   */
  private bindKeyboardEvents(): void {
    const container = this.container instanceof HTMLCanvasElement ? this.container : this.container;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // 忽略来自输入元素的键盘事件
      const target = e.target as HTMLElement;
      if (target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      )) {
        return;
      }
      
      const currentTool = this.toolManager.getCurrentTool();
      
      // 折线工具的键盘事件处理
      if (currentTool === 'polyline' && this.drawingHandler) {
        switch (e.key) {
          case 'Enter':
            e.preventDefault();
            e.stopPropagation();
            // 使用 async/await 确保异步操作完成
            this.drawingHandler.finishPolylineDrawing().catch(error => {
              logger.error('折线完成绘制失败（Enter键）', error);
            });
            break;
          case 'Escape':
            e.preventDefault();
            e.stopPropagation();
            this.drawingHandler.cancelPolylineDrawing();
            break;
          case 'Backspace':
            // 只在绘制中时处理，避免与删除选中内容的快捷键冲突
            if (this.drawingHandler.isDrawingState) {
              e.preventDefault();
              e.stopPropagation();
              this.drawingHandler.deletePolylineLastPoint();
            }
            break;
        }
      }
    };
    
    container.addEventListener('keydown', handleKeyDown);
    
    // 保存清理函数
    this.eventUnsubscribers.push(() => {
      container.removeEventListener('keydown', handleKeyDown);
    });
  }

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
    logger.debug('handleDrawStart 被调用', {
      tool: this.toolManager.getCurrentTool(),
      point: event.point
    });
    
    // 如果是选择工具，委托给 SelectToolCoordinator 处理
    if (this.toolManager.getCurrentTool() === 'select') {
      await this.selectToolCoordinator.handleDrawStart(event);
        this.updateCursor();
        return;
    }
    
    // 如果是文字工具，处理单击创建文字
    if (this.toolManager.getCurrentTool() === 'text') {
      await this.handleTextToolClick(event);
      return;
    }
    
    // 其他工具走正常的绘制流程
    this.drawingHandler.handleDrawStart(event);
    this.updateCursor();
  }
  
  /**
   * 处理文字工具的单击事件
   * - 如果点击了已有文本，进入编辑模式
   * - 如果点击了空白处，创建新文本
   */
  private async handleTextToolClick(event: DrawEvent): Promise<void> {
    try {
      const textTool = await this.toolManager.getTool('text');
      
      // 如果已经在编辑中，忽略新的点击
      if (textTool && ToolTypeGuards.isTextTool(textTool) && textTool.isEditing()) {
        logger.debug('文字工具正在编辑中，忽略点击事件');
        return;
      }
      
      // 检测是否点击了已有的文本对象
      const hitTextAction = this.findTextActionAtPoint(event.point);
      
      if (hitTextAction) {
        // 点击了已有文本，进入编辑模式
        await this.editExistingText(hitTextAction);
        logger.info('单击已有文字，进入编辑模式', { actionId: hitTextAction.id });
      } else {
        // 点击了空白处，创建新文本
        await this.createNewText(event.point);
        logger.info('单击创建新文字', { point: event.point });
      }
    } catch (error) {
      logger.error('文字工具单击处理失败', error);
      this.handleDoubleClickError(error);
    }
  }
  
  /**
   * 查找点击位置的文本对象
   */
  private findTextActionAtPoint(point: { x: number; y: number }): DrawAction | null {
    const allActions = this.historyManager.getHistory();
    const tolerance = 5; // 点击容差（像素）
    
    // 从后往前遍历（后绘制的在上层）
    for (let i = allActions.length - 1; i >= 0; i--) {
      const action = allActions[i];
      if (action.type === 'text' && this.isPointInTextBounds(point, action, tolerance)) {
        return action;
      }
    }
    
    return null;
  }
  
  /**
   * 检测点是否在文本边界内
   * 📝 统一使用 points[0] + width/height 规范
   */
  private isPointInTextBounds(point: { x: number; y: number }, action: DrawAction, tolerance: number): boolean {
    if (!action.points || action.points.length === 0) return false;
    
    const textAction = action as TextAction;
    const textPoint = action.points[0];
    
    if (!textPoint || !isFinite(textPoint.x) || !isFinite(textPoint.y)) {
      return false;
    }
    
    const text = textAction.text || '';
    const fontSize = textAction.fontSize || 16;
    const lineHeight = fontSize * (textAction.lineHeight ?? 1.2);
    
    // 📝 统一使用 width/height 属性，如果不存在则估算
    let width: number;
    let height: number;
    
    if (textAction.width && textAction.width > 0) {
      width = textAction.width;
      // 如果 height 存在，使用它；否则估算多行文本高度
      if (textAction.height && textAction.height > 0) {
        height = textAction.height;
      } else {
        height = this.estimateMultilineTextHeight(text, fontSize, lineHeight, width);
      }
    } else {
      // 估算单行文本
      width = this.estimateTextWidth(text, fontSize);
      height = lineHeight;
    }
    
    const bounds = {
      x: textPoint.x - tolerance,
      y: textPoint.y - tolerance,
      width: width + tolerance * 2,
      height: height + tolerance * 2
    };
    
    return (
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.height
    );
  }
  
  /**
   * 估算文本宽度（单行）
   */
  private estimateTextWidth(text: string, fontSize: number): number {
    let estimatedWidth = 0;
    for (const char of text) {
      if (/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(char)) {
        estimatedWidth += fontSize;
      } else {
        estimatedWidth += fontSize * 0.6;
      }
    }
    return Math.max(estimatedWidth, fontSize);
  }
  
  /**
   * 估算多行文本的高度
   */
  private estimateMultilineTextHeight(text: string, fontSize: number, lineHeight: number, maxWidth: number): number {
    if (!text || maxWidth <= 0) {
      return lineHeight;
    }
    
    const paragraphs = text.split('\n');
    let totalLines = 0;
    const avgCharWidth = fontSize * 0.8;
    const charsPerLine = Math.max(1, Math.floor(maxWidth / avgCharWidth));
    
    for (const paragraph of paragraphs) {
      if (paragraph.length === 0) {
        totalLines += 1;
      } else {
        const paragraphLines = Math.ceil(paragraph.length / charsPerLine);
        totalLines += Math.max(1, paragraphLines);
      }
    }
    
    return Math.max(lineHeight, totalLines * lineHeight);
  }
  
  /**
   * 编辑已有文本
   */
  private async editExistingText(textAction: DrawAction): Promise<void> {
    // 初始化文字工具编辑管理器
    const canvasContainer = this.canvasEngine.getContainer();
    await this.toolAPI.initializeTextToolEditing(canvasContainer);
    
    // ⭐ 先设置 editingActionId，确保在任何重绘中都跳过该文本
    // 这必须在 editExisting 之前设置，避免重影
    this.drawingHandler.setEditingActionId(textAction.id);
    this.drawingHandler.forceRedraw();
    
    // 记录当前编辑的 actionId，用于在 editingEnded 时判断是否是这个会话
    const currentEditingActionId = textAction.id;
    
    // 获取文字工具并开始编辑
    const textTool = await this.toolManager.getTool('text');
    if (textTool && ToolTypeGuards.isTextTool(textTool)) {
      const canvasBounds = this.canvasEngine.getCanvas().getBoundingClientRect();
      textTool.editExisting(textAction, canvasBounds);
      
      // 监听编辑完成事件
      const unsubscribe = textTool.on((textEvent) => {
        try {
          if (textEvent.type === 'textUpdated' && textEvent.action) {
            // 只处理当前编辑会话的事件
            if (textEvent.action.id === currentEditingActionId) {
              this.historyManager.updateAction(textEvent.action);
              logger.debug('文字已更新', { actionId: textEvent.action.id });
            }
          }
          
          if (textEvent.type === 'editingEnded') {
            // ⭐ 只处理当前编辑会话的事件
            const eventActionId = (textEvent as { actionId?: string | null }).actionId ?? null;
            if (eventActionId !== currentEditingActionId) {
              // 不是这个会话的事件，忽略（不要 unsubscribe）
              return;
            }
            
            // 只有当 editingActionId 仍然是这个 actionId 时才清除
            const currentId = this.drawingHandler.getEditingActionId();
            if (currentId === currentEditingActionId) {
              this.drawingHandler.setEditingActionId(null);
              this.drawingHandler.forceRedraw();
            }
            unsubscribe();
          }
        } catch (eventError) {
          logger.error('处理文字更新事件失败', eventError);
        }
      });
    }
  }
  
  /**
   * 创建新文本
   */
  private async createNewText(point: { x: number; y: number }): Promise<void> {
    // 初始化文字工具编辑管理器
    const canvasContainer = this.canvasEngine.getContainer();
    await this.toolAPI.initializeTextToolEditing(canvasContainer);
    
    // 获取当前画布上下文的颜色设置
    const ctx = this.canvasEngine.getContext();
    const color = ctx.fillStyle as string || '#000000';
    
    // 开始新建文字
    await this.toolAPI.startTextEditing(point, {
      color,
      fontSize: 16,
      fontFamily: 'Arial'
    });
    
    // 获取文字工具并监听事件
    const textTool = await this.toolManager.getTool('text');
    if (textTool && ToolTypeGuards.isTextTool(textTool)) {
      const unsubscribe = textTool.on((textEvent) => {
        try {
          if (textEvent.type === 'textCreated' && textEvent.action) {
            // 添加到历史记录
            this.historyManager.addAction(textEvent.action);
            this.drawingHandler.forceRedraw();
            logger.debug('新文字已创建', { actionId: textEvent.action.id });
          }
          
          if (textEvent.type === 'editingEnded') {
            unsubscribe();
          }
        } catch (eventError) {
          logger.error('处理文字创建事件失败', eventError);
        }
      });
    }
  }

  private handleDrawMove(event: DrawEvent): void {
    // 如果是选择工具，委托给 SelectToolCoordinator 处理
    // SelectToolCoordinator 内部会区分悬停和拖拽
    if (this.toolManager.getCurrentTool() === 'select') {
      const { needsCursorUpdate } = this.selectToolCoordinator.handleDrawMove(event);
      if (needsCursorUpdate) {
        this.updateCursor();
      }
        return;
    }
    
    // 其他绘制工具：只有在鼠标/手指按下状态时才处理绑画
    // 确保释放后绑画立即结束
    if (!event.isPointerDown) {
      return;
    }
    
    // 其他工具走正常的绑画流程
    this.drawingHandler.handleDrawMove(event);
    this.updateCursor();
  }

  // ============================================
  // 脏矩形性能统计（预留功能）
  // ============================================
  
  /**
   * 脏矩形性能统计
   * 
   * ⚠️ 预留功能：目前未使用，保留用于将来的性能监控
   * 如果将来需要监控脏矩形性能，可以在重绘流程中记录性能指标
   */
  private dirtyRectPerformanceStats?: {
    totalRedraws: number;
    dirtyRectRedraws: number;
    fullRedraws: number;
    averageDirtyRectTime: number;
    averageFullRedrawTime: number;
    savedTimeMs: number;
  };
  
  /**
   * 获取脏矩形性能统计
   * 
   * ⚠️ 预留功能：目前返回 null，因为性能统计功能尚未集成
   */
  public getDirtyRectPerformanceStats() {
    return this.dirtyRectPerformanceStats ?? null;
  }
  
  /**
   * 重置脏矩形性能统计
   * 
   * ⚠️ 预留功能：目前无效果，因为性能统计功能尚未集成
   */
  public resetDirtyRectPerformanceStats(): void {
    this.dirtyRectPerformanceStats = undefined;
  }

  // ============================================
  // 脏矩形调试 API
  // ============================================

  /**
   * 启用/禁用脏矩形调试模式
   * 开启后会在画布上显示脏矩形可视化
   */
  public setDirtyRectDebugEnabled(enabled: boolean): void {
    this.drawingHandler.setDirtyRectDebugEnabled(enabled);
  }

  /**
   * 获取脏矩形调试模式状态
   */
  public isDirtyRectDebugEnabled(): boolean {
    return this.drawingHandler.isDirtyRectDebugEnabled();
  }

  /**
   * 切换脏矩形调试模式
   */
  public toggleDirtyRectDebug(): boolean {
    const newState = !this.isDirtyRectDebugEnabled();
    this.setDirtyRectDebugEnabled(newState);
    return newState;
  }

  /**
   * 获取脏矩形调试控制器
   * 可以挂载到 window 对象用于开发者工具
   * 
   * @example
   * ```typescript
   * // 挂载到 window 用于浏览器开发者工具调试
   * (window as any).dirtyRectDebug = drawBoard.getDirtyRectDebugController();
   * 
   * // 然后在控制台中使用：
   * dirtyRectDebug.enable();           // 启用调试
   * dirtyRectDebug.getStats();         // 获取统计
   * dirtyRectDebug.toggle();           // 切换状态
   * ```
   */
  public getDirtyRectDebugController() {
    return this.drawingHandler.getDirtyRectDebugController();
  }

  /**
   * 手动绘制脏矩形调试覆盖层
   * 在需要时手动触发调试可视化绘制
   */
  public drawDirtyRectDebugOverlay(): void {
    this.drawingHandler.drawDirtyRectDebugOverlay();
  }

  // ============================================
  // 优化配置 API
  // ============================================

  /**
   * 获取当前优化配置
   */
  public getOptimizationConfig(): OptimizationConfig {
    return {
      enableDirtyRect: true, // 脏矩形始终启用
      enableDynamicLayerSplit: this.virtualLayerManager?.isDynamicLayerSplitEnabled() ?? false,
      dynamicSplitThreshold: this.virtualLayerManager?.getDynamicSplitThreshold() ?? 100
    };
  }

  /**
   * 设置是否启用动态图层拆分
   * 注意：脏矩形算法已足够优化，一般不需要启用动态拆分
   * 
   * @param enabled 是否启用
   */
  public setDynamicLayerSplitEnabled(enabled: boolean): void {
    this.virtualLayerManager?.setDynamicLayerSplitEnabled(enabled);
    logger.info(`动态图层拆分: ${enabled ? '启用' : '禁用'}`);
  }

  /**
   * 获取是否启用动态图层拆分
   */
  public isDynamicLayerSplitEnabled(): boolean {
    return this.virtualLayerManager?.isDynamicLayerSplitEnabled() ?? false;
  }

  /**
   * 设置动态拆分阈值
   * 只有当 bottom/top 层元素数量超过此值时才启用拆分
   * 
   * @param threshold 阈值
   */
  public setDynamicSplitThreshold(threshold: number): void {
    this.virtualLayerManager?.setDynamicSplitThreshold(threshold);
  }

  /**
   * 处理绘制结束事件
   */
  private async handleDrawEnd(event: DrawEvent): Promise<void> {
    try {
      // 如果是选择工具，委托给 SelectToolCoordinator 处理
      // 注意：handleDrawEnd 内部已经调用了 forceRedraw()，不需要重复调用
      if (this.toolManager.getCurrentTool() === 'select') {
        await this.selectToolCoordinator.handleDrawEnd();
        this.updateCursor();
        return;
      }
      
      // 其他工具走正常的绘制流程
      this.drawingHandler.handleDrawEnd(event);
      this.updateCursor();
    } catch (error) {
      logger.error('绘制结束事件处理失败', error);
    }
  }

  /**
   * 处理双击事件
   * 用于：
   * - 双击文字进入编辑模式
   * - 双击空白处创建新文字（当文字工具激活时）
   */
  private async handleDoubleClick(event: DrawEvent): Promise<void> {
    try {
      logger.debug('handleDoubleClick 被调用', {
        tool: this.toolManager.getCurrentTool(),
        point: event.point
      });
      
      const currentTool = this.toolManager.getCurrentTool();
      
      // 如果是选择工具，检查是否双击了文字对象
      if (currentTool === 'select') {
        await this.handleSelectToolDoubleClick();
        return;
      }
      
      // 如果是文字工具，开始新建文字
      if (currentTool === 'text') {
        await this.handleTextToolDoubleClick(event);
        return;
      }
      
      // 如果是折线工具，完成绘制
      if (currentTool === 'polyline') {
        await this.handlePolylineDoubleClick(event);
        return;
      }
      
      logger.debug('双击事件未处理（当前工具不支持）', { currentTool });
    } catch (error) {
      logger.error('双击事件处理失败', error);
      this.handleDoubleClickError(error);
    }
  }
  
  /**
   * 处理折线工具双击事件（完成绘制）
   */
  private async handlePolylineDoubleClick(event: DrawEvent): Promise<void> {
    try {
      if (!this.drawingHandler) return;
      
      // 完成折线绘制
      await this.drawingHandler.finishPolylineDrawing();
      
      logger.debug('折线绘制完成（双击）', { point: event.point });
    } catch (error) {
      logger.error('折线双击事件处理失败', error);
    }
  }
  
  /**
   * 处理双击错误，提供用户友好的错误提示
   */
  private handleDoubleClickError(error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    
    // 发出错误事件，让上层UI可以显示提示
    this.eventBus?.emit('error:occurred', {
      type: 'text-editing',
      message: `文字编辑失败: ${errorMessage}`,
      recoverable: true,
      timestamp: Date.now()
    });
    
    // 尝试恢复到安全状态
    try {
      this.setTool('select');
    } catch (recoveryError) {
      logger.error('恢复状态失败', recoveryError);
    }
  }

  /**
   * 选择工具的双击处理
   * 如果双击了文字对象，进入编辑模式
   */
  private async handleSelectToolDoubleClick(): Promise<void> {
    try {
      const selectTool = this.toolManager.getCurrentToolInstance();
      if (!selectTool || !ToolTypeGuards.isSelectTool(selectTool)) {
        return;
      }
      
      // 获取选中的 actions
      const selectedActions = selectTool.getSelectedActions();
      
      // 检查是否有选中的文字对象
      const textAction = selectedActions.find(action => action.type === 'text');
      
      if (textAction) {
        logger.info('双击选中的文字，进入编辑模式', { actionId: textAction.id });
        
        // 切换到文字工具并开始编辑
        await this.setTool('text');
        
        // 初始化文字工具编辑管理器（如果还没有初始化）
        // 使用 CanvasEngine 的容器，因为 canvas 元素是在那里创建的
        const canvasContainer = this.canvasEngine.getContainer();
        await this.toolAPI.initializeTextToolEditing(canvasContainer);
        
        // 获取文字工具并开始编辑已有文字
        const textTool = await this.toolManager.getTool('text');
        if (textTool && ToolTypeGuards.isTextTool(textTool)) {
          // ⭐ 先设置 editingActionId，确保在任何重绘中都跳过该文本，避免重影
          this.drawingHandler.setEditingActionId(textAction.id);
          this.drawingHandler.forceRedraw();
          
          // 记录当前编辑的 actionId，用于在 editingEnded 时判断
          const currentEditingActionId = textAction.id;
          
          const canvasBounds = this.canvasEngine.getCanvas().getBoundingClientRect();
          textTool.editExisting(textAction, canvasBounds);
          
          // 监听文字编辑完成事件
          const unsubscribe = textTool.on((textEvent) => {
            try {
              if (textEvent.type === 'textCreated' || textEvent.type === 'textUpdated') {
                // 只处理当前编辑会话的事件
                if (textEvent.action && textEvent.action.id === currentEditingActionId) {
                  if (textEvent.type === 'textUpdated') {
                    this.historyManager.updateAction(textEvent.action);
                    logger.debug('文字已更新', { actionId: textEvent.action.id });
                  } else {
                    this.historyManager.addAction(textEvent.action);
                    logger.debug('文字已添加', { actionId: textEvent.action.id });
                  }
                }
              }
              
              if (textEvent.type === 'editingEnded') {
                // ⭐ 只处理当前编辑会话的事件
                const eventActionId = (textEvent as { actionId?: string | null }).actionId ?? null;
                if (eventActionId !== currentEditingActionId) {
                  // 不是这个会话的事件，忽略（不要 unsubscribe）
                  return;
                }
                
                // 只有当 editingActionId 仍然是这个 actionId 时才清除
                const currentId = this.drawingHandler.getEditingActionId();
                if (currentId === currentEditingActionId) {
                  this.drawingHandler.setEditingActionId(null);
                  this.drawingHandler.forceRedraw();
                  // 编辑结束后切回选择工具
                  this.setTool('select');
                }
                unsubscribe();
              }
            } catch (eventError) {
              logger.error('处理文字编辑事件失败', eventError);
            }
          });
        } else {
          throw new Error('无法获取文字工具实例');
        }
      } else {
        logger.debug('双击未命中文字对象');
      }
    } catch (error) {
      logger.error('选择工具双击处理失败', error);
      this.handleDoubleClickError(error);
    }
  }

  /**
   * 文字工具的双击处理
   * - 如果正在编辑中：选中当前单词
   * - 如果双击已有文本：进入编辑并选中单词
   * - 如果双击空白处：创建新文字
   */
  private async handleTextToolDoubleClick(event: DrawEvent): Promise<void> {
    try {
      const textTool = await this.toolManager.getTool('text');
      
      // 如果已经在编辑中，选中当前光标位置的单词
      if (textTool && ToolTypeGuards.isTextTool(textTool) && textTool.isEditing()) {
        textTool.selectWordAtCursor();
        logger.info('双击选中单词');
        return;
      }
      
      // 检测是否双击了已有的文本对象
      const hitTextAction = this.findTextActionAtPoint(event.point);
      
      if (hitTextAction) {
        // 双击了已有文本，进入编辑模式并选中单词
        await this.editExistingText(hitTextAction);
        
        // 稍微延迟后选中单词（等待编辑器初始化完成）
        setTimeout(() => {
          if (textTool && ToolTypeGuards.isTextTool(textTool)) {
            textTool.selectWordAtCursor();
          }
        }, 50);
        
        logger.info('双击已有文字，进入编辑并选中单词', { actionId: hitTextAction.id });
      } else {
        // 双击了空白处，创建新文字
        await this.createNewText(event.point);
        logger.info('双击创建新文字', { point: event.point });
      }
    } catch (error) {
      logger.error('文字工具双击处理失败', error);
      this.handleDoubleClickError(error);
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
    
    // 切换工具前，先清理之前的绘制状态（包括折线工具的自动完成）
    const currentTool = this.toolManager.getCurrentTool();
    if (currentTool !== toolType) {
      // 如果当前有正在进行的绘制（如折线），先完成或清理
      if (this.drawingHandler && 'resetDrawingState' in this.drawingHandler) {
        (this.drawingHandler as { resetDrawingState: () => void }).resetDrawingState();
        logger.info('DrawBoard.setTool: 已清理DrawingHandler的绘制状态', {
          fromTool: currentTool,
          toTool: toolType
        });
      }
    }
    
    // 如果切换到select工具，验证事件管理器状态
    if (toolType === 'select') {
      
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
  // 公共API - 数据导入导出
  // ============================================

  /**
   * 导出为 JSON 对象
   */
  public exportData(options?: import('./utils/DataExporter').ExportOptions): import('./utils/DataExporter').DrawBoardExportData {
    return this.dataAPI.exportData(options);
  }

  /**
   * 导出为 JSON 字符串
   */
  public exportToJSON(options?: import('./utils/DataExporter').ExportOptions): string {
    return this.dataAPI.exportToJSON(options);
  }

  /**
   * 下载为 JSON 文件
   */
  public downloadAsJSON(options?: import('./utils/DataExporter').ExportOptions): void {
    this.dataAPI.downloadAsJSON(options);
  }

  /**
   * 从 JSON 字符串导入数据
   */
  public async importFromJSON(jsonString: string, options?: import('./utils/DataImporter').ImportOptions): Promise<import('./utils/DataImporter').ImportResult> {
    return this.dataAPI.importFromJSON(jsonString, options);
  }

  /**
   * 从文件导入数据
   */
  public async importFromFile(file: File, options?: import('./utils/DataImporter').ImportOptions): Promise<import('./utils/DataImporter').ImportResult> {
    return this.dataAPI.importFromFile(file, options);
  }

  /**
   * 打开文件选择器并导入
   */
  public async openImportDialog(options?: import('./utils/DataImporter').ImportOptions): Promise<import('./utils/DataImporter').ImportResult> {
    return this.dataAPI.openFileDialog(options);
  }

  /**
   * 获取数据统计
   */
  public getDataStats(): { actionsCount: number; layersCount: number; estimatedSize: number } {
    return this.dataAPI.getDataStats();
  }

  /**
   * 验证 JSON 数据
   */
  public validateJSON(jsonString: string): { valid: boolean; errors: string[]; warnings: string[] } {
    return this.dataAPI.validateJSON(jsonString);
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
   * 复制选中的图形（在画布上直接创建副本）
   * individual 模式下会复制图层 + action
   */
  public async duplicateSelection(): Promise<DrawAction[]> {
    return this.selectionAPI.duplicateSelection();
  }
  
  /**
   * 将选中图形的图层移动到最顶层
   */
  public async moveSelectionToTop(): Promise<void> {
    return this.selectionAPI.moveSelectionToTop();
  }
  
  /**
   * 将选中图形的图层移动到最底层
   */
  public async moveSelectionToBottom(): Promise<void> {
    return this.selectionAPI.moveSelectionToBottom();
  }
  
  /**
   * 切换选中图形的锁定状态
   * @param locked 是否锁定
   */
  public async toggleSelectionLock(locked: boolean): Promise<void> {
    return this.selectionAPI.toggleSelectionLock(locked);
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

  /**
   * 插入图片
   * @param imageUrl 图片 URL 或 base64 字符串
   * @param x 图片左上角 x 坐标（可选，默认画布中心）
   * @param y 图片左上角 y 坐标（可选，默认画布中心）
   * @param width 图片宽度（可选，默认 200）
   * @param height 图片高度（可选，默认 200）
   * @returns 创建的图片 action
   */
  public async insertImage(
    imageUrl: string,
    x?: number,
    y?: number,
    width: number = 200,
    height: number = 200
  ): Promise<DrawAction> {
    try {
      // 获取画布尺寸
      const canvas = this.canvasEngine.getCanvas();
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      
      // 如果没有指定位置，默认放在画布中心
      const imageX = x ?? (canvasWidth / 2 - width / 2);
      const imageY = y ?? (canvasHeight / 2 - height / 2);
      
      // 创建图片工具
      const { ImageTool } = await import('./tools/ImageTool');
      const imageTool = new ImageTool();
      
      // 🔧 性能优化：先预加载图片，避免重绘时阻塞
      let preloadedImage: HTMLImageElement | ImageBitmap | undefined;
      try {
        await imageTool.preloadImage(imageUrl);
        // 获取预加载的图片
        preloadedImage = imageTool.getCachedImage(imageUrl);
      } catch (error) {
        logger.warn('图片预加载失败，将在绘制时加载', { url: imageUrl.substring(0, 50), error });
        // 继续执行，图片会在绘制时加载
      }
      
      // 创建图片 action（图片已预加载，draw() 会立即绘制）
      const imageAction = imageTool.createImageAction({
        imageUrl,
        position: { x: imageX, y: imageY },
        width,
        height
      });
      
      // 🔧 关键修复：将预加载的图片设置到 action 的 imageElement 属性上
      // 这样重绘时就能立即使用，不依赖工具实例的缓存
      if (preloadedImage && imageTool.isValidImage(preloadedImage)) {
        imageAction.imageElement = preloadedImage;
        imageAction.loadState = 'loaded';
        
        // 更新原始尺寸信息
        if (!imageAction.originalWidth || !imageAction.originalHeight) {
          if (preloadedImage instanceof HTMLImageElement) {
            imageAction.originalWidth = preloadedImage.naturalWidth;
            imageAction.originalHeight = preloadedImage.naturalHeight;
          } else {
            imageAction.originalWidth = preloadedImage.width;
            imageAction.originalHeight = preloadedImage.height;
          }
        }
        
        logger.debug('图片已预加载并设置到 action', { 
          actionId: imageAction.id,
          imageWidth: imageAction.originalWidth,
          imageHeight: imageAction.originalHeight
        });
      }
      
      // 分配虚拟图层（避免"未分配的动作"警告）
      this.virtualLayerManager.handleNewAction(imageAction);
      
      // 添加到历史记录
      this.historyManager.addAction(imageAction);
      
      // 触发重绘（图片已加载，会立即显示）
      await this.drawingHandler.forceRedraw();
      
      logger.debug('图片已插入', { 
        actionId: imageAction.id, 
        url: imageUrl.substring(0, 50) + '...',
        x: imageX,
        y: imageY,
        width,
        height
      });
      
      return imageAction;
    } catch (error) {
      logger.error('插入图片失败', error);
      throw error;
    }
  }

  /**
   * 更新选中图形的样式（颜色、线宽等）
   * @param style 样式对象，支持 strokeStyle（描边颜色）、fillStyle（填充颜色）和 lineWidth（线宽）
   * @example
   * // 修改描边颜色
   * drawBoard.updateSelectionStyle({ strokeStyle: '#ff0000' });
   * // 修改填充颜色
   * drawBoard.updateSelectionStyle({ fillStyle: '#00ff00' });
   * // 修改线宽
   * drawBoard.updateSelectionStyle({ lineWidth: 3 });
   * // 同时修改多个属性
   * drawBoard.updateSelectionStyle({ strokeStyle: '#ff0000', fillStyle: '#00ff00', lineWidth: 5 });
   */
  public async updateSelectionStyle(style: { strokeStyle?: string; fillStyle?: string; lineWidth?: number }): Promise<void> {
    return this.selectionAPI.updateSelectionStyle(style);
  }

  /**
   * 更新选中文本的样式
   */
  public async updateTextStyle(style: { color?: string; fontSize?: number; fontWeight?: string }): Promise<void> {
    return this.selectionAPI.updateTextStyle(style);
  }

  /**
   * 导出选中元素为 JSON 对象
   */
  public exportSelectionData(options?: import('./utils/DataExporter').ExportOptions): import('./utils/DataExporter').DrawBoardExportData | null {
    return this.selectionAPI.exportSelectionData(options);
  }

  /**
   * 导出选中元素为 JSON 字符串
   */
  public exportSelectionToJSON(options?: import('./utils/DataExporter').ExportOptions): string | null {
    return this.selectionAPI.exportSelectionToJSON(options);
  }

  /**
   * 下载选中元素为 JSON 文件
   */
  public downloadSelectionAsJSON(options?: import('./utils/DataExporter').ExportOptions): boolean {
    return this.selectionAPI.downloadSelectionAsJSON(options);
  }

  /**
   * 复制选中元素的 JSON 到剪贴板
   */
  public async copySelectionAsJSON(options?: import('./utils/DataExporter').ExportOptions): Promise<boolean> {
    return this.selectionAPI.copySelectionAsJSON(options);
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
      
      // 1.5 清理 EventBus 订阅
      for (const unsubscribe of this.eventUnsubscribers) {
        unsubscribe();
      }
      this.eventUnsubscribers = [];
      logger.debug('✅ EventBus订阅已清理');
      
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
      
      // 6. 清理DrawingHandler
      // 【修复】之前检查的是 dispose 方法，但实际上 DrawingHandler 有 destroy 方法
      if (this.drawingHandler && typeof this.drawingHandler.destroy === 'function') {
        this.drawingHandler.destroy();
        logger.debug('✅ DrawingHandler已销毁');
      }
      
      // 7. 清理CursorHandler
      // 【修复】之前检查的是 dispose 方法，但实际上 CursorHandler 有 destroy 方法
      if (this.cursorHandler && typeof this.cursorHandler.destroy === 'function') {
        this.cursorHandler.destroy();
        logger.debug('✅ CursorHandler已销毁');
      }
      
      // 8. 清理StateHandler
      // 【修复】之前检查的是 dispose 方法，但实际上 StateHandler 有 destroy 方法
      if (this.stateHandler && typeof this.stateHandler.destroy === 'function') {
        this.stateHandler.destroy();
        logger.debug('✅ StateHandler已销毁');
      }
      
      // 8.5 清理 SelectToolCoordinator
      if (this.selectToolCoordinator && typeof this.selectToolCoordinator.destroy === 'function') {
        this.selectToolCoordinator.destroy();
        logger.debug('✅ SelectToolCoordinator已销毁');
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
      this.selectionManager = null as unknown as CoreSelectionManager;
      this.performanceManager = null as unknown as PerformanceManager;
      this.complexityManager = null as unknown as ComplexityManager;
      this.virtualLayerManager = null as unknown as VirtualLayerManager;
      this.drawingHandler = null as unknown as DrawingHandler;
      this.cursorHandler = null as unknown as CursorHandler;
      this.stateHandler = null as unknown as StateHandler;
      this.selectToolCoordinator = null as unknown as SelectToolCoordinator;
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
    this.selectToolCoordinator.forceSyncSelectToolData();
    
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