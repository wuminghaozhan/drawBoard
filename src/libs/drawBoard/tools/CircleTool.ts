import { DrawTool } from './DrawTool';
import type { DrawAction } from './DrawTool';

export class CircleTool extends DrawTool {
  constructor() {
    super('圆形', 'circle');
  }

  public draw(ctx: CanvasRenderingContext2D, action: DrawAction): void {
    if (action.points.length < 2) return;

    const originalContext = this.saveContext(ctx);
    this.setContext(ctx, action.context);

    const start = action.points[0];
    const end = action.points[action.points.length - 1];
    const radius = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));

    ctx.beginPath();
    ctx.arc(start.x, start.y, radius, 0, 2 * Math.PI);
    ctx.stroke();

    this.restoreContext(ctx, originalContext);
  }

  public getActionType(): string {
    return 'circle'; // 修复：返回工具类型
  }

  // 移除重复的上下文管理方法，使用基类的方法
} 