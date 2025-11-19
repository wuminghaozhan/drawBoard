import { CircleAnchorHandler } from '../../../libs/drawBoard/tools/anchor/CircleAnchorHandler';
import type { DrawAction } from '../../../libs/drawBoard/tools/DrawTool';
import type { AnchorType, Bounds } from '../../../libs/drawBoard/tools/anchor/AnchorTypes';
import type { Point } from '../../../libs/drawBoard/core/CanvasEngine';

describe('CircleAnchorHandler', () => {
  let handler: CircleAnchorHandler;
  let circleAction: DrawAction;
  let bounds: Bounds;

  beforeEach(() => {
    handler = new CircleAnchorHandler();
    circleAction = {
      id: 'circle-1',
      type: 'circle',
      points: [
        { x: 100, y: 100 }, // 圆心
        { x: 150, y: 100 }, // 边缘点（半径50）
      ],
      timestamp: Date.now(),
      context: {
        strokeStyle: '#000000',
        fillStyle: '#000000',
        lineWidth: 2
      }
    };
    bounds = {
      x: 50,
      y: 50,
      width: 100,
      height: 100,
    };
  });

  describe('generateAnchors', () => {
    it('应该生成4个边界锚点 + 1个中心点', () => {
      const anchors = handler.generateAnchors(circleAction, bounds);
      expect(anchors.length).toBe(5);

      const centerAnchors = anchors.filter(a => a.isCenter);
      const edgeAnchors = anchors.filter(a => !a.isCenter);
      expect(centerAnchors.length).toBe(1);
      expect(edgeAnchors.length).toBe(4);
    });

    it('应该正确生成上、下、左、右四个锚点', () => {
      const anchors = handler.generateAnchors(circleAction, bounds);
      const edgeAnchors = anchors.filter(a => !a.isCenter);

      const types = edgeAnchors.map(a => a.type);
      expect(types).toContain('top');
      expect(types).toContain('bottom');
      expect(types).toContain('left');
      expect(types).toContain('right');
    });

    it('应该正确生成中心点', () => {
      const anchors = handler.generateAnchors(circleAction, bounds);
      const centerAnchor = anchors.find(a => a.isCenter);

      expect(centerAnchor).toBeDefined();
      expect(centerAnchor?.type).toBe('center');
      expect(centerAnchor?.cursor).toBe('move');
      expect(centerAnchor?.shapeType).toBe('circle');
    });

    it('应该正确计算锚点位置', () => {
      const anchors = handler.generateAnchors(circleAction, bounds);
      const centerAnchor = anchors.find(a => a.isCenter);
      const topAnchor = anchors.find(a => a.type === 'top');
      const bottomAnchor = anchors.find(a => a.type === 'bottom');
      const leftAnchor = anchors.find(a => a.type === 'left');
      const rightAnchor = anchors.find(a => a.type === 'right');

      // 中心点应该在圆心位置（考虑锚点大小的一半）
      expect(centerAnchor?.x).toBeCloseTo(100 - 4, 1); // center.x - halfSize
      expect(centerAnchor?.y).toBeCloseTo(100 - 4, 1);

      // 上锚点应该在边界框顶部
      expect(topAnchor?.x).toBeCloseTo(100 - 4, 1);
      expect(topAnchor?.y).toBeCloseTo(50 - 4, 1); // bounds.y - halfSize

      // 下锚点应该在边界框底部
      expect(bottomAnchor?.x).toBeCloseTo(100 - 4, 1);
      expect(bottomAnchor?.y).toBeCloseTo(150 - 4, 1); // bounds.y + bounds.height - halfSize

      // 左锚点应该在边界框左侧
      expect(leftAnchor?.x).toBeCloseTo(50 - 4, 1); // bounds.x - halfSize
      expect(leftAnchor?.y).toBeCloseTo(100 - 4, 1);

      // 右锚点应该在边界框右侧
      expect(rightAnchor?.x).toBeCloseTo(150 - 4, 1); // bounds.x + bounds.width - halfSize
      expect(rightAnchor?.y).toBeCloseTo(100 - 4, 1);
    });

    it('应该处理 points 不足的情况', () => {
      const invalidAction: DrawAction = {
        id: 'invalid',
        type: 'circle',
        points: [{ x: 100, y: 100 }], // 只有圆心，没有边缘点
        timestamp: Date.now(),
        context: {
          strokeStyle: '#000000',
          fillStyle: '#000000',
          lineWidth: 2
        }
      };
      const anchors = handler.generateAnchors(invalidAction, bounds);
      expect(anchors.length).toBe(0);
    });

    it('应该处理空 points 数组', () => {
      const invalidAction: DrawAction = {
        id: 'invalid',
        type: 'circle',
        points: [],
        timestamp: Date.now(),
        context: {
          strokeStyle: '#000000',
          fillStyle: '#000000',
          lineWidth: 2
        }
      };
      const anchors = handler.generateAnchors(invalidAction, bounds);
      expect(anchors.length).toBe(0);
    });
  });

  describe('handleAnchorDrag', () => {
    const startPoint: Point = { x: 150, y: 100 };
    const dragStartBounds: Bounds = bounds;

    it('应该正确处理边缘锚点拖拽（top）', () => {
      const currentPoint: Point = { x: 100, y: 50 }; // 向上拖拽，半径变为约50
      const result = handler.handleAnchorDrag(
        circleAction,
        'top',
        startPoint,
        currentPoint,
        dragStartBounds
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.points[0].x).toBe(100); // 圆心不变
        expect(result.points[0].y).toBe(100);
        // 边缘点应该更新
        expect(result.points[1]).toBeDefined();
      }
    });

    it('应该正确处理边缘锚点拖拽（right）', () => {
      const currentPoint: Point = { x: 200, y: 100 }; // 向右拖拽，半径变为100
      const result = handler.handleAnchorDrag(
        circleAction,
        'right',
        startPoint,
        currentPoint,
        dragStartBounds
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.points[0].x).toBe(100); // 圆心不变
        expect(result.points[0].y).toBe(100);
      }
    });

    it('应该正确处理边缘锚点拖拽（bottom）', () => {
      const currentPoint: Point = { x: 100, y: 150 }; // 向下拖拽
      const result = handler.handleAnchorDrag(
        circleAction,
        'bottom',
        startPoint,
        currentPoint,
        dragStartBounds
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.points[0].x).toBe(100); // 圆心不变
        expect(result.points[0].y).toBe(100);
      }
    });

    it('应该正确处理边缘锚点拖拽（left）', () => {
      const currentPoint: Point = { x: 50, y: 100 }; // 向左拖拽
      const result = handler.handleAnchorDrag(
        circleAction,
        'left',
        startPoint,
        currentPoint,
        dragStartBounds
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.points[0].x).toBe(100); // 圆心不变
        expect(result.points[0].y).toBe(100);
      }
    });

    it('应该限制最小半径', () => {
      const currentPoint: Point = { x: 100, y: 100 }; // 拖拽到圆心，半径接近0
      const result = handler.handleAnchorDrag(
        circleAction,
        'top',
        startPoint,
        currentPoint,
        dragStartBounds
      );

      // 应该返回 null 或保持最小半径
      if (result) {
        const radius = Math.sqrt(
          Math.pow(result.points[1].x - result.points[0].x, 2) +
          Math.pow(result.points[1].y - result.points[0].y, 2)
        );
        expect(radius).toBeGreaterThanOrEqual(5); // MIN_RADIUS = 5
      }
    });

    it('应该限制最大半径', () => {
      const currentPoint: Point = { x: 20000, y: 100 }; // 非常大的半径
      const result = handler.handleAnchorDrag(
        circleAction,
        'right',
        startPoint,
        currentPoint,
        dragStartBounds
      );

      if (result) {
        const radius = Math.sqrt(
          Math.pow(result.points[1].x - result.points[0].x, 2) +
          Math.pow(result.points[1].y - result.points[0].y, 2)
        );
        expect(radius).toBeLessThanOrEqual(10000); // MAX_RADIUS = 10000
      }
    });

    it('应该正确处理中心点拖拽（移动）', () => {
      const currentPoint: Point = { x: 200, y: 200 };
      const result = handler.handleAnchorDrag(
        circleAction,
        'center',
        startPoint,
        currentPoint,
        dragStartBounds
      );

      expect(result).not.toBeNull();
      if (result) {
        // 圆心应该移动
        const deltaX = currentPoint.x - startPoint.x;
        const deltaY = currentPoint.y - startPoint.y;
        expect(result.points[0].x).toBe(100 + deltaX);
        expect(result.points[0].y).toBe(100 + deltaY);
      }
    });

    it('应该处理 points 不足的情况', () => {
      const invalidAction: DrawAction = {
        id: 'invalid',
        type: 'circle',
        points: [{ x: 100, y: 100 }],
        timestamp: Date.now(),
        context: {
          strokeStyle: '#000000',
          fillStyle: '#000000',
          lineWidth: 2
        }
      };
      const result = handler.handleAnchorDrag(
        invalidAction,
        'top',
        startPoint,
        { x: 150, y: 50 },
        dragStartBounds
      );
      expect(result).toBeNull();
    });
  });

  describe('handleMove', () => {
    it('应该正确移动圆形', () => {
      const deltaX = 50;
      const deltaY = 30;
      const result = handler.handleMove(circleAction, deltaX, deltaY);

      expect(result).not.toBeNull();
      if (result) {
        expect(result.points[0].x).toBe(150); // 100 + 50
        expect(result.points[0].y).toBe(130); // 100 + 30
        expect(result.points[1].x).toBe(200); // 150 + 50
        expect(result.points[1].y).toBe(130); // 100 + 30
      }
    });

    it('应该处理无效的 delta 值', () => {
      const result1 = handler.handleMove(circleAction, NaN, 30);
      expect(result1).toBeNull();

      const result2 = handler.handleMove(circleAction, 50, Infinity);
      expect(result2).toBeNull();
    });

    it('应该限制点在画布范围内（如果提供画布边界）', () => {
      const canvasBounds = { width: 200, height: 200 };
      const result = handler.handleMove(circleAction, 150, 150, canvasBounds);

      expect(result).not.toBeNull();
      if (result) {
        // 点应该被限制在画布范围内
        expect(result.points[0].x).toBeLessThanOrEqual(200);
        expect(result.points[0].y).toBeLessThanOrEqual(200);
        expect(result.points[0].x).toBeGreaterThanOrEqual(0);
        expect(result.points[0].y).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('calculateCenterPoint', () => {
    it('应该正确计算圆心位置', () => {
      const center = handler.calculateCenterPoint(circleAction);
      expect(center.x).toBe(100);
      expect(center.y).toBe(100);
    });

    it('应该处理空 points 数组', () => {
      const invalidAction: DrawAction = {
        id: 'invalid',
        type: 'circle',
        points: [],
        timestamp: Date.now(),
        context: {
          strokeStyle: '#000000',
          fillStyle: '#000000',
          lineWidth: 2
        }
      };
      const center = handler.calculateCenterPoint(invalidAction);
      expect(center.x).toBe(0);
      expect(center.y).toBe(0);
    });
  });
});

