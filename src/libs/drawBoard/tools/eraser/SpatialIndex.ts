/**
 * 空间索引 - 四叉树实现
 * 
 * 用于加速橡皮擦与画笔路径的相交检测
 * 将 O(n*m) 复杂度降低到 O(n*log(m))
 */

import type { Point } from '../../core/CanvasEngine';

/**
 * 边界框
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 线段数据
 */
export interface SegmentData {
  /** 线段起点 */
  start: Point;
  /** 线段终点 */
  end: Point;
  /** 线段所属的 Action ID */
  actionId: string;
  /** 线段在路径中的索引 */
  segmentIndex: number;
}

/**
 * 四叉树节点
 */
class QuadTreeNode {
  private bounds: BoundingBox;
  private segments: SegmentData[] = [];
  private children: QuadTreeNode[] | null = null;
  private maxSegments: number;
  private maxDepth: number;
  private depth: number;

  constructor(bounds: BoundingBox, maxSegments: number = 10, maxDepth: number = 8, depth: number = 0) {
    this.bounds = bounds;
    this.maxSegments = maxSegments;
    this.maxDepth = maxDepth;
    this.depth = depth;
  }

  /**
   * 插入线段
   */
  insert(segment: SegmentData): boolean {
    // 检查线段是否与当前节点边界相交
    if (!this.segmentIntersectsBounds(segment)) {
      return false;
    }

    // 如果没有子节点且未达到分裂条件
    if (this.children === null) {
      this.segments.push(segment);

      // 检查是否需要分裂
      if (this.segments.length > this.maxSegments && this.depth < this.maxDepth) {
        this.subdivide();
      }
      return true;
    }

    // 如果有子节点，尝试插入到子节点
    for (const child of this.children) {
      child.insert(segment);
    }

    return true;
  }

  /**
   * 查询与指定边界框相交的所有线段
   */
  query(searchBounds: BoundingBox): SegmentData[] {
    const result: SegmentData[] = [];

    // 如果搜索区域与当前节点不相交，返回空
    if (!this.boundsIntersect(this.bounds, searchBounds)) {
      return result;
    }

    // 添加当前节点的线段
    for (const segment of this.segments) {
      if (this.segmentIntersectsBoundingBox(segment, searchBounds)) {
        result.push(segment);
      }
    }

    // 如果有子节点，递归查询
    if (this.children !== null) {
      for (const child of this.children) {
        result.push(...child.query(searchBounds));
      }
    }

    return result;
  }

  /**
   * 查询与指定点在半径范围内的所有线段
   */
  queryRadius(point: Point, radius: number): SegmentData[] {
    const searchBounds: BoundingBox = {
      x: point.x - radius,
      y: point.y - radius,
      width: radius * 2,
      height: radius * 2
    };
    return this.query(searchBounds);
  }

  /**
   * 分裂当前节点为四个子节点
   */
  private subdivide(): void {
    const { x, y, width, height } = this.bounds;
    const halfWidth = width / 2;
    const halfHeight = height / 2;

    this.children = [
      // 左上
      new QuadTreeNode(
        { x, y, width: halfWidth, height: halfHeight },
        this.maxSegments,
        this.maxDepth,
        this.depth + 1
      ),
      // 右上
      new QuadTreeNode(
        { x: x + halfWidth, y, width: halfWidth, height: halfHeight },
        this.maxSegments,
        this.maxDepth,
        this.depth + 1
      ),
      // 左下
      new QuadTreeNode(
        { x, y: y + halfHeight, width: halfWidth, height: halfHeight },
        this.maxSegments,
        this.maxDepth,
        this.depth + 1
      ),
      // 右下
      new QuadTreeNode(
        { x: x + halfWidth, y: y + halfHeight, width: halfWidth, height: halfHeight },
        this.maxSegments,
        this.maxDepth,
        this.depth + 1
      )
    ];

    // 重新分配现有线段到子节点
    for (const segment of this.segments) {
      for (const child of this.children) {
        child.insert(segment);
      }
    }

    // 清空当前节点的线段
    this.segments = [];
  }

  /**
   * 检查线段是否与边界框相交
   */
  private segmentIntersectsBounds(segment: SegmentData): boolean {
    return this.segmentIntersectsBoundingBox(segment, this.bounds);
  }

  /**
   * 检查线段是否与指定边界框相交
   */
  private segmentIntersectsBoundingBox(segment: SegmentData, bounds: BoundingBox): boolean {
    const { start, end } = segment;
    const { x, y, width, height } = bounds;

    // 快速检查：线段的边界框是否与目标边界框相交
    const segMinX = Math.min(start.x, end.x);
    const segMaxX = Math.max(start.x, end.x);
    const segMinY = Math.min(start.y, end.y);
    const segMaxY = Math.max(start.y, end.y);

    return !(segMaxX < x || segMinX > x + width || segMaxY < y || segMinY > y + height);
  }

  /**
   * 检查两个边界框是否相交
   */
  private boundsIntersect(a: BoundingBox, b: BoundingBox): boolean {
    return !(
      a.x + a.width < b.x ||
      b.x + b.width < a.x ||
      a.y + a.height < b.y ||
      b.y + b.height < a.y
    );
  }

  /**
   * 清空节点
   */
  clear(): void {
    this.segments = [];
    this.children = null;
  }

  /**
   * 获取统计信息
   */
  getStats(): { totalSegments: number; nodeCount: number; maxDepthReached: number } {
    let totalSegments = this.segments.length;
    let nodeCount = 1;
    let maxDepthReached = this.depth;

    if (this.children !== null) {
      for (const child of this.children) {
        const childStats = child.getStats();
        totalSegments += childStats.totalSegments;
        nodeCount += childStats.nodeCount;
        maxDepthReached = Math.max(maxDepthReached, childStats.maxDepthReached);
      }
    }

    return { totalSegments, nodeCount, maxDepthReached };
  }
}

/**
 * 橡皮擦空间索引
 * 
 * 使用四叉树加速画笔路径的空间查询
 */
export class EraserSpatialIndex {
  private quadTree: QuadTreeNode | null = null;
  private canvasBounds: BoundingBox;

  constructor(canvasWidth: number, canvasHeight: number) {
    this.canvasBounds = {
      x: 0,
      y: 0,
      width: canvasWidth,
      height: canvasHeight
    };
  }

  /**
   * 构建空间索引
   * 
   * @param actions 需要索引的 Actions 及其点集
   */
  buildIndex(actions: Array<{ id: string; points: Point[] }>): void {
    this.quadTree = new QuadTreeNode(this.canvasBounds);

    for (const action of actions) {
      for (let i = 0; i < action.points.length - 1; i++) {
        const segment: SegmentData = {
          start: action.points[i],
          end: action.points[i + 1],
          actionId: action.id,
          segmentIndex: i
        };
        this.quadTree.insert(segment);
      }
    }
  }

  /**
   * 查询与橡皮擦路径可能相交的线段
   * 
   * @param eraserPoints 橡皮擦路径点
   * @param eraserRadius 橡皮擦半径
   * @returns 可能相交的线段，按 Action ID 分组
   */
  queryCandidates(
    eraserPoints: Point[],
    eraserRadius: number
  ): Map<string, SegmentData[]> {
    if (!this.quadTree) {
      return new Map();
    }

    const candidateMap = new Map<string, SegmentData[]>();
    const seenSegments = new Set<string>();

    // 对橡皮擦路径上的每个点查询附近的线段
    for (const point of eraserPoints) {
      const nearbySegments = this.quadTree.queryRadius(point, eraserRadius * 2);

      for (const segment of nearbySegments) {
        const segmentKey = `${segment.actionId}-${segment.segmentIndex}`;
        if (seenSegments.has(segmentKey)) continue;
        seenSegments.add(segmentKey);

        if (!candidateMap.has(segment.actionId)) {
          candidateMap.set(segment.actionId, []);
        }
        candidateMap.get(segment.actionId)!.push(segment);
      }
    }

    return candidateMap;
  }

  /**
   * 计算橡皮擦路径的边界框
   */
  static calculatePathBounds(points: Point[], padding: number = 0): BoundingBox {
    if (points.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    let minX = points[0].x;
    let maxX = points[0].x;
    let minY = points[0].y;
    let maxY = points[0].y;

    for (const point of points) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }

    return {
      x: minX - padding,
      y: minY - padding,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2
    };
  }

  /**
   * 清空索引
   */
  clear(): void {
    this.quadTree?.clear();
    this.quadTree = null;
  }

  /**
   * 更新画布尺寸
   */
  updateCanvasSize(width: number, height: number): void {
    this.canvasBounds = { x: 0, y: 0, width, height };
    this.clear();
  }

  /**
   * 获取统计信息
   */
  getStats(): { totalSegments: number; nodeCount: number; maxDepthReached: number } | null {
    return this.quadTree?.getStats() ?? null;
  }
}

export default EraserSpatialIndex;

