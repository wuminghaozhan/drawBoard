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