import type { ToolType } from '../tools/DrawTool';
import { logger } from '../utils/Logger';

/**
 * 鼠标样式处理器 - 负责管理画板的鼠标样式
 * 
 * 职责：
 * - 根据当前工具设置对应的鼠标样式
 * - 根据绘制状态提供动态样式反馈
 * - 根据线宽动态调整样式大小
 * - 提供自定义样式接口
 */
export class CursorHandler {
  private container: HTMLElement;
  private interactionCanvas: HTMLCanvasElement | null = null;
  
  // 光标缓存
  private cursorCache = new Map<string, string>();
  private lastCursorState = { toolType: '', isDrawing: false, lineWidth: 0 };
  
  // 配置选项
  private config = {
    enableCustomCursors: true,
    enableDynamicSizing: true,
    minCursorSize: 16,
    maxCursorSize: 32,
    cacheSize: 50
  };
  
  // 性能统计
  private performanceStats = {
    updateCount: 0,
    cacheHits: 0,
    cacheMisses: 0,
    lastUpdateTime: 0
  };

  constructor(container: HTMLElement, interactionCanvas?: HTMLCanvasElement) {
    this.container = container;
    this.interactionCanvas = interactionCanvas || null;
  }

  /**
   * 设置交互层Canvas引用
   */
  public setInteractionCanvas(canvas: HTMLCanvasElement): void {
    this.interactionCanvas = canvas;
  }

  /**
   * 更新鼠标样式
   * @param toolType 当前工具类型
   * @param isDrawing 是否正在绘制
   * @param lineWidth 当前线宽
   */
  public updateCursor(toolType: ToolType, isDrawing: boolean = false, lineWidth: number = 2): void {
    const startTime = performance.now();
    
    const cacheKey = `${toolType}-${isDrawing}-${lineWidth}`;
    
    // 检查是否需要更新
    if (this.lastCursorState.toolType === toolType && 
        this.lastCursorState.isDrawing === isDrawing && 
        this.lastCursorState.lineWidth === lineWidth) {
      return; // 状态未变化，跳过更新
    }
    
    // 检查缓存
    let cursorStyle = this.cursorCache.get(cacheKey);
    if (cursorStyle) {
      this.performanceStats.cacheHits++;
    } else {
      this.performanceStats.cacheMisses++;
      cursorStyle = this.getCursorForDrawingState(toolType, isDrawing, lineWidth);
      
      // 管理缓存大小
      if (this.cursorCache.size >= this.config.cacheSize) {
        const firstKey = this.cursorCache.keys().next().value;
        if (firstKey) {
          this.cursorCache.delete(firstKey);
        }
      }
      this.cursorCache.set(cacheKey, cursorStyle);
    }
    
    this.setCursor(cursorStyle);
    this.lastCursorState = { toolType, isDrawing, lineWidth };
    
    // 更新性能统计
    this.performanceStats.updateCount++;
    this.performanceStats.lastUpdateTime = startTime;
    
    logger.debug('光标更新:', { toolType, isDrawing, lineWidth, cacheKey });
  }

  /**
   * 设置自定义鼠标样式
   * @param cursor CSS cursor 值
   */
  public setCursor(cursor: string): void {
    try {
      // 验证cursor参数
      if (typeof cursor !== 'string' || cursor.trim() === '') {
        logger.warn('无效的光标样式:', cursor);
        cursor = 'default';
      }
      
      this.container.style.cursor = cursor;
      
      if (this.interactionCanvas) {
        this.interactionCanvas.style.cursor = cursor;
      }
      
      logger.debug('光标样式已更新:', cursor);
    } catch (error) {
      logger.error('设置光标样式失败:', error);
      // 回退到默认样式
      this.resetCursor();
    }
  }

  /**
   * 重置为默认鼠标样式
   */
  public resetCursor(): void {
    this.setCursor('default');
  }

  /**
   * 获取性能统计信息
   */
  public getPerformanceStats() {
    return { ...this.performanceStats };
  }

  /**
   * 清理光标缓存
   */
  public clearCache(): void {
    this.cursorCache.clear();
    logger.debug('光标缓存已清理');
  }

  /**
   * 销毁光标处理器，清理所有资源
   */
  public destroy(): void {
    // 重置光标样式
    this.resetCursor();
    
    // 清理缓存
    this.clearCache();
    
    // 清理Canvas引用
    this.interactionCanvas = null;
    
    logger.info('🗑️ CursorHandler destroyed');
  }

  // ============================================
  // 私有方法 - 样式生成
  // ============================================

  /**
   * 获取绘制状态的鼠标样式
   * @param toolType 工具类型
   * @param isDrawing 是否正在绘制
   * @param lineWidth 线宽
   * @returns CSS cursor 值
   */
  private getCursorForDrawingState(toolType: ToolType, isDrawing: boolean, lineWidth: number): string {
    if (!isDrawing) {
      return this.getCursorForTool(toolType, lineWidth);
    }

    // 绘制状态下的特殊样式
    const drawingCursorMap: Record<ToolType, () => string> = {
      // 画笔绘制中 - 显示动态大小的实心圆点
      'pen': () => this.getPenDrawingCursor(lineWidth),
      'brush': () => this.getBrushDrawingCursor(lineWidth),
      
      // 橡皮擦绘制中 - 显示动态大小的空心圆
      'eraser': () => this.getEraserDrawingCursor(lineWidth),
      
      // 选择工具绘制中 - 使用十字光标
      'select': () => 'crosshair',
      
      // 几何图形绘制中 - 使用十字光标
      'rect': () => 'crosshair',
      'circle': () => 'crosshair',
      'line': () => 'crosshair',
      'polygon': () => 'crosshair',
      
      // 文字工具绘制中
      'text': () => 'text',
      
      // 变换工具绘制中
      'transform': () => 'move'
    };
    
    const cursorGenerator = drawingCursorMap[toolType];
    return cursorGenerator ? cursorGenerator() : this.getCursorForTool(toolType, lineWidth);
  }

  /**
   * 获取工具对应的鼠标样式
   * @param toolType 工具类型
   * @param lineWidth 当前线宽
   * @returns CSS cursor 值
   */
  private getCursorForTool(toolType: ToolType, lineWidth: number = 2): string {
    if (!this.config.enableCustomCursors) {
      return this.getDefaultCursorForTool(toolType);
    }

    const cursorMap: Record<ToolType, () => string> = {
      pen: () => this.getPenCursor(lineWidth),
      brush: () => this.getBrushCursor(lineWidth),
      eraser: () => this.getEraserCursor(lineWidth),
      select: () => 'default',
      rect: () => 'crosshair',
      circle: () => 'crosshair',
      line: () => 'crosshair',
      polygon: () => 'crosshair',
      text: () => 'text',
      transform: () => 'move'
    };
    
    const cursorGenerator = cursorMap[toolType];
    return cursorGenerator ? cursorGenerator() : 'default';
  }

  /**
   * 获取默认工具光标（不使用自定义样式）
   */
  private getDefaultCursorForTool(toolType: ToolType): string {
    const defaultCursorMap: Record<ToolType, string> = {
      pen: 'crosshair',
      brush: 'crosshair',
      eraser: 'crosshair',
      select: 'default',
      rect: 'crosshair',
      circle: 'crosshair',
      line: 'crosshair',
      polygon: 'crosshair',
      text: 'text',
      transform: 'move'
    };
    
    return defaultCursorMap[toolType] || 'default';
  }

  // ============================================
  // 自定义光标生成方法
  // ============================================

  /**
   * 生成画笔光标
   */
  private getPenCursor(lineWidth: number): string {
    if (!this.config.enableDynamicSizing) {
      return 'crosshair';
    }
    
    const size = this.calculateCursorSize(lineWidth);
    const svg = this.generatePenSVG(size, lineWidth);
    const hotspotX = Math.floor(size * 0.1); // 笔尖位置
    const hotspotY = Math.floor(size * 0.9);
    
    return `url(data:image/svg+xml;base64,${btoa(svg)}) ${hotspotX} ${hotspotY}, crosshair`;
  }

  /**
   * 生成画笔绘制状态光标
   */
  private getPenDrawingCursor(lineWidth: number): string {
    if (!this.config.enableDynamicSizing) {
      return 'crosshair';
    }
    
    const size = this.calculateCursorSize(lineWidth);
    const svg = this.generatePenDrawingSVG(size, lineWidth);
    const hotspot = Math.floor(size / 2);
    
    return `url(data:image/svg+xml;base64,${btoa(svg)}) ${hotspot} ${hotspot}, crosshair`;
  }

  /**
   * 生成毛笔光标
   */
  private getBrushCursor(lineWidth: number): string {
    if (!this.config.enableDynamicSizing) {
      return 'crosshair';
    }
    
    const size = this.calculateCursorSize(lineWidth);
    const svg = this.generateBrushSVG(size, lineWidth);
    const hotspotX = Math.floor(size * 0.15);
    const hotspotY = Math.floor(size * 0.85);
    
    return `url(data:image/svg+xml;base64,${btoa(svg)}) ${hotspotX} ${hotspotY}, crosshair`;
  }

  /**
   * 生成毛笔绘制状态光标
   */
  private getBrushDrawingCursor(lineWidth: number): string {
    if (!this.config.enableDynamicSizing) {
      return 'crosshair';
    }
    
    const size = this.calculateCursorSize(lineWidth);
    const svg = this.generateBrushDrawingSVG(size, lineWidth);
    const hotspot = Math.floor(size / 2);
    
    return `url(data:image/svg+xml;base64,${btoa(svg)}) ${hotspot} ${hotspot}, crosshair`;
  }

  /**
   * 生成橡皮擦光标
   */
  private getEraserCursor(lineWidth: number): string {
    if (!this.config.enableDynamicSizing) {
      return 'crosshair';
    }
    
    const size = this.calculateCursorSize(lineWidth);
    const svg = this.generateEraserSVG(size, lineWidth);
    const hotspot = Math.floor(size / 2);
    
    return `url(data:image/svg+xml;base64,${btoa(svg)}) ${hotspot} ${hotspot}, crosshair`;
  }

  /**
   * 生成橡皮擦绘制状态光标
   */
  private getEraserDrawingCursor(lineWidth: number): string {
    if (!this.config.enableDynamicSizing) {
      return 'crosshair';
    }
    
    const size = this.calculateCursorSize(lineWidth);
    const svg = this.generateEraserDrawingSVG(size, lineWidth);
    const hotspot = Math.floor(size / 2);
    
    return `url(data:image/svg+xml;base64,${btoa(svg)}) ${hotspot} ${hotspot}, crosshair`;
  }

  // ============================================
  // 工具方法
  // ============================================

  /**
   * 计算光标大小
   */
  private calculateCursorSize(lineWidth: number): number {
    if (!this.config.enableDynamicSizing) {
      return this.config.minCursorSize;
    }
    
    // 根据线宽动态调整大小，最小16px，最大32px
    const size = Math.max(
      this.config.minCursorSize, 
      Math.min(this.config.maxCursorSize, this.config.minCursorSize + lineWidth * 2)
    );
    
    return Math.round(size);
  }

  /**
   * 生成画笔SVG
   */
  private generatePenSVG(size: number, lineWidth: number): string {
    const strokeWidth = Math.max(1, Math.min(3, lineWidth / 2));
    const color = '#000000';
    
    return `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="penGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${color};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${color};stop-opacity:0.7" />
          </linearGradient>
        </defs>
        <path d="M ${size * 0.1} ${size * 0.9} L ${size * 0.9} ${size * 0.1}" 
              stroke="url(#penGradient)" 
              stroke-width="${strokeWidth}" 
              fill="none" 
              stroke-linecap="round"/>
        <circle cx="${size * 0.1}" cy="${size * 0.9}" r="${strokeWidth * 2}" 
                fill="${color}" opacity="0.8"/>
      </svg>
    `.trim();
  }

  /**
   * 生成画笔绘制状态SVG
   */
  private generatePenDrawingSVG(size: number, lineWidth: number): string {
    const radius = Math.max(2, Math.min(8, lineWidth));
    const color = '#000000';
    
    return `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" 
                fill="${color}" opacity="0.6"/>
        <circle cx="${size / 2}" cy="${size / 2}" r="${radius / 2}" 
                fill="${color}" opacity="0.9"/>
      </svg>
    `.trim();
  }

  /**
   * 生成毛笔SVG
   */
  private generateBrushSVG(size: number, lineWidth: number): string {
    const strokeWidth = Math.max(2, Math.min(6, lineWidth));
    const color = '#8B4513';
    
    return `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="brushGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" style="stop-color:${color};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${color};stop-opacity:0.3" />
          </radialGradient>
        </defs>
        <ellipse cx="${size / 2}" cy="${size / 2}" 
                 rx="${strokeWidth * 2}" ry="${strokeWidth}" 
                 fill="url(#brushGradient)"/>
        <path d="M ${size * 0.2} ${size * 0.8} L ${size * 0.8} ${size * 0.2}" 
              stroke="${color}" 
              stroke-width="${strokeWidth / 2}" 
              fill="none" 
              stroke-linecap="round"/>
      </svg>
    `.trim();
  }

  /**
   * 生成毛笔绘制状态SVG
   */
  private generateBrushDrawingSVG(size: number, lineWidth: number): string {
    const radius = Math.max(3, Math.min(12, lineWidth * 1.5));
    const color = '#8B4513';
    
    return `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="brushDrawingGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" style="stop-color:${color};stop-opacity:0.8" />
            <stop offset="100%" style="stop-color:${color};stop-opacity:0.2" />
          </radialGradient>
        </defs>
        <ellipse cx="${size / 2}" cy="${size / 2}" 
                 rx="${radius}" ry="${radius * 0.6}" 
                 fill="url(#brushDrawingGradient)"/>
      </svg>
    `.trim();
  }

  /**
   * 生成橡皮擦SVG
   */
  private generateEraserSVG(size: number, lineWidth: number): string {
    const radius = Math.max(4, Math.min(12, lineWidth * 1.5));
    const color = '#FF6B6B';
    
    return `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" 
                fill="none" 
                stroke="${color}" 
                stroke-width="2" 
                opacity="0.8"/>
        <circle cx="${size / 2}" cy="${size / 2}" r="${radius / 2}" 
                fill="none" 
                stroke="${color}" 
                stroke-width="1" 
                opacity="0.6"/>
      </svg>
    `.trim();
  }

  /**
   * 生成橡皮擦绘制状态SVG
   */
  private generateEraserDrawingSVG(size: number, lineWidth: number): string {
    const radius = Math.max(4, Math.min(12, lineWidth * 1.5));
    const color = '#FF6B6B';
    
    return `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" 
                fill="${color}" 
                opacity="0.3"/>
        <circle cx="${size / 2}" cy="${size / 2}" r="${radius / 2}" 
                fill="${color}" 
                opacity="0.6"/>
      </svg>
    `.trim();
  }
} 