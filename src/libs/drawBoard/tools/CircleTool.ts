import { DrawTool } from './DrawTool';
import type { DrawAction } from './DrawTool';
import { GeometryUtils } from '../utils/GeometryUtils';

export class CircleTool extends DrawTool {
  constructor() {
    super('圆形', 'circle');
  }

  public draw(ctx: CanvasRenderingContext2D, action: DrawAction): void {
    if (action.points.length < 2) return;

    const originalContext = this.saveContext(ctx);
    this.setContext(ctx, action.context);

    // 设置复杂度评分和缓存支持
    if (!action.complexityScore) {
      action.complexityScore = this.calculateComplexity(action);
    }
    if (action.supportsCaching === undefined) {
      action.supportsCaching = false; // 圆形绘制简单，不需要缓存
    }

    const start = action.points[0];
    const end = action.points[action.points.length - 1];
    const radius = GeometryUtils.distance(start, end);

    ctx.beginPath();
    ctx.arc(start.x, start.y, radius, 0, 2 * Math.PI);
    
    // 先填充（如果有填充色且不是透明）
    if (action.context.fillStyle && action.context.fillStyle !== 'transparent') {
      ctx.fill();
    }
    // 再描边
    ctx.stroke();

    this.restoreContext(ctx, originalContext);
  }

  /**
   * 计算圆形工具的复杂度评分
   */
  private calculateComplexity(action: DrawAction): number {
    // 圆形复杂度很低，只考虑线宽
    return Math.round(action.context.lineWidth * 0.4 + 2);
  }

  public getActionType(): string {
    return 'circle'; // 修复：返回工具类型
  }

  // 移除重复的上下文管理方法，使用基类的方法
} 