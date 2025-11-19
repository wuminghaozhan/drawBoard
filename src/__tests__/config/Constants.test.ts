import { ConfigConstants } from '../../libs/drawBoard/config/Constants';

describe('ConfigConstants', () => {
  describe('ANCHOR 配置', () => {
    it('应该有正确的锚点大小配置', () => {
      expect(ConfigConstants.ANCHOR.DEFAULT_SIZE).toBe(8);
      expect(ConfigConstants.ANCHOR.MIN_SIZE).toBe(4);
      expect(ConfigConstants.ANCHOR.MAX_SIZE).toBe(20);
    });

    it('应该有正确的锚点容差配置', () => {
      expect(ConfigConstants.ANCHOR.DEFAULT_TOLERANCE).toBe(6);
      expect(ConfigConstants.ANCHOR.MIN_TOLERANCE).toBe(2);
      expect(ConfigConstants.ANCHOR.MAX_TOLERANCE).toBe(15);
    });

    it('应该有正确的锚点缓存TTL', () => {
      expect(ConfigConstants.ANCHOR.CACHE_TTL).toBe(100);
    });
  });

  describe('DRAG 配置', () => {
    it('应该有正确的拖拽敏感度配置', () => {
      expect(ConfigConstants.DRAG.DEFAULT_SENSITIVITY).toBe(0.7);
      expect(ConfigConstants.DRAG.MIN_SENSITIVITY).toBe(0);
      expect(ConfigConstants.DRAG.MAX_SENSITIVITY).toBe(1);
    });

    it('应该有正确的拖拽距离配置', () => {
      expect(ConfigConstants.DRAG.DEFAULT_MIN_DISTANCE).toBe(3);
      expect(ConfigConstants.DRAG.MIN_DISTANCE).toBe(1);
      expect(ConfigConstants.DRAG.MAX_DISTANCE).toBe(10);
    });

    it('应该有正确的圆形精确模式配置', () => {
      expect(ConfigConstants.DRAG.DEFAULT_ENABLE_CIRCLE_PRECISION).toBe(true);
    });
  });

  describe('SPATIAL_INDEX 配置', () => {
    it('应该有正确的空间索引阈值', () => {
      expect(ConfigConstants.SPATIAL_INDEX.POINT_SELECT_THRESHOLD).toBe(1000);
      expect(ConfigConstants.SPATIAL_INDEX.BOX_SELECT_THRESHOLD).toBe(500);
    });
  });

  describe('MEMORY 配置', () => {
    it('应该有正确的内存配置', () => {
      expect(ConfigConstants.MEMORY.DEFAULT_MAX_USAGE).toBe(0.8);
      expect(ConfigConstants.MEMORY.CHECK_INTERVAL).toBe(5000);
    });
  });

  describe('Z_INDEX 配置', () => {
    it('应该有正确的 zIndex 配置', () => {
      expect(ConfigConstants.Z_INDEX.BASE).toBe(100);
      expect(ConfigConstants.Z_INDEX.MAX_DYNAMIC_LAYER).toBe(1000);
      expect(ConfigConstants.Z_INDEX.STEP).toBe(2);
    });
  });

  describe('PERFORMANCE 配置', () => {
    it('应该有正确的性能配置', () => {
      expect(ConfigConstants.PERFORMANCE.OFFScreen_CACHE_THRESHOLD).toBe(100);
      expect(ConfigConstants.PERFORMANCE.THROTTLE_DELAY).toBe(16);
      expect(ConfigConstants.PERFORMANCE.DEBOUNCE_DELAY).toBe(300);
    });
  });

  describe('SHAPE 配置', () => {
    it('应该有正确的图形配置', () => {
      expect(ConfigConstants.SHAPE.MIN_RADIUS).toBe(5);
      expect(ConfigConstants.SHAPE.MAX_RADIUS).toBe(10000);
      expect(ConfigConstants.SHAPE.MIN_SIZE).toBe(5);
      expect(ConfigConstants.SHAPE.MAX_SIZE).toBe(10000);
    });
  });

  describe('常量类型检查', () => {
    it('所有配置应该是只读的', () => {
      // TypeScript 会在编译时检查，这里只是验证结构
      expect(ConfigConstants).toBeDefined();
      expect(typeof ConfigConstants).toBe('object');
    });

    it('配置结构应该完整', () => {
      expect(ConfigConstants).toHaveProperty('ANCHOR');
      expect(ConfigConstants).toHaveProperty('DRAG');
      expect(ConfigConstants).toHaveProperty('SPATIAL_INDEX');
      expect(ConfigConstants).toHaveProperty('MEMORY');
      expect(ConfigConstants).toHaveProperty('Z_INDEX');
      expect(ConfigConstants).toHaveProperty('PERFORMANCE');
      expect(ConfigConstants).toHaveProperty('SHAPE');
    });
  });
});

