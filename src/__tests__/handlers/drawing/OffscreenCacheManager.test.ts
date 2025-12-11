/**
 * OffscreenCacheManager 单元测试
 */

import { OffscreenCacheManager } from '../../../libs/drawBoard/handlers/drawing/OffscreenCacheManager';
import { MemoryMonitor } from '../../../libs/drawBoard/infrastructure/performance/MemoryMonitor';

// Mock MemoryMonitor
jest.mock('../../../libs/drawBoard/infrastructure/performance/MemoryMonitor');

describe('OffscreenCacheManager', () => {
  let cacheManager: OffscreenCacheManager;
  let mockMemoryMonitor: jest.Mocked<MemoryMonitor>;

  beforeEach(() => {
    mockMemoryMonitor = new MemoryMonitor() as jest.Mocked<MemoryMonitor>;
    mockMemoryMonitor.isMemoryUsageHigh = jest.fn().mockReturnValue(false);
    
    cacheManager = new OffscreenCacheManager(mockMemoryMonitor, {
      cacheThreshold: 50,
      enableGeometricOptimization: true
    });
  });

  describe('缓存生命周期', () => {
    it('应该初始化时缓存为脏状态', () => {
      expect(cacheManager.isDirty()).toBe(true);
    });

    it('invalidate 应该标记缓存为脏', () => {
      cacheManager.markValid();
      expect(cacheManager.isDirty()).toBe(false);
      
      cacheManager.invalidate();
      expect(cacheManager.isDirty()).toBe(true);
    });

    it('markValid 应该标记缓存为有效', () => {
      cacheManager.markValid();
      expect(cacheManager.isDirty()).toBe(false);
    });
  });

  describe('shouldUseCache', () => {
    it('内存使用率高时应该返回 false', () => {
      mockMemoryMonitor.isMemoryUsageHigh.mockReturnValue(true);
      
      expect(cacheManager.shouldUseCache(100)).toBe(false);
    });

    it('历史记录数量低于阈值时应该返回 false', () => {
      expect(cacheManager.shouldUseCache(10)).toBe(false);
    });

    it('满足条件时应该返回 true', () => {
      mockMemoryMonitor.isMemoryUsageHigh.mockReturnValue(false);
      
      expect(cacheManager.shouldUseCache(100)).toBe(true);
    });
  });

  describe('Canvas 操作', () => {
    it('initialize 应该创建离屏 Canvas', () => {
      const ctx = cacheManager.initialize(800, 600);
      
      expect(ctx).not.toBeNull();
      expect(cacheManager.getCanvas()).not.toBeNull();
      expect(cacheManager.getContext()).not.toBeNull();
    });

    it('尺寸变化时应该标记缓存为脏', () => {
      cacheManager.initialize(800, 600);
      cacheManager.markValid();
      expect(cacheManager.isDirty()).toBe(false);

      // 改变尺寸
      cacheManager.initialize(1024, 768);
      expect(cacheManager.isDirty()).toBe(true);
    });

    it('cleanup 应该释放资源', () => {
      cacheManager.initialize(800, 600);
      expect(cacheManager.getCanvas()).not.toBeNull();

      cacheManager.cleanup();
      expect(cacheManager.getCanvas()).toBeNull();
      expect(cacheManager.getContext()).toBeNull();
    });
  });

  describe('getStats', () => {
    it('没有缓存时应该返回正确状态', () => {
      const stats = cacheManager.getStats();
      
      expect(stats.hasCache).toBe(false);
      expect(stats.isDirty).toBe(true);
      expect(stats.size).toBeNull();
    });

    it('有缓存时应该返回正确状态', () => {
      cacheManager.initialize(800, 600);
      cacheManager.markValid();
      
      const stats = cacheManager.getStats();
      
      expect(stats.hasCache).toBe(true);
      expect(stats.isDirty).toBe(false);
      expect(stats.size).toEqual({ width: 800, height: 600 });
    });
  });

  describe('updateConfig', () => {
    it('应该更新配置', () => {
      cacheManager.updateConfig({ cacheThreshold: 200 });
      
      // 验证：100 < 200，所以不应该使用缓存
      expect(cacheManager.shouldUseCache(100)).toBe(false);
      expect(cacheManager.shouldUseCache(250)).toBe(true);
    });
  });
});

