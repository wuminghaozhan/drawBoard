import { DirtyRectManager, type DirtyRectConfig } from '../../libs/drawBoard/infrastructure/performance/DirtyRectManager';

describe('DirtyRectManager', () => {
  let manager: DirtyRectManager;
  const canvasWidth = 800;
  const canvasHeight = 600;

  beforeEach(() => {
    manager = new DirtyRectManager(canvasWidth, canvasHeight);
  });

  describe('构造函数', () => {
    it('应该使用默认配置创建实例', () => {
      expect(manager).toBeDefined();
      expect(manager.hasDirtyRects()).toBe(false);
    });

    it('应该使用自定义配置创建实例', () => {
      const config: Partial<DirtyRectConfig> = {
        mergeThreshold: 30,
        maxDirtyRects: 100,
        padding: 5
      };
      const customManager = new DirtyRectManager(canvasWidth, canvasHeight, config);
      expect(customManager).toBeDefined();
    });
  });

  describe('markDirty', () => {
    it('应该标记单个脏矩形', () => {
      manager.markDirty({ x: 100, y: 100, width: 50, height: 50 });
      expect(manager.hasDirtyRects()).toBe(true);
    });

    it('扩展后面积仍然很小的矩形会被处理', () => {
      // 默认 padding=2px，所以 1x1 的矩形会被扩展为 5x5 = 25px² > minArea(4)
      // 因此会被标记为脏区域
      manager.markDirty({ x: 100, y: 100, width: 1, height: 1 });
      expect(manager.hasDirtyRects()).toBe(true);
    });

    it('应该裁剪超出画布边界的矩形', () => {
      manager.markDirty({ x: -10, y: -10, width: 100, height: 100 });
      expect(manager.hasDirtyRects()).toBe(true);
      
      const dirtyRects = manager.getDirtyRects();
      expect(dirtyRects.length).toBe(1);
      expect(dirtyRects[0].x).toBeGreaterThanOrEqual(0);
      expect(dirtyRects[0].y).toBeGreaterThanOrEqual(0);
    });

    it('应该处理完全在画布外的矩形', () => {
      manager.markDirty({ x: -100, y: -100, width: 50, height: 50 });
      expect(manager.hasDirtyRects()).toBe(false);
    });
  });

  describe('矩形合并', () => {
    it('应该合并重叠的矩形', () => {
      manager.markDirty({ x: 100, y: 100, width: 50, height: 50 });
      manager.markDirty({ x: 120, y: 120, width: 50, height: 50 });
      
      const dirtyRects = manager.getDirtyRects();
      expect(dirtyRects.length).toBe(1);
    });

    it('应该合并相邻的矩形（距离小于阈值）', () => {
      // 默认阈值是 20px
      manager.markDirty({ x: 100, y: 100, width: 50, height: 50 });
      manager.markDirty({ x: 160, y: 100, width: 50, height: 50 }); // 距离 = 10px
      
      const dirtyRects = manager.getDirtyRects();
      expect(dirtyRects.length).toBe(1);
    });

    it('应该保持不相邻的矩形分离', () => {
      manager.markDirty({ x: 100, y: 100, width: 50, height: 50 });
      manager.markDirty({ x: 300, y: 300, width: 50, height: 50 }); // 距离远大于阈值
      
      const dirtyRects = manager.getDirtyRects();
      expect(dirtyRects.length).toBe(2);
    });
  });

  describe('needsFullRedraw', () => {
    it('当脏矩形数量超过限制时应该返回 true', () => {
      const smallManager = new DirtyRectManager(canvasWidth, canvasHeight, {
        maxDirtyRects: 3
      });
      
      // 添加多个不重叠的脏矩形
      smallManager.markDirty({ x: 0, y: 0, width: 50, height: 50 });
      smallManager.markDirty({ x: 200, y: 0, width: 50, height: 50 });
      smallManager.markDirty({ x: 400, y: 0, width: 50, height: 50 });
      smallManager.markDirty({ x: 600, y: 0, width: 50, height: 50 });
      
      expect(smallManager.needsFullRedraw()).toBe(true);
    });

    it('当脏区域面积占比超过阈值时应该返回 true', () => {
      const smallThresholdManager = new DirtyRectManager(canvasWidth, canvasHeight, {
        fullRedrawThreshold: 0.1 // 10%
      });
      
      // 添加一个大矩形，超过 10% 的画布面积
      // 画布面积 = 800 * 600 = 480000
      // 10% = 48000
      smallThresholdManager.markDirty({ x: 0, y: 0, width: 300, height: 200 }); // 面积 = 60000 > 48000
      
      expect(smallThresholdManager.needsFullRedraw()).toBe(true);
    });

    it('当脏区域较小时应该返回 false', () => {
      manager.markDirty({ x: 100, y: 100, width: 50, height: 50 });
      expect(manager.needsFullRedraw()).toBe(false);
    });
  });

  describe('markFullRedraw', () => {
    it('应该强制全量重绘', () => {
      manager.markFullRedraw();
      expect(manager.needsFullRedraw()).toBe(true);
    });
  });

  describe('clear', () => {
    it('应该清除所有脏矩形', () => {
      manager.markDirty({ x: 100, y: 100, width: 50, height: 50 });
      manager.markDirty({ x: 200, y: 200, width: 50, height: 50 });
      
      expect(manager.hasDirtyRects()).toBe(true);
      
      manager.clear();
      
      expect(manager.hasDirtyRects()).toBe(false);
    });

    it('应该重置全量重绘标志', () => {
      manager.markFullRedraw();
      expect(manager.needsFullRedraw()).toBe(true);
      
      manager.clear();
      
      expect(manager.needsFullRedraw()).toBe(false);
    });
  });

  describe('getStats', () => {
    it('应该返回正确的统计信息', () => {
      manager.markDirty({ x: 100, y: 100, width: 50, height: 50 });
      
      const stats = manager.getStats();
      
      expect(stats.dirtyRectCount).toBe(1);
      expect(stats.canvasArea).toBe(canvasWidth * canvasHeight);
      expect(stats.totalDirtyArea).toBeGreaterThan(0);
      expect(stats.dirtyRatio).toBeGreaterThan(0);
      expect(stats.dirtyRatio).toBeLessThan(1);
    });

    it('当没有脏矩形时应该返回零统计', () => {
      const stats = manager.getStats();
      
      expect(stats.dirtyRectCount).toBe(0);
      expect(stats.totalDirtyArea).toBe(0);
      expect(stats.dirtyRatio).toBe(0);
    });
  });

  describe('updateCanvasSize', () => {
    it('应该更新画布尺寸', () => {
      manager.updateCanvasSize(1024, 768);
      
      const stats = manager.getStats();
      expect(stats.canvasArea).toBe(1024 * 768);
    });

    it('更新尺寸后应该标记需要全量重绘', () => {
      manager.markDirty({ x: 100, y: 100, width: 50, height: 50 });
      expect(manager.hasDirtyRects()).toBe(true);
      
      manager.updateCanvasSize(1024, 768);
      
      // 尺寸变化会标记全量重绘而不是清除脏矩形
      expect(manager.needsFullRedraw()).toBe(true);
    });
  });

  describe('clipAndRedraw', () => {
    it('应该使用裁剪区域调用回调', async () => {
      const mockCtx = {
        canvas: { width: canvasWidth, height: canvasHeight },
        save: jest.fn(),
        restore: jest.fn(),
        beginPath: jest.fn(),
        rect: jest.fn(),
        clip: jest.fn(),
        clearRect: jest.fn()
      } as unknown as CanvasRenderingContext2D;

      const callback = jest.fn();
      
      manager.markDirty({ x: 100, y: 100, width: 50, height: 50 });
      
      await manager.clipAndRedraw(mockCtx, callback);
      
      expect(mockCtx.save).toHaveBeenCalled();
      expect(mockCtx.beginPath).toHaveBeenCalled();
      expect(mockCtx.rect).toHaveBeenCalled();
      expect(mockCtx.clip).toHaveBeenCalled();
      expect(mockCtx.clearRect).toHaveBeenCalled();
      expect(callback).toHaveBeenCalled();
      expect(mockCtx.restore).toHaveBeenCalled();
    });

    it('当没有脏矩形时不应该调用回调', async () => {
      const mockCtx = {
        canvas: { width: canvasWidth, height: canvasHeight },
        save: jest.fn(),
        restore: jest.fn(),
        beginPath: jest.fn(),
        rect: jest.fn(),
        clip: jest.fn(),
        clearRect: jest.fn()
      } as unknown as CanvasRenderingContext2D;

      const callback = jest.fn();
      
      await manager.clipAndRedraw(mockCtx, callback);
      
      expect(callback).not.toHaveBeenCalled();
    });
  });

  // Note: expandBounds 是私有方法，通过 markDirty 的行为间接测试
});

