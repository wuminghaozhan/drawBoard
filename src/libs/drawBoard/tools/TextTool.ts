import { DrawTool } from './DrawTool';
import type { DrawAction } from './DrawTool';
import { logger } from '../infrastructure/logging/Logger';

export interface TextAction extends DrawAction {
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  textAlign?: CanvasTextAlign;
  textBaseline?: CanvasTextBaseline;
}

export class TextTool extends DrawTool {
  // 默认配置
  private static readonly DEFAULT_CONFIG = {
    fontSize: 16,
    fontFamily: 'Arial',
    textAlign: 'left' as CanvasTextAlign,
    textBaseline: 'top' as CanvasTextBaseline,
    minFontSize: 8,
    maxFontSize: 72
  };

  constructor() {
    super('文字', 'text');
  }

  /**
   * 获取文字配置
   */
  private getTextConfig(action: TextAction) {
    const fontSize = this.calculateFontSize(action);
    const fontFamily = action.fontFamily || TextTool.DEFAULT_CONFIG.fontFamily;
    const textAlign = action.textAlign || TextTool.DEFAULT_CONFIG.textAlign;
    const textBaseline = action.textBaseline || TextTool.DEFAULT_CONFIG.textBaseline;

    return { fontSize, fontFamily, textAlign, textBaseline };
  }

  /**
   * 计算字体大小
   */
  private calculateFontSize(action: TextAction): number {
    if (action.fontSize) {
      return Math.max(
        TextTool.DEFAULT_CONFIG.minFontSize,
        Math.min(action.fontSize, TextTool.DEFAULT_CONFIG.maxFontSize)
      );
    }
    
    // 基于线宽计算字体大小
    const baseSize = action.context?.lineWidth ? action.context.lineWidth * 8 : TextTool.DEFAULT_CONFIG.fontSize;
    return Math.max(TextTool.DEFAULT_CONFIG.minFontSize, Math.min(baseSize, TextTool.DEFAULT_CONFIG.maxFontSize));
  }

  /**
   * 验证文字内容
   */
  private validateText(text?: string): string {
    if (!text || text.trim().length === 0) {
      return '文字';
    }
    return text.trim();
  }

  public draw(ctx: CanvasRenderingContext2D, action: TextAction): void {
    try {
      if (action.points.length === 0) {
        return;
      }

      const originalContext = this.saveContext(ctx);
      this.setContext(ctx, action.context);

      const point = action.points[0];
      const text = this.validateText(action.text);
      
      const { fontSize, fontFamily, textAlign, textBaseline } = this.getTextConfig(action);
      
      // 设置字体属性
      ctx.font = `${fontSize}px ${fontFamily}`;
      ctx.textAlign = textAlign;
      ctx.textBaseline = textBaseline;
      
      // 绘制文字
      ctx.fillText(text, point.x, point.y);

      this.restoreContext(ctx, originalContext);
    } catch (error) {
      logger.error('TextTool绘制失败:', error);
      // 尝试恢复上下文状态，使用默认值
      this.restoreContext(ctx, {
        font: TextTool.DEFAULT_CONFIG.fontFamily,
        textAlign: TextTool.DEFAULT_CONFIG.textAlign,
        textBaseline: TextTool.DEFAULT_CONFIG.textBaseline,
        strokeStyle: '#000000',
        lineWidth: 1,
        fillStyle: '#000000',
        globalCompositeOperation: 'source-over'
      });
    }
  }

  public getActionType(): string {
    return 'text';
  }

  // 测量文字尺寸
  public measureText(ctx: CanvasRenderingContext2D, text: string, fontSize: number = 16, fontFamily: string = 'Arial'): TextMetrics {
    try {
      // 参数验证
      if (!text || text.trim().length === 0) {
        text = '文字';
      }
      
      fontSize = Math.max(TextTool.DEFAULT_CONFIG.minFontSize, 
                         Math.min(fontSize, TextTool.DEFAULT_CONFIG.maxFontSize));
      
      const originalFont = ctx.font;
      ctx.font = `${fontSize}px ${fontFamily}`;
      const metrics = ctx.measureText(text);
      ctx.font = originalFont;
      return metrics;
    } catch (error) {
      logger.error('TextTool测量文字失败:', error);
      // 返回默认的TextMetrics对象
      return {
        width: 0,
        actualBoundingBoxAscent: 0,
        actualBoundingBoxDescent: 0,
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: 0,
        fontBoundingBoxAscent: 0,
        fontBoundingBoxDescent: 0,
        fontBoundingBoxLeft: 0,
        fontBoundingBoxRight: 0,
        alphabeticBaseline: 0,
        emHeightAscent: 0,
        emHeightDescent: 0,
        hangingBaseline: 0,
        ideographicBaseline: 0
      } as TextMetrics;
    }
  }

  // 获取文字边界框
  public getTextBounds(ctx: CanvasRenderingContext2D, action: TextAction): { x: number, y: number, width: number, height: number } {
    try {
      if (action.points.length === 0) {
        return { x: 0, y: 0, width: 0, height: 0 };
      }

      const point = action.points[0];
      const text = this.validateText(action.text);
      const { fontSize, fontFamily, textAlign, textBaseline } = this.getTextConfig(action);

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
    } catch (error) {
      logger.error('TextTool计算边界框失败:', error);
      return { x: 0, y: 0, width: 0, height: 0 };
    }
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

  /**
   * 截断文字以适应指定宽度
   */
  public truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, fontSize: number = 16, fontFamily: string = 'Arial'): string {
    if (maxWidth <= 0) return '';
    
    const metrics = this.measureText(ctx, text, fontSize, fontFamily);
    if (metrics.width <= maxWidth) return text;
    
    // 二分查找合适的截断位置
    let start = 0;
    let end = text.length;
    let result = '';
    
    while (start <= end) {
      const mid = Math.floor((start + end) / 2);
      const truncated = text.substring(0, mid) + '...';
      const truncatedMetrics = this.measureText(ctx, truncated, fontSize, fontFamily);
      
      if (truncatedMetrics.width <= maxWidth) {
        result = truncated;
        start = mid + 1;
      } else {
        end = mid - 1;
      }
    }
    
    return result || '...';
  }

  /**
   * 检查字体是否可用
   */
  public async isFontAvailable(fontFamily: string): Promise<boolean> {
    try {
      // 使用 FontFace API 检查字体可用性
      if ('FontFace' in window) {
        const font = new FontFace(fontFamily, `normal 16px ${fontFamily}`);
        await font.load();
        return true;
      }
      return true; // 如果不支持 FontFace API，假设字体可用
    } catch (error) {
        logger.warn(`字体 ${fontFamily} 不可用:`, error);
      return false;
    }
  }

  /**
   * 获取文字的行高
   */
  public getLineHeight(fontSize: number): number {
    return fontSize * 1.2; // 标准行高比例
  }

  /**
   * 绘制多行文字
   */
  public drawMultilineText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, action: TextAction): void {
    const lines = this.splitTextIntoLines(ctx, text, maxWidth, action);
    const lineHeight = this.getLineHeight(this.calculateFontSize(action));
    
    lines.forEach((line, index) => {
      ctx.fillText(line, x, y + index * lineHeight);
    });
  }

  /**
   * 将文字分割为多行
   */
  private splitTextIntoLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, action: TextAction): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = this.measureText(ctx, testLine, this.calculateFontSize(action), action.fontFamily || 'Arial');
      
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines;
  }
} 