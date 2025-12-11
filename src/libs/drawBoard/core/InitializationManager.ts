import { CanvasEngine } from './CanvasEngine';
import { ToolManager } from '../tools/ToolManager';
import { HistoryManager } from '../history/HistoryManager';
import { EventManager } from '../infrastructure/events/EventManager';
import { ShortcutManager } from '../shortcuts/ShortcutManager';
import { ExportManager } from '../utils/ExportManager';
import { SelectionManager } from './SelectionManager';
import { PerformanceManager } from './PerformanceManager';
import { ComplexityManager } from './ComplexityManager';
import { VirtualLayerManager } from './VirtualLayerManager';
import { DrawingHandler } from '../handlers/DrawingHandler';
import { CursorHandler } from '../handlers/CursorHandler';
import { StateHandler } from '../handlers/StateHandler';
import { LightweightResourceManager } from '../utils/LightweightResourceManager';
import type { DrawBoardConfig } from '../DrawBoard';
import { logger } from '../infrastructure/logging/Logger';

/**
 * 核心组件接口
 */
export interface CoreComponents {
  canvasEngine: CanvasEngine;
  toolManager: ToolManager;
  historyManager: HistoryManager;
  selectionManager: SelectionManager;
  performanceManager: PerformanceManager;
  complexityManager: ComplexityManager;
  virtualLayerManager: VirtualLayerManager;
  eventManager: EventManager;
  shortcutManager: ShortcutManager;
  exportManager: ExportManager;
  resourceManager?: LightweightResourceManager;
}

/**
 * 处理器接口
 */
export interface Handlers {
  drawingHandler: DrawingHandler;
  cursorHandler: CursorHandler;
  stateHandler: StateHandler;
}

/**
 * 初始化管理器
 * 负责DrawBoard的初始化逻辑，提高代码可维护性
 */
export class InitializationManager {
  /**
   * 初始化核心组件
   */
  static initializeCoreComponents(
    container: HTMLCanvasElement | HTMLDivElement,
    config: DrawBoardConfig
  ): CoreComponents {
    // Canvas引擎
    const canvasEngine = new CanvasEngine(container);
    
    // 工具管理器
    const toolManager = new ToolManager();
    
    // 历史记录管理器
    const historyManager = new HistoryManager();
    
    // 选择管理器
    const selectionManager = new SelectionManager();
    
    // 性能管理器
    const performanceManager = new PerformanceManager(config.performanceConfig);
    
    // 复杂度管理器
    const complexityManager = new ComplexityManager();
    
    // 虚拟图层管理器
    const virtualLayerManager = new VirtualLayerManager(
      config.virtualLayerConfig,
      canvasEngine
    );
    
    // 设置依赖关系
    virtualLayerManager.setHistoryManager(historyManager);
    
    // 事件管理器 - 绑定到交互层
    const interactionCanvas = canvasEngine.getLayer('interaction')?.canvas;
    const eventManager = interactionCanvas
      ? new EventManager(interactionCanvas)
      : new EventManager(
          container instanceof HTMLCanvasElement
            ? container
            : document.createElement('canvas')
        );
    
    // 快捷键管理器
    const shortcutManager = new ShortcutManager();
    
    // 导出管理器
    const exportManager = new ExportManager(canvasEngine.getCanvas());
    
    // 资源管理器（默认启用，使用单例）
    const resourceManager = LightweightResourceManager.getInstance();
    
    // 配置历史记录大小
    if (config.maxHistorySize) {
      historyManager.setMaxHistorySize(config.maxHistorySize);
    }
    
    logger.info('核心组件初始化完成');
    
    return {
      canvasEngine,
      toolManager,
      historyManager,
      selectionManager,
      performanceManager,
      complexityManager,
      virtualLayerManager,
      eventManager,
      shortcutManager,
      exportManager,
      resourceManager
    };
  }
  
  /**
   * 初始化处理器
   */
  static initializeHandlers(
    coreComponents: CoreComponents,
    onStateChange: () => void
  ): Handlers {
    // 状态处理器（不依赖其他处理器）
    const stateHandler = new StateHandler(
      coreComponents.toolManager,
      coreComponents.historyManager,
      coreComponents.selectionManager,
      coreComponents.performanceManager
    );
    
    // 绘制处理器
    const drawingHandler = new DrawingHandler(
      coreComponents.canvasEngine,
      coreComponents.toolManager,
      coreComponents.historyManager,
      onStateChange,
      coreComponents.virtualLayerManager
    );
    
    // 设置drawingHandler到stateHandler
    stateHandler.setDrawingHandler(drawingHandler);
    
    // 鼠标样式处理器
    const interactionCanvas = coreComponents.canvasEngine.getLayer('interaction')?.canvas;
    const container = coreComponents.canvasEngine.getContainer();
    const cursorHandler = interactionCanvas
      ? new CursorHandler(container, interactionCanvas)
      : new CursorHandler(container);
    
    logger.info('处理器初始化完成');
    
    return {
      drawingHandler,
      cursorHandler,
      stateHandler
    };
  }
  
  /**
   * 设置依赖关系
   */
  static setupDependencies(
    coreComponents: CoreComponents,
    _handlers: Handlers, // 保留用于将来扩展
    drawBoardInstance: { recalculateComplexity: () => void } // DrawBoard实例，用于设置引用
  ): void {
    // 设置PerformanceManager的DrawBoard引用
    coreComponents.performanceManager.setDrawBoard(drawBoardInstance);
    
    // 设置ComplexityManager的依赖关系
    coreComponents.complexityManager.setDependencies(
      coreComponents.historyManager,
      coreComponents.performanceManager as unknown as {
        getMemoryStats(): { cacheHitRate: number; underMemoryPressure: boolean };
        updateConfig(config: { complexityThreshold: number }): void;
        stats: { totalDrawCalls: number };
      }
    );
    
    logger.debug('依赖关系设置完成');
  }
}

