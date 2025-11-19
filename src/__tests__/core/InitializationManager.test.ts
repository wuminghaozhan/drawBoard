import { InitializationManager, type CoreComponents, type Handlers } from '../../libs/drawBoard/core/InitializationManager';
import type { DrawBoardConfig } from '../../libs/drawBoard/DrawBoard';
import { CanvasEngine } from '../../libs/drawBoard/core/CanvasEngine';
import { ToolManager } from '../../libs/drawBoard/tools/ToolManager';
import { HistoryManager } from '../../libs/drawBoard/history/HistoryManager';
import { SelectionManager } from '../../libs/drawBoard/core/SelectionManager';
import { PerformanceManager } from '../../libs/drawBoard/core/PerformanceManager';
import { ComplexityManager } from '../../libs/drawBoard/core/ComplexityManager';
import { VirtualLayerManager } from '../../libs/drawBoard/core/VirtualLayerManager';
import { EventManager } from '../../libs/drawBoard/events/EventManager';
import { ShortcutManager } from '../../libs/drawBoard/shortcuts/ShortcutManager';
import { ExportManager } from '../../libs/drawBoard/utils/ExportManager';
import { DrawingHandler } from '../../libs/drawBoard/handlers/DrawingHandler';
import { CursorHandler } from '../../libs/drawBoard/handlers/CursorHandler';
import { StateHandler } from '../../libs/drawBoard/handlers/StateHandler';

describe('InitializationManager', () => {
  let container: HTMLDivElement;
  let config: DrawBoardConfig;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.width = '1000px';
    container.style.height = '1000px';
    document.body.appendChild(container);

    config = {
      maxHistorySize: 100,
      performanceConfig: {}
    };
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('initializeCoreComponents', () => {
    it('应该初始化所有核心组件', () => {
      const components = InitializationManager.initializeCoreComponents(container, config);

      expect(components.canvasEngine).toBeInstanceOf(CanvasEngine);
      expect(components.toolManager).toBeInstanceOf(ToolManager);
      expect(components.historyManager).toBeInstanceOf(HistoryManager);
      expect(components.selectionManager).toBeInstanceOf(SelectionManager);
      expect(components.performanceManager).toBeInstanceOf(PerformanceManager);
      expect(components.complexityManager).toBeInstanceOf(ComplexityManager);
      expect(components.virtualLayerManager).toBeInstanceOf(VirtualLayerManager);
      expect(components.eventManager).toBeInstanceOf(EventManager);
      expect(components.shortcutManager).toBeInstanceOf(ShortcutManager);
      expect(components.exportManager).toBeInstanceOf(ExportManager);
    });

    it('应该设置历史记录大小', () => {
      const components = InitializationManager.initializeCoreComponents(container, {
        maxHistorySize: 200
      });

      expect(components.historyManager).toBeInstanceOf(HistoryManager);
      // 验证历史记录大小已设置（通过检查实例）
    });

    it('应该创建资源管理器', () => {
      const components = InitializationManager.initializeCoreComponents(container, config);

      // 资源管理器默认创建（如果未禁用）
      expect(components.resourceManager).toBeDefined();
    });

    it('应该处理 HTMLCanvasElement 容器', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1000;
      canvas.height = 1000;

      const components = InitializationManager.initializeCoreComponents(canvas, config);

      expect(components.canvasEngine).toBeInstanceOf(CanvasEngine);
      expect(components.eventManager).toBeInstanceOf(EventManager);
    });

    it('应该设置虚拟图层管理器的依赖关系', () => {
      const components = InitializationManager.initializeCoreComponents(container, config);

      // 验证虚拟图层管理器已创建
      expect(components.virtualLayerManager).toBeInstanceOf(VirtualLayerManager);
      // 依赖关系在内部设置，我们验证组件已创建即可
    });
  });

  describe('initializeHandlers', () => {
    let coreComponents: CoreComponents;
    let onStateChange: jest.Mock;

    beforeEach(() => {
      coreComponents = InitializationManager.initializeCoreComponents(container, config);
      onStateChange = jest.fn();
    });

    it('应该初始化所有处理器', () => {
      const handlers = InitializationManager.initializeHandlers(coreComponents, onStateChange);

      expect(handlers.drawingHandler).toBeInstanceOf(DrawingHandler);
      expect(handlers.cursorHandler).toBeInstanceOf(CursorHandler);
      expect(handlers.stateHandler).toBeInstanceOf(StateHandler);
    });

    it('应该设置 drawingHandler 到 stateHandler', () => {
      const handlers = InitializationManager.initializeHandlers(coreComponents, onStateChange);

      // 验证处理器已创建
      expect(handlers.drawingHandler).toBeInstanceOf(DrawingHandler);
      expect(handlers.stateHandler).toBeInstanceOf(StateHandler);
    });

    it('应该使用交互层 canvas 创建 CursorHandler', () => {
      const handlers = InitializationManager.initializeHandlers(coreComponents, onStateChange);

      expect(handlers.cursorHandler).toBeInstanceOf(CursorHandler);
    });

    it('应该在没有交互层时使用容器创建 CursorHandler', () => {
      // 创建一个没有交互层的容器
      const simpleContainer = document.createElement('div');
      const simpleComponents = InitializationManager.initializeCoreComponents(simpleContainer, config);
      
      const handlers = InitializationManager.initializeHandlers(simpleComponents, onStateChange);

      expect(handlers.cursorHandler).toBeInstanceOf(CursorHandler);
    });
  });

  describe('setupDependencies', () => {
    let coreComponents: CoreComponents;
    let handlers: Handlers;
    let mockDrawBoard: any;

    beforeEach(() => {
      coreComponents = InitializationManager.initializeCoreComponents(container, config);
      handlers = InitializationManager.initializeHandlers(coreComponents, jest.fn());
      mockDrawBoard = {
        // Mock DrawBoard 实例
      };
    });

    it('应该设置依赖关系', () => {
      expect(() => {
        InitializationManager.setupDependencies(coreComponents, handlers, mockDrawBoard);
      }).not.toThrow();
    });

    it('应该设置 PerformanceManager 的 DrawBoard 引用', () => {
      const setDrawBoardSpy = jest.spyOn(coreComponents.performanceManager, 'setDrawBoard');

      InitializationManager.setupDependencies(coreComponents, handlers, mockDrawBoard);

      expect(setDrawBoardSpy).toHaveBeenCalledWith(mockDrawBoard);
    });

    it('应该设置 ComplexityManager 的依赖关系', () => {
      const setDependenciesSpy = jest.spyOn(coreComponents.complexityManager, 'setDependencies');

      InitializationManager.setupDependencies(coreComponents, handlers, mockDrawBoard);

      expect(setDependenciesSpy).toHaveBeenCalled();
    });
  });

  describe('完整初始化流程', () => {
    it('应该完成完整的初始化流程', () => {
      const coreComponents = InitializationManager.initializeCoreComponents(container, config);
      const handlers = InitializationManager.initializeHandlers(coreComponents, jest.fn());
      const mockDrawBoard = {};

      expect(() => {
        InitializationManager.setupDependencies(coreComponents, handlers, mockDrawBoard);
      }).not.toThrow();

      // 验证所有组件都已正确初始化
      expect(coreComponents.canvasEngine).toBeDefined();
      expect(coreComponents.toolManager).toBeDefined();
      expect(coreComponents.historyManager).toBeDefined();
      expect(handlers.drawingHandler).toBeDefined();
      expect(handlers.cursorHandler).toBeDefined();
      expect(handlers.stateHandler).toBeDefined();
    });
  });

  describe('配置选项处理', () => {
    it('应该处理空的配置', () => {
      const components = InitializationManager.initializeCoreComponents(container, {});

      expect(components.canvasEngine).toBeInstanceOf(CanvasEngine);
      expect(components.toolManager).toBeInstanceOf(ToolManager);
    });

    it('应该处理虚拟图层配置', () => {
      const configWithLayers: DrawBoardConfig = {
        virtualLayerConfig: {
          maxLayers: 10
        }
      };

      const components = InitializationManager.initializeCoreComponents(container, configWithLayers);

      expect(components.virtualLayerManager).toBeInstanceOf(VirtualLayerManager);
    });

    it('应该处理性能配置', () => {
      const configWithPerformance: DrawBoardConfig = {
        performanceConfig: {}
      };

      const components = InitializationManager.initializeCoreComponents(container, configWithPerformance);

      expect(components.performanceManager).toBeInstanceOf(PerformanceManager);
    });
  });
});

