import { SpatialIndex } from '../../libs/drawBoard/utils/SpatialIndex';
import type { DrawAction } from '../../libs/drawBoard/tools/DrawTool';
import type { Point } from '../../libs/drawBoard/core/CanvasEngine';

describe('SpatialIndex', () => {
  let index: SpatialIndex;
  let actions: DrawAction[];

  // 辅助函数：计算 action 的边界框
  const getBounds = (action: DrawAction) => {
    if (action.points.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
    const xs = action.points.map(p => p.x);
    const ys = action.points.map(p => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    return {
      x: minX,
      y: minY,
      width: maxX - minX || 10,
      height: maxY - minY || 10,
    };
  };

  beforeEach(() => {
    index = new SpatialIndex(1000, 1000);
    actions = [
      {
        id: '1',
        type: 'rect',
        points: [
          { x: 10, y: 10 },
          { x: 50, y: 50 },
        ],
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
        points: [
          { x: 100, y: 100 },
          { x: 150, y: 150 },
        ],
        timestamp: Date.now(),
        context: {
          strokeStyle: '#000000',
          fillStyle: '#000000',
          lineWidth: 2
        }
      },
      {
        id: '3',
        type: 'line',
        points: [
          { x: 200, y: 200 },
          { x: 250, y: 250 },
        ],
        timestamp: Date.now(),
        context: {
          strokeStyle: '#000000',
          fillStyle: '#000000',
          lineWidth: 2
        }
      },
      {
        id: '4',
        type: 'rect',
        points: [
          { x: 300, y: 300 },
          { x: 350, y: 350 },
        ],
        timestamp: Date.now(),
        context: {
          strokeStyle: '#000000',
          fillStyle: '#000000',
          lineWidth: 2
        }
      },
      {
        id: '5',
        type: 'circle',
        points: [
          { x: 500, y: 500 },
          { x: 600, y: 600 },
        ],
        timestamp: Date.now(),
        context: {
          strokeStyle: '#000000',
          fillStyle: '#000000',
          lineWidth: 2
        }
      },
    ];
  });

  describe('buildIndex', () => {
    it('应该正确构建索引', () => {
      index.buildIndex(actions, getBounds);
      // 验证索引已构建（通过查询验证）
      const candidates = index.queryPoint({ x: 30, y: 30 }, 20);
      expect(candidates.length).toBeGreaterThan(0);
    });

    it('应该处理空 actions 数组', () => {
      expect(() => {
        index.buildIndex([], getBounds);
      }).not.toThrow();
    });

    it('应该处理大量 actions', () => {
      const largeActions: DrawAction[] = [];
      for (let i = 0; i < 1000; i++) {
        largeActions.push({
          id: `action-${i}`,
          type: 'rect',
          points: [
            { x: i * 10, y: i * 10 },
            { x: i * 10 + 50, y: i * 10 + 50 },
          ],
          timestamp: Date.now(),
          context: {
            strokeStyle: '#000000',
            fillStyle: '#000000',
            lineWidth: 2
          }
        });
      }
      expect(() => {
        index.buildIndex(largeActions, getBounds);
      }).not.toThrow();
    });
  });

  describe('queryPoint', () => {
    beforeEach(() => {
      index.buildIndex(actions, getBounds);
    });

    it('应该正确查询点附近的 actions', () => {
      const candidates = index.queryPoint({ x: 30, y: 30 }, 20);
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates.some(a => a.id === '1')).toBe(true);
    });

    it('应该返回空数组当没有匹配的 actions', () => {
      const candidates = index.queryPoint({ x: 900, y: 900 }, 10);
      expect(candidates.length).toBe(0);
    });

    it('应该根据容差返回不同的结果', () => {
      const smallTolerance = index.queryPoint({ x: 30, y: 30 }, 5);
      const largeTolerance = index.queryPoint({ x: 30, y: 30 }, 50);
      expect(largeTolerance.length).toBeGreaterThanOrEqual(smallTolerance.length);
    });

    it('应该处理边界点', () => {
      const candidates = index.queryPoint({ x: 50, y: 50 }, 5);
      expect(candidates.length).toBeGreaterThan(0);
    });
  });

  describe('queryBounds', () => {
    beforeEach(() => {
      index.buildIndex(actions, getBounds);
    });

    it('应该正确查询边界框内的 actions', () => {
      // 扩大查询边界框以包含 action '3'（从 (200,200) 开始）
      const candidates = index.queryBounds({ x: 0, y: 0, width: 250, height: 250 });
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates.some(a => a.id === '1')).toBe(true);
      expect(candidates.some(a => a.id === '2')).toBe(true);
      expect(candidates.some(a => a.id === '3')).toBe(true);
    });

    it('应该返回空数组当边界框内没有 actions', () => {
      const candidates = index.queryBounds({ x: 800, y: 800, width: 100, height: 100 });
      expect(candidates.length).toBe(0);
    });

    it('应该处理部分重叠的边界框', () => {
      const candidates = index.queryBounds({ x: 45, y: 45, width: 10, height: 10 });
      expect(candidates.length).toBeGreaterThan(0);
    });

    it('应该处理完全包含的边界框', () => {
      const candidates = index.queryBounds({ x: 0, y: 0, width: 1000, height: 1000 });
      expect(candidates.length).toBe(actions.length);
    });
  });

  describe('clear', () => {
    it('应该正确清空索引', () => {
      index.buildIndex(actions, getBounds);
      index.clear();
      const candidates = index.queryPoint({ x: 30, y: 30 }, 20);
      expect(candidates.length).toBe(0);
    });

    it('应该允许清空后重新构建', () => {
      index.buildIndex(actions, getBounds);
      index.clear();
      index.buildIndex(actions, getBounds);
      const candidates = index.queryPoint({ x: 30, y: 30 }, 20);
      expect(candidates.length).toBeGreaterThan(0);
    });
  });

  describe('updateCanvasSize', () => {
    it('应该正确更新画布尺寸', () => {
      index.buildIndex(actions, getBounds);
      index.updateCanvasSize(2000, 2000);
      // 清空后应该可以重新构建
      index.buildIndex(actions, getBounds);
      const candidates = index.queryPoint({ x: 30, y: 30 }, 20);
      expect(candidates.length).toBeGreaterThan(0);
    });
  });
});

