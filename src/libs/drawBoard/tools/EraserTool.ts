import { DrawTool } from './DrawTool';
import type { DrawAction } from './DrawTool';
import type { Point } from '../core/CanvasEngine';

export class EraserTool extends DrawTool {
  constructor() {
    super('橡皮擦', 'eraser');
  }

  public draw(ctx: CanvasRenderingContext2D, action: DrawAction): void {
    if (action.points.length < 2) return;

    const originalContext = this.saveContext(ctx);
    
    // 设置橡皮擦模式
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.lineWidth = action.context.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 绘制橡皮擦路径
    this.drawPath(ctx, action.points);

    this.restoreContext(ctx, originalContext);
  }

  private drawPath(ctx: CanvasRenderingContext2D, points: Point[]): void {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }

    ctx.stroke();
  }

  public getActionType(): string {
    return 'eraser'; // 修复：返回工具类型
  }
} 