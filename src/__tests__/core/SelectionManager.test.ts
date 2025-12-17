import { CoreSelectionManager as SelectionManager, type SelectionBox } from '../../libs/drawBoard/core/CoreSelectionManager';
import type { DrawAction } from '../../libs/drawBoard/tools/DrawTool';

describe('SelectionManager', () => {
  let selectionManager: SelectionManager;

  beforeEach(() => {
    selectionManager = new SelectionManager();
  });

  const createAction = (id: string, points: Array<{ x: number; y: number }>): DrawAction => ({
    id,
    type: 'rect',
    points,
    timestamp: Date.now(),
    context: {
      strokeStyle: '#000000',
      fillStyle: '#000000',
      lineWidth: 2
    }
  });

  describe('detectSelection', () => {
    it('应该检测在选择框内的动作', () => {
      const actions = [
        createAction('1', [{ x: 50, y: 50 }, { x: 100, y: 100 }]),
        createAction('2', [{ x: 200, y: 200 }, { x: 250, y: 250 }]),
        createAction('3', [{ x: 60, y: 60 }, { x: 80, y: 80 }])
      ];

      const selectionBox: SelectionBox = {
        left: 40,
        top: 40,
        width: 100,
        height: 100
      };

      const selectedIds = selectionManager.detectSelection(selectionBox, actions);
      
      expect(selectedIds).toContain('1');
      expect(selectedIds).toContain('3');
      expect(selectedIds).not.toContain('2');
    });

    it('应该处理空选择框', () => {
      const actions = [
        createAction('1', [{ x: 50, y: 50 }, { x: 100, y: 100 }])
      ];

      const selectionBox: SelectionBox = {
        left: 0,
        top: 0,
        width: 0,
        height: 0
      };

      const selectedIds = selectionManager.detectSelection(selectionBox, actions);
      expect(selectedIds.length).toBe(0);
    });

    it('应该处理空动作数组', () => {
      const selectionBox: SelectionBox = {
        left: 0,
        top: 0,
        width: 100,
        height: 100
      };

      const selectedIds = selectionManager.detectSelection(selectionBox, []);
      expect(selectedIds.length).toBe(0);
    });

    it('应该处理没有点的动作', () => {
      const actions = [
        createAction('1', [])
      ];

      const selectionBox: SelectionBox = {
        left: 0,
        top: 0,
        width: 100,
        height: 100
      };

      const selectedIds = selectionManager.detectSelection(selectionBox, actions);
      expect(selectedIds.length).toBe(0);
    });
  });

  describe('setSelectionBox 和 getSelectionBox', () => {
    it('应该设置和获取选择框', () => {
      const selectionBox: SelectionBox = {
        left: 10,
        top: 20,
        width: 100,
        height: 200
      };

      selectionManager.setSelectionBox(selectionBox);
      const retrieved = selectionManager.getSelectionBox();

      expect(retrieved).toEqual(selectionBox);
    });

    it('应该允许清空选择框', () => {
      const selectionBox: SelectionBox = {
        left: 10,
        top: 20,
        width: 100,
        height: 200
      };

      selectionManager.setSelectionBox(selectionBox);
      selectionManager.setSelectionBox(null);
      
      expect(selectionManager.getSelectionBox()).toBeNull();
    });
  });

  describe('getSelectedActions', () => {
    it('应该返回选中的动作', () => {
      const actions = [
        createAction('1', [{ x: 50, y: 50 }, { x: 100, y: 100 }]),
        createAction('2', [{ x: 60, y: 60 }, { x: 80, y: 80 }])
      ];

      const selectionBox: SelectionBox = {
        left: 40,
        top: 40,
        width: 100,
        height: 100
      };

      selectionManager.detectSelection(selectionBox, actions);
      const selectedActions = selectionManager.getSelectedActions();

      expect(selectedActions.length).toBe(2);
      expect(selectedActions.some(a => a.action.id === '1')).toBe(true);
      expect(selectedActions.some(a => a.action.id === '2')).toBe(true);
    });

    it('应该在没有选中动作时返回空数组', () => {
      const selectedActions = selectionManager.getSelectedActions();
      expect(selectedActions.length).toBe(0);
    });
  });

  describe('getSelectedActionIds', () => {
    it('应该返回选中的动作ID', () => {
      const actions = [
        createAction('1', [{ x: 50, y: 50 }, { x: 100, y: 100 }]),
        createAction('2', [{ x: 60, y: 60 }, { x: 80, y: 80 }])
      ];

      const selectionBox: SelectionBox = {
        left: 40,
        top: 40,
        width: 100,
        height: 100
      };

      selectionManager.detectSelection(selectionBox, actions);
      const selectedIds = selectionManager.getSelectedActionIds();

      expect(selectedIds).toContain('1');
      expect(selectedIds).toContain('2');
      expect(selectedIds.length).toBe(2);
    });
  });

  describe('hasSelection', () => {
    it('应该正确判断是否有选择', () => {
      expect(selectionManager.hasSelection()).toBe(false);

      const actions = [
        createAction('1', [{ x: 50, y: 50 }, { x: 100, y: 100 }])
      ];

      const selectionBox: SelectionBox = {
        left: 40,
        top: 40,
        width: 100,
        height: 100
      };

      selectionManager.detectSelection(selectionBox, actions);
      expect(selectionManager.hasSelection()).toBe(true);

      selectionManager.clearSelection();
      expect(selectionManager.hasSelection()).toBe(false);
    });
  });

  describe('clearSelection', () => {
    it('应该清空所有选择', () => {
      const actions = [
        createAction('1', [{ x: 50, y: 50 }, { x: 100, y: 100 }])
      ];

      const selectionBox: SelectionBox = {
        left: 40,
        top: 40,
        width: 100,
        height: 100
      };

      selectionManager.detectSelection(selectionBox, actions);
      expect(selectionManager.getSelectedActions().length).toBeGreaterThan(0);

      selectionManager.clearSelection();
      
      expect(selectionManager.getSelectedActions().length).toBe(0);
      expect(selectionManager.getSelectionBox()).toBeNull();
    });
  });

  describe('拖拽状态管理', () => {
    it('应该开始拖拽', () => {
      const actions = [
        createAction('1', [{ x: 50, y: 50 }, { x: 100, y: 100 }])
      ];

      const selectionBox: SelectionBox = {
        left: 40,
        top: 40,
        width: 100,
        height: 100
      };

      selectionManager.detectSelection(selectionBox, actions);
      selectionManager.startDrag({ x: 60, y: 60 });
      
      const delta = selectionManager.updateDrag({ x: 70, y: 70 });
      expect(delta.x).not.toBe(0);
      expect(delta.y).not.toBe(0);
    });

    it('应该在没有选择时不允许拖拽', () => {
      selectionManager.startDrag({ x: 60, y: 60 });
      const delta = selectionManager.updateDrag({ x: 70, y: 70 });
      expect(delta).toEqual({ x: 0, y: 0 });
    });

    it('应该结束拖拽', () => {
      const actions = [
        createAction('1', [{ x: 50, y: 50 }, { x: 100, y: 100 }])
      ];

      const selectionBox: SelectionBox = {
        left: 40,
        top: 40,
        width: 100,
        height: 100
      };

      selectionManager.detectSelection(selectionBox, actions);
      selectionManager.startDrag({ x: 60, y: 60 });
      selectionManager.endDrag();
      
      const delta = selectionManager.updateDrag({ x: 70, y: 70 });
      expect(delta).toEqual({ x: 0, y: 0 });
    });
  });

  describe('边界框计算', () => {
    it('应该正确计算动作的边界框', () => {
      const action = createAction('1', [
        { x: 10, y: 20 },
        { x: 50, y: 60 }
      ]);

      const actions = [action];
      const selectionBox: SelectionBox = {
        left: 0,
        top: 0,
        width: 100,
        height: 100
      };

      selectionManager.detectSelection(selectionBox, actions);
      const selectedActions = selectionManager.getSelectedActions();

      expect(selectedActions.length).toBe(1);
      const bounds = selectedActions[0].bounds;
      
      expect(bounds.left).toBeLessThanOrEqual(10);
      expect(bounds.top).toBeLessThanOrEqual(20);
      expect(bounds.width).toBeGreaterThan(0);
      expect(bounds.height).toBeGreaterThan(0);
    });

    it('应该考虑线宽边距', () => {
      const action = createAction('1', [
        { x: 10, y: 20 },
        { x: 50, y: 60 }
      ]);
      action.context = {
        strokeStyle: '#000000',
        fillStyle: '#000000',
        lineWidth: 10
      };

      const actions = [action];
      const selectionBox: SelectionBox = {
        left: 0,
        top: 0,
        width: 100,
        height: 100
      };

      selectionManager.detectSelection(selectionBox, actions);
      const selectedActions = selectionManager.getSelectedActions();

      expect(selectedActions.length).toBe(1);
      const bounds = selectedActions[0].bounds;
      
      // 边界框应该包含线宽边距
      expect(bounds.left).toBeLessThan(10);
      expect(bounds.top).toBeLessThan(20);
    });
  });
});

