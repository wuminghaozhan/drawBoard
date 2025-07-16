import { DrawTool } from './DrawTool';
import type { DrawAction } from './DrawTool';
import type { Point } from '../core/CanvasEngine';

export interface LineAction extends DrawAction {
  lineType?: 'line' | 'arrow' | 'dashed';
  arrowStyle?: 'none' | 'start' | 'end' | 'both';
  dashPattern?: number[];
}

/**
 * 直线工具类 - 绘制直线、箭头和虚线
 */
export class LineTool extends DrawTool {
  constructor() {
    super('直线', 'line');
  }

  public draw(ctx: CanvasRenderingContext2D, action: LineAction): void {
    if (action.points.length < 2) return;

    const originalContext = this.saveContext(ctx);
    this.setContext(ctx, action.context);

    // 设置复杂度评分和缓存支持
    if (!action.complexityScore) {
      action.complexityScore = this.calculateComplexity(action);
    }
    if (action.supportsCaching === undefined) {
      action.supportsCaching = false; // 直线绘制简单，不需要缓存
    }

    const start = action.points[0];
    const end = action.points[action.points.length - 1];
    
    // 设置虚线样式
    if (action.lineType === 'dashed' && action.dashPattern) {
      ctx.setLineDash(action.dashPattern);
    } else {
      ctx.setLineDash([]);
    }

    // 绘制主线条
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    // 绘制箭头
    if (action.lineType === 'arrow' || action.arrowStyle) {
      this.drawArrows(ctx, start, end, action.arrowStyle || 'end');
    }

    this.restoreContext(ctx, originalContext);
  }

  /**
   * 绘制箭头
   */
  private drawArrows(ctx: CanvasRenderingContext2D, start: Point, end: Point, arrowStyle: string): void {
    const arrowLength = Math.max(10, ctx.lineWidth * 3);
    const arrowAngle = Math.PI / 6; // 30度

    if (arrowStyle === 'end' || arrowStyle === 'both') {
      this.drawArrowHead(ctx, start, end, arrowLength, arrowAngle);
    }

    if (arrowStyle === 'start' || arrowStyle === 'both') {
      this.drawArrowHead(ctx, end, start, arrowLength, arrowAngle);
    }
  }

  /**
   * 绘制箭头头部
   */
  private drawArrowHead(ctx: CanvasRenderingContext2D, from: Point, to: Point, length: number, angle: number): void {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const lineAngle = Math.atan2(dy, dx);

    // 箭头的两个边
    const x1 = to.x - length * Math.cos(lineAngle - angle);
    const y1 = to.y - length * Math.sin(lineAngle - angle);
    const x2 = to.x - length * Math.cos(lineAngle + angle);
    const y2 = to.y - length * Math.sin(lineAngle + angle);

    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(x1, y1);
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  /**
   * 计算直线工具的复杂度评分
   */
  private calculateComplexity(action: LineAction): number {
    let complexity = Math.round(action.context.lineWidth * 0.3 + 1);
    
    // 箭头增加复杂度
    if (action.lineType === 'arrow' || action.arrowStyle) {
      complexity += 2;
    }
    
    // 虚线增加复杂度
    if (action.lineType === 'dashed') {
      complexity += 1;
    }
    
    return complexity;
  }

  public getActionType(): string {
    return 'line';
  }
} 