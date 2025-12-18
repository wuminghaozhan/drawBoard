import { BoundsCalculator } from '../../../libs/drawBoard/tools/select/BoundsCalculator';
import type { TextAction } from '../../../libs/drawBoard/types/TextTypes';

describe('BoundsCalculator - 文本高度计算', () => {
  let calculator: BoundsCalculator;

  beforeEach(() => {
    calculator = new BoundsCalculator();
  });

  describe('单行文本', () => {
    it('应该返回单行高度', () => {
      const action: TextAction = {
        id: 'text-1',
        type: 'text',
        points: [{ x: 0, y: 0 }],
        text: '短文本',
        fontSize: 16,
        width: 200, // 足够宽，不会折行
        timestamp: Date.now(),
        context: {
          strokeStyle: '#000000',
          fillStyle: '#000000',
          lineWidth: 1
        }
      };

      const bounds = calculator.calculate(action);
      const expectedHeight = 16 * 1.2; // fontSize * lineHeight

      expect(bounds.height).toBeCloseTo(expectedHeight, 1);
    });

    it('应该正确处理没有width的单行文本', () => {
      const action: TextAction = {
        id: 'text-2',
        type: 'text',
        points: [{ x: 0, y: 0 }],
        text: '单行文本',
        fontSize: 16,
        timestamp: Date.now(),
        context: {
          strokeStyle: '#000000',
          fillStyle: '#000000',
          lineWidth: 1
        }
      };

      const bounds = calculator.calculate(action);
      const expectedHeight = 16 * 1.2;

      expect(bounds.height).toBeCloseTo(expectedHeight, 1);
    });
  });

  describe('多行文本 - 折行计算', () => {
    it('应该正确计算两行文本的高度', () => {
      const action: TextAction = {
        id: 'text-3',
        type: 'text',
        points: [{ x: 0, y: 0 }],
        text: '这是一段比较长的文本内容应该会折行',
        fontSize: 16,
        width: 100, // 窄宽度，会折行
        timestamp: Date.now(),
        context: {
          strokeStyle: '#000000',
          fillStyle: '#000000',
          lineWidth: 1
        }
      };

      const bounds = calculator.calculate(action);
      const lineHeight = 16 * 1.2;
      const expectedHeight = lineHeight * 2; // 至少两行

      expect(bounds.height).toBeGreaterThanOrEqual(expectedHeight);
      expect(bounds.height).toBeLessThan(lineHeight * 10); // 不应该超过太多行
    });

    it('应该正确处理中英文混合文本', () => {
      const action: TextAction = {
        id: 'text-4',
        type: 'text',
        points: [{ x: 0, y: 0 }],
        text: '中文English混合文本Mixed Content',
        fontSize: 16,
        width: 120, // 窄宽度，会折行
        timestamp: Date.now(),
        context: {
          strokeStyle: '#000000',
          fillStyle: '#000000',
          lineWidth: 1
        }
      };

      const bounds = calculator.calculate(action);
      const lineHeight = 16 * 1.2;

      // 应该至少折行
      expect(bounds.height).toBeGreaterThan(lineHeight);
    });

    it('应该正确处理包含换行符的文本', () => {
      const action: TextAction = {
        id: 'text-5',
        type: 'text',
        points: [{ x: 0, y: 0 }],
        text: '第一行\n第二行\n第三行',
        fontSize: 16,
        width: 200,
        timestamp: Date.now(),
        context: {
          strokeStyle: '#000000',
          fillStyle: '#000000',
          lineWidth: 1
        }
      };

      const bounds = calculator.calculate(action);
      const lineHeight = 16 * 1.2;
      const expectedHeight = lineHeight * 3; // 三行

      expect(bounds.height).toBeCloseTo(expectedHeight, 1);
    });

    it('应该正确处理空段落', () => {
      const action: TextAction = {
        id: 'text-6',
        type: 'text',
        points: [{ x: 0, y: 0 }],
        text: '第一行\n\n第三行',
        fontSize: 16,
        width: 200,
        timestamp: Date.now(),
        context: {
          strokeStyle: '#000000',
          fillStyle: '#000000',
          lineWidth: 1
        }
      };

      const bounds = calculator.calculate(action);
      const lineHeight = 16 * 1.2;
      const expectedHeight = lineHeight * 3; // 三行（包括空行）

      expect(bounds.height).toBeCloseTo(expectedHeight, 1);
    });
  });

  describe('边界情况', () => {
    it('应该处理空文本', () => {
      const action: TextAction = {
        id: 'text-7',
        type: 'text',
        points: [{ x: 0, y: 0 }],
        text: '',
        fontSize: 16,
        width: 200,
        timestamp: Date.now(),
        context: {
          strokeStyle: '#000000',
          fillStyle: '#000000',
          lineWidth: 1
        }
      };

      const bounds = calculator.calculate(action);
      const lineHeight = 16 * 1.2;

      expect(bounds.height).toBeCloseTo(lineHeight, 1);
    });

    it('应该处理width为0的情况', () => {
      const action: TextAction = {
        id: 'text-8',
        type: 'text',
        points: [{ x: 0, y: 0 }],
        text: '测试文本',
        fontSize: 16,
        width: 0,
        timestamp: Date.now(),
        context: {
          strokeStyle: '#000000',
          fillStyle: '#000000',
          lineWidth: 1
        }
      };

      const bounds = calculator.calculate(action);
      const lineHeight = 16 * 1.2;

      expect(bounds.height).toBeCloseTo(lineHeight, 1);
    });

    it('应该处理width小于字符宽度的情况', () => {
      const action: TextAction = {
        id: 'text-9',
        type: 'text',
        points: [{ x: 0, y: 0 }],
        text: '测试',
        fontSize: 16,
        width: 5, // 非常窄
        timestamp: Date.now(),
        context: {
          strokeStyle: '#000000',
          fillStyle: '#000000',
          lineWidth: 1
        }
      };

      const bounds = calculator.calculate(action);
      const lineHeight = 16 * 1.2;

      // 即使很窄，也应该至少有一行高度
      expect(bounds.height).toBeGreaterThanOrEqual(lineHeight);
    });

    it('应该处理height已存在的情况', () => {
      const action: TextAction = {
        id: 'text-10',
        type: 'text',
        points: [{ x: 0, y: 0 }],
        text: '测试文本',
        fontSize: 16,
        width: 200,
        height: 50, // 已存在的高度
        timestamp: Date.now(),
        context: {
          strokeStyle: '#000000',
          fillStyle: '#000000',
          lineWidth: 1
        }
      };

      const bounds = calculator.calculate(action);

      // 如果height已存在，应该直接使用
      expect(bounds.height).toBe(50);
    });
  });

  describe('性能测试 - 长文本', () => {
    it('应该能快速处理长文本', () => {
      // 生成一个长文本（1000个字符）
      const longText = '这是一段很长的文本内容'.repeat(100);
      
      const action: TextAction = {
        id: 'text-11',
        type: 'text',
        points: [{ x: 0, y: 0 }],
        text: longText,
        fontSize: 16,
        width: 200,
        timestamp: Date.now(),
        context: {
          strokeStyle: '#000000',
          fillStyle: '#000000',
          lineWidth: 1
        }
      };

      const startTime = performance.now();
      const bounds = calculator.calculate(action);
      const endTime = performance.now();

      // 应该在合理时间内完成（< 100ms）
      expect(endTime - startTime).toBeLessThan(100);
      
      // 结果应该合理
      const lineHeight = 16 * 1.2;
      expect(bounds.height).toBeGreaterThan(lineHeight);
    });

    it('应该能处理超长文本（10000个字符）', () => {
      const veryLongText = '测试'.repeat(5000);
      
      const action: TextAction = {
        id: 'text-12',
        type: 'text',
        points: [{ x: 0, y: 0 }],
        text: veryLongText,
        fontSize: 16,
        width: 200,
        timestamp: Date.now(),
        context: {
          strokeStyle: '#000000',
          fillStyle: '#000000',
          lineWidth: 1
        }
      };

      const startTime = performance.now();
      const bounds = calculator.calculate(action);
      const endTime = performance.now();

      // 应该在合理时间内完成（< 500ms）
      expect(endTime - startTime).toBeLessThan(500);
      
      // 结果应该合理
      expect(bounds.height).toBeGreaterThan(16 * 1.2);
    });
  });

  describe('字符宽度计算准确性', () => {
    it('应该正确区分中文字符和英文字符的宽度', () => {
      // 中文字符宽度 = fontSize，英文字符宽度 = fontSize * 0.6
      const action: TextAction = {
        id: 'text-13',
        type: 'text',
        points: [{ x: 0, y: 0 }],
        text: '中A文B字C符',
        fontSize: 16,
        width: 80, // 刚好能放下几个字符
        timestamp: Date.now(),
        context: {
          strokeStyle: '#000000',
          fillStyle: '#000000',
          lineWidth: 1
        }
      };

      const bounds = calculator.calculate(action);
      const lineHeight = 16 * 1.2;

      // 应该正确折行
      expect(bounds.height).toBeGreaterThan(lineHeight);
    });

    it('应该正确处理全中文文本', () => {
      const action: TextAction = {
        id: 'text-14',
        type: 'text',
        points: [{ x: 0, y: 0 }],
        text: '这是一段全中文的文本内容',
        fontSize: 16,
        width: 80, // 每行约5个中文字符
        timestamp: Date.now(),
        context: {
          strokeStyle: '#000000',
          fillStyle: '#000000',
          lineWidth: 1
        }
      };

      const bounds = calculator.calculate(action);
      const lineHeight = 16 * 1.2;
      const textLength = action.text!.length;
      const charsPerLine = Math.floor(80 / 16); // 约5个字符
      const expectedLines = Math.ceil(textLength / charsPerLine);

      expect(bounds.height).toBeCloseTo(lineHeight * expectedLines, 1);
    });

    it('应该正确处理全英文文本', () => {
      const action: TextAction = {
        id: 'text-15',
        type: 'text',
        points: [{ x: 0, y: 0 }],
        text: 'This is a long English text content',
        fontSize: 16,
        width: 80, // 每行约8个英文字符
        timestamp: Date.now(),
        context: {
          strokeStyle: '#000000',
          fillStyle: '#000000',
          lineWidth: 1
        }
      };

      const bounds = calculator.calculate(action);
      const lineHeight = 16 * 1.2;

      // 应该正确折行
      expect(bounds.height).toBeGreaterThan(lineHeight);
    });
  });
});

