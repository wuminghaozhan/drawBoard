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
   * 使用 isVertexList 标记（由 PolygonAnchorHandler 设置）
   * 只有在变换后的多边形才会有 isVertexList = true
   * 
   * 这与 PolygonAnchorHandler.getPolygonVertices() 保持一致
   */
  private isVertexListFormat(action: PolygonAction): boolean {
    // 检查是否有明确的 isVertexList 标记
    const polygonAction = action as PolygonAction & { isVertexList?: boolean };
    
    if (polygonAction.isVertexList === true) {
      return true;
    }
    
    // 默认：认为是中心+半径格式（绘制时的标准格式）
    return false;
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