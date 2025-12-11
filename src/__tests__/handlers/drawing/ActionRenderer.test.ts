/**
 * ActionRenderer 单元测试
 */

import { ActionRenderer } from '../../../libs/drawBoard/handlers/drawing/ActionRenderer';
import type { ToolManager } from '../../../libs/drawBoard/tools/ToolManager';
import type { DrawAction } from '../../../libs/drawBoard/tools/DrawTool';

// Mock 工具
const mockTool = {
  draw: jest.fn()
};

// Mock ToolManager
const createMockToolManager = (): jest.Mocked<Partial<ToolManager>> => ({
  getTool: jest.fn().mockResolvedValue(mockTool)
});

describe('ActionRenderer', () => {
  let renderer: ActionRenderer;
  let mockToolManager: jest.Mocked<Partial<ToolManager>>;
  let mockCtx: jest.Mocked<CanvasRenderingContext2D>;

  beforeEach(() => {
    mockToolManager = createMockToolManager();
    mockTool.draw.mockClear();
    mockToolManager.getTool!.mockClear();
    
    renderer = new ActionRenderer(
      mockToolManager as unknown as ToolManager,
      undefined,
      { enableErrorRecovery: true }
    );

    // Mock Canvas 2D Context
    mockCtx = {
      save: jest.fn(),
      restore: jest.fn(),
      clearRect: jest.fn(),
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      stroke: jest.fn(),
      globalAlpha: 1
    } as unknown as jest.Mocked<CanvasRenderingContext2D>;
  });

  describe('drawAction', () => {
    it('应该调用工具的 draw 方法', async () => {
      const action: DrawAction = {
        id: 'test-action',
        type: 'pen',
        points: [{ x: 0, y: 0 }]
      } as DrawAction;

      await renderer.drawAction(mockCtx, action);

      expect(mockToolManager.getTool).toHaveBeenCalledWith('pen');
      expect(mockTool.draw).toHaveBeenCalledWith(mockCtx, action);
    });

    it('工具不存在时不应该抛出错误', async () => {
      mockToolManager.getTool!.mockResolvedValue(null);

      const action = {
        id: 'test-action',
        type: 'unknown',
        points: [],
        context: {},
        timestamp: Date.now()
      } as unknown as DrawAction;

      await expect(renderer.drawAction(mockCtx, action)).resolves.not.toThrow();
    });
  });

  describe('drawActions', () => {
    it('应该按顺序绘制所有动作', async () => {
      const actions: DrawAction[] = [
        { id: 'action-1', type: 'pen', points: [{ x: 0, y: 0 }] } as DrawAction,
        { id: 'action-2', type: 'rect', points: [{ x: 10, y: 10 }] } as DrawAction,
        { id: 'action-3', type: 'circle', points: [{ x: 20, y: 20 }] } as DrawAction
      ];

      await renderer.drawActions(mockCtx, actions);

      expect(mockToolManager.getTool).toHaveBeenCalledTimes(3);
      expect(mockTool.draw).toHaveBeenCalledTimes(3);
    });
  });

  describe('缓存管理', () => {
    it('updateCachedActions 应该更新缓存', () => {
      const actions: DrawAction[] = [
        { id: 'action-1', type: 'pen', points: [] } as DrawAction,
        { id: 'action-2', type: 'rect', points: [] } as DrawAction
      ];

      renderer.updateCachedActions(actions);

      expect(renderer.isActionCached('action-1')).toBe(true);
      expect(renderer.isActionCached('action-2')).toBe(true);
      expect(renderer.isActionCached('action-3')).toBe(false);
    });

    it('getCachedCount 应该返回正确数量', () => {
      expect(renderer.getCachedCount()).toBe(0);

      renderer.updateCachedActions([
        { id: '1', type: 'pen', points: [] } as DrawAction,
        { id: '2', type: 'pen', points: [] } as DrawAction
      ]);

      expect(renderer.getCachedCount()).toBe(2);
    });

    it('clearCache 应该清除所有缓存', () => {
      renderer.updateCachedActions([
        { id: '1', type: 'pen', points: [] } as DrawAction
      ]);
      expect(renderer.getCachedCount()).toBe(1);

      renderer.clearCache();
      expect(renderer.getCachedCount()).toBe(0);
    });
  });

  describe('错误恢复', () => {
    it('工具抛出错误时应该尝试恢复', async () => {
      mockTool.draw.mockImplementationOnce(() => {
        throw new Error('Draw failed');
      });

      const action = {
        id: 'test-action',
        type: 'problematic',
        points: [],
        context: {},
        timestamp: Date.now()
      } as unknown as DrawAction;

      // 不应该抛出错误
      await expect(renderer.drawAction(mockCtx, action)).resolves.not.toThrow();
      
      // 应该尝试使用 fallback 工具
      expect(mockToolManager.getTool).toHaveBeenCalledWith('pen');
    });
  });

  describe('updateConfig', () => {
    it('应该更新配置', async () => {
      renderer.updateConfig({ fallbackToolType: 'pen' as const }); // 使用有效的 ToolType
      
      // 配置更新后，错误恢复时应该使用新的 fallback 工具
      mockTool.draw.mockImplementationOnce(() => {
        throw new Error('Draw failed');
      });

      const action = {
        id: 'test-action',
        type: 'problematic',
        points: [],
        context: {},
        timestamp: Date.now()
      } as unknown as DrawAction;

      await renderer.drawAction(mockCtx, action);

      // 等待异步调用完成
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(mockToolManager.getTool).toHaveBeenCalledWith('pen');
    });
  });
});

