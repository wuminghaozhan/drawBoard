/**
 * DirtyRectHandler 单元测试
 */

import { DirtyRectHandler } from '../../../libs/drawBoard/handlers/drawing/DirtyRectHandler';
import type { DrawAction } from '../../../libs/drawBoard/tools/DrawTool';

describe('DirtyRectHandler', () => {
  let handler: DirtyRectHandler;

  beforeEach(() => {
    handler = new DirtyRectHandler(800, 600, {
      enabled: true,
      mergeThreshold: 30,
      maxDirtyRects: 40,
      padding: 4
    });
  });

  describe('基本操作', () => {
    it('默认应该启用', () => {
      expect(handler.isEnabled()).toBe(true);
    });

    it('禁用时应该返回 false', () => {
      const disabledHandler = new DirtyRectHandler(800, 600, { enabled: false });
      expect(disabledHandler.isEnabled()).toBe(false);
    });

    it('初始时没有脏矩形', () => {
      expect(handler.hasDirtyRects()).toBe(false);
    });
  });

  describe('markBoundsDirty', () => {
    it('应该标记区域为脏', () => {
      handler.markBoundsDirty({ x: 0, y: 0, width: 100, height: 100 });
      
      expect(handler.hasDirtyRects()).toBe(true);
    });
  });

  describe('markFullRedraw', () => {
    it('应该触发全量重绘', () => {
      handler.markFullRedraw();
      
      expect(handler.needsFullRedraw()).toBe(true);
    });
  });

  describe('clear', () => {
    it('应该清除所有脏矩形', () => {
      handler.markBoundsDirty({ x: 0, y: 0, width: 100, height: 100 });
      expect(handler.hasDirtyRects()).toBe(true);

      handler.clear();
      expect(handler.hasDirtyRects()).toBe(false);
    });
  });

  describe('calculateActionBounds', () => {
    it('应该正确计算动作边界', () => {
      const action: DrawAction = {
        id: 'test-action',
        type: 'pen',
        points: [
          { x: 10, y: 10 },
          { x: 50, y: 30 },
          { x: 90, y: 50 }
        ],
        context: { lineWidth: 4 }
      } as DrawAction;

      const bounds = handler.calculateActionBounds(action);

      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBe(8); // 10 - lineWidth/2
      expect(bounds!.y).toBe(8); // 10 - lineWidth/2
      expect(bounds!.width).toBe(84); // 90 - 10 + lineWidth
      expect(bounds!.height).toBe(44); // 50 - 10 + lineWidth
    });

    it('没有点时应该返回 null', () => {
      const action: DrawAction = {
        id: 'test-action',
        type: 'pen',
        points: []
      } as DrawAction;

      expect(handler.calculateActionBounds(action)).toBeNull();
    });
  });

  describe('markActionDirty', () => {
    it('应该标记动作区域为脏', () => {
      const action: DrawAction = {
        id: 'test-action',
        type: 'pen',
        points: [
          { x: 10, y: 10 },
          { x: 50, y: 30 }
        ],
        context: { lineWidth: 2 }
      } as DrawAction;

      handler.markActionDirty(action);
      
      expect(handler.hasDirtyRects()).toBe(true);
    });
  });

  describe('rectsIntersect', () => {
    it('相交的矩形应该返回 true', () => {
      const result = handler.rectsIntersect(
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 50, y: 50, width: 100, height: 100 }
      );
      
      expect(result).toBe(true);
    });

    it('不相交的矩形应该返回 false', () => {
      const result = handler.rectsIntersect(
        { x: 0, y: 0, width: 50, height: 50 },
        { x: 100, y: 100, width: 50, height: 50 }
      );
      
      expect(result).toBe(false);
    });
  });

  describe('updateCanvasSize', () => {
    it('应该更新画布尺寸', () => {
      handler.updateCanvasSize(1920, 1080);
      
      // 验证通过 getStats 检查
      const stats = handler.getStats();
      expect(stats).not.toBeNull();
    });
  });

  describe('调试功能', () => {
    it('应该支持启用/禁用调试模式', () => {
      expect(handler.isDebugEnabled()).toBe(false);
      
      handler.setDebugEnabled(true);
      expect(handler.isDebugEnabled()).toBe(true);
      
      handler.setDebugEnabled(false);
      expect(handler.isDebugEnabled()).toBe(false);
    });
  });

  describe('clearBoundsCache', () => {
    it('应该清除边界缓存', () => {
      const action: DrawAction = {
        id: 'test-action',
        type: 'pen',
        points: [{ x: 10, y: 10 }],
        context: { lineWidth: 2 }
      } as DrawAction;

      handler.markActionDirty(action);
      handler.clearBoundsCache();
      
      // 清除后再次标记，应该重新计算边界
      handler.markActionDirty(action);
      expect(handler.hasDirtyRects()).toBe(true);
    });
  });
});

