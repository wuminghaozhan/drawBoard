/**
 * EraserSpatialIndex 单元测试
 */

import { EraserSpatialIndex } from '../../../libs/drawBoard/tools/eraser/SpatialIndex';
import type { Point } from '../../../libs/drawBoard/core/CanvasEngine';

describe('EraserSpatialIndex', () => {
  let spatialIndex: EraserSpatialIndex;
  
  beforeEach(() => {
    spatialIndex = new EraserSpatialIndex(1000, 1000);
  });
  
  afterEach(() => {
    spatialIndex.clear();
  });
  
  describe('构建索引', () => {
    it('应该正确构建空间索引', () => {
      const actions = [
        {
          id: 'action-1',
          points: [
            { x: 0, y: 0 },
            { x: 100, y: 100 }
          ]
        },
        {
          id: 'action-2',
          points: [
            { x: 500, y: 500 },
            { x: 600, y: 600 }
          ]
        }
      ];
      
      spatialIndex.buildIndex(actions);
      
      const stats = spatialIndex.getStats();
      expect(stats).not.toBeNull();
      expect(stats!.totalSegments).toBe(2);
    });
    
    it('应该处理多点路径', () => {
      const actions = [
        {
          id: 'action-1',
          points: [
            { x: 0, y: 0 },
            { x: 50, y: 50 },
            { x: 100, y: 0 },
            { x: 150, y: 50 }
          ]
        }
      ];
      
      spatialIndex.buildIndex(actions);
      
      const stats = spatialIndex.getStats();
      expect(stats!.totalSegments).toBe(3); // 4个点 = 3个线段
    });
  });
  
  describe('查询候选', () => {
    it('应该返回附近的线段', () => {
      const actions = [
        {
          id: 'action-1',
          points: [
            { x: 0, y: 50 },
            { x: 100, y: 50 }
          ]
        },
        {
          id: 'action-2',
          points: [
            { x: 500, y: 500 },
            { x: 600, y: 500 }
          ]
        }
      ];
      
      spatialIndex.buildIndex(actions);
      
      // 橡皮擦路径在 action-1 附近
      const eraserPoints: Point[] = [
        { x: 50, y: 0 },
        { x: 50, y: 100 }
      ];
      
      const candidates = spatialIndex.queryCandidates(eraserPoints, 20);
      
      expect(candidates.has('action-1')).toBe(true);
      expect(candidates.has('action-2')).toBe(false);
    });
    
    it('应该返回多个候选', () => {
      const actions = [
        {
          id: 'action-1',
          points: [
            { x: 0, y: 50 },
            { x: 100, y: 50 }
          ]
        },
        {
          id: 'action-2',
          points: [
            { x: 0, y: 100 },
            { x: 100, y: 100 }
          ]
        }
      ];
      
      spatialIndex.buildIndex(actions);
      
      // 橡皮擦路径穿过两条线
      const eraserPoints: Point[] = [
        { x: 50, y: 0 },
        { x: 50, y: 150 }
      ];
      
      const candidates = spatialIndex.queryCandidates(eraserPoints, 20);
      
      expect(candidates.size).toBe(2);
      expect(candidates.has('action-1')).toBe(true);
      expect(candidates.has('action-2')).toBe(true);
    });
  });
  
  describe('边界框计算', () => {
    it('应该正确计算路径边界框', () => {
      const points: Point[] = [
        { x: 10, y: 20 },
        { x: 50, y: 80 },
        { x: 30, y: 40 }
      ];
      
      const bounds = EraserSpatialIndex.calculatePathBounds(points, 5);
      
      expect(bounds.x).toBe(5);
      expect(bounds.y).toBe(15);
      expect(bounds.width).toBe(50);
      expect(bounds.height).toBe(70);
    });
    
    it('应该处理空路径', () => {
      const bounds = EraserSpatialIndex.calculatePathBounds([]);
      
      expect(bounds.x).toBe(0);
      expect(bounds.y).toBe(0);
      expect(bounds.width).toBe(0);
      expect(bounds.height).toBe(0);
    });
    
    it('应该处理单点路径', () => {
      const bounds = EraserSpatialIndex.calculatePathBounds([{ x: 50, y: 50 }], 10);
      
      expect(bounds.x).toBe(40);
      expect(bounds.y).toBe(40);
      expect(bounds.width).toBe(20);
      expect(bounds.height).toBe(20);
    });
  });
  
  describe('清理和更新', () => {
    it('应该正确清理索引', () => {
      const actions = [
        {
          id: 'action-1',
          points: [{ x: 0, y: 0 }, { x: 100, y: 100 }]
        }
      ];
      
      spatialIndex.buildIndex(actions);
      spatialIndex.clear();
      
      const stats = spatialIndex.getStats();
      expect(stats).toBeNull();
    });
    
    it('应该支持更新画布尺寸', () => {
      spatialIndex.updateCanvasSize(2000, 1500);
      
      // 更新后应该能正常工作
      const actions = [
        {
          id: 'action-1',
          points: [{ x: 1500, y: 1200 }, { x: 1800, y: 1400 }]
        }
      ];
      
      spatialIndex.buildIndex(actions);
      const stats = spatialIndex.getStats();
      expect(stats!.totalSegments).toBe(1);
    });
  });
  
  describe('四叉树性能', () => {
    it('应该能处理大量线段', () => {
      const actions: Array<{ id: string; points: Point[] }> = [];
      
      // 创建 100 个随机动作
      for (let i = 0; i < 100; i++) {
        const startX = Math.random() * 900;
        const startY = Math.random() * 900;
        actions.push({
          id: `action-${i}`,
          points: [
            { x: startX, y: startY },
            { x: startX + 100, y: startY + 100 }
          ]
        });
      }
      
      const startTime = performance.now();
      spatialIndex.buildIndex(actions);
      const buildTime = performance.now() - startTime;
      
      // 构建时间应该合理（< 100ms）
      expect(buildTime).toBeLessThan(100);
      
      // 查询也应该快速
      const queryStartTime = performance.now();
      const eraserPoints: Point[] = [
        { x: 450, y: 0 },
        { x: 450, y: 1000 }
      ];
      spatialIndex.queryCandidates(eraserPoints, 20);
      const queryTime = performance.now() - queryStartTime;
      
      expect(queryTime).toBeLessThan(50);
    });
    
    it('四叉树应该正确细分', () => {
      // 在同一区域创建大量线段，触发四叉树细分
      const actions: Array<{ id: string; points: Point[] }> = [];
      
      for (let i = 0; i < 50; i++) {
        actions.push({
          id: `action-${i}`,
          points: [
            { x: 100 + i * 2, y: 100 },
            { x: 100 + i * 2, y: 200 }
          ]
        });
      }
      
      spatialIndex.buildIndex(actions);
      
      const stats = spatialIndex.getStats();
      expect(stats!.totalSegments).toBe(50);
      // 应该有多个节点（细分后）
      expect(stats!.nodeCount).toBeGreaterThan(1);
    });
  });
});

