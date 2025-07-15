import { DrawTool } from './DrawTool';
import type { DrawAction } from './DrawTool';

export class RectTool extends DrawTool {
  constructor() {
    super('矩形', 'rect');
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
      action.supportsCaching = false; // 矩形工具不需要缓存，绘制很简单
    }

    const start = action.points[0];
    const end = action.points[action.points.length - 1];
    const width = end.x - start.x;
    const height = end.y - start.y;

    ctx.beginPath();
    ctx.rect(start.x, start.y, width, height);
    ctx.stroke();

    this.restoreContext(ctx, originalContext);
  }

  public getActionType(): string {
    return 'rect';
  }

  /**
   * 计算矩形工具的复杂度评分
   * 矩形工具复杂度很低，因为绘制算法简单
   */
  private calculateComplexity(action: DrawAction): number {
    // 矩形工具复杂度很低，只考虑线宽
    return Math.round(action.context.lineWidth * 0.5 + 2);
  }
} 