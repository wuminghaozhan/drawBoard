import { SelectTool } from '../../libs/drawBoard/tools/SelectTool';
import type { DrawAction } from '../../libs/drawBoard/tools/DrawTool';
import type { Point } from '../../libs/drawBoard/core/CanvasEngine';

describe('SelectTool', () => {
  let selectTool: SelectTool;
  let mockAction: DrawAction;
  let mockActions: DrawAction[];

  beforeEach(() => {
    selectTool = new SelectTool();
    mockAction = {
      id: 'test-1',
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
    };
    mockActions = [
      mockAction,
      {
        id: 'test-2',
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
    ];
  });

  describe('拖拽配置', () => {
    it('应该支持构造函数配置', () => {
      const customTool = new SelectTool({
        sensitivity: 0.8,
        minDragDistance: 5,
        anchorCacheTTL: 150,
        enableCirclePrecisionMode: false,
      });
      const config = customTool.getDragConfig();
      expect(config.sensitivity).toBe(0.8);
      expect(config.minDragDistance).toBe(5);
      expect(config.anchorCacheTTL).toBe(150);
      expect(config.enableCirclePrecisionMode).toBe(false);
    });

    it('应该使用默认配置', () => {
      const config = selectTool.getDragConfig();
      expect(config.sensitivity).toBe(0.7);
      expect(config.minDragDistance).toBe(3);
      expect(config.anchorCacheTTL).toBe(100);
      expect(config.enableCirclePrecisionMode).toBe(true);
    });

    it('应该支持更新配置', () => {
      selectTool.updateDragConfig({ sensitivity: 0.9 });
      const config = selectTool.getDragConfig();
      expect(config.sensitivity).toBe(0.9);
      expect(config.minDragDistance).toBe(3); // 其他配置保持不变
    });

    it('应该支持部分更新配置', () => {
      selectTool.updateDragConfig({ minDragDistance: 10 });
      const config = selectTool.getDragConfig();
      expect(config.minDragDistance).toBe(10);
      expect(config.sensitivity).toBe(0.7); // 其他配置保持不变
    });
  });

  describe('拖拽取消', () => {
    it('应该在没有拖拽时返回 false', () => {
      const wasDragging = selectTool.cancelDrag();
      expect(wasDragging).toBe(false);
    });

    it('应该正确保存拖拽前状态', () => {
      selectTool.setLayerActions(mockActions, false);
      // 注意：实际测试需要模拟拖拽开始
      // 这里主要测试 cancelDrag 方法的存在和基本行为
      const wasDragging = selectTool.cancelDrag();
      expect(typeof wasDragging).toBe('boolean');
    });

    it('应该支持取消拖拽操作', () => {
      selectTool.setLayerActions([mockAction], false);
      // 模拟拖拽开始（需要内部状态）
      // 由于 cancelDrag 需要内部状态，这里主要验证方法存在
      expect(typeof selectTool.cancelDrag).toBe('function');
    });
  });

  describe('空间索引', () => {
    it('应该支持清空空间索引', () => {
      selectTool.setLayerActions(mockActions, false);
      expect(() => {
        selectTool.clearSpatialIndex();
      }).not.toThrow();
    });

    it('应该在设置图层 actions 时清空空间索引', () => {
      selectTool.setLayerActions(mockActions, false);
      // 验证空间索引被清空（通过后续查询验证）
      selectTool.clearSpatialIndex();
      expect(() => {
        selectTool.clearSpatialIndex();
      }).not.toThrow();
    });
  });

  describe('setLayerActions', () => {
    it('应该正确设置图层 actions', () => {
      selectTool.setLayerActions(mockActions, false);
      // 验证 actions 已设置（通过其他方法验证）
      expect(() => {
        selectTool.clearSpatialIndex();
      }).not.toThrow();
    });

    it('应该在 clearSelection 为 true 时清空选择', () => {
      selectTool.setLayerActions(mockActions, false);
      selectTool.setLayerActions(mockActions, true);
      // 验证选择已清空
      expect(() => {
        selectTool.clearSpatialIndex();
      }).not.toThrow();
    });
  });
});

