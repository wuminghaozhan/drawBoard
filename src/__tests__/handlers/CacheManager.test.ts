import { CacheManager } from '../../libs/drawBoard/handlers/CacheManager';
import type { CanvasEngine } from '../../libs/drawBoard/core/CanvasEngine';
import type { DrawAction } from '../../libs/drawBoard/tools/DrawTool';

describe('CacheManager', () => {
  let cacheManager: CacheManager;
  let mockCanvasEngine: jest.Mocked<CanvasEngine>;
  let mockDrawAction: jest.Mock;

  beforeEach(() => {
    // Mock CanvasEngine
    mockCanvasEngine = {
      getCanvas: jest.fn(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 1000;
        canvas.height = 1000;
        return canvas;
      })
    } as any;

    // Mock drawAction function
    mockDrawAction = jest.fn().mockResolvedValue(undefined);

    cacheManager = new CacheManager(mockCanvasEngine, mockDrawAction);
  });

  describe('构造函数', () => {
    it('应该正确初始化', () => {
      expect(cacheManager).toBeInstanceOf(CacheManager);
    });

    it('应该初始化动作缓存', () => {
      expect(cacheManager.getActionCacheSize()).toBe(0);
    });
  });

  describe('动作缓存管理', () => {
    const createAction = (id: string): DrawAction => ({
      id,
      type: 'rect',
      points: [{ x: 10, y: 10 }],
      timestamp: Date.now(),
      context: {
        strokeStyle: '#000000',
        fillStyle: '#000000',
        lineWidth: 2
      }
    });

    it('应该更新动作缓存', () => {
      const actions = [createAction('1'), createAction('2'), createAction('3')];
      cacheManager.updateActionCache(actions);
      expect(cacheManager.getActionCacheSize()).toBe(3);
    });

    it('应该检查并更新动作缓存', () => {
      const actions1 = [createAction('1'), createAction('2')];
      cacheManager.checkAndUpdateActionCache(actions1);
      expect(cacheManager.getActionCacheSize()).toBe(2);

      const actions2 = [createAction('1'), createAction('2'), createAction('3')];
      cacheManager.checkAndUpdateActionCache(actions2);
      expect(cacheManager.getActionCacheSize()).toBe(3);
    });

    it('应该在动作数量不变时不更新缓存', () => {
      const actions = [createAction('1'), createAction('2')];
      cacheManager.checkAndUpdateActionCache(actions);
      const size1 = cacheManager.getActionCacheSize();
      
      cacheManager.checkAndUpdateActionCache(actions);
      const size2 = cacheManager.getActionCacheSize();
      expect(size1).toBe(size2);
    });

    it('应该添加动作到缓存', () => {
      cacheManager.addActionToCache('action1');
      expect(cacheManager.isActionCached('action1')).toBe(true);
    });

    it('应该从缓存移除动作', () => {
      cacheManager.addActionToCache('action1');
      cacheManager.removeActionFromCache('action1');
      expect(cacheManager.isActionCached('action1')).toBe(false);
    });

    it('应该检查动作是否在缓存中', () => {
      expect(cacheManager.isActionCached('action1')).toBe(false);
      cacheManager.addActionToCache('action1');
      expect(cacheManager.isActionCached('action1')).toBe(true);
    });

    it('应该清空动作缓存', () => {
      cacheManager.addActionToCache('action1');
      cacheManager.addActionToCache('action2');
      cacheManager.clearActionCache();
      expect(cacheManager.getActionCacheSize()).toBe(0);
    });
  });

  describe('离屏缓存管理', () => {
    it('应该检查是否应该使用离屏缓存', () => {
      // 历史动作数量少于阈值
      expect(cacheManager.shouldUseOffscreenCache(50)).toBe(false);
      
      // 历史动作数量达到阈值
      expect(cacheManager.shouldUseOffscreenCache(150)).toBe(true);
    });

    it('应该获取离屏缓存', async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1000;
      canvas.height = 1000;
      const ctx = canvas.getContext('2d')!;

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

      const offscreenCanvas = await cacheManager.getOffscreenCache(ctx, actions);
      expect(offscreenCanvas).not.toBeNull();
      expect(mockDrawAction).toHaveBeenCalled();
    });

    it('应该在动作数量不足时返回 null', async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1000;
      canvas.height = 1000;
      const ctx = canvas.getContext('2d')!;

      const actions: DrawAction[] = [];
      const offscreenCanvas = await cacheManager.getOffscreenCache(ctx, actions);
      expect(offscreenCanvas).toBeNull();
    });

    it('应该标记缓存过期', () => {
      expect(cacheManager.isOffscreenCacheDirty()).toBe(true);
      cacheManager.invalidateOffscreenCache();
      expect(cacheManager.isOffscreenCacheDirty()).toBe(true);
    });

    it('应该清理离屏Canvas', async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1000;
      canvas.height = 1000;
      const ctx = canvas.getContext('2d')!;

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

      await cacheManager.getOffscreenCache(ctx, actions);
      cacheManager.cleanupOffscreenCanvas();
      
      // 清理后应该无法获取缓存
      const offscreenCanvas = await cacheManager.getOffscreenCache(ctx, actions);
      expect(offscreenCanvas).not.toBeNull(); // 会重新创建
    });
  });

  describe('缓存统计', () => {
    it('应该获取缓存统计信息', () => {
      const stats = cacheManager.getCacheStats();
      expect(stats).toHaveProperty('actionCacheSize');
      expect(stats).toHaveProperty('hasOffscreenCache');
      expect(stats).toHaveProperty('offscreenCacheDirty');
      expect(stats).toHaveProperty('memoryUsage');
      expect(stats).toHaveProperty('memoryUsageHigh');
    });

    it('应该正确反映缓存状态', () => {
      cacheManager.addActionToCache('action1');
      const stats = cacheManager.getCacheStats();
      expect(stats.actionCacheSize).toBe(1);
      expect(stats.offscreenCacheDirty).toBe(true);
    });
  });

  describe('清空所有缓存', () => {
    it('应该清空所有缓存', () => {
      cacheManager.addActionToCache('action1');
      cacheManager.clearAllCache();
      expect(cacheManager.getActionCacheSize()).toBe(0);
    });
  });

  describe('内存监控', () => {
    it('应该刷新内存监控', () => {
      expect(() => {
        cacheManager.refreshMemoryMonitor();
      }).not.toThrow();
    });
  });
});

