import { DrawTool } from './DrawTool';
import type { DrawAction } from './DrawTool';
import type { Point } from '../core/CanvasEngine';

export interface PolygonAction extends DrawAction {
  polygonType?: 'triangle' | 'pentagon' | 'hexagon' | 'star' | 'custom';
  sides?: number;
  filled?: boolean;
  innerRadius?: number; // 用于星形
}

/**
 * 多边形工具类 - 绘制各种多边形
 */
export class PolygonTool extends DrawTool {
  constructor() {
    super('多边形', 'polygon');
  }

  public draw(ctx: CanvasRenderingContext2D, action: PolygonAction): void {
    if (action.points.length < 2) return;

    const originalContext = this.saveContext(ctx);
    this.setContext(ctx, action.context);

    // 设置复杂度评分和缓存支持
    if (!action.complexityScore) {
      action.complexityScore = this.calculateComplexity(action);
    }
    if (action.supportsCaching === undefined) {
      action.supportsCaching = false; // 多边形绘制相对简单
    }

    // 判断是顶点列表格式还是中心+半径格式
    const isVertexList = this.isVertexListFormat(action);
    
    if (isVertexList) {
      // 绘制顶点列表多边形（编辑后的多边形）
      this.drawPolygonFromVertices(ctx, action.points, action.filled);
      this.restoreContext(ctx, originalContext);
      return;
    }

    // 使用中心+半径方式绘制（原始绘制方式）
    // 注意：拖拽绘制时，points 可能包含很多中间点，但中心+半径格式只需要第一个点和最后一个点
    if (action.points.length < 2) {
      this.restoreContext(ctx, originalContext);
      return;
    }

    // 只使用第一个点（中心）和最后一个点（边缘），忽略中间的拖拽点
    const center = action.points[0];
    const edge = action.points[action.points.length - 1];
    const radius = Math.sqrt(Math.pow(edge.x - center.x, 2) + Math.pow(edge.y - center.y, 2));

    // 根据多边形类型绘制
    switch (action.polygonType) {
      case 'triangle':
        this.drawRegularPolygon(ctx, center, radius, 3, action.filled);
        break;
      case 'pentagon':
        this.drawRegularPolygon(ctx, center, radius, 5, action.filled);
        break;
      case 'hexagon':
        this.drawRegularPolygon(ctx, center, radius, 6, action.filled);
        break;
      case 'star':
        this.drawStar(ctx, center, radius, action.innerRadius || radius * 0.5, action.filled);
        break;
      case 'custom':
        this.drawRegularPolygon(ctx, center, radius, action.sides || 6, action.filled);
        break;
      default:
        this.drawRegularPolygon(ctx, center, radius, 6, action.filled);
        break;
    }

    this.restoreContext(ctx, originalContext);
  }

  /**
   * 判断 action.points 是否是顶点列表格式
   * 
   * 判断规则：
   * 1. 如果 points.length === 2，肯定是中心+半径格式
   * 2. 如果 points.length >= 3：
   *    - 检查是否等于多边形的边数（对于正多边形）
   *    - 或者，检查第一个点和最后一个点是否距离较远（未闭合的顶点列表）
   *    - 注意：拖拽绘制时，points 可能包含很多中间点，但这些不是顶点列表
   * 
   * 关键区别：
   * - 中心+半径格式：points[0] 是中心，points[points.length-1] 是边缘点，中间的点是拖拽过程中的中间点
   * - 顶点列表格式：points 中的每个点都是多边形的实际顶点，且 points.length 应该等于或接近预期边数
   */
  private isVertexListFormat(action: PolygonAction): boolean {
    // 如果只有2个点，肯定是中心+半径格式
    if (action.points.length === 2) {
      return false;
    }

    // 如果少于3个点，无法形成多边形
    if (action.points.length < 3) {
      return false;
    }

    // 获取多边形的预期边数
    const expectedSides = this.getExpectedSides(action);

    // 如果 points.length 等于预期边数，很可能是顶点列表
    if (action.points.length === expectedSides) {
      return true;
    }

    // 如果 points.length 在预期边数附近（允许一些容差），可能是顶点列表
    // 容差范围：expectedSides ± 2（允许一些重复点或中间点）
    if (action.points.length >= expectedSides - 2 && action.points.length <= expectedSides + 2) {
      // 进一步检查：如果第一个点和最后一个点距离很近（闭合的顶点列表），很可能是顶点列表
      const first = action.points[0];
      const last = action.points[action.points.length - 1];
      const distance = Math.sqrt(
        Math.pow(last.x - first.x, 2) + Math.pow(last.y - first.y, 2)
      );
      
      // 如果距离很近（<= 10px），可能是闭合的顶点列表
      if (distance <= 10) {
        return true;
      }
      
      // 如果距离较远，但 points.length 正好等于 expectedSides，也可能是未闭合的顶点列表
      if (action.points.length === expectedSides) {
        return true;
      }
    }

    // 如果 points.length 远大于预期边数（比如 > expectedSides * 3），
    // 很可能是拖拽绘制过程中的中间点，不是顶点列表
    if (action.points.length > expectedSides * 3) {
      return false;
    }

    // 其他情况：如果 points.length 在 expectedSides + 2 到 expectedSides * 3 之间
    // 需要进一步判断：检查点的分布是否像顶点列表
    // 简单判断：如果第一个点和最后一个点距离较远（> 10px），且 points.length 不太大，可能是未闭合的顶点列表
    if (action.points.length > expectedSides + 2 && action.points.length <= expectedSides * 2) {
      const first = action.points[0];
      const last = action.points[action.points.length - 1];
      const distance = Math.sqrt(
        Math.pow(last.x - first.x, 2) + Math.pow(last.y - first.y, 2)
      );
      
      // 如果距离较远（> 10px），可能是未闭合的顶点列表
      if (distance > 10) {
        return true;
      }
    }

    // 默认：认为是中心+半径格式（拖拽绘制时的中间点）
    return false;
  }

  /**
   * 获取多边形的预期边数
   */
  private getExpectedSides(action: PolygonAction): number {
    switch (action.polygonType) {
      case 'triangle':
        return 3;
      case 'pentagon':
        return 5;
      case 'hexagon':
        return 6;
      case 'star':
        return 5; // 星形有5个外顶点
      case 'custom':
        return action.sides || 6;
      default:
        return 6; // 默认六边形
    }
  }
  
  /**
   * 从顶点列表绘制多边形
   * 用于绘制编辑后的多边形（顶点已被修改）
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
    
    // 闭合路径
    ctx.closePath();
    
    if (filled) {
      ctx.fill();
    } else {
      ctx.stroke();
    }
  }

  /**
   * 绘制正多边形
   */
  private drawRegularPolygon(ctx: CanvasRenderingContext2D, center: Point, radius: number, sides: number, filled?: boolean): void {
    const angleStep = (2 * Math.PI) / sides;
    
    ctx.beginPath();
    
    for (let i = 0; i <= sides; i++) {
      const angle = i * angleStep - Math.PI / 2; // 从顶部开始
      const x = center.x + radius * Math.cos(angle);
      const y = center.y + radius * Math.sin(angle);
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    
    if (filled) {
      ctx.fill();
    } else {
      ctx.stroke();
    }
  }

  /**
   * 绘制星形
   */
  private drawStar(ctx: CanvasRenderingContext2D, center: Point, outerRadius: number, innerRadius: number, filled?: boolean): void {
    const points = 5;
    const angleStep = Math.PI / points;
    
    ctx.beginPath();
    
    for (let i = 0; i <= points * 2; i++) {
      const angle = i * angleStep - Math.PI / 2;
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const x = center.x + radius * Math.cos(angle);
      const y = center.y + radius * Math.sin(angle);
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    
    if (filled) {
      ctx.fill();
    } else {
      ctx.stroke();
    }
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
    
    // 边数越多越复杂
    const sides = action.sides || 6;
    complexity += Math.floor(sides / 3);
    
    return complexity;
  }

  public getActionType(): string {
    return 'polygon';
  }
} 