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
    
    // 设置复杂度评分和缓存支持
    if (!action.complexityScore) {
      action.complexityScore = this.calculateComplexity(action);
    }
    if (action.supportsCaching === undefined) {
      action.supportsCaching = false; // 橡皮擦不需要缓存
    }
    
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
    return 'eraser';
  }

  /**
   * 计算橡皮擦工具的复杂度评分
   */
  private calculateComplexity(action: DrawAction): number {
    // 基于点数和线宽计算复杂度
    const pointsComplexity = Math.min(action.points.length / 10, 5);
    const lineWidthComplexity = action.context.lineWidth * 0.3;
    return Math.round(pointsComplexity + lineWidthComplexity + 2);
  }
} 