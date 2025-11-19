import { ShapeUtils } from '../../libs/drawBoard/utils/ShapeUtils';
import type { Point } from '../../libs/drawBoard/core/CanvasEngine';
import type { DrawAction } from '../../libs/drawBoard/tools/DrawTool';
import type { Bounds } from '../../libs/drawBoard/tools/anchor/AnchorTypes';

describe('ShapeUtils', () => {
  describe('calculateBounds', () => {
    it('应该正确计算边界框', () => {
      const points: Point[] = [
        { x: 10, y: 20 },
        { x: 50, y: 60 },
        { x: 30, y: 40 }
      ];
      const bounds = ShapeUtils.calculateBounds(points);
      expect(bounds.x).toBe(10);
      expect(bounds.y).toBe(20);
      expect(bounds.width).toBe(40);
      expect(bounds.height).toBe(40);
    });

    it('应该处理空数组', () => {
      const points: Point[] = [];
      const bounds = ShapeUtils.calculateBounds(points);
      expect(bounds.x).toBe(0);
      expect(bounds.y).toBe(0);
      expect(bounds.width).toBe(0);
      expect(bounds.height).toBe(0);
    });

    it('应该处理单个点', () => {
      const points: Point[] = [{ x: 100, y: 200 }];
      const bounds = ShapeUtils.calculateBounds(points);
      expect(bounds.x).toBe(100);
      expect(bounds.y).toBe(200);
      expect(bounds.width).toBe(10); // 最小宽度
      expect(bounds.height).toBe(10); // 最小高度
    });

    it('应该处理相同坐标的点', () => {
      const points: Point[] = [
        { x: 10, y: 20 },
        { x: 10, y: 20 }
      ];
      const bounds = ShapeUtils.calculateBounds(points);
      expect(bounds.x).toBe(10);
      expect(bounds.y).toBe(20);
      expect(bounds.width).toBe(10); // 最小宽度
      expect(bounds.height).toBe(10); // 最小高度
    });

    it('应该处理负数坐标', () => {
      const points: Point[] = [
        { x: -10, y: -20 },
        { x: 10, y: 20 }
      ];
      const bounds = ShapeUtils.calculateBounds(points);
      expect(bounds.x).toBe(-10);
      expect(bounds.y).toBe(-20);
      expect(bounds.width).toBe(20);
      expect(bounds.height).toBe(40);
    });
  });

  describe('moveShape', () => {
  const createAction = (points: Point[]): DrawAction => ({
    id: 'test',
    type: 'rect',
    points,
    timestamp: Date.now(),
    context: {
      strokeStyle: '#000000',
      fillStyle: '#000000',
      lineWidth: 2
    }
  });

    it('应该正确移动图形', () => {
      const action = createAction([
        { x: 10, y: 20 },
        { x: 50, y: 60 }
      ]);
      const moved = ShapeUtils.moveShape(action, 10, 20);
      expect(moved).not.toBeNull();
      expect(moved!.points[0].x).toBe(20);
      expect(moved!.points[0].y).toBe(40);
      expect(moved!.points[1].x).toBe(60);
      expect(moved!.points[1].y).toBe(80);
    });

    it('应该处理负数偏移', () => {
      const action = createAction([
        { x: 50, y: 60 },
        { x: 100, y: 120 }
      ]);
      const moved = ShapeUtils.moveShape(action, -10, -20);
      expect(moved).not.toBeNull();
      expect(moved!.points[0].x).toBe(40);
      expect(moved!.points[0].y).toBe(40);
    });

    it('应该限制在画布范围内', () => {
      const action = createAction([
        { x: 10, y: 20 },
        { x: 50, y: 60 }
      ]);
      const moved = ShapeUtils.moveShape(action, 100, 200, { width: 100, height: 100 });
      expect(moved).not.toBeNull();
      // 应该被限制在画布范围内
      expect(moved!.points[0].x).toBeLessThanOrEqual(100);
      expect(moved!.points[0].y).toBeLessThanOrEqual(100);
    });

    it('应该返回 null 当 delta 无效', () => {
      const action = createAction([{ x: 10, y: 20 }]);
      expect(ShapeUtils.moveShape(action, NaN, 10)).toBeNull();
      expect(ShapeUtils.moveShape(action, 10, NaN)).toBeNull();
      expect(ShapeUtils.moveShape(action, Infinity, 10)).toBeNull();
      expect(ShapeUtils.moveShape(action, 10, Infinity)).toBeNull();
    });

    it('应该保持图形属性', () => {
      const action: DrawAction = {
        id: 'test',
        type: 'circle',
        points: [{ x: 10, y: 20 }],
        timestamp: 1234567890,
        context: {
          strokeStyle: '#000000',
          fillStyle: '#000000',
          lineWidth: 2
        }
      };
      const moved = ShapeUtils.moveShape(action, 10, 20);
      expect(moved).not.toBeNull();
      expect(moved!.id).toBe(action.id);
      expect(moved!.type).toBe(action.type);
      expect(moved!.timestamp).toBe(action.timestamp);
      expect(moved!.context).toEqual(action.context);
    });
  });

  describe('isPointInBounds', () => {
    const bounds: Bounds = { x: 10, y: 20, width: 50, height: 60 };

    it('应该正确判断点在边界框内', () => {
      expect(ShapeUtils.isPointInBounds({ x: 30, y: 40 }, bounds)).toBe(true);
      expect(ShapeUtils.isPointInBounds({ x: 10, y: 20 }, bounds)).toBe(true);
      expect(ShapeUtils.isPointInBounds({ x: 60, y: 80 }, bounds)).toBe(true);
    });

    it('应该正确判断点在边界框外', () => {
      expect(ShapeUtils.isPointInBounds({ x: 5, y: 15 }, bounds)).toBe(false);
      expect(ShapeUtils.isPointInBounds({ x: 100, y: 100 }, bounds)).toBe(false);
    });

    it('应该使用容差', () => {
      const point = { x: 5, y: 15 }; // 在边界外
      expect(ShapeUtils.isPointInBounds(point, bounds, 0)).toBe(false);
      expect(ShapeUtils.isPointInBounds(point, bounds, 10)).toBe(true);
    });

    it('应该处理边界点', () => {
      expect(ShapeUtils.isPointInBounds({ x: 10, y: 20 }, bounds)).toBe(true);
      expect(ShapeUtils.isPointInBounds({ x: 60, y: 80 }, bounds)).toBe(true);
    });
  });

  describe('isBoundsIntersect', () => {
    it('应该正确判断边界框相交', () => {
      const bounds1: Bounds = { x: 10, y: 10, width: 50, height: 50 };
      const bounds2: Bounds = { x: 30, y: 30, width: 50, height: 50 };
      expect(ShapeUtils.isBoundsIntersect(bounds1, bounds2)).toBe(true);
    });

    it('应该正确判断边界框不相交', () => {
      const bounds1: Bounds = { x: 10, y: 10, width: 50, height: 50 };
      const bounds2: Bounds = { x: 100, y: 100, width: 50, height: 50 };
      expect(ShapeUtils.isBoundsIntersect(bounds1, bounds2)).toBe(false);
    });

    it('应该处理完全包含的情况', () => {
      const bounds1: Bounds = { x: 10, y: 10, width: 100, height: 100 };
      const bounds2: Bounds = { x: 30, y: 30, width: 50, height: 50 };
      expect(ShapeUtils.isBoundsIntersect(bounds1, bounds2)).toBe(true);
    });

    it('应该处理相邻边界框', () => {
      const bounds1: Bounds = { x: 10, y: 10, width: 50, height: 50 };
      const bounds2: Bounds = { x: 60, y: 10, width: 50, height: 50 };
      expect(ShapeUtils.isBoundsIntersect(bounds1, bounds2)).toBe(false);
    });
  });

  describe('mergeBounds', () => {
    it('应该正确合并多个边界框', () => {
      const boundsArray: Bounds[] = [
        { x: 10, y: 10, width: 50, height: 50 },
        { x: 100, y: 100, width: 50, height: 50 },
        { x: 200, y: 200, width: 30, height: 30 }
      ];
      const merged = ShapeUtils.mergeBounds(boundsArray);
      expect(merged.x).toBe(10);
      expect(merged.y).toBe(10);
      expect(merged.width).toBe(220); // 200 + 30 - 10
      expect(merged.height).toBe(220); // 200 + 30 - 10
    });

    it('应该处理空数组', () => {
      const boundsArray: Bounds[] = [];
      const merged = ShapeUtils.mergeBounds(boundsArray);
      expect(merged.x).toBe(0);
      expect(merged.y).toBe(0);
      expect(merged.width).toBe(0);
      expect(merged.height).toBe(0);
    });

    it('应该处理单个边界框', () => {
      const boundsArray: Bounds[] = [
        { x: 10, y: 20, width: 50, height: 60 }
      ];
      const merged = ShapeUtils.mergeBounds(boundsArray);
      expect(merged).toEqual(boundsArray[0]);
    });

    it('应该处理重叠的边界框', () => {
      const boundsArray: Bounds[] = [
        { x: 10, y: 10, width: 50, height: 50 },
        { x: 30, y: 30, width: 50, height: 50 }
      ];
      const merged = ShapeUtils.mergeBounds(boundsArray);
      expect(merged.x).toBe(10);
      expect(merged.y).toBe(10);
      expect(merged.width).toBe(70); // 30 + 50 - 10
      expect(merged.height).toBe(70); // 30 + 50 - 10
    });
  });

  describe('validateBounds', () => {
    it('应该验证并修正边界框', () => {
      const bounds: Bounds = { x: -10, y: -20, width: -50, height: -60 };
      const validated = ShapeUtils.validateBounds(bounds);
      expect(validated.x).toBeGreaterThanOrEqual(0);
      expect(validated.y).toBeGreaterThanOrEqual(0);
      expect(validated.width).toBeGreaterThanOrEqual(0);
      expect(validated.height).toBeGreaterThanOrEqual(0);
      // 当宽度和高度为负数时，修正后应该为0
      expect(validated.width).toBe(0);
      expect(validated.height).toBe(0);
    });

    it('应该限制在画布范围内', () => {
      const bounds: Bounds = { x: 50, y: 50, width: 100, height: 100 };
      const validated = ShapeUtils.validateBounds(bounds, { width: 100, height: 100 });
      expect(validated.x + validated.width).toBeLessThanOrEqual(100);
      expect(validated.y + validated.height).toBeLessThanOrEqual(100);
    });

    it('应该处理有效的边界框', () => {
      const bounds: Bounds = { x: 10, y: 20, width: 50, height: 60 };
      const validated = ShapeUtils.validateBounds(bounds);
      expect(validated).toEqual(bounds);
    });
  });

  describe('getBoundsCenter', () => {
    it('应该正确计算边界框中心', () => {
      const bounds: Bounds = { x: 10, y: 20, width: 50, height: 60 };
      const center = ShapeUtils.getBoundsCenter(bounds);
      expect(center.x).toBe(35); // 10 + 50/2
      expect(center.y).toBe(50); // 20 + 60/2
    });

    it('应该处理零尺寸边界框', () => {
      const bounds: Bounds = { x: 10, y: 20, width: 0, height: 0 };
      const center = ShapeUtils.getBoundsCenter(bounds);
      expect(center.x).toBe(10);
      expect(center.y).toBe(20);
    });
  });

  describe('getDistance', () => {
    it('应该正确计算两点之间的距离', () => {
      const point1: Point = { x: 0, y: 0 };
      const point2: Point = { x: 3, y: 4 };
      const distance = ShapeUtils.getDistance(point1, point2);
      expect(distance).toBe(5); // 3-4-5 直角三角形
    });

    it('应该处理相同点', () => {
      const point: Point = { x: 10, y: 20 };
      const distance = ShapeUtils.getDistance(point, point);
      expect(distance).toBe(0);
    });

    it('应该处理负数坐标', () => {
      const point1: Point = { x: -10, y: -20 };
      const point2: Point = { x: 10, y: 20 };
      const distance = ShapeUtils.getDistance(point1, point2);
      expect(distance).toBeCloseTo(44.72, 1);
    });
  });

  describe('getAngle', () => {
    it('应该正确计算角度', () => {
      const point1: Point = { x: 0, y: 0 };
      const point2: Point = { x: 1, y: 0 };
      const angle = ShapeUtils.getAngle(point1, point2);
      expect(angle).toBe(0); // 向右
    });

    it('应该计算垂直角度', () => {
      const point1: Point = { x: 0, y: 0 };
      const point2: Point = { x: 0, y: 1 };
      const angle = ShapeUtils.getAngle(point1, point2);
      expect(angle).toBeCloseTo(Math.PI / 2, 5); // 向上
    });

    it('应该处理相同点', () => {
      const point: Point = { x: 10, y: 20 };
      const angle = ShapeUtils.getAngle(point, point);
      expect(angle).toBe(0);
    });
  });
});

