import { AnchorUtils } from '../../libs/drawBoard/utils/AnchorUtils';
import type { Point } from '../../libs/drawBoard/core/CanvasEngine';
import type { AnchorPoint } from '../../libs/drawBoard/tools/anchor/AnchorTypes';

describe('AnchorUtils', () => {
  describe('常量', () => {
    it('应该有正确的默认锚点大小', () => {
      expect(AnchorUtils.DEFAULT_ANCHOR_SIZE).toBe(8);
    });

    it('应该有正确的最小和最大锚点大小', () => {
      expect(AnchorUtils.MIN_ANCHOR_SIZE).toBe(4);
      expect(AnchorUtils.MAX_ANCHOR_SIZE).toBe(20);
    });

    it('应该有正确的默认锚点容差', () => {
      expect(AnchorUtils.DEFAULT_ANCHOR_TOLERANCE).toBe(6);
    });

    it('应该有正确的最小和最大锚点容差', () => {
      expect(AnchorUtils.MIN_ANCHOR_TOLERANCE).toBe(2);
      expect(AnchorUtils.MAX_ANCHOR_TOLERANCE).toBe(15);
    });
  });

  describe('calculateCenterPoint', () => {
    it('应该正确计算中心点', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 }
      ];
      const center = AnchorUtils.calculateCenterPoint(points);
      expect(center.x).toBe(5);
      expect(center.y).toBe(5);
    });

    it('应该处理单个点', () => {
      const points: Point[] = [{ x: 100, y: 200 }];
      const center = AnchorUtils.calculateCenterPoint(points);
      expect(center.x).toBe(100);
      expect(center.y).toBe(200);
    });

    it('应该处理空数组', () => {
      const points: Point[] = [];
      const center = AnchorUtils.calculateCenterPoint(points);
      expect(center.x).toBe(0);
      expect(center.y).toBe(0);
    });

    it('应该处理负数坐标', () => {
      const points: Point[] = [
        { x: -10, y: -20 },
        { x: 10, y: 20 }
      ];
      const center = AnchorUtils.calculateCenterPoint(points);
      expect(center.x).toBe(0);
      expect(center.y).toBe(0);
    });

    it('应该处理小数坐标', () => {
      const points: Point[] = [
        { x: 1.5, y: 2.5 },
        { x: 3.5, y: 4.5 }
      ];
      const center = AnchorUtils.calculateCenterPoint(points);
      expect(center.x).toBe(2.5);
      expect(center.y).toBe(3.5);
    });
  });

  describe('isPointInAnchor', () => {
    const anchor: AnchorPoint = {
      x: 100,
      y: 100,
      type: 'top',
      cursor: 'ns-resize',
      shapeType: 'rect',
      isCenter: false
    };

    it('应该正确判断点在锚点内', () => {
      const point: Point = { x: 104, y: 104 }; // 锚点中心附近
      const result = AnchorUtils.isPointInAnchor(point, anchor, 10);
      expect(result).toBe(true);
    });

    it('应该正确判断点在锚点外', () => {
      const point: Point = { x: 200, y: 200 };
      const result = AnchorUtils.isPointInAnchor(point, anchor, 10);
      expect(result).toBe(false);
    });

    it('应该使用默认容差', () => {
      const point: Point = { x: 104, y: 104 };
      const result = AnchorUtils.isPointInAnchor(point, anchor);
      expect(result).toBe(true);
    });

    it('应该处理边界情况', () => {
      const point: Point = { x: 100 + AnchorUtils.DEFAULT_ANCHOR_SIZE / 2 + AnchorUtils.DEFAULT_ANCHOR_TOLERANCE, y: 104 };
      const result = AnchorUtils.isPointInAnchor(point, anchor);
      expect(result).toBe(true);
    });

    it('应该处理超出容差的点', () => {
      const point: Point = { x: 100 + AnchorUtils.DEFAULT_ANCHOR_SIZE / 2 + AnchorUtils.DEFAULT_ANCHOR_TOLERANCE + 1, y: 104 };
      const result = AnchorUtils.isPointInAnchor(point, anchor);
      expect(result).toBe(false);
    });
  });

  describe('clampAnchorSize', () => {
    it('应该限制大小在有效范围内', () => {
      expect(AnchorUtils.clampAnchorSize(5)).toBe(5);
      expect(AnchorUtils.clampAnchorSize(8)).toBe(8);
      expect(AnchorUtils.clampAnchorSize(15)).toBe(15);
    });

    it('应该限制最小值', () => {
      expect(AnchorUtils.clampAnchorSize(2)).toBe(AnchorUtils.MIN_ANCHOR_SIZE);
      expect(AnchorUtils.clampAnchorSize(0)).toBe(AnchorUtils.MIN_ANCHOR_SIZE);
      expect(AnchorUtils.clampAnchorSize(-10)).toBe(AnchorUtils.MIN_ANCHOR_SIZE);
    });

    it('应该限制最大值', () => {
      expect(AnchorUtils.clampAnchorSize(25)).toBe(AnchorUtils.MAX_ANCHOR_SIZE);
      expect(AnchorUtils.clampAnchorSize(100)).toBe(AnchorUtils.MAX_ANCHOR_SIZE);
    });

    it('应该处理边界值', () => {
      expect(AnchorUtils.clampAnchorSize(AnchorUtils.MIN_ANCHOR_SIZE)).toBe(AnchorUtils.MIN_ANCHOR_SIZE);
      expect(AnchorUtils.clampAnchorSize(AnchorUtils.MAX_ANCHOR_SIZE)).toBe(AnchorUtils.MAX_ANCHOR_SIZE);
    });
  });

  describe('clampAnchorTolerance', () => {
    it('应该限制容差在有效范围内', () => {
      expect(AnchorUtils.clampAnchorTolerance(5)).toBe(5);
      expect(AnchorUtils.clampAnchorTolerance(6)).toBe(6);
      expect(AnchorUtils.clampAnchorTolerance(10)).toBe(10);
    });

    it('应该限制最小值', () => {
      expect(AnchorUtils.clampAnchorTolerance(1)).toBe(AnchorUtils.MIN_ANCHOR_TOLERANCE);
      expect(AnchorUtils.clampAnchorTolerance(0)).toBe(AnchorUtils.MIN_ANCHOR_TOLERANCE);
      expect(AnchorUtils.clampAnchorTolerance(-10)).toBe(AnchorUtils.MIN_ANCHOR_TOLERANCE);
    });

    it('应该限制最大值', () => {
      expect(AnchorUtils.clampAnchorTolerance(20)).toBe(AnchorUtils.MAX_ANCHOR_TOLERANCE);
      expect(AnchorUtils.clampAnchorTolerance(100)).toBe(AnchorUtils.MAX_ANCHOR_TOLERANCE);
    });

    it('应该处理边界值', () => {
      expect(AnchorUtils.clampAnchorTolerance(AnchorUtils.MIN_ANCHOR_TOLERANCE)).toBe(AnchorUtils.MIN_ANCHOR_TOLERANCE);
      expect(AnchorUtils.clampAnchorTolerance(AnchorUtils.MAX_ANCHOR_TOLERANCE)).toBe(AnchorUtils.MAX_ANCHOR_TOLERANCE);
    });
  });

  describe('getAnchorCenter', () => {
    it('应该正确计算锚点中心', () => {
      const anchor: AnchorPoint = {
        x: 100,
        y: 100,
        type: 'top',
        cursor: 'ns-resize',
        shapeType: 'rect',
        isCenter: false
      };
      const center = AnchorUtils.getAnchorCenter(anchor);
      expect(center.x).toBe(100 + AnchorUtils.DEFAULT_ANCHOR_SIZE / 2);
      expect(center.y).toBe(100 + AnchorUtils.DEFAULT_ANCHOR_SIZE / 2);
    });

    it('应该处理不同位置的锚点', () => {
      const anchor: AnchorPoint = {
        x: 0,
        y: 0,
        type: 'center',
        cursor: 'move',
        shapeType: 'rect',
        isCenter: true
      };
      const center = AnchorUtils.getAnchorCenter(anchor);
      expect(center.x).toBe(AnchorUtils.DEFAULT_ANCHOR_SIZE / 2);
      expect(center.y).toBe(AnchorUtils.DEFAULT_ANCHOR_SIZE / 2);
    });

    it('应该处理负数坐标', () => {
      const anchor: AnchorPoint = {
        x: -10,
        y: -20,
        type: 'bottom',
        cursor: 'ns-resize',
        shapeType: 'rect',
        isCenter: false
      };
      const center = AnchorUtils.getAnchorCenter(anchor);
      expect(center.x).toBe(-10 + AnchorUtils.DEFAULT_ANCHOR_SIZE / 2);
      expect(center.y).toBe(-20 + AnchorUtils.DEFAULT_ANCHOR_SIZE / 2);
    });
  });

  describe('getAnchorDistance', () => {
    it('应该正确计算两个锚点之间的距离', () => {
      const anchor1: AnchorPoint = {
        x: 0,
        y: 0,
        type: 'top',
        cursor: 'ns-resize',
        shapeType: 'rect',
        isCenter: false
      };
      const anchor2: AnchorPoint = {
        x: 100,
        y: 100,
        type: 'bottom',
        cursor: 'ns-resize',
        shapeType: 'rect',
        isCenter: false
      };
      const distance = AnchorUtils.getAnchorDistance(anchor1, anchor2);
      // 距离应该约为 sqrt((100+4-4)^2 + (100+4-4)^2) = sqrt(10000 + 10000) = sqrt(20000) ≈ 141.42
      expect(distance).toBeCloseTo(141.42, 1);
    });

    it('应该处理相同位置的锚点', () => {
      const anchor: AnchorPoint = {
        x: 100,
        y: 100,
        type: 'center',
        cursor: 'move',
        shapeType: 'rect',
        isCenter: true
      };
      const distance = AnchorUtils.getAnchorDistance(anchor, anchor);
      expect(distance).toBe(0);
    });

    it('应该处理水平对齐的锚点', () => {
      const anchor1: AnchorPoint = {
        x: 0,
        y: 0,
        type: 'left',
        cursor: 'ew-resize',
        shapeType: 'rect',
        isCenter: false
      };
      const anchor2: AnchorPoint = {
        x: 100,
        y: 0,
        type: 'right',
        cursor: 'ew-resize',
        shapeType: 'rect',
        isCenter: false
      };
      const distance = AnchorUtils.getAnchorDistance(anchor1, anchor2);
      expect(distance).toBeCloseTo(100, 1);
    });

    it('应该处理垂直对齐的锚点', () => {
      const anchor1: AnchorPoint = {
        x: 0,
        y: 0,
        type: 'top',
        cursor: 'ns-resize',
        shapeType: 'rect',
        isCenter: false
      };
      const anchor2: AnchorPoint = {
        x: 0,
        y: 100,
        type: 'bottom',
        cursor: 'ns-resize',
        shapeType: 'rect',
        isCenter: false
      };
      const distance = AnchorUtils.getAnchorDistance(anchor1, anchor2);
      expect(distance).toBeCloseTo(100, 1);
    });
  });
});

