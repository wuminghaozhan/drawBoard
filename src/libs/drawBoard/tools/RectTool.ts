import { DrawTool } from './DrawTool';
import type { DrawAction } from './DrawTool';

/**
 * 矩形工具
 * 
 * 数据格式统一为 4 顶点格式：
 * - points[0]: 左上角
 * - points[1]: 右上角
 * - points[2]: 右下角
 * - points[3]: 左下角
 * 
 * 顺时针顺序，支持旋转变换
 */
export class RectTool extends DrawTool {
  constructor() {
    super('矩形', 'rect');
  }

  public draw(ctx: CanvasRenderingContext2D, action: DrawAction): void {
    if (action.points.length < 4) return;

    const originalContext = this.saveContext(ctx);
    this.setContext(ctx, action.context);

    // 设置复杂度评分和缓存支持
    if (!action.complexityScore) {
      action.complexityScore = this.calculateComplexity(action);
    }
    if (action.supportsCaching === undefined) {
      action.supportsCaching = false; // 矩形工具不需要缓存，绘制很简单
    }

    // 统一使用 4 顶点绘制矩形
    this.drawRectFromVertices(ctx, action.points, action.context.fillStyle as string | undefined);

    this.restoreContext(ctx, originalContext);
  }

  /**
   * 绘制矩形（使用 4 个顶点）
   * 顶点顺序：左上、右上、右下、左下（顺时针）
   */
  private drawRectFromVertices(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[], fillStyle?: string): void {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
    ctx.lineTo(points[2].x, points[2].y);
    ctx.lineTo(points[3].x, points[3].y);
    ctx.closePath();
    
    // 先填充（如果有填充色且不是透明）
    if (fillStyle && fillStyle !== 'transparent') {
      ctx.fill();
    }
    // 再描边
    ctx.stroke();
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

  /**
   * 静态工具方法：将 2 点格式转换为 4 顶点格式
   * @param start 起点（通常是左上角）
   * @param end 终点（通常是右下角）
   * @returns 4 个顶点数组：左上、右上、右下、左下
   */
  public static toFourVertices(
    start: { x: number; y: number },
    end: { x: number; y: number }
  ): Array<{ x: number; y: number }> {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);

    return [
      { x: minX, y: minY },  // 左上
      { x: maxX, y: minY },  // 右上
      { x: maxX, y: maxY },  // 右下
      { x: minX, y: maxY }   // 左下
    ];
  }
} 