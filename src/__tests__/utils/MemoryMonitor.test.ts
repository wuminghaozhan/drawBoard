import { MemoryMonitor } from '../../libs/drawBoard/infrastructure/performance/MemoryMonitor';

describe('MemoryMonitor', () => {
  let monitor: MemoryMonitor;
  let originalMemory: any;

  beforeEach(() => {
    monitor = new MemoryMonitor();
    // 保存原始的 performance.memory
    originalMemory = (window.performance as any).memory;
  });

  afterEach(() => {
    // 恢复原始的 performance.memory
    if (originalMemory) {
      (window.performance as any).memory = originalMemory;
    }
  });

  describe('getMemoryUsage', () => {
    it('应该正确获取内存使用率（如果支持）', () => {
      // Mock performance.memory
      (window.performance as any).memory = {
        usedJSHeapSize: 10000000,
        totalJSHeapSize: 20000000,
        jsHeapSizeLimit: 200000000,
      };

      const usage = monitor.getMemoryUsage();
      if (usage !== null) {
        expect(usage).toBeGreaterThanOrEqual(0);
        expect(usage).toBeLessThanOrEqual(1);
        expect(usage).toBeCloseTo(0.05, 2); // 10000000 / 200000000 = 0.05
      }
    });

    it('应该返回 null 当浏览器不支持 performance.memory', () => {
      // 移除 performance.memory
      delete (window.performance as any).memory;
      const usage = monitor.getMemoryUsage();
      expect(usage).toBeNull();
    });

    it('应该返回 null 当内存数据无效', () => {
      (window.performance as any).memory = {
        usedJSHeapSize: 0,
        totalJSHeapSize: 0,
        jsHeapSizeLimit: 0,
      };
      const usage = monitor.getMemoryUsage();
      expect(usage).toBeNull();
    });

    it('应该限制使用率在 0-1 之间', () => {
      (window.performance as any).memory = {
        usedJSHeapSize: 300000000, // 超过限制
        totalJSHeapSize: 200000000,
        jsHeapSizeLimit: 200000000,
      };
      const usage = monitor.getMemoryUsage();
      if (usage !== null) {
        expect(usage).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('isMemoryUsageHigh', () => {
    it('应该正确判断内存是否紧张', () => {
      (window.performance as any).memory = {
        usedJSHeapSize: 10000000,
        totalJSHeapSize: 20000000,
        jsHeapSizeLimit: 200000000,
      };
      const isHigh = monitor.isMemoryUsageHigh();
      expect(typeof isHigh).toBe('boolean');
      expect(isHigh).toBe(false); // 0.05 < 0.8
    });

    it('应该在内存使用率高时返回 true', () => {
      (window.performance as any).memory = {
        usedJSHeapSize: 170000000, // 85% 使用率
        totalJSHeapSize: 200000000,
        jsHeapSizeLimit: 200000000,
      };
      monitor.refresh(); // 清除缓存
      const isHigh = monitor.isMemoryUsageHigh();
      expect(isHigh).toBe(true);
    });

    it('应该使用缓存机制', () => {
      (window.performance as any).memory = {
        usedJSHeapSize: 10000000,
        totalJSHeapSize: 20000000,
        jsHeapSizeLimit: 200000000,
      };
      monitor.refresh();
      const firstCall = monitor.isMemoryUsageHigh();
      
      // 修改内存数据
      (window.performance as any).memory.usedJSHeapSize = 170000000;
      
      // 立即再次调用，应该使用缓存
      const secondCall = monitor.isMemoryUsageHigh();
      expect(secondCall).toBe(firstCall); // 应该使用缓存
    });

    it('应该在浏览器不支持时返回 false', () => {
      delete (window.performance as any).memory;
      const isHigh = monitor.isMemoryUsageHigh();
      expect(isHigh).toBe(false);
    });
  });

  describe('setMaxMemoryUsage', () => {
    it('应该正确设置内存使用率阈值', () => {
      monitor.setMaxMemoryUsage(0.9);
      // 设置内存使用率刚好超过阈值（90%）
      (window.performance as any).memory = {
        usedJSHeapSize: 181000000, // 90.5% 使用率 (181/200)
        totalJSHeapSize: 200000000,
        jsHeapSizeLimit: 200000000,
      };
      monitor.refresh(); // 清除缓存
      const isHigh = monitor.isMemoryUsageHigh();
      expect(isHigh).toBe(true);
    });

    it('应该拒绝无效的阈值（负数）', () => {
      const originalThreshold = monitor.getMemoryInfo();
      monitor.setMaxMemoryUsage(-0.1);
      // 阈值应该保持不变
      const newThreshold = monitor.getMemoryInfo();
      expect(newThreshold.isHigh).toBe(originalThreshold.isHigh);
    });

    it('应该拒绝无效的阈值（大于1）', () => {
      const originalThreshold = monitor.getMemoryInfo();
      monitor.setMaxMemoryUsage(1.5);
      // 阈值应该保持不变
      const newThreshold = monitor.getMemoryInfo();
      expect(newThreshold.isHigh).toBe(originalThreshold.isHigh);
    });
  });

  describe('getMemoryInfo', () => {
    it('应该正确获取内存信息', () => {
      (window.performance as any).memory = {
        usedJSHeapSize: 10000000,
        totalJSHeapSize: 20000000,
        jsHeapSizeLimit: 200000000,
      };
      const info = monitor.getMemoryInfo();
      expect(info).toHaveProperty('usage');
      expect(info).toHaveProperty('used');
      expect(info).toHaveProperty('total');
      expect(info).toHaveProperty('limit');
      expect(info).toHaveProperty('isHigh');
      expect(typeof info.isHigh).toBe('boolean');
    });

    it('应该在浏览器不支持时返回默认值', () => {
      delete (window.performance as any).memory;
      const info = monitor.getMemoryInfo();
      expect(info.usage).toBeNull();
      expect(info.used).toBeNull();
      expect(info.total).toBeNull();
      expect(info.limit).toBeNull();
      expect(info.isHigh).toBe(false);
    });
  });

  describe('refresh', () => {
    it('应该正确刷新缓存', () => {
      (window.performance as any).memory = {
        usedJSHeapSize: 10000000,
        totalJSHeapSize: 20000000,
        jsHeapSizeLimit: 200000000,
      };
      monitor.isMemoryUsageHigh(); // 触发缓存
      monitor.refresh();
      
      // 修改内存数据
      (window.performance as any).memory.usedJSHeapSize = 170000000;
      
      // 刷新后应该使用新数据
      const isHigh = monitor.isMemoryUsageHigh();
      expect(isHigh).toBe(true);
    });
  });
});

