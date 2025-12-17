import { DrawTool } from './DrawTool';
import type { DrawAction } from './DrawTool';
import type { Point } from '../core/CanvasEngine';

export type PolygonType = 'triangle' | 'pentagon' | 'hexagon' | 'star' | 'custom';

export interface PolygonAction extends DrawAction {
  polygonType?: PolygonType;
  sides?: number;
  filled?: boolean;
  innerRadius?: number; // 用于星形（内半径与外半径的比例）
}

/**
 * 多边形工具类 - 绘制各种多边形
 * 
 * 数据格式统一为顶点列表格式：
 * - points: 所有顶点坐标数组
 * - 支持旋转、缩放等变换
 * 
 * 顶点顺序：从顶部开始，顺时针排列
 */
export class PolygonTool extends DrawTool {
  constructor() {
    super('多边形', 'polygon');
  }

  public draw(ctx: CanvasRenderingContext2D, action: PolygonAction): void {
    // 统一使用顶点列表格式，至少需要3个顶点
    if (action.points.length < 3) return;

    const originalContext = this.saveContext(ctx);
    this.setContext(ctx, action.context);

    // 设置复杂度评分和缓存支持
    if (!action.complexityScore) {
      action.complexityScore = this.calculateComplexity(action);
    }
    if (action.supportsCaching === undefined) {
      action.supportsCaching = false;
    }

    // 统一使用顶点列表绘制
    // 使用 fillStyle 判断是否填充（优先于 filled 属性）
    const shouldFill = action.context.fillStyle && action.context.fillStyle !== 'transparent';
    this.drawPolygonFromVertices(ctx, action.points, shouldFill || action.filled);

    this.restoreContext(ctx, originalContext);
  }

  /**
   * 从顶点列表绘制多边形
   */
  private drawPolygonFromVertices(
    ctx: CanvasRenderingContext2D,
    vertices: Point[],
    filled?: boolean
  ): void {
    if (vertices.length < 3) return;
    
    ctx.beginPath();
    ctx.moveTo(vertices[0].x, vertices[0].y);
    
    for (let i = 1; i < vertices.length; i++) {
      ctx.lineTo(vertices[i].x, vertices[i].y);
    }
    
    ctx.closePath();
    
    // 先填充（如果有填充色）
    if (filled) {
      ctx.fill();
    }
    // 再描边（始终描边，确保边框可见）
    ctx.stroke();
  }

  /**
   * 计算多边形复杂度
   */
  private calculateComplexity(action: PolygonAction): number {
    let complexity = Math.round(action.context.lineWidth * 0.4 + 2);
    
    // 星形更复杂
    if (action.polygonType === 'star') {
      complexity += 2;
    }
    
    // 填充增加复杂度
    if (action.filled) {
      complexity += 1;
    }
    
    // 顶点数越多越复杂
    complexity += Math.floor(action.points.length / 3);
    
    return complexity;
  }

  public getActionType(): string {
    return 'polygon';
  }

  // ============================================
  // 静态工具方法：生成顶点
  // ============================================

  /**
   * 根据中心点和边缘点生成多边形顶点
   * @param center 中心点
   * @param edge 边缘点（用于计算半径）
   * @param polygonType 多边形类型
   * @param sides 自定义边数（仅 custom 类型使用）
   * @param innerRadiusRatio 内半径比例（仅 star 类型使用，默认 0.5）
   * @returns 顶点数组
   */
  public static generateVertices(
    center: Point,
    edge: Point,
    polygonType: PolygonType = 'hexagon',
    sides?: number,
    innerRadiusRatio: number = 0.5
  ): Point[] {
    const radius = Math.sqrt(
      Math.pow(edge.x - center.x, 2) + Math.pow(edge.y - center.y, 2)
    );

    if (radius <= 0) {
      return [];
    }

    switch (polygonType) {
      case 'triangle':
        return this.generateRegularPolygonVertices(center, radius, 3);
      case 'pentagon':
        return this.generateRegularPolygonVertices(center, radius, 5);
      case 'hexagon':
        return this.generateRegularPolygonVertices(center, radius, 6);
      case 'star':
        return this.generateStarVertices(center, radius, innerRadiusRatio);
      case 'custom':
        return this.generateRegularPolygonVertices(center, radius, sides || 6);
      default:
        return this.generateRegularPolygonVertices(center, radius, 6);
    }
  }

  /**
   * 生成正多边形顶点
   * @param center 中心点
   * @param radius 外接圆半径
   * @param sides 边数
   * @returns 顶点数组（从顶部开始，顺时针）
   */
  public static generateRegularPolygonVertices(
    center: Point,
    radius: number,
    sides: number
  ): Point[] {
    const vertices: Point[] = [];
    const angleStep = (2 * Math.PI) / sides;

    for (let i = 0; i < sides; i++) {
      const angle = i * angleStep - Math.PI / 2; // 从顶部开始
      vertices.push({
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle)
      });
    }

    return vertices;
  }

  /**
   * 生成星形顶点
   * @param center 中心点
   * @param outerRadius 外半径
   * @param innerRadiusRatio 内半径比例（相对于外半径）
   * @returns 顶点数组（外顶点和内顶点交替）
   */
  public static generateStarVertices(
    center: Point,
    outerRadius: number,
    innerRadiusRatio: number = 0.5
  ): Point[] {
    const vertices: Point[] = [];
    const points = 5; // 5角星
    const innerRadius = outerRadius * innerRadiusRatio;
    const angleStep = Math.PI / points;

    for (let i = 0; i < points * 2; i++) {
      const angle = i * angleStep - Math.PI / 2; // 从顶部开始
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      vertices.push({
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle)
      });
    }

    return vertices;
  }

  /**
   * 根据多边形类型获取默认边数
   */
  public static getDefaultSides(polygonType: PolygonType): number {
    switch (polygonType) {
      case 'triangle': return 3;
      case 'pentagon': return 5;
      case 'hexagon': return 6;
      case 'star': return 10; // 星形有10个顶点（5外+5内）
      case 'custom': return 6;
      default: return 6;
    }
  }
} 