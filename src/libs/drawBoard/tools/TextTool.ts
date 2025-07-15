import { DrawTool } from './DrawTool';
import type { DrawAction } from './DrawTool';

export interface TextAction extends DrawAction {
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  textAlign?: CanvasTextAlign;
  textBaseline?: CanvasTextBaseline;
}

export class TextTool extends DrawTool {
  constructor() {
    super('文字', 'text');
  }

  public draw(ctx: CanvasRenderingContext2D, action: TextAction): void {
    if (action.points.length === 0) return;

    const originalContext = this.saveContext(ctx);
    this.setContext(ctx, action.context);

    const point = action.points[0];
    const text = action.text || '文字';
    
    // 字体配置
    const fontSize = action.fontSize || Math.max(action.context.lineWidth * 8, 12);
    const fontFamily = action.fontFamily || 'Arial';
    const textAlign = action.textAlign || 'left';
    const textBaseline = action.textBaseline || 'top';
    
    // 设置字体属性
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.textAlign = textAlign;
    ctx.textBaseline = textBaseline;
    
    // 绘制文字
    ctx.fillText(text, point.x, point.y);

    this.restoreContext(ctx, originalContext);
  }

  public getActionType(): string {
    return 'text';
  }

  // 测量文字尺寸
  public measureText(ctx: CanvasRenderingContext2D, text: string, fontSize: number = 16, fontFamily: string = 'Arial'): TextMetrics {
    const originalFont = ctx.font;
    ctx.font = `${fontSize}px ${fontFamily}`;
    const metrics = ctx.measureText(text);
    ctx.font = originalFont;
    return metrics;
  }

  // 获取文字边界框
  public getTextBounds(ctx: CanvasRenderingContext2D, action: TextAction): { x: number, y: number, width: number, height: number } {
    if (action.points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };

    const point = action.points[0];
    const text = action.text || '文字';
    const fontSize = action.fontSize || Math.max(action.context.lineWidth * 8, 12);
    const fontFamily = action.fontFamily || 'Arial';
    const textAlign = action.textAlign || 'left';
    const textBaseline = action.textBaseline || 'top';

    const metrics = this.measureText(ctx, text, fontSize, fontFamily);
    
    // 根据对齐方式计算实际位置
    let x = point.x;
    if (textAlign === 'center') {
      x = point.x - metrics.width / 2;
    } else if (textAlign === 'right') {
      x = point.x - metrics.width;
    }

    let y = point.y;
    if (textBaseline === 'middle') {
      y = point.y - metrics.actualBoundingBoxAscent / 2;
    } else if (textBaseline === 'bottom') {
      y = point.y - metrics.actualBoundingBoxAscent;
    }

    return {
      x,
      y,
      width: metrics.width,
      height: metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent
    };
  }

  // 移除重复的上下文管理方法，使用基类的方法
  // 注意：TextTool需要特殊处理字体相关属性，所以重写saveContext和restoreContext
  protected saveContext(ctx: CanvasRenderingContext2D) {
    return {
      ...super.saveContext(ctx),
      font: ctx.font,
      textAlign: ctx.textAlign,
      textBaseline: ctx.textBaseline
    };
  }

  protected restoreContext(ctx: CanvasRenderingContext2D, saved: ReturnType<typeof this.saveContext>): void {
    super.restoreContext(ctx, saved);
    ctx.font = saved.font;
    ctx.textAlign = saved.textAlign;
    ctx.textBaseline = saved.textBaseline;
  }
} 