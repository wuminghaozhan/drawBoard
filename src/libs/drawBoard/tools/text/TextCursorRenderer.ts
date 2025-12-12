/**
 * 文字光标渲染器
 * 
 * 职责：
 * - 渲染闪烁光标
 * - 渲染文字选中高亮
 * - 支持不同的光标样式
 */

import { logger } from '../../infrastructure/logging/Logger';
import type { Point } from '../../core/CanvasEngine';

/** 光标配置 */
export interface CursorConfig {
  /** 光标颜色 */
  color: string;
  /** 光标宽度 */
  width: number;
  /** 闪烁间隔 (ms) */
  blinkInterval: number;
  /** 选中高亮颜色 */
  selectionColor: string;
  /** 选中高亮透明度 */
  selectionOpacity: number;
}

/** 光标位置信息 */
export interface CursorPosition {
  x: number;
  y: number;
  height: number;
}

/** 选中范围 */
export interface SelectionRange {
  start: CursorPosition;
  end: CursorPosition;
  rects: Array<{ x: number; y: number; width: number; height: number }>;
}

export class TextCursorRenderer {
  private ctx: CanvasRenderingContext2D | null = null;
  private config: CursorConfig;
  
  private cursorVisible = true;
  private blinkTimer: number | null = null;
  private cursorPosition: CursorPosition | null = null;
  private selectionRange: SelectionRange | null = null;
  
  private redrawCallback: (() => void) | null = null;
  
  private static readonly DEFAULT_CONFIG: CursorConfig = {
    color: '#000000',
    width: 2,
    blinkInterval: 500,
    selectionColor: '#1890ff',
    selectionOpacity: 0.3
  };
  
  constructor(config: Partial<CursorConfig> = {}) {
    this.config = { ...TextCursorRenderer.DEFAULT_CONFIG, ...config };
  }
  
  /**
   * 设置渲染上下文
   */
  public setContext(ctx: CanvasRenderingContext2D): void {
    this.ctx = ctx;
  }
  
  /**
   * 设置重绘回调
   */
  public setRedrawCallback(callback: () => void): void {
    this.redrawCallback = callback;
  }
  
  /**
   * 开始光标闪烁
   */
  public startBlinking(position: CursorPosition): void {
    this.stopBlinking();
    
    this.cursorPosition = position;
    this.cursorVisible = true;
    
    this.blinkTimer = window.setInterval(() => {
      this.cursorVisible = !this.cursorVisible;
      this.redrawCallback?.();
    }, this.config.blinkInterval);
    
    this.redrawCallback?.();
  }
  
  /**
   * 停止光标闪烁
   */
  public stopBlinking(): void {
    if (this.blinkTimer !== null) {
      clearInterval(this.blinkTimer);
      this.blinkTimer = null;
    }
    this.cursorPosition = null;
    this.cursorVisible = false;
  }
  
  /**
   * 更新光标位置
   */
  public updatePosition(position: CursorPosition): void {
    this.cursorPosition = position;
    this.cursorVisible = true;
    this.redrawCallback?.();
  }
  
  /**
   * 设置选中范围
   */
  public setSelection(range: SelectionRange | null): void {
    this.selectionRange = range;
    this.redrawCallback?.();
  }
  
  /**
   * 清除选中
   */
  public clearSelection(): void {
    this.selectionRange = null;
    this.redrawCallback?.();
  }
  
  /**
   * 渲染光标
   */
  public render(ctx?: CanvasRenderingContext2D): void {
    const renderCtx = ctx || this.ctx;
    if (!renderCtx) return;
    
    // 渲染选中高亮
    if (this.selectionRange) {
      this.renderSelection(renderCtx);
    }
    
    // 渲染光标
    if (this.cursorPosition && this.cursorVisible) {
      this.renderCursor(renderCtx);
    }
  }
  
  /**
   * 渲染光标
   */
  private renderCursor(ctx: CanvasRenderingContext2D): void {
    if (!this.cursorPosition) return;
    
    const { x, y, height } = this.cursorPosition;
    
    ctx.save();
    
    ctx.strokeStyle = this.config.color;
    ctx.lineWidth = this.config.width;
    ctx.lineCap = 'round';
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + height);
    ctx.stroke();
    
    ctx.restore();
  }
  
  /**
   * 渲染选中高亮
   */
  private renderSelection(ctx: CanvasRenderingContext2D): void {
    if (!this.selectionRange || this.selectionRange.rects.length === 0) return;
    
    ctx.save();
    
    ctx.fillStyle = this.config.selectionColor;
    ctx.globalAlpha = this.config.selectionOpacity;
    
    for (const rect of this.selectionRange.rects) {
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    }
    
    ctx.restore();
  }
  
  /**
   * 更新配置
   */
  public updateConfig(config: Partial<CursorConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  /**
   * 是否正在闪烁
   */
  public isBlinking(): boolean {
    return this.blinkTimer !== null;
  }
  
  /**
   * 获取当前光标位置
   */
  public getCursorPosition(): CursorPosition | null {
    return this.cursorPosition;
  }
  
  /**
   * 销毁
   */
  public destroy(): void {
    this.stopBlinking();
    this.selectionRange = null;
    this.redrawCallback = null;
    this.ctx = null;
  }
}

/**
 * 文字测量工具
 * 用于计算光标位置和选中范围
 */
export class TextMeasurer {
  private ctx: CanvasRenderingContext2D;
  
  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }
  
  /**
   * 计算光标位置
   */
  public getCursorPosition(
    text: string,
    cursorIndex: number,
    startX: number,
    startY: number,
    fontSize: number,
    fontFamily: string
  ): CursorPosition {
    const originalFont = this.ctx.font;
    this.ctx.font = `${fontSize}px ${fontFamily}`;
    
    const textBeforeCursor = text.substring(0, cursorIndex);
    const metrics = this.ctx.measureText(textBeforeCursor);
    
    this.ctx.font = originalFont;
    
    return {
      x: startX + metrics.width,
      y: startY,
      height: fontSize * 1.2
    };
  }
  
  /**
   * 计算选中范围
   */
  public getSelectionRange(
    text: string,
    startIndex: number,
    endIndex: number,
    startX: number,
    startY: number,
    fontSize: number,
    fontFamily: string
  ): SelectionRange {
    const originalFont = this.ctx.font;
    this.ctx.font = `${fontSize}px ${fontFamily}`;
    
    const textBeforeStart = text.substring(0, startIndex);
    const textBeforeEnd = text.substring(0, endIndex);
    
    const startMetrics = this.ctx.measureText(textBeforeStart);
    const endMetrics = this.ctx.measureText(textBeforeEnd);
    
    this.ctx.font = originalFont;
    
    const height = fontSize * 1.2;
    
    const start: CursorPosition = {
      x: startX + startMetrics.width,
      y: startY,
      height
    };
    
    const end: CursorPosition = {
      x: startX + endMetrics.width,
      y: startY,
      height
    };
    
    // 简单情况：单行选中
    const rects = [{
      x: start.x,
      y: start.y,
      width: end.x - start.x,
      height
    }];
    
    return { start, end, rects };
  }
  
  /**
   * 根据点击位置计算光标索引
   */
  public getIndexFromPosition(
    text: string,
    clickX: number,
    startX: number,
    fontSize: number,
    fontFamily: string
  ): number {
    const originalFont = this.ctx.font;
    this.ctx.font = `${fontSize}px ${fontFamily}`;
    
    const relativeX = clickX - startX;
    
    if (relativeX <= 0) {
      this.ctx.font = originalFont;
      return 0;
    }
    
    // 二分查找
    let start = 0;
    let end = text.length;
    
    while (start < end) {
      const mid = Math.floor((start + end) / 2);
      const textToMid = text.substring(0, mid);
      const width = this.ctx.measureText(textToMid).width;
      
      if (width < relativeX) {
        start = mid + 1;
      } else {
        end = mid;
      }
    }
    
    // 检查是否更接近前一个字符
    if (start > 0) {
      const widthBefore = this.ctx.measureText(text.substring(0, start - 1)).width;
      const widthAfter = this.ctx.measureText(text.substring(0, start)).width;
      
      if (relativeX - widthBefore < widthAfter - relativeX) {
        start--;
      }
    }
    
    this.ctx.font = originalFont;
    
    return Math.min(start, text.length);
  }
}

