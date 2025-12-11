import { CanvasEngine } from '../../libs/drawBoard/core/CanvasEngine';

describe('CanvasEngine.calculateDynamicLayerZIndex', () => {
  // 实际实现: BASE_ZINDEX = 100, ZINDEX_STEP = 1, MAX_DYNAMIC_LAYER_ZINDEX = 999
  // 公式: BASE_ZINDEX + virtualLayerZIndex * ZINDEX_STEP
  
  it('应该正确计算基础 zIndex', () => {
    expect(CanvasEngine.calculateDynamicLayerZIndex(0)).toBe(100);
    expect(CanvasEngine.calculateDynamicLayerZIndex(1)).toBe(101);
    expect(CanvasEngine.calculateDynamicLayerZIndex(2)).toBe(102);
    expect(CanvasEngine.calculateDynamicLayerZIndex(3)).toBe(103);
  });

  it('应该使用公式 BASE_ZINDEX + layerZIndex * ZINDEX_STEP', () => {
    const testCases = [
      { input: 0, expected: 100 },
      { input: 1, expected: 101 },
      { input: 5, expected: 105 },
      { input: 10, expected: 110 },
      { input: 50, expected: 150 },
    ];

    testCases.forEach(({ input, expected }) => {
      expect(CanvasEngine.calculateDynamicLayerZIndex(input)).toBe(expected);
    });
  });

  it('应该限制最大 zIndex 为 998 (MAX - 1)', () => {
    // 100 + 898 = 998, 不超过 MAX (999)
    expect(CanvasEngine.calculateDynamicLayerZIndex(898)).toBe(998);
    // 100 + 899 = 999 >= MAX (999), 返回 MAX - 1 = 998
    expect(CanvasEngine.calculateDynamicLayerZIndex(899)).toBe(998);
    // 100 + 900 = 1000 >= MAX, 返回 998
    expect(CanvasEngine.calculateDynamicLayerZIndex(900)).toBe(998);
    // 100 + 1000 = 1100 >= MAX, 返回 998
    expect(CanvasEngine.calculateDynamicLayerZIndex(1000)).toBe(998);
  });

  it('应该处理负数输入', () => {
    // 100 + (-1) * 1 = 99
    expect(CanvasEngine.calculateDynamicLayerZIndex(-1)).toBe(99);
    // 100 + (-10) * 1 = 90
    expect(CanvasEngine.calculateDynamicLayerZIndex(-10)).toBe(90);
    // 100 + (-50) * 1 = 50
    expect(CanvasEngine.calculateDynamicLayerZIndex(-50)).toBe(50);
    // 100 + (-100) * 1 = 0
    expect(CanvasEngine.calculateDynamicLayerZIndex(-100)).toBe(0);
  });

  it('应该处理边界值', () => {
    // BASE_ZINDEX = 100, ZINDEX_STEP = 1, MAX = 999
    // 正常计算: 100 + 898 * 1 = 998 (不超过 MAX)
    expect(CanvasEngine.calculateDynamicLayerZIndex(898)).toBe(998);
    // 超过限制: 100 + 899 * 1 = 999, 但 >= MAX(999)，返回 MAX-1 = 998
    expect(CanvasEngine.calculateDynamicLayerZIndex(899)).toBe(998);
    // 正常计算示例
    expect(CanvasEngine.calculateDynamicLayerZIndex(450)).toBe(550);
  });

  it('应该返回整数', () => {
    const result = CanvasEngine.calculateDynamicLayerZIndex(10);
    expect(Number.isInteger(result)).toBe(true);
  });
});
