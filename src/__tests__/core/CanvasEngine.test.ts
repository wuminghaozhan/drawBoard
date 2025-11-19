import { CanvasEngine } from '../../libs/drawBoard/core/CanvasEngine';

describe('CanvasEngine.calculateDynamicLayerZIndex', () => {
  it('应该正确计算基础 zIndex', () => {
    expect(CanvasEngine.calculateDynamicLayerZIndex(0)).toBe(100);
    expect(CanvasEngine.calculateDynamicLayerZIndex(1)).toBe(102);
    expect(CanvasEngine.calculateDynamicLayerZIndex(2)).toBe(104);
    expect(CanvasEngine.calculateDynamicLayerZIndex(3)).toBe(106);
  });

  it('应该使用公式 BASE_ZINDEX + layerZIndex * 2', () => {
    const testCases = [
      { input: 0, expected: 100 },
      { input: 1, expected: 102 },
      { input: 5, expected: 110 },
      { input: 10, expected: 120 },
      { input: 50, expected: 200 },
    ];

    testCases.forEach(({ input, expected }) => {
      expect(CanvasEngine.calculateDynamicLayerZIndex(input)).toBe(expected);
    });
  });

  it('应该限制最大 zIndex 为 1000', () => {
    expect(CanvasEngine.calculateDynamicLayerZIndex(450)).toBe(1000);
    expect(CanvasEngine.calculateDynamicLayerZIndex(500)).toBe(1000);
    expect(CanvasEngine.calculateDynamicLayerZIndex(1000)).toBe(1000);
  });

  it('应该处理负数输入', () => {
    expect(CanvasEngine.calculateDynamicLayerZIndex(-1)).toBe(98);
    expect(CanvasEngine.calculateDynamicLayerZIndex(-10)).toBe(80);
    expect(CanvasEngine.calculateDynamicLayerZIndex(-50)).toBe(0);
  });

  it('应该处理边界值', () => {
    // 刚好达到最大值的情况
    expect(CanvasEngine.calculateDynamicLayerZIndex(450)).toBe(1000);
    // 刚好不超过最大值的情况
    expect(CanvasEngine.calculateDynamicLayerZIndex(449)).toBe(998);
  });

  it('应该返回整数', () => {
    const result = CanvasEngine.calculateDynamicLayerZIndex(10);
    expect(Number.isInteger(result)).toBe(true);
  });
});

