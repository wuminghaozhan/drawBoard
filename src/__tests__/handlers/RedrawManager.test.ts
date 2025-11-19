import { RedrawManager } from '../../libs/drawBoard/handlers/RedrawManager';
import type { CanvasEngine } from '../../libs/drawBoard/core/CanvasEngine';
import type { HistoryManager } from '../../libs/drawBoard/history/HistoryManager';
import type { ToolManager } from '../../libs/drawBoard/tools/ToolManager';
import type { VirtualLayerManager } from '../../libs/drawBoard/core/VirtualLayerManager';
import type { CacheManager } from '../../libs/drawBoard/handlers/CacheManager';
import type { DrawAction } from '../../libs/drawBoard/tools/DrawTool';
import type { DrawActionFn, DrawSelectToolUIFn } from '../../libs/drawBoard/handlers/RedrawManager';

describe('RedrawManager', () => {
  let redrawManager: RedrawManager;
  let mockCanvasEngine: jest.Mocked<CanvasEngine>;
  let mockHistoryManager: jest.Mocked<HistoryManager>;
  let mockToolManager: jest.Mocked<ToolManager>;
  let mockVirtualLayerManager: jest.Mocked<VirtualLayerManager>;
  let mockCacheManager: jest.Mocked<CacheManager>;
  let mockDrawAction: jest.MockedFunction<DrawActionFn>;
  let mockDrawSelectToolUI: jest.MockedFunction<DrawSelectToolUIFn>;

  beforeEach(() => {
    // Mock CanvasEngine
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 1000;
    const ctx = canvas.getContext('2d')!;

    mockCanvasEngine = {
      getCanvas: jest.fn().mockReturnValue(canvas),
      getBottomLayersDrawContext: jest.fn().mockReturnValue(ctx),
      getTopLayersDrawContext: jest.fn().mockReturnValue(ctx),
      getSelectedLayerDrawContext: jest.fn().mockReturnValue(ctx)
    } as any;

    // Mock HistoryManager
    mockHistoryManager = {
      getAllActions: jest.fn().mockReturnValue([])
    } as any;

    // Mock ToolManager
    mockToolManager = {
      getCurrentTool: jest.fn().mockReturnValue('pen')
    } as any;

    // Mock VirtualLayerManager
    mockVirtualLayerManager = {
      getAllVirtualLayers: jest.fn().mockReturnValue([]),
      getVirtualLayer: jest.fn().mockReturnValue(null),
      getLayerCache: jest.fn().mockReturnValue(null),
      markLayerCacheValid: jest.fn()
    } as any;

    // Mock CacheManager
    mockCacheManager = {
      checkAndUpdateActionCache: jest.fn(),
      shouldUseOffscreenCache: jest.fn().mockReturnValue(false),
      getOffscreenCache: jest.fn().mockResolvedValue(null)
    } as any;

    // Mock draw functions
    mockDrawAction = jest.fn().mockResolvedValue(undefined);
    mockDrawSelectToolUI = jest.fn().mockResolvedValue(undefined);

    redrawManager = new RedrawManager(
      mockCanvasEngine,
      mockHistoryManager,
      mockToolManager,
      mockVirtualLayerManager,
      mockCacheManager,
      mockDrawAction,
      mockDrawSelectToolUI
    );
  });

  describe('构造函数', () => {
    it('应该正确初始化', () => {
      expect(redrawManager).toBeInstanceOf(RedrawManager);
    });
  });

  describe('redrawAll', () => {
    it('应该执行全量重绘', async () => {
      const actions: DrawAction[] = [
        {
          id: '1',
          type: 'rect',
          points: [{ x: 10, y: 10 }],
          timestamp: Date.now(),
          context: {
            strokeStyle: '#000000',
            fillStyle: '#000000',
            lineWidth: 2
          }
        }
      ];
      mockHistoryManager.getAllActions = jest.fn().mockReturnValue(actions);

      await redrawManager.redrawAll();

      expect(mockCanvasEngine.getCanvas).toHaveBeenCalled();
      expect(mockHistoryManager.getAllActions).toHaveBeenCalled();
      expect(mockCacheManager.checkAndUpdateActionCache).toHaveBeenCalledWith(actions);
    });

    it('应该绘制当前动作', async () => {
      const currentAction: DrawAction = {
        id: 'current',
        type: 'rect',
        points: [{ x: 20, y: 20 }],
        timestamp: Date.now(),
        context: {
          strokeStyle: '#000000',
          fillStyle: '#000000',
          lineWidth: 2
        }
      };

      await redrawManager.redrawAll(currentAction);

      expect(mockDrawAction).toHaveBeenCalled();
    });

    it('应该在选择工具时绘制UI', async () => {
      mockToolManager.getCurrentTool = jest.fn().mockReturnValue('select');

      await redrawManager.redrawAll();

      expect(mockDrawSelectToolUI).toHaveBeenCalled();
    });

    it('应该处理没有虚拟图层管理器的情况', async () => {
      const actions: DrawAction[] = [
        {
          id: '1',
          type: 'rect',
          points: [{ x: 10, y: 10 }],
          timestamp: Date.now(),
          context: {
            strokeStyle: '#000000',
            fillStyle: '#000000',
            lineWidth: 2
          }
        }
      ];
      mockHistoryManager.getAllActions = jest.fn().mockReturnValue(actions);

      const managerWithoutLayers = new RedrawManager(
        mockCanvasEngine,
        mockHistoryManager,
        mockToolManager,
        undefined,
        mockCacheManager,
        mockDrawAction
      );

      await managerWithoutLayers.redrawAll();

      expect(mockDrawAction).toHaveBeenCalled();
    });

    it('应该处理无法获取Canvas上下文的情况', async () => {
      const canvasWithoutCtx = document.createElement('canvas');
      mockCanvasEngine.getCanvas = jest.fn().mockReturnValue(canvasWithoutCtx);
      // 模拟 getContext 返回 null
      Object.defineProperty(canvasWithoutCtx, 'getContext', {
        value: jest.fn().mockReturnValue(null),
        writable: true,
        configurable: true
      });

      // SafeExecutor 会捕获错误，所以不会抛出，而是正常完成
      await redrawManager.redrawAll();

      // 验证 getContext 被调用
      expect(canvasWithoutCtx.getContext).toHaveBeenCalledWith('2d');
    });
  });

  describe('redrawIncremental', () => {
    it('应该只绘制新增的动作', async () => {
      const newActions: DrawAction[] = [
        {
          id: '1',
          type: 'rect',
          points: [{ x: 10, y: 10 }],
          timestamp: Date.now(),
          context: {
            strokeStyle: '#000000',
            fillStyle: '#000000',
            lineWidth: 2
          }
        },
        {
          id: '2',
          type: 'circle',
          points: [{ x: 20, y: 20 }],
          timestamp: Date.now(),
          context: {
            strokeStyle: '#000000',
            fillStyle: '#000000',
            lineWidth: 2
          }
        }
      ];

      await redrawManager.redrawIncremental(newActions);

      expect(mockDrawAction).toHaveBeenCalledTimes(2);
    });

    it('应该绘制当前动作', async () => {
      const newActions: DrawAction[] = [];
      const currentAction: DrawAction = {
        id: 'current',
        type: 'rect',
        points: [{ x: 20, y: 20 }],
        timestamp: Date.now(),
        context: {
          strokeStyle: '#000000',
          fillStyle: '#000000',
          lineWidth: 2
        }
      };

      await redrawManager.redrawIncremental(newActions, currentAction);

      expect(mockDrawAction).toHaveBeenCalled();
    });

    it('应该处理没有 drawAction 的情况', async () => {
      const managerWithoutDrawAction = new RedrawManager(
        mockCanvasEngine,
        mockHistoryManager,
        mockToolManager,
        undefined,
        undefined,
        undefined
      );

      await managerWithoutDrawAction.redrawIncremental([]);

      // 应该不抛出错误
      expect(true).toBe(true);
    });
  });

  describe('redrawGeometric', () => {
    it('应该使用离屏缓存', async () => {
      const actions: DrawAction[] = [];
      for (let i = 0; i < 150; i++) {
        actions.push({
          id: `action-${i}`,
          type: 'rect',
          points: [{ x: i, y: i }],
          timestamp: Date.now(),
          context: {
            strokeStyle: '#000000',
            fillStyle: '#000000',
            lineWidth: 2
          }
        });
      }

      const offscreenCanvas = document.createElement('canvas');
      mockCacheManager.shouldUseOffscreenCache = jest.fn().mockReturnValue(true);
      mockCacheManager.getOffscreenCache = jest.fn().mockResolvedValue(offscreenCanvas);

      await redrawManager.redrawGeometric(actions);

      expect(mockCacheManager.shouldUseOffscreenCache).toHaveBeenCalledWith(actions.length);
      expect(mockCacheManager.getOffscreenCache).toHaveBeenCalled();
    });

    it('应该在不使用缓存时执行全量重绘', async () => {
      const actions: DrawAction[] = [];
      mockCacheManager.shouldUseOffscreenCache = jest.fn().mockReturnValue(false);

      await redrawManager.redrawGeometric(actions);

      expect(mockCacheManager.shouldUseOffscreenCache).toHaveBeenCalled();
      // 应该调用全量重绘
      expect(mockHistoryManager.getAllActions).toHaveBeenCalled();
    });
  });

  describe('redrawLayer', () => {
    it('应该重绘指定图层', async () => {
      const layerId = 'layer1';
      const actions: DrawAction[] = [
        {
          id: '1',
          type: 'rect',
          points: [{ x: 10, y: 10 }],
          timestamp: Date.now(),
          context: {
            strokeStyle: '#000000',
            fillStyle: '#000000',
            lineWidth: 2
          }
        }
      ];

      const mockLayer = {
        id: layerId,
        actionIds: ['1'],
        cacheCtx: mockCanvasEngine.getCanvas().getContext('2d'),
        cacheDirty: false
      };

      mockVirtualLayerManager.getVirtualLayer = jest.fn().mockReturnValue(mockLayer as any);
      mockVirtualLayerManager.getLayerCache = jest.fn().mockReturnValue(
        mockCanvasEngine.getCanvas()
      );

      await redrawManager.redrawLayer(layerId, actions);

      expect(mockVirtualLayerManager.getVirtualLayer).toHaveBeenCalledWith(layerId);
      expect(mockDrawAction).toHaveBeenCalled();
    });

    it('应该处理图层不存在的情况', async () => {
      mockVirtualLayerManager.getVirtualLayer = jest.fn().mockReturnValue(null);

      await redrawManager.redrawLayer('nonexistent', []);

      // 应该不抛出错误
      expect(true).toBe(true);
    });

    it('应该在没有虚拟图层管理器时执行全量重绘', async () => {
      const managerWithoutLayers = new RedrawManager(
        mockCanvasEngine,
        mockHistoryManager,
        mockToolManager,
        undefined,
        undefined,
        mockDrawAction
      );

      await managerWithoutLayers.redrawLayer('layer1', []);

      expect(mockHistoryManager.getAllActions).toHaveBeenCalled();
    });
  });

  describe('redrawBottomLayers 和 redrawTopLayers', () => {
    it('应该重绘下层图层', async () => {
      const selectedLayerZIndex = 5;
      const actions: DrawAction[] = [];

      await redrawManager.redrawBottomLayers(selectedLayerZIndex, actions);

      expect(mockCanvasEngine.getBottomLayersDrawContext).toHaveBeenCalled();
      expect(mockVirtualLayerManager.getAllVirtualLayers).toHaveBeenCalled();
    });

    it('应该重绘上层图层', async () => {
      const selectedLayerZIndex = 5;
      const actions: DrawAction[] = [];

      await redrawManager.redrawTopLayers(selectedLayerZIndex, actions);

      expect(mockCanvasEngine.getTopLayersDrawContext).toHaveBeenCalled();
      expect(mockVirtualLayerManager.getAllVirtualLayers).toHaveBeenCalled();
    });

    it('应该在没有虚拟图层管理器时执行全量重绘', async () => {
      const managerWithoutLayers = new RedrawManager(
        mockCanvasEngine,
        mockHistoryManager,
        mockToolManager,
        undefined,
        undefined,
        mockDrawAction
      );

      await managerWithoutLayers.redrawBottomLayers(5, []);

      expect(mockHistoryManager.getAllActions).toHaveBeenCalled();
    });
  });

  describe('redrawSelectedLayer', () => {
    it('应该重绘选中图层', async () => {
      const selectedLayerZIndex = 5;
      const actions: DrawAction[] = [];

      const mockLayer = {
        id: 'layer1',
        zIndex: selectedLayerZIndex,
        actionIds: [],
        cacheCtx: mockCanvasEngine.getCanvas().getContext('2d'),
        cacheDirty: false
      };

      mockVirtualLayerManager.getAllVirtualLayers = jest.fn().mockReturnValue([mockLayer] as any);
      mockVirtualLayerManager.getLayerCache = jest.fn().mockReturnValue(
        mockCanvasEngine.getCanvas()
      );

      await redrawManager.redrawSelectedLayer(selectedLayerZIndex, actions);

      expect(mockCanvasEngine.getSelectedLayerDrawContext).toHaveBeenCalled();
      expect(mockVirtualLayerManager.getAllVirtualLayers).toHaveBeenCalled();
    });

    it('应该处理选中图层不存在的情况', async () => {
      mockVirtualLayerManager.getAllVirtualLayers = jest.fn().mockReturnValue([]);

      await redrawManager.redrawSelectedLayer(5, []);

      expect(mockHistoryManager.getAllActions).toHaveBeenCalled();
    });
  });

  describe('错误处理', () => {
    it('应该处理 redrawAll 中的错误', async () => {
      mockHistoryManager.getAllActions = jest.fn().mockImplementation(() => {
        throw new Error('测试错误');
      });

      await expect(redrawManager.redrawAll()).resolves.not.toThrow();
    });

    it('应该处理 redrawIncremental 中的错误', async () => {
      mockDrawAction = jest.fn().mockRejectedValue(new Error('绘制错误'));

      const managerWithError = new RedrawManager(
        mockCanvasEngine,
        mockHistoryManager,
        mockToolManager,
        undefined,
        undefined,
        mockDrawAction
      );

      await expect(managerWithError.redrawIncremental([], null)).resolves.not.toThrow();
    });
  });
});

