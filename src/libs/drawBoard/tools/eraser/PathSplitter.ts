/**
 * 路径分割器
 * 
 * 负责处理橡皮擦与画笔路径的相交检测和分割
 */

import type { DrawAction } from '../DrawTool';
import type { Point } from '../../core/CanvasEngine';
import { logger } from '../../infrastructure/logging/Logger';
import { EraserSpatialIndex } from './SpatialIndex';
import { GeometryUtils } from '../../utils/GeometryUtils';

/**
 * 分割结果
 */
export interface SplitResult {
  /** 是否发生分割 */
  split: boolean;
  /** 分割后的 Actions（可能为空，表示整条路径被擦除） */
  resultActions: DrawAction[];
  /** 原始 Action ID */
  originalActionId: string;
}

// 注：Segment 接口保留以备将来使用（如精确交点计算）
// interface Segment { start: Point; end: Point; }

/**
 * 路径分割器配置
 */
export interface PathSplitterConfig {
  /** 是否启用空间索引加速 */
  enableSpatialIndex: boolean;
  /** 是否启用分割端点平滑 */
  enableSmoothing: boolean;
  /** 平滑采样点数 */
  smoothingSamples: number;
  /** 画布宽度（用于空间索引） */
  canvasWidth: number;
  /** 画布高度 */
  canvasHeight: number;
}

const DEFAULT_CONFIG: PathSplitterConfig = {
  enableSpatialIndex: true,
  enableSmoothing: true,
  smoothingSamples: 3,
  canvasWidth: 1920,
  canvasHeight: 1080
};

/**
 * 路径分割器
 */
export class PathSplitter {
  private eraserRadius: number;
  private config: PathSplitterConfig;
  private spatialIndex: EraserSpatialIndex | null = null;
  
  constructor(eraserRadius: number = 10, config: Partial<PathSplitterConfig> = {}) {
    this.eraserRadius = eraserRadius;
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    if (this.config.enableSpatialIndex) {
      this.spatialIndex = new EraserSpatialIndex(
        this.config.canvasWidth,
        this.config.canvasHeight
      );
    }
  }
  
  /**
   * 设置橡皮擦半径
   */
  setEraserRadius(radius: number): void {
    this.eraserRadius = radius;
  }
  
  /**
   * 更新配置
   */
  updateConfig(config: Partial<PathSplitterConfig>): void {
    this.config = { ...this.config, ...config };
    
    if (this.config.enableSpatialIndex && !this.spatialIndex) {
      this.spatialIndex = new EraserSpatialIndex(
        this.config.canvasWidth,
        this.config.canvasHeight
      );
    }
  }
  
  /**
   * 检查并分割被橡皮擦影响的画笔路径
   * 
   * @param penAction 画笔 Action
   * @param eraserPoints 橡皮擦路径点
   * @returns 分割结果
   */
  splitPenAction(penAction: DrawAction, eraserPoints: Point[]): SplitResult {
    if (penAction.type !== 'pen' || penAction.points.length < 2) {
      logger.debug('splitPenAction: 跳过非画笔或点数不足', {
        actionType: penAction.type,
        pointsCount: penAction.points.length
      });
      return {
        split: false,
        resultActions: [penAction],
        originalActionId: penAction.id
      };
    }
    
    logger.debug('splitPenAction: 开始处理', {
      actionId: penAction.id,
      penPointsCount: penAction.points.length,
      eraserPointsCount: eraserPoints.length,
      eraserRadius: this.eraserRadius
    });
    
    // 🔥 改进：先对长线段进行细分，插入更多的点以提高精度
    const refinedPoints = this.refinePathForEraser(penAction.points, eraserPoints);
    
    // 找出被橡皮擦覆盖的点的索引
    const erasedIndices = this.findErasedPointIndices(refinedPoints, eraserPoints);
    
    logger.debug('splitPenAction: 找到被擦除的点', {
      originalPointsCount: penAction.points.length,
      refinedPointsCount: refinedPoints.length,
      erasedIndicesCount: erasedIndices.size
    });
    
    if (erasedIndices.size === 0) {
      // 没有被擦除的点
      const minDistance = this.findMinDistance(penAction.points, eraserPoints);
      logger.debug('splitPenAction: 没有交叉点', {
        minDistance,
        eraserRadius: this.eraserRadius
      });
      return {
        split: false,
        resultActions: [penAction],
        originalActionId: penAction.id
      };
    }
    
    // 根据被擦除的点分割路径（使用细化后的点）
    const segments = this.splitPathByErasedPoints(refinedPoints, erasedIndices);
    
    if (segments.length === 0) {
      // 整条路径都被擦除
      logger.debug('路径完全被擦除', { actionId: penAction.id });
      return {
        split: true,
        resultActions: [],
        originalActionId: penAction.id
      };
    }
    
    if (segments.length === 1 && segments[0].length === refinedPoints.length) {
      // 没有实际分割
      return {
        split: false,
        resultActions: [penAction],
        originalActionId: penAction.id
      };
    }
    
    // 创建分割后的 Actions
    const resultActions = this.createSplitActions(penAction, segments);
    
    logger.debug('路径分割完成', {
      originalActionId: penAction.id,
      originalPointsCount: penAction.points.length,
      erasedPointsCount: erasedIndices.size,
      resultActionsCount: resultActions.length
    });
    
    return {
      split: true,
      resultActions,
      originalActionId: penAction.id
    };
  }
  
  /**
   * 找出被橡皮擦覆盖的点的索引
   * 
   * 改进算法（v3）：
   * 1. 找到橡皮擦与画笔线段的交点
   * 2. 在交点附近插入虚拟分割点
   * 3. 只标记交点附近的点为"被擦除"
   * 
   * 这样可以精确控制擦除范围，不会因为 A-B 距离大而擦除整段
   */
  private findErasedPointIndices(penPoints: Point[], eraserPoints: Point[]): Set<number> {
    const erasedIndices = new Set<number>();
    
    // 1. 检查画笔的每个线段是否与橡皮擦路径相交
    for (let i = 0; i < penPoints.length - 1; i++) {
      const penSegStart = penPoints[i];
      const penSegEnd = penPoints[i + 1];
      const segmentLength = this.getDistance(penSegStart, penSegEnd);
      
      // 检查该画笔线段是否与橡皮擦的任何线段相交
      for (let j = 0; j < eraserPoints.length - 1; j++) {
        const eraserSegStart = eraserPoints[j];
        const eraserSegEnd = eraserPoints[j + 1];
        
        // 检测线段相交（考虑橡皮擦半径）
        if (this.segmentsIntersectWithRadius(
          penSegStart, penSegEnd,
          eraserSegStart, eraserSegEnd,
          this.eraserRadius
        )) {
          // 如果线段很短（<= 2 * eraserRadius），直接标记两个端点
          if (segmentLength <= this.eraserRadius * 2) {
            erasedIndices.add(i);
            erasedIndices.add(i + 1);
          } else {
            // 线段较长，需要找到交点位置，只标记交点附近的部分
            // 通过检查端点到橡皮擦路径的距离来决定
            const startDist = this.minDistanceToPath(penSegStart, eraserPoints);
            const endDist = this.minDistanceToPath(penSegEnd, eraserPoints);
            
            if (startDist <= this.eraserRadius) {
              erasedIndices.add(i);
            }
            if (endDist <= this.eraserRadius) {
              erasedIndices.add(i + 1);
            }
            
            // 如果两个端点都不在半径内，说明交点在中间
            // 需要标记这个线段，让后续处理时进行细分
            if (startDist > this.eraserRadius && endDist > this.eraserRadius) {
              // 标记为需要细分的线段
              this.markSegmentForSubdivision(i, penPoints, eraserPoints, erasedIndices);
            }
          }
          break;
        }
      }
    }
    
    // 2. 额外检查：画笔的点是否在橡皮擦路径附近
    for (let i = 0; i < penPoints.length; i++) {
      if (erasedIndices.has(i)) continue;
      
      const penPoint = penPoints[i];
      const distToPath = this.minDistanceToPath(penPoint, eraserPoints);
      
      if (distToPath <= this.eraserRadius) {
        erasedIndices.add(i);
      }
    }
    
    return erasedIndices;
  }
  
  /**
   * 细化路径：对长线段进行细分，以便更精确地检测橡皮擦交叉
   * 
   * 当 A-B 线段很长时，在交叉点附近插入额外的点
   * 这样可以实现更精确的擦除范围控制
   */
  private refinePathForEraser(penPoints: Point[], eraserPoints: Point[]): Point[] {
    const refinedPoints: Point[] = [];
    const maxSegmentLength = this.eraserRadius * 2; // 最大线段长度 = 2倍橡皮擦半径
    
    for (let i = 0; i < penPoints.length; i++) {
      const currentPoint = penPoints[i];
      refinedPoints.push(currentPoint);
      
      if (i < penPoints.length - 1) {
        const nextPoint = penPoints[i + 1];
        const segmentLength = this.getDistance(currentPoint, nextPoint);
        
        // 如果线段很长，检查是否与橡皮擦路径有交叉
        if (segmentLength > maxSegmentLength) {
          // 检查该线段是否与橡皮擦相交
          let intersects = false;
          for (let j = 0; j < eraserPoints.length - 1; j++) {
            if (this.segmentsIntersectWithRadius(
              currentPoint, nextPoint,
              eraserPoints[j], eraserPoints[j + 1],
              this.eraserRadius
            )) {
              intersects = true;
              break;
            }
          }
          
          if (intersects) {
            // 对这个长线段进行细分
            const numSubdivisions = Math.ceil(segmentLength / maxSegmentLength);
            for (let k = 1; k < numSubdivisions; k++) {
              const t = k / numSubdivisions;
              refinedPoints.push({
                x: currentPoint.x + (nextPoint.x - currentPoint.x) * t,
                y: currentPoint.y + (nextPoint.y - currentPoint.y) * t
              });
            }
          }
        }
      }
    }
    
    return refinedPoints;
  }
  
  /**
   * 计算点到路径的最小距离 - 委托给 GeometryUtils
   */
  private minDistanceToPath(point: Point, pathPoints: Point[]): number {
    return GeometryUtils.pointToPathDistance(point, pathPoints);
  }
  
  /**
   * 标记需要细分的线段
   * 当交点在线段中间时，需要找到交点附近的点
   */
  private markSegmentForSubdivision(
    segmentIndex: number,
    penPoints: Point[],
    eraserPoints: Point[],
    erasedIndices: Set<number>
  ): void {
    const start = penPoints[segmentIndex];
    const end = penPoints[segmentIndex + 1];
    
    // 在线段上采样，找到与橡皮擦路径最近的点
    const samples = 10;
    for (let t = 0; t <= samples; t++) {
      const ratio = t / samples;
      const samplePoint: Point = {
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio
      };
      
      const dist = this.minDistanceToPath(samplePoint, eraserPoints);
      if (dist <= this.eraserRadius) {
        // 找到了交点附近的位置
        // 标记相邻的原始点
        if (ratio < 0.5) {
          erasedIndices.add(segmentIndex);
        } else {
          erasedIndices.add(segmentIndex + 1);
        }
        
        // 只需要标记一个端点，因为我们会在分割时创建新的边界点
        break;
      }
    }
  }
  
  /**
   * 检测两条线段是否相交（考虑半径/粗细）
   * 委托给 GeometryUtils
   */
  private segmentsIntersectWithRadius(
    a1: Point, a2: Point,
    b1: Point, b2: Point,
    radius: number
  ): boolean {
    return GeometryUtils.segmentsIntersectWithRadius(a1, a2, b1, b2, radius);
  }
  
  /**
   * 根据被擦除的点分割路径
   */
  private splitPathByErasedPoints(points: Point[], erasedIndices: Set<number>): Point[][] {
    const segments: Point[][] = [];
    let currentSegment: Point[] = [];
    
    for (let i = 0; i < points.length; i++) {
      if (erasedIndices.has(i)) {
        // 当前点被擦除
        if (currentSegment.length >= 2) {
          segments.push([...currentSegment]);
        }
        currentSegment = [];
      } else {
        // 当前点保留
        currentSegment.push(points[i]);
      }
    }
    
    // 处理最后一个分段
    if (currentSegment.length >= 2) {
      segments.push(currentSegment);
    }
    
    return segments;
  }
  
  /**
   * 创建分割后的 Actions
   */
  private createSplitActions(originalAction: DrawAction, segments: Point[][]): DrawAction[] {
    const timestamp = Date.now();
    
    return segments.map((segment, index) => {
      const newId = `${originalAction.id}-split-${index}-${timestamp}`;
      
      // 如果启用平滑，对分割端点进行平滑处理
      const smoothedSegment = this.config.enableSmoothing
        ? this.smoothSegmentEndpoints(segment)
        : segment;
      
      return {
        ...originalAction,
        id: newId,
        points: smoothedSegment,
        // 保留原始的虚拟图层信息
        virtualLayerId: originalAction.virtualLayerId,
        // 标记为从原始 action 分割而来
        splitFrom: originalAction.id
      } as DrawAction & { splitFrom?: string };
    });
  }
  
  /**
   * 平滑分割端点（使用 Bezier 曲线）
   * 
   * 在分割边界处使用 Bezier 曲线平滑过渡，使线条看起来更自然
   */
  private smoothSegmentEndpoints(segment: Point[]): Point[] {
    if (segment.length < 4) {
      return segment;
    }
    
    const result: Point[] = [];
    const samples = this.config.smoothingSamples;
    
    // 平滑起点区域（使用 Bezier 曲线）
    const startSmoothed = this.bezierSmoothStart(segment, samples);
    result.push(...startSmoothed);
    
    // 添加中间点（跳过已处理的端点区域）
    const skipStart = Math.min(3, segment.length - 1);
    const skipEnd = Math.max(skipStart, segment.length - 3);
    for (let i = skipStart; i < skipEnd; i++) {
      result.push(segment[i]);
    }
    
    // 平滑终点区域（使用 Bezier 曲线）
    const endSmoothed = this.bezierSmoothEnd(segment, samples);
    result.push(...endSmoothed);
    
    return result.length >= 2 ? result : segment;
  }
  
  /**
   * 使用 Bezier 曲线平滑起点
   */
  private bezierSmoothStart(segment: Point[], samples: number): Point[] {
    if (segment.length < 3) {
      return [segment[0]];
    }
    
    // 获取起点附近的点
    const p0 = segment[0];
    const p1 = segment[1];
    const p2 = segment[2];
    const p3 = segment.length > 3 ? segment[3] : p2;
    
    // 计算 Bezier 控制点
    const controlPoints = GeometryUtils.calculateBezierControlPoints(
      null,  // 没有前一个点
      p0,
      p1,
      p2,
      0.4    // 张力参数
    );
    
    // 对起点进行内收处理
    const pullFactor = 0.25;
    const adjustedP0: Point = {
      x: p0.x + (p1.x - p0.x) * pullFactor,
      y: p0.y + (p1.y - p0.y) * pullFactor
    };
    
    // 生成平滑点
    const result: Point[] = [adjustedP0];
    for (let i = 1; i <= samples; i++) {
      const t = i / (samples + 1);
      const smoothedPoint = GeometryUtils.cubicBezierPoint(
        t,
        adjustedP0,
        controlPoints.p1,
        controlPoints.p2,
        p1
      );
      result.push(smoothedPoint);
    }
    result.push(p1);
    
    return result;
  }
  
  /**
   * 使用 Bezier 曲线平滑终点
   */
  private bezierSmoothEnd(segment: Point[], samples: number): Point[] {
    const len = segment.length;
    if (len < 3) {
      return [segment[len - 1]];
    }
    
    // 获取终点附近的点
    const pN = segment[len - 1];
    const pN1 = segment[len - 2];
    const pN2 = segment[len - 3];
    const pN3 = len > 3 ? segment[len - 4] : pN2;
    
    // 计算 Bezier 控制点
    const controlPoints = GeometryUtils.calculateBezierControlPoints(
      pN2,
      pN1,
      pN,
      null,  // 没有后一个点
      0.4    // 张力参数
    );
    
    // 对终点进行内收处理
    const pullFactor = 0.25;
    const adjustedPN: Point = {
      x: pN.x + (pN1.x - pN.x) * pullFactor,
      y: pN.y + (pN1.y - pN.y) * pullFactor
    };
    
    // 生成平滑点
    const result: Point[] = [pN1];
    for (let i = 1; i <= samples; i++) {
      const t = i / (samples + 1);
      const smoothedPoint = GeometryUtils.cubicBezierPoint(
        t,
        pN1,
        controlPoints.p1,
        controlPoints.p2,
        adjustedPN
      );
      result.push(smoothedPoint);
    }
    result.push(adjustedPN);
    
    return result;
  }
  
  /**
   * 计算两点间距离 - 委托给 GeometryUtils
   */
  private getDistance(p1: Point, p2: Point): number {
    return GeometryUtils.distance(p1, p2);
  }
  
  /**
   * 找出画笔路径和橡皮擦路径之间的最小距离
   */
  private findMinDistance(penPoints: Point[], eraserPoints: Point[]): number {
    let minDist = Infinity;
    for (const penPoint of penPoints) {
      const dist = GeometryUtils.pointToPathDistance(penPoint, eraserPoints);
      if (dist < minDist) {
        minDist = dist;
      }
    }
    return minDist;
  }
  
  /**
   * 批量处理多个画笔 Actions
   */
  splitMultiplePenActions(
    penActions: DrawAction[],
    eraserPoints: Point[]
  ): {
    unchanged: DrawAction[];
    removed: string[];
    splitResults: Map<string, DrawAction[]>;
  } {
    const unchanged: DrawAction[] = [];
    const removed: string[] = [];
    const splitResults = new Map<string, DrawAction[]>();
    
    logger.debug('批量处理画笔分割', {
      penActionsCount: penActions.length,
      eraserPointsCount: eraserPoints.length,
      eraserRadius: this.eraserRadius,
      useSpatialIndex: this.config.enableSpatialIndex && !!this.spatialIndex
    });
    
    // 如果启用空间索引，先筛选候选 Actions
    let candidateActions = penActions;
    if (this.config.enableSpatialIndex && this.spatialIndex && penActions.length > 10) {
      candidateActions = this.filterCandidatesWithSpatialIndex(penActions, eraserPoints);
      
      // 将非候选的 Actions 直接标记为未变化
      const candidateIds = new Set(candidateActions.map(a => a.id));
      for (const action of penActions) {
        if (!candidateIds.has(action.id)) {
          unchanged.push(action);
        }
      }
      
      logger.debug('空间索引筛选', {
        originalCount: penActions.length,
        candidateCount: candidateActions.length,
        filtered: penActions.length - candidateActions.length
      });
    }
    
    for (const action of candidateActions) {
      if (action.type !== 'pen') {
        unchanged.push(action);
        continue;
      }
      
      const result = this.splitPenAction(action, eraserPoints);
      
      logger.debug('单个画笔处理结果', {
        actionId: action.id,
        split: result.split,
        resultActionsCount: result.resultActions.length
      });
      
      if (!result.split) {
        unchanged.push(action);
      } else if (result.resultActions.length === 0) {
        removed.push(action.id);
      } else {
        splitResults.set(action.id, result.resultActions);
      }
    }
    
    logger.info('批量处理完成', {
      unchangedCount: unchanged.length,
      removedCount: removed.length,
      splitCount: splitResults.size,
      totalNewActions: Array.from(splitResults.values()).reduce((sum, arr) => sum + arr.length, 0)
    });
    
    return { unchanged, removed, splitResults };
  }
  
  /**
   * 使用空间索引筛选候选 Actions
   */
  private filterCandidatesWithSpatialIndex(
    penActions: DrawAction[],
    eraserPoints: Point[]
  ): DrawAction[] {
    if (!this.spatialIndex) {
      return penActions;
    }
    
    // 构建空间索引
    this.spatialIndex.buildIndex(
      penActions.map(a => ({ id: a.id, points: a.points }))
    );
    
    // 查询候选
    const candidateMap = this.spatialIndex.queryCandidates(eraserPoints, this.eraserRadius);
    
    // 返回候选 Actions
    const candidateIds = new Set(candidateMap.keys());
    return penActions.filter(a => candidateIds.has(a.id));
  }
  
  /**
   * 清理资源
   */
  destroy(): void {
    this.spatialIndex?.clear();
    this.spatialIndex = null;
  }
}

export default PathSplitter;

