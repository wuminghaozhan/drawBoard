/**
 * PathSplitter 单元测试
 */

import { PathSplitter } from '../../../libs/drawBoard/tools/eraser/PathSplitter';
import type { DrawAction } from '../../../libs/drawBoard/tools/DrawTool';
import type { Point } from '../../../libs/drawBoard/core/CanvasEngine';

describe('PathSplitter', () => {
  let splitter: PathSplitter;
  
  beforeEach(() => {
    splitter = new PathSplitter(10, {
      enableSpatialIndex: false, // 简化测试
      enableSmoothing: false
    });
  });
  
  // 创建测试用的画笔 Action
  const createPenAction = (id: string, points: Point[]): DrawAction => ({
    id,
    type: 'pen',
    points,
    context: {
      strokeStyle: '#000000',
      lineWidth: 2,
      lineCap: 'round',
      lineJoin: 'round',
      globalCompositeOperation: 'source-over'
    },
    timestamp: Date.now()
  });
  
  describe('基本分割', () => {
    it('应该正确分割简单交叉', () => {
      // 水平画笔线
      const penAction = createPenAction('pen-1', [
        { x: 0, y: 50 },
        { x: 100, y: 50 }
      ]);
      
      // 垂直橡皮擦线（穿过画笔中间）
      const eraserPoints: Point[] = [
        { x: 50, y: 0 },
        { x: 50, y: 100 }
      ];
      
      const result = splitter.splitPenAction(penAction, eraserPoints);
      
      expect(result.split).toBe(true);
      expect(result.resultActions.length).toBeGreaterThan(0);
      expect(result.originalActionId).toBe('pen-1');
    });
    
    it('应该在无交叉时返回原始 Action', () => {
      const penAction = createPenAction('pen-1', [
        { x: 0, y: 0 },
        { x: 100, y: 0 }
      ]);
      
      // 橡皮擦在画笔下方，无交叉
      const eraserPoints: Point[] = [
        { x: 0, y: 100 },
        { x: 100, y: 100 }
      ];
      
      const result = splitter.splitPenAction(penAction, eraserPoints);
      
      expect(result.split).toBe(false);
      expect(result.resultActions.length).toBe(1);
      expect(result.resultActions[0].id).toBe('pen-1');
    });
    
    it('应该处理完全被擦除的情况', () => {
      // 短画笔线
      const penAction = createPenAction('pen-1', [
        { x: 48, y: 50 },
        { x: 52, y: 50 }
      ]);
      
      // 大范围橡皮擦
      splitter.setEraserRadius(20);
      const eraserPoints: Point[] = [
        { x: 50, y: 0 },
        { x: 50, y: 100 }
      ];
      
      const result = splitter.splitPenAction(penAction, eraserPoints);
      
      expect(result.split).toBe(true);
      expect(result.resultActions.length).toBe(0);
    });
  });
  
  describe('多次交叉', () => {
    it('应该正确处理多次交叉', () => {
      // 长水平画笔线
      const penAction = createPenAction('pen-1', [
        { x: 0, y: 50 },
        { x: 50, y: 50 },
        { x: 100, y: 50 },
        { x: 150, y: 50 },
        { x: 200, y: 50 }
      ]);
      
      // 两条垂直橡皮擦线
      const eraserPoints: Point[] = [
        { x: 50, y: 0 },
        { x: 50, y: 100 },
        { x: 150, y: 100 },
        { x: 150, y: 0 }
      ];
      
      const result = splitter.splitPenAction(penAction, eraserPoints);
      
      expect(result.split).toBe(true);
      // 应该分割成多个片段
      expect(result.resultActions.length).toBeGreaterThan(1);
    });
  });
  
  describe('长线段处理', () => {
    it('应该在长线段上精确分割', () => {
      // 长画笔线（两点之间距离很大）
      const penAction = createPenAction('pen-1', [
        { x: 0, y: 50 },
        { x: 200, y: 50 }
      ]);
      
      splitter.setEraserRadius(5);
      
      // 在中间位置擦除
      const eraserPoints: Point[] = [
        { x: 100, y: 0 },
        { x: 100, y: 100 }
      ];
      
      const result = splitter.splitPenAction(penAction, eraserPoints);
      
      expect(result.split).toBe(true);
      // 应该分割成两部分
      expect(result.resultActions.length).toBe(2);
    });
  });
  
  describe('批量处理', () => {
    it('应该正确批量处理多个 Actions', () => {
      const actions: DrawAction[] = [
        createPenAction('pen-1', [
          { x: 0, y: 50 },
          { x: 100, y: 50 }
        ]),
        createPenAction('pen-2', [
          { x: 0, y: 150 },
          { x: 100, y: 150 }
        ]),
        createPenAction('pen-3', [
          { x: 0, y: 250 },
          { x: 100, y: 250 }
        ])
      ];
      
      // 只擦除第一条
      const eraserPoints: Point[] = [
        { x: 50, y: 0 },
        { x: 50, y: 100 }
      ];
      
      const result = splitter.splitMultiplePenActions(actions, eraserPoints);
      
      expect(result.unchanged.length).toBe(2);
      expect(result.splitResults.size).toBe(1);
      expect(result.splitResults.has('pen-1')).toBe(true);
    });
    
    it('应该过滤非画笔 Actions', () => {
      const actions: DrawAction[] = [
        createPenAction('pen-1', [
          { x: 0, y: 50 },
          { x: 100, y: 50 }
        ]),
        {
          id: 'rect-1',
          type: 'rect',
          points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
          context: {} as any,
          timestamp: Date.now()
        }
      ];
      
      const eraserPoints: Point[] = [
        { x: 50, y: 50 }
      ];
      
      const result = splitter.splitMultiplePenActions(actions, eraserPoints);
      
      // 矩形应该保持不变
      expect(result.unchanged.some(a => a.id === 'rect-1')).toBe(true);
    });
  });
  
  describe('边界情况', () => {
    it('应该处理点数不足的情况', () => {
      const penAction = createPenAction('pen-1', [{ x: 50, y: 50 }]);
      const eraserPoints: Point[] = [{ x: 50, y: 50 }];
      
      const result = splitter.splitPenAction(penAction, eraserPoints);
      
      expect(result.split).toBe(false);
    });
    
    it('应该处理空橡皮擦路径', () => {
      const penAction = createPenAction('pen-1', [
        { x: 0, y: 0 },
        { x: 100, y: 100 }
      ]);
      
      const result = splitter.splitPenAction(penAction, []);
      
      expect(result.split).toBe(false);
    });
  });
  
  describe('分割 Action 属性保留', () => {
    it('应该保留原始 Action 的属性', () => {
      const penAction = createPenAction('pen-1', [
        { x: 0, y: 50 },
        { x: 100, y: 50 }
      ]);
      penAction.virtualLayerId = 'layer-1';
      (penAction.context as any).strokeStyle = '#ff0000';
      
      const eraserPoints: Point[] = [
        { x: 50, y: 0 },
        { x: 50, y: 100 }
      ];
      
      const result = splitter.splitPenAction(penAction, eraserPoints);
      
      if (result.split && result.resultActions.length > 0) {
        for (const action of result.resultActions) {
          expect(action.virtualLayerId).toBe('layer-1');
          expect((action.context as any).strokeStyle).toBe('#ff0000');
          expect((action as any).splitFrom).toBe('pen-1');
        }
      }
    });
  });
});

describe('PathSplitter 配置', () => {
  it('应该支持启用空间索引', () => {
    const splitter = new PathSplitter(10, {
      enableSpatialIndex: true,
      canvasWidth: 1920,
      canvasHeight: 1080
    });
    
    expect(splitter).toBeDefined();
  });
  
  it('应该支持启用平滑', () => {
    const splitter = new PathSplitter(10, {
      enableSmoothing: true,
      smoothingSamples: 5
    });
    
    expect(splitter).toBeDefined();
  });
  
  it('应该支持更新配置', () => {
    const splitter = new PathSplitter(10);
    splitter.updateConfig({
      enableSpatialIndex: true,
      enableSmoothing: false
    });
    
    expect(splitter).toBeDefined();
  });
});

describe('PathSplitter 平滑功能', () => {
  it('启用平滑时应该对分割结果进行平滑处理', () => {
    const splitter = new PathSplitter(10, {
      enableSmoothing: true,
      smoothingSamples: 2,
      enableSpatialIndex: false
    });
    
    // 多点画笔线
    const penAction: DrawAction = {
      id: 'pen-1',
      type: 'pen',
      points: [
        { x: 0, y: 50 },
        { x: 25, y: 50 },
        { x: 50, y: 50 },
        { x: 75, y: 50 },
        { x: 100, y: 50 }
      ],
      context: {
        strokeStyle: '#000000',
        lineWidth: 2,
        lineCap: 'round',
        lineJoin: 'round',
        globalCompositeOperation: 'source-over'
      },
      timestamp: Date.now()
    };
    
    const eraserPoints: Point[] = [
      { x: 50, y: 0 },
      { x: 50, y: 100 }
    ];
    
    const result = splitter.splitPenAction(penAction, eraserPoints);
    
    // 结果应该被分割
    expect(result.split).toBe(true);
  });
});

