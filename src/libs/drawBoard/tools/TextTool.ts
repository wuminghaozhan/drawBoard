import { DrawTool } from './DrawTool';
import type { DrawAction } from './DrawTool';
import { logger } from '../infrastructure/logging/Logger';
import { TextEditingManager, type TextCommitEvent, type TextChangeEvent } from './text/TextEditingManager';
import type { Point } from '../core/CanvasEngine';

// 类型从独立文件导入，避免循环依赖
export type { TextAction, TextToolEventType, TextToolEventHandler } from '../types/TextTypes';
import type { TextAction, TextToolEventHandler } from '../types/TextTypes';

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

  // 编辑管理器
  private editingManager: TextEditingManager | null = null;
  
  // 当前预览的文字（编辑中实时显示）
  private previewText: string = '';
  private previewPosition: Point | null = null;
  
  // 事件处理器
  private eventHandlers: Set<TextToolEventHandler> = new Set();
  
  // 取消订阅函数
  private unsubscribers: Array<() => void> = [];

  constructor() {
    super('文字', 'text');
  }

  /**
   * 初始化编辑管理器
   * 如果已经初始化，则跳过（避免重复创建导致输入框闪烁）
   */
  public initEditingManager(container: HTMLElement, canvas: HTMLCanvasElement): void {
    // 如果已经初始化，跳过
    if (this.editingManager) {
      logger.debug('TextTool.initEditingManager: 编辑管理器已存在，跳过初始化');
      return;
    }
    
    logger.info('TextTool.initEditingManager: 开始初始化', {
      hasContainer: !!container,
      hasCanvas: !!canvas,
      containerTag: container?.tagName,
      canvasSize: canvas ? { width: canvas.width, height: canvas.height } : null
    });
    
    this.editingManager = new TextEditingManager(container, canvas, {
      defaultFontSize: TextTool.DEFAULT_CONFIG.fontSize,
      defaultFontFamily: TextTool.DEFAULT_CONFIG.fontFamily
    });
    
    // 订阅编辑事件
    this.unsubscribers.push(
      this.editingManager.on('textCommit', this.handleTextCommit.bind(this))
    );
    this.unsubscribers.push(
      this.editingManager.on('textChange', this.handleTextChange.bind(this))
    );
    this.unsubscribers.push(
      this.editingManager.on('editStart', this.handleEditStart.bind(this))
    );
    this.unsubscribers.push(
      this.editingManager.on('editEnd', this.handleEditEnd.bind(this))
    );
    
    logger.info('TextTool 编辑管理器已初始化');
  }

  /**
   * 处理文字提交
   */
  private handleTextCommit(event: TextCommitEvent): void {
    // 清除预览
    this.previewText = '';
    this.previewPosition = null;
    
    // 发出事件
    const eventType: TextToolEventType = event.isNew ? 'textCreated' : 'textUpdated';
    this.emit({ type: eventType, action: this.createTextAction(event) });
  }
  
  /**
   * 处理文字变化（实时预览）
   */
  private handleTextChange(event: TextChangeEvent): void {
    this.previewText = event.text;
    this.previewPosition = event.position;
    
    // 触发重绘（需要外部监听）
    this.emit({ type: 'editingStarted' });
  }
  
  /**
   * 处理编辑开始
   */
  private handleEditStart(position: Point): void {
    this.previewPosition = position;
    this.emit({ type: 'editingStarted' });
  }
  
  /**
   * 处理编辑结束
   */
  private handleEditEnd(data?: { actionId: string | null }): void {
    this.previewText = '';
    this.previewPosition = null;
    // 传递 actionId，用于区分是哪个编辑会话结束
    this.emit({ type: 'editingEnded', actionId: data?.actionId });
  }
  
  /**
   * 创建文字 Action
   */
  private createTextAction(event: TextCommitEvent): TextAction {
    // 估算文本宽高，用于选区边界计算
    const { width, height } = this.estimateTextBounds(event.text, event.fontSize);
    
    return {
      id: event.actionId || `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'text',
      points: [event.position],
      text: event.text,
      fontSize: event.fontSize,
      fontFamily: event.fontFamily,
      width,
      height,
      context: {
        fillStyle: event.color,
        strokeStyle: event.color,
        lineWidth: 1
      },
      timestamp: Date.now()
    };
  }
  
  /**
   * 估算文本边界（不需要 canvas context）
   * 用于选区边界计算
   */
  private estimateTextBounds(text: string, fontSize: number): { width: number; height: number } {
    if (!text) {
      return { width: fontSize, height: fontSize * 1.2 };
    }
    
    // 估算文本宽度：中文字符约等于 fontSize，英文字符约等于 fontSize * 0.6
    let estimatedWidth = 0;
    for (const char of text) {
      // 判断是否是中文字符（或其他宽字符）
      if (/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(char)) {
        estimatedWidth += fontSize;
      } else {
        estimatedWidth += fontSize * 0.6;
      }
    }
    
    // 最小宽度为一个字符宽度
    const width = Math.max(estimatedWidth, fontSize);
    const height = fontSize * 1.2; // 行高约为字体大小的 1.2 倍
    
    return { width, height };
  }

  /**
   * 开始编辑（点击画布时调用）
   */
  public startEditing(position: Point, options?: {
    fontSize?: number;
    fontFamily?: string;
    color?: string;
  }): void {
    logger.info('TextTool.startEditing: 被调用', { 
      position, 
      options, 
      hasEditingManager: !!this.editingManager 
    });
    
    if (!this.editingManager) {
      logger.warn('TextTool: 编辑管理器未初始化，无法开始编辑');
      return;
    }
    
    this.editingManager.startEditing(position, options);
  }
  
  /**
   * 编辑已有文字
   */
  public editExisting(action: TextAction, canvasBounds: DOMRect): void {
    if (!this.editingManager) {
      logger.warn('TextTool: 编辑管理器未初始化');
      return;
    }
    
    this.editingManager.editExisting(action, canvasBounds);
  }
  
  /**
   * 完成编辑
   */
  public finishEditing(): void {
    this.editingManager?.finishEditing();
  }
  
  /**
   * 取消编辑
   */
  public cancelEditing(): void {
    this.editingManager?.cancelEditing();
  }
  
  /**
   * 选中当前光标位置的单词
   */
  public selectWordAtCursor(): void {
    this.editingManager?.selectWordAtCursor();
  }
  
  /**
   * 选中所有文本
   */
  public selectAll(): void {
    this.editingManager?.selectAll();
  }
  
  /**
   * 是否正在编辑
   */
  public isEditing(): boolean {
    return this.editingManager?.isEditing() ?? false;
  }
  
  /**
   * 获取正在编辑的 action ID
   * 用于在绘制时跳过该 action（避免双层显示）
   */
  public getEditingActionId(): string | null {
    return this.editingManager?.getState().actionId ?? null;
  }

  /**
   * 获取文字配置
   */
  private getTextConfig(action: TextAction) {
    const fontSize = this.calculateFontSize(action);
    const fontFamily = action.fontFamily || TextTool.DEFAULT_CONFIG.fontFamily;
    const fontWeight = action.fontWeight || 'normal';
    const textAlign = action.textAlign || TextTool.DEFAULT_CONFIG.textAlign;
    const textBaseline = action.textBaseline || TextTool.DEFAULT_CONFIG.textBaseline;

    return { fontSize, fontFamily, fontWeight, textAlign, textBaseline };
  }
  
  /**
   * 构建 CSS font 字符串
   * 格式: [font-weight] font-size font-family
   */
  private buildFontString(fontSize: number, fontFamily: string, fontWeight: string = 'normal'): string {
    return `${fontWeight} ${fontSize}px ${fontFamily}`;
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
      return '';
    }
    return text;
  }

  public draw(ctx: CanvasRenderingContext2D, action: TextAction): void {
    try {
      if (action.points.length === 0) {
        return;
      }

      const text = this.validateText(action.text);
      if (!text) {
        return;
      }

      const originalContext = this.saveContext(ctx);
      this.setContext(ctx, action.context);

      const point = action.points[0];
      const { fontSize, fontFamily, fontWeight, textAlign, textBaseline } = this.getTextConfig(action);
      
      // 设置字体属性
      ctx.font = this.buildFontString(fontSize, fontFamily, fontWeight);
      ctx.textAlign = textAlign;
      ctx.textBaseline = textBaseline;
      
      // 如果设置了宽度，使用多行绘制（文本框模式）
      if (action.width && action.width > 0) {
        this.drawWrappedText(ctx, text, point.x, point.y, action.width, action);
      } else {
        // 单行绘制
        ctx.fillText(text, point.x, point.y);
      }

      this.restoreContext(ctx, originalContext);
    } catch (error) {
      logger.error('TextTool绘制失败:', error);
      this.restoreContext(ctx, {
        font: TextTool.DEFAULT_CONFIG.fontFamily,
        textAlign: TextTool.DEFAULT_CONFIG.textAlign,
        textBaseline: TextTool.DEFAULT_CONFIG.textBaseline,
        strokeStyle: '#000000',
        lineWidth: 1,
        fillStyle: 'transparent',
        globalCompositeOperation: 'source-over'
      });
    }
  }
  
  /**
   * 绘制自动换行的文本（文本框模式）
   */
  private drawWrappedText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    action: TextAction
  ): void {
    const fontSize = this.calculateFontSize(action);
    const lineHeightMultiplier = action.lineHeight ?? 1.2;
    const lineHeight = fontSize * lineHeightMultiplier;
    
    // 按换行符分割
    const paragraphs = text.split('\n');
    let currentY = y;
    
    for (const paragraph of paragraphs) {
      if (paragraph.length === 0) {
        // 空行
        currentY += lineHeight;
        continue;
      }
      
      // 对每个段落进行自动换行
      const lines = this.wrapTextToLines(ctx, paragraph, maxWidth);
      
      for (const line of lines) {
        ctx.fillText(line, x, currentY);
        currentY += lineHeight;
      }
    }
  }
  
  /**
   * 将文本按宽度分割成多行
   */
  private wrapTextToLines(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number
  ): string[] {
    const words = this.splitTextIntoWords(text);
    const lines: string[] = [];
    let currentLine = '';
    
    for (const word of words) {
      const testLine = currentLine ? `${currentLine}${word}` : word;
      const metrics = ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && currentLine) {
        // 当前行已满，保存并开始新行
        lines.push(currentLine.trim());
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    
    // 添加最后一行
    if (currentLine) {
      lines.push(currentLine.trim());
    }
    
    return lines.length > 0 ? lines : [''];
  }
  
  /**
   * 将文本分割成单词（支持中英文混合）
   */
  private splitTextIntoWords(text: string): string[] {
    const words: string[] = [];
    let currentWord = '';
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const charCode = char.charCodeAt(0);
      
      // 判断是否为 CJK 字符（中日韩）
      const isCJK = (charCode >= 0x4E00 && charCode <= 0x9FFF) ||  // 中文
                    (charCode >= 0x3040 && charCode <= 0x30FF) ||  // 日文
                    (charCode >= 0xAC00 && charCode <= 0xD7AF);    // 韩文
      
      if (isCJK) {
        // CJK 字符单独成词
        if (currentWord) {
          words.push(currentWord);
          currentWord = '';
        }
        words.push(char);
      } else if (char === ' ') {
        // 空格：结束当前单词
        if (currentWord) {
          words.push(currentWord + ' ');
          currentWord = '';
        } else {
          words.push(' ');
        }
      } else {
        // 英文字符：累积成单词
        currentWord += char;
      }
    }
    
    // 添加最后一个单词
    if (currentWord) {
      words.push(currentWord);
    }
    
    return words;
  }
  
  /**
   * 绘制预览文字（编辑时实时显示）
   */
  public drawPreview(ctx: CanvasRenderingContext2D): void {
    if (!this.previewText || !this.previewPosition) {
      return;
    }
    
    const state = this.editingManager?.getState();
    if (!state) return;
    
    ctx.save();
    
    ctx.font = `${state.fontSize}px ${state.fontFamily}`;
    ctx.fillStyle = state.color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.globalAlpha = 0.5; // 半透明预览
    
    ctx.fillText(this.previewText, this.previewPosition.x, this.previewPosition.y);
    
    ctx.restore();
  }

  public getActionType(): string {
    return 'text';
  }

  /**
   * 测量文字尺寸
   */
  public measureText(ctx: CanvasRenderingContext2D, text: string, fontSize: number = 16, fontFamily: string = 'Arial', fontWeight: string = 'normal'): TextMetrics {
    try {
      if (!text || text.trim().length === 0) {
        text = ' ';
      }
      
      fontSize = Math.max(TextTool.DEFAULT_CONFIG.minFontSize, 
                         Math.min(fontSize, TextTool.DEFAULT_CONFIG.maxFontSize));
      
      const originalFont = ctx.font;
      ctx.font = this.buildFontString(fontSize, fontFamily, fontWeight);
      const metrics = ctx.measureText(text);
      ctx.font = originalFont;
      return metrics;
    } catch (error) {
      logger.error('TextTool测量文字失败:', error);
      return this.getEmptyTextMetrics();
    }
  }
  
  /**
   * 获取空的 TextMetrics
   */
  private getEmptyTextMetrics(): TextMetrics {
    return {
      width: 0,
      actualBoundingBoxAscent: 0,
      actualBoundingBoxDescent: 0,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: 0,
      fontBoundingBoxAscent: 0,
      fontBoundingBoxDescent: 0,
      emHeightAscent: 0,
      emHeightDescent: 0,
      alphabeticBaseline: 0,
      hangingBaseline: 0,
      ideographicBaseline: 0
    } as TextMetrics;
  }

  /**
   * 获取文字边界框
   * 支持单行文本和多行文本框模式
   */
  public getTextBounds(ctx: CanvasRenderingContext2D, action: TextAction): { x: number, y: number, width: number, height: number } {
    try {
      if (action.points.length === 0) {
        return { x: 0, y: 0, width: 0, height: 0 };
      }

      const point = action.points[0];
      const text = this.validateText(action.text);
      
      if (!text) {
        // 如果有宽度设置，返回文本框的尺寸
        if (action.width) {
          return { x: point.x, y: point.y, width: action.width, height: action.height || 24 };
        }
        return { x: point.x, y: point.y, width: 0, height: 0 };
      }
      
      const { fontSize, fontFamily, fontWeight, textAlign, textBaseline } = this.getTextConfig(action);
      ctx.font = this.buildFontString(fontSize, fontFamily, fontWeight);

      // 如果设置了宽度，使用多行模式计算边界
      if (action.width && action.width > 0) {
        return this.getMultilineTextBounds(ctx, text, point, action);
      }

      // 单行模式
      const metrics = this.measureText(ctx, text, fontSize, fontFamily, fontWeight);
      
      // 根据对齐方式计算实际位置
      let x = point.x;
      if (textAlign === 'center') {
        x = point.x - metrics.width / 2;
      } else if (textAlign === 'right') {
        x = point.x - metrics.width;
      }

      let y = point.y;
      const height = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent || fontSize * 1.2;
      
      if (textBaseline === 'middle') {
        y = point.y - height / 2;
      } else if (textBaseline === 'bottom') {
        y = point.y - height;
      }

      return {
        x,
        y,
        width: metrics.width,
        height
      };
    } catch (error) {
      logger.error('TextTool计算边界框失败:', error);
      return { x: 0, y: 0, width: 0, height: 0 };
    }
  }
  
  /**
   * 计算多行文本的边界框
   */
  private getMultilineTextBounds(
    ctx: CanvasRenderingContext2D,
    text: string,
    point: { x: number; y: number },
    action: TextAction
  ): { x: number; y: number; width: number; height: number } {
    const fontSize = this.calculateFontSize(action);
    const lineHeightMultiplier = action.lineHeight ?? 1.2;
    const lineHeight = fontSize * lineHeightMultiplier;
    const maxWidth = action.width || 100;
    
    // 计算总行数
    const paragraphs = text.split('\n');
    let totalLines = 0;
    
    for (const paragraph of paragraphs) {
      if (paragraph.length === 0) {
        totalLines += 1;
      } else {
        const lines = this.wrapTextToLines(ctx, paragraph, maxWidth);
        totalLines += lines.length;
      }
    }
    
    const totalHeight = totalLines * lineHeight;
    
    return {
      x: point.x,
      y: point.y,
      width: maxWidth,
      height: Math.max(totalHeight, lineHeight) // 至少一行高度
    };
  }

  /**
   * 上下文保存（包含字体属性）
   */
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
  public truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, fontSize: number = 16, fontFamily: string = 'Arial', fontWeight: string = 'normal'): string {
    if (maxWidth <= 0) return '';
    
    const metrics = this.measureText(ctx, text, fontSize, fontFamily, fontWeight);
    if (metrics.width <= maxWidth) return text;
    
    let start = 0;
    let end = text.length;
    let result = '';
    
    while (start <= end) {
      const mid = Math.floor((start + end) / 2);
      const truncated = text.substring(0, mid) + '...';
      const truncatedMetrics = this.measureText(ctx, truncated, fontSize, fontFamily, fontWeight);
      
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
      if ('fonts' in document) {
        return document.fonts.check(`16px ${fontFamily}`);
      }
      return true;
    } catch (error) {
      logger.warn(`字体 ${fontFamily} 检查失败:`, error);
      return true;
    }
  }

  /**
   * 获取文字的行高
   */
  public getLineHeight(fontSize: number): number {
    return fontSize * 1.2;
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
      const metrics = this.measureText(ctx, testLine, this.calculateFontSize(action), action.fontFamily || 'Arial', action.fontWeight || 'normal');
      
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
  
  /**
   * 订阅事件
   */
  public on(handler: TextToolEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }
  
  /**
   * 发出事件
   */
  private emit(event: { type: TextToolEventType; action?: TextAction }): void {
    this.eventHandlers.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        logger.error('TextTool 事件处理器错误', error);
      }
    });
  }
  
  /**
   * 设置字体大小（编辑中）
   */
  public setFontSize(size: number): void {
    this.editingManager?.setFontSize(size);
  }
  
  /**
   * 设置字体（编辑中）
   */
  public setFontFamily(family: string): void {
    this.editingManager?.setFontFamily(family);
  }
  
  /**
   * 设置颜色（编辑中）
   */
  public setTextColor(color: string): void {
    this.editingManager?.setColor(color);
  }
  
  /**
   * 销毁
   */
  public destroy(): void {
    // 取消所有订阅
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];
    
    // 销毁编辑管理器
    this.editingManager?.destroy();
    this.editingManager = null;
    
    // 清理事件处理器
    this.eventHandlers.clear();
    
    // 清理状态
    this.previewText = '';
    this.previewPosition = null;
    
    logger.debug('TextTool 已销毁');
  }
}
