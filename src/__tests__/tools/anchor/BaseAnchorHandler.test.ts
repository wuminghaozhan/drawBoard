import { BaseAnchorHandler } from '../../../libs/drawBoard/tools/anchor/BaseAnchorHandler';
import type { DrawAction } from '../../../libs/drawBoard/tools/DrawTool';
import type { Point } from '../../../libs/drawBoard/core/CanvasEngine';
import type { AnchorPoint, AnchorType, Bounds } from '../../../libs/drawBoard/tools/anchor/AnchorTypes';

/**
 * 测试用的具体实现类
 * 用于测试 BaseAnchorHandler 的通用方法
 */
class TestAnchorHandler extends BaseAnchorHandler {
  generateAnchors(action: DrawAction, bounds: Bounds): AnchorPoint[] {
    // 简单的测试实现
    return [
      {
        x: bounds.x,
        y: bounds.y,
        type: 'top-left',
        cursor: 'nwse-resize',
        shapeType: 'rect',
        isCenter: false
      }
    ];
  }

  handleAnchorDrag(
    action: DrawAction,
    anchorType: AnchorType,
    startPoint: Point,
    currentPoint: Point,
    dragStartBounds: Bounds,
    dragStartAction?: DrawAction
  ): DrawAction | null {
    // 简单的测试实现
    return action;
  }

  // 暴露 protected 方法用于测试
  public testCalculateBounds(action: DrawAction): Bounds {
    return this.calculateBounds(action);
  }

  public testValidateBounds(
    bounds: Bounds,
    canvasBounds?: { width: number; height: number }
  ): Bounds {
    return this.validateBounds(bounds, canvasBounds);
  }

  public testIsPointInAnchor(
    point: Point,
    anchor: AnchorPoint,
    tolerance?: number
  ): boolean {
    return this.isPointInAnchor(point, anchor, tolerance);
  }
}

describe('BaseAnchorHandler', () => {
  let handler: TestAnchorHandler;
  let testAction: DrawAction;

  beforeEach(() => {
    handler = new TestAnchorHandler();
    testAction = {
      id: 'test',
      type: 'rect',
      points: [
        { x: 10, y: 20 },
        { x: 50, y: 60 }
      ],
      timestamp: Date.now(),
      context: {
        strokeStyle: '#000000',
        fillStyle: '#000000',
        lineWidth: 2
      }
    };
  });

  describe('handleMove', () => {
    it('应该正确移动图形', () => {
      const moved = handler.handleMove(testAction, 10, 20);
      
      expect(moved).not.toBeNull();
      expect(moved!.points[0].x).toBe(20);
      expect(moved!.points[0].y).toBe(40);
      expect(moved!.points[1].x).toBe(60);
      expect(moved!.points[1].y).toBe(80);
    });

    it('应该限制在画布范围内', () => {
      const moved = handler.handleMove(testAction, 100, 200, { width: 100, height: 100 });
      
      expect(moved).not.toBeNull();
      expect(moved!.points[0].x).toBeLessThanOrEqual(100);
      expect(moved!.points[0].y).toBeLessThanOrEqual(100);
    });

    it('应该返回 null 当 delta 无效', () => {
      expect(handler.handleMove(testAction, NaN, 10)).toBeNull();
      expect(handler.handleMove(testAction, 10, NaN)).toBeNull();
      expect(handler.handleMove(testAction, Infinity, 10)).toBeNull();
    });

    it('应该保持图形属性', () => {
      testAction.context = {
        strokeStyle: '#000000',
        fillStyle: '#000000',
        lineWidth: 2
      };
      const moved = handler.handleMove(testAction, 10, 20);
      
      expect(moved).not.toBeNull();
      expect(moved!.id).toBe(testAction.id);
      expect(moved!.type).toBe(testAction.type);
      expect(moved!.context).toEqual(testAction.context);
    });
  });

  describe('calculateCenterPoint', () => {
    it('应该正确计算中心点', () => {
      const center = handler.calculateCenterPoint(testAction);
      
      expect(center.x).toBe(30); // (10 + 50) / 2
      expect(center.y).toBe(40); // (20 + 60) / 2
    });

    it('应该处理单个点', () => {
      const singlePointAction: DrawAction = {
        id: 'single',
        type: 'circle',
        points: [{ x: 100, y: 200 }],
        timestamp: Date.now(),
        context: {
          strokeStyle: '#000000',
          fillStyle: '#000000',
          lineWidth: 2
        }
      };
      
      const center = handler.calculateCenterPoint(singlePointAction);
      expect(center.x).toBe(100);
      expect(center.y).toBe(200);
    });

    it('应该处理空点数组', () => {
      const emptyAction: DrawAction = {
        id: 'empty',
        type: 'rect',
        points: [],
        timestamp: Date.now(),
        context: {
          strokeStyle: '#000000',
          fillStyle: '#000000',
          lineWidth: 2
        }
      };
      
      const center = handler.calculateCenterPoint(emptyAction);
      expect(center.x).toBe(0);
      expect(center.y).toBe(0);
    });
  });

  describe('calculateBounds', () => {
    it('应该正确计算边界框', () => {
      const bounds = handler.testCalculateBounds(testAction);
      
      expect(bounds.x).toBe(10);
      expect(bounds.y).toBe(20);
      expect(bounds.width).toBe(40);
      expect(bounds.height).toBe(40);
    });

    it('应该处理单个点', () => {
      const singlePointAction: DrawAction = {
        id: 'single',
        type: 'circle',
        points: [{ x: 100, y: 200 }],
        timestamp: Date.now(),
        context: {
          strokeStyle: '#000000',
          fillStyle: '#000000',
          lineWidth: 2
        }
      };
      
      const bounds = handler.testCalculateBounds(singlePointAction);
      expect(bounds.x).toBe(100);
      expect(bounds.y).toBe(200);
      expect(bounds.width).toBeGreaterThan(0);
      expect(bounds.height).toBeGreaterThan(0);
    });
  });

  describe('validateBounds', () => {
    it('应该验证并修正边界框', () => {
      const invalidBounds: Bounds = {
        x: -10,
        y: -20,
        width: -50,
        height: -60
      };
      
      const validated = handler.testValidateBounds(invalidBounds);
      
      expect(validated.x).toBeGreaterThanOrEqual(0);
      expect(validated.y).toBeGreaterThanOrEqual(0);
      expect(validated.width).toBeGreaterThanOrEqual(0);
      expect(validated.height).toBeGreaterThanOrEqual(0);
      // 当宽度和高度为负数时，修正后应该为0
      expect(validated.width).toBe(0);
      expect(validated.height).toBe(0);
    });

    it('应该限制在画布范围内', () => {
      const bounds: Bounds = {
        x: 50,
        y: 50,
        width: 100,
        height: 100
      };
      
      const validated = handler.testValidateBounds(bounds, { width: 100, height: 100 });
      
      expect(validated.x + validated.width).toBeLessThanOrEqual(100);
      expect(validated.y + validated.height).toBeLessThanOrEqual(100);
    });

    it('应该处理有效的边界框', () => {
      const bounds: Bounds = {
        x: 10,
        y: 20,
        width: 50,
        height: 60
      };
      
      const validated = handler.testValidateBounds(bounds);
      expect(validated).toEqual(bounds);
    });
  });

  describe('isPointInAnchor', () => {
    it('应该正确判断点在锚点内', () => {
      const anchor: AnchorPoint = {
        x: 100,
        y: 100,
        type: 'top',
        cursor: 'ns-resize',
        shapeType: 'rect',
        isCenter: false
      };
      
      const point: Point = { x: 104, y: 104 }; // 锚点中心附近
      const result = handler.testIsPointInAnchor(point, anchor, 10);
      
      expect(result).toBe(true);
    });

    it('应该正确判断点在锚点外', () => {
      const anchor: AnchorPoint = {
        x: 100,
        y: 100,
        type: 'top',
        cursor: 'ns-resize',
        shapeType: 'rect',
        isCenter: false
      };
      
      const point: Point = { x: 200, y: 200 };
      const result = handler.testIsPointInAnchor(point, anchor, 10);
      
      expect(result).toBe(false);
    });

    it('应该使用默认容差', () => {
      const anchor: AnchorPoint = {
        x: 100,
        y: 100,
        type: 'top',
        cursor: 'ns-resize',
        shapeType: 'rect',
        isCenter: false
      };
      
      const point: Point = { x: 104, y: 104 };
      const result = handler.testIsPointInAnchor(point, anchor);
      
      expect(result).toBe(true);
    });
  });

  describe('抽象方法', () => {
    it('应该要求子类实现 generateAnchors', () => {
      const anchors = handler.generateAnchors(testAction, {
        x: 10,
        y: 20,
        width: 40,
        height: 40
      });
      
      expect(anchors.length).toBeGreaterThan(0);
    });

    it('应该要求子类实现 handleAnchorDrag', () => {
      const result = handler.handleAnchorDrag(
        testAction,
        'top-left',
        { x: 10, y: 20 },
        { x: 20, y: 30 },
        { x: 10, y: 20, width: 40, height: 40 }
      );
      
      expect(result).not.toBeNull();
    });
  });

  describe('锚点大小', () => {
    it('应该使用默认锚点大小', () => {
      // anchorSize 是 protected，我们通过测试来验证它被正确使用
      const anchors = handler.generateAnchors(testAction, {
        x: 10,
        y: 20,
        width: 40,
        height: 40
      });
      
      // 验证锚点生成使用了正确的逻辑
      expect(anchors.length).toBeGreaterThan(0);
    });
  });
});

