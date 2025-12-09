import type { DrawAction } from '../tools/DrawTool';
import type { Point } from '../core/CanvasEngine';

/**
 * 四叉树节点接口
 */
interface QuadNode {
  x: number;
  y: number;
  width: number;
  height: number;
  items: QuadItem[];
  children: QuadNode[] | null;
}

/**
 * 四叉树项接口
 */
interface QuadItem {
  x: number;
  y: number;
  width: number;
  height: number;
  action: DrawAction;
}

/**
 * 四叉树实现
 * 用于空间索引优化，提高点选和框选性能
 */
class Quadtree {
  private root: QuadNode;
  private maxItems: number;
  private maxDepth: number;

  constructor(bounds: { x: number; y: number; width: number; height: number }, maxItems: number = 10, maxDepth: number = 5) {
    this.maxItems = maxItems;
    this.maxDepth = maxDepth;
    this.root = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      items: [],
      children: null
    };
  }

  /**
   * 插入一个项
   */
  insert(item: QuadItem): void {
    this.insertIntoNode(this.root, item, 0);
  }

  /**
   * 递归插入到节点
   */
  private insertIntoNode(node: QuadNode, item: QuadItem, depth: number): void {
    // 如果节点没有子节点
    if (!node.children) {
      // 如果节点未满或达到最大深度，直接添加到当前节点
      if (node.items.length < this.maxItems || depth >= this.maxDepth) {
        node.items.push(item);
        return;
      }

      // 否则，分割节点
      this.splitNode(node);
    }

    // 尝试插入到子节点
    const children = node.children!;
    for (const child of children) {
      if (this.isItemInBounds(item, child)) {
        this.insertIntoNode(child, item, depth + 1);
        return;
      }
    }

    // 如果无法插入到任何子节点，添加到当前节点
    node.items.push(item);
  }

  /**
   * 分割节点为4个子节点
   */
  private splitNode(node: QuadNode): void {
    const halfWidth = node.width / 2;
    const halfHeight = node.height / 2;
    const x = node.x;
    const y = node.y;

    node.children = [
      { x, y, width: halfWidth, height: halfHeight, items: [], children: null }, // 左上
      { x: x + halfWidth, y, width: halfWidth, height: halfHeight, items: [], children: null }, // 右上
      { x, y: y + halfHeight, width: halfWidth, height: halfHeight, items: [], children: null }, // 左下
      { x: x + halfWidth, y: y + halfHeight, width: halfWidth, height: halfHeight, items: [], children: null } // 右下
    ];

    // 将现有项重新分配到子节点
    const items = node.items;
    node.items = [];
    for (const item of items) {
      for (const child of node.children) {
        if (this.isItemInBounds(item, child)) {
          child.items.push(item);
          break;
        }
      }
    }
  }

  /**
   * 检查项是否在边界内
   */
  private isItemInBounds(item: QuadItem, bounds: QuadNode): boolean {
    return item.x < bounds.x + bounds.width &&
           item.x + item.width > bounds.x &&
           item.y < bounds.y + bounds.height &&
           item.y + item.height > bounds.y;
  }

  /**
   * 查询指定区域内的所有项
   */
  retrieve(bounds: { x: number; y: number; width: number; height: number }): QuadItem[] {
    const results: QuadItem[] = [];
    this.retrieveFromNode(this.root, bounds, results);
    return results;
  }

  /**
   * 从节点递归查询
   */
  private retrieveFromNode(node: QuadNode, bounds: { x: number; y: number; width: number; height: number }, results: QuadItem[]): void {
    // 检查节点是否与查询区域相交
    if (!this.isBoundsIntersect(node, bounds)) {
      return;
    }

    // 添加当前节点的项
    for (const item of node.items) {
      if (this.isItemInBounds(item, bounds as QuadNode)) {
        results.push(item);
      }
    }

    // 递归查询子节点
    if (node.children) {
      for (const child of node.children) {
        this.retrieveFromNode(child, bounds, results);
      }
    }
  }

  /**
   * 检查两个边界框是否相交
   */
  private isBoundsIntersect(bounds1: QuadNode, bounds2: { x: number; y: number; width: number; height: number }): boolean {
    return bounds1.x < bounds2.x + bounds2.width &&
           bounds1.x + bounds1.width > bounds2.x &&
           bounds1.y < bounds2.y + bounds2.height &&
           bounds1.y + bounds1.height > bounds2.y;
  }

  /**
   * 清空四叉树
   */
  clear(): void {
    this.root = {
      x: this.root.x,
      y: this.root.y,
      width: this.root.width,
      height: this.root.height,
      items: [],
      children: null
    };
  }
}

/**
 * 空间索引类
 * 用于优化点选和框选性能
 */
export class SpatialIndex {
  private quadtree: Quadtree | null = null;
  private canvasWidth: number = 0;
  private canvasHeight: number = 0;

  constructor(canvasWidth: number, canvasHeight: number) {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
  }

  /**
   * 构建空间索引
   * @param actions 动作列表
   * @param getBounds 获取动作边界框的函数
   */
  buildIndex(actions: DrawAction[], getBounds: (action: DrawAction) => { x: number; y: number; width: number; height: number }): void {
    this.quadtree = new Quadtree({
      x: 0,
      y: 0,
      width: this.canvasWidth,
      height: this.canvasHeight
    });

    // 为每个动作创建边界框并插入四叉树
    for (const action of actions) {
      const bounds = getBounds(action);
      this.quadtree.insert({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        action
      });
    }
  }

  /**
   * 查询点附近的actions
   * @param point 查询点
   * @param tolerance 容差（像素）
   * @returns 候选actions列表
   */
  queryPoint(point: Point, tolerance: number): DrawAction[] {
    if (!this.quadtree) {
      return [];
    }

    const candidates = this.quadtree.retrieve({
      x: point.x - tolerance,
      y: point.y - tolerance,
      width: tolerance * 2,
      height: tolerance * 2
    });

    return candidates.map(item => item.action);
  }

  /**
   * 查询边界框内的actions
   * @param bounds 查询边界框
   * @returns 候选actions列表
   */
  queryBounds(bounds: { x: number; y: number; width: number; height: number }): DrawAction[] {
    if (!this.quadtree) {
      return [];
    }

    const candidates = this.quadtree.retrieve(bounds);
    return candidates.map(item => item.action);
  }

  /**
   * 清空索引
   */
  clear(): void {
    if (this.quadtree) {
      this.quadtree.clear();
    }
  }

  /**
   * 更新画布尺寸
   */
  updateCanvasSize(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;
    this.clear();
  }
}

