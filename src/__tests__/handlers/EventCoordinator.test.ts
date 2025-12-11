import { EventCoordinator } from '../../libs/drawBoard/handlers/EventCoordinator';
import type { ToolManager } from '../../libs/drawBoard/tools/ToolManager';
import type { DrawingHandler } from '../../libs/drawBoard/handlers/DrawingHandler';
import type { CursorHandler } from '../../libs/drawBoard/handlers/CursorHandler';
import type { DrawEvent } from '../../libs/drawBoard/infrastructure/events/EventManager';
import type { DrawAction } from '../../libs/drawBoard/tools/DrawTool';
import type { Point } from '../../libs/drawBoard/core/CanvasEngine';

describe('EventCoordinator', () => {
  let eventCoordinator: EventCoordinator;
  let mockToolManager: jest.Mocked<ToolManager>;
  let mockDrawingHandler: jest.Mocked<DrawingHandler>;
  let mockCursorHandler: jest.Mocked<CursorHandler>;
  let mockSyncLayerDataToSelectTool: jest.Mock;
  let mockHandleUpdatedActions: jest.Mock;

  beforeEach(() => {
    // Mock ToolManager
    mockToolManager = {
      getCurrentTool: jest.fn().mockReturnValue('pen'),
      getCurrentToolInstance: jest.fn()
    } as any;

    // Mock DrawingHandler
    mockDrawingHandler = {
      handleDrawStart: jest.fn(),
      handleDrawMove: jest.fn(),
      handleDrawEnd: jest.fn().mockResolvedValue(undefined),
      forceRedraw: jest.fn().mockResolvedValue(undefined),
      getDrawingState: jest.fn().mockReturnValue({
        isDrawing: false,
        isSelecting: false,
        hasCurrentAction: false,
        currentToolType: 'pen'
      }),
      isDrawing: false
    } as any;

    // Mock CursorHandler
    mockCursorHandler = {
      updateCursor: jest.fn()
    } as any;

    // Mock callbacks
    mockSyncLayerDataToSelectTool = jest.fn();
    mockHandleUpdatedActions = jest.fn().mockResolvedValue(undefined);

    eventCoordinator = new EventCoordinator(
      mockToolManager,
      mockDrawingHandler,
      mockCursorHandler,
      mockSyncLayerDataToSelectTool,
      mockHandleUpdatedActions
    );
  });

  describe('构造函数', () => {
    it('应该正确初始化', () => {
      expect(eventCoordinator).toBeInstanceOf(EventCoordinator);
    });
  });

  describe('handleDrawStart', () => {
    const createEvent = (point: Point): DrawEvent => ({
      type: 'mousedown',
      point,
      timestamp: Date.now()
    });

    it('应该处理非选择工具的事件', () => {
      const event = createEvent({ x: 100, y: 200 });
      eventCoordinator.handleDrawStart(event);

      expect(mockToolManager.getCurrentTool).toHaveBeenCalled();
      expect(mockDrawingHandler.handleDrawStart).toHaveBeenCalledWith(event);
      expect(mockCursorHandler.updateCursor).toHaveBeenCalled();
    });

    it('应该处理选择工具的事件', () => {
      mockToolManager.getCurrentTool = jest.fn().mockReturnValue('select');
      
      const mockSelectTool = {
        getActionType: jest.fn().mockReturnValue('select'),
        handleMouseDown: jest.fn().mockReturnValue('select')
      };
      mockToolManager.getCurrentToolInstance = jest.fn().mockReturnValue(mockSelectTool);

      const event = createEvent({ x: 100, y: 200 });
      eventCoordinator.handleDrawStart(event);

      expect(mockSyncLayerDataToSelectTool).toHaveBeenCalled();
      expect(mockSelectTool.handleMouseDown).toHaveBeenCalledWith(event.point);
      expect(mockDrawingHandler.forceRedraw).toHaveBeenCalled();
      expect(mockCursorHandler.updateCursor).toHaveBeenCalled();
    });

    it('应该处理选择工具实例获取失败的情况', () => {
      mockToolManager.getCurrentTool = jest.fn().mockReturnValue('select');
      mockToolManager.getCurrentToolInstance = jest.fn().mockReturnValue(null);

      const event = createEvent({ x: 100, y: 200 });
      eventCoordinator.handleDrawStart(event);

      expect(mockSyncLayerDataToSelectTool).not.toHaveBeenCalled();
    });
  });

  describe('handleDrawMove', () => {
    const createEvent = (point: Point): DrawEvent => ({
      type: 'mousemove',
      point,
      timestamp: Date.now()
    });

    it('应该处理非选择工具的事件', () => {
      const event = createEvent({ x: 100, y: 200 });
      eventCoordinator.handleDrawMove(event);

      expect(mockDrawingHandler.handleDrawMove).toHaveBeenCalledWith(event);
      expect(mockCursorHandler.updateCursor).toHaveBeenCalled();
    });

    it('应该处理选择工具的事件', () => {
      mockToolManager.getCurrentTool = jest.fn().mockReturnValue('select');
      
      const mockSelectTool = {
        getActionType: jest.fn().mockReturnValue('select'),
        handleMouseMove: jest.fn().mockReturnValue(null),
        updateHoverAnchor: jest.fn()
      };
      mockToolManager.getCurrentToolInstance = jest.fn().mockReturnValue(mockSelectTool);

      const event = createEvent({ x: 100, y: 200 });
      eventCoordinator.handleDrawMove(event);

      expect(mockSelectTool.updateHoverAnchor).toHaveBeenCalledWith(event.point);
      expect(mockSelectTool.handleMouseMove).toHaveBeenCalledWith(event.point);
      expect(mockCursorHandler.updateCursor).toHaveBeenCalled();
    });

    it('应该节流重绘', async () => {
      mockToolManager.getCurrentTool = jest.fn().mockReturnValue('select');
      
      const mockSelectTool = {
        getActionType: jest.fn().mockReturnValue('select'),
        handleMouseMove: jest.fn().mockReturnValue(null)
      };
      mockToolManager.getCurrentToolInstance = jest.fn().mockReturnValue(mockSelectTool);

      const event = createEvent({ x: 100, y: 200 });
      
      // 快速连续调用
      eventCoordinator.handleDrawMove(event);
      eventCoordinator.handleDrawMove(event);
      eventCoordinator.handleDrawMove(event);

      // 应该只调用一次 forceRedraw（由于节流）
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(mockDrawingHandler.forceRedraw).toHaveBeenCalled();
    });
  });

  describe('handleDrawEnd', () => {
    const createEvent = (point: Point): DrawEvent => ({
      type: 'mouseup',
      point,
      timestamp: Date.now()
    });

    it('应该处理非选择工具的事件', async () => {
      const event = createEvent({ x: 100, y: 200 });
      await eventCoordinator.handleDrawEnd(event);

      expect(mockDrawingHandler.handleDrawEnd).toHaveBeenCalledWith(event);
      expect(mockCursorHandler.updateCursor).toHaveBeenCalled();
    });

    it('应该处理选择工具的事件', async () => {
      mockToolManager.getCurrentTool = jest.fn().mockReturnValue('select');
      
      const mockSelectTool = {
        getActionType: jest.fn().mockReturnValue('select'),
        handleMouseUp: jest.fn().mockReturnValue(null)
      };
      mockToolManager.getCurrentToolInstance = jest.fn().mockReturnValue(mockSelectTool);

      const event = createEvent({ x: 100, y: 200 });
      await eventCoordinator.handleDrawEnd(event);

      expect(mockSelectTool.handleMouseUp).toHaveBeenCalled();
      expect(mockSyncLayerDataToSelectTool).toHaveBeenCalled();
      expect(mockDrawingHandler.forceRedraw).toHaveBeenCalled();
      expect(mockCursorHandler.updateCursor).toHaveBeenCalled();
    });

    it('应该处理选择工具返回更新后的动作', async () => {
      mockToolManager.getCurrentTool = jest.fn().mockReturnValue('select');
      
      const updatedAction: DrawAction = {
        id: 'updated',
        type: 'rect',
        points: [{ x: 10, y: 10 }],
        timestamp: Date.now(),
        context: {
          strokeStyle: '#000000',
          fillStyle: '#000000',
          lineWidth: 2
        }
      };
      
      const mockSelectTool = {
        getActionType: jest.fn().mockReturnValue('select'),
        handleMouseUp: jest.fn().mockReturnValue(updatedAction)
      };
      mockToolManager.getCurrentToolInstance = jest.fn().mockReturnValue(mockSelectTool);

      const event = createEvent({ x: 100, y: 200 });
      await eventCoordinator.handleDrawEnd(event);

      expect(mockHandleUpdatedActions).toHaveBeenCalledWith(updatedAction);
    });

    it('应该处理选择工具返回多个更新后的动作', async () => {
      mockToolManager.getCurrentTool = jest.fn().mockReturnValue('select');
      
      const updatedActions: DrawAction[] = [
        {
          id: 'updated1',
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
          id: 'updated2',
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
      
      const mockSelectTool = {
        getActionType: jest.fn().mockReturnValue('select'),
        handleMouseUp: jest.fn().mockReturnValue(updatedActions)
      };
      mockToolManager.getCurrentToolInstance = jest.fn().mockReturnValue(mockSelectTool);

      const event = createEvent({ x: 100, y: 200 });
      await eventCoordinator.handleDrawEnd(event);

      expect(mockHandleUpdatedActions).toHaveBeenCalledWith(updatedActions);
    });
  });

  describe('错误处理', () => {
    it('应该处理 handleDrawStart 中的错误', () => {
      mockDrawingHandler.handleDrawStart = jest.fn().mockImplementation(() => {
        throw new Error('测试错误');
      });

      const event: DrawEvent = {
        type: 'mousedown',
        point: { x: 100, y: 200 },
        timestamp: Date.now()
      };

      expect(() => {
        eventCoordinator.handleDrawStart(event);
      }).not.toThrow();
    });

    it('应该处理 handleDrawEnd 中的错误', async () => {
      // handleDrawEnd 现在是同步的，所以使用同步的错误抛出
      mockDrawingHandler.handleDrawEnd = jest.fn().mockImplementation(() => {
        throw new Error('测试错误');
      });

      const event: DrawEvent = {
        type: 'mouseup',
        point: { x: 100, y: 200 },
        timestamp: Date.now()
      };

      // SafeExecutor 会捕获错误，所以不应该抛出
      await expect(eventCoordinator.handleDrawEnd(event)).resolves.not.toThrow();
    });
  });
});

