import type { ToolType } from '../tools/DrawTool';

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
    const cursorStyle = this.getCursorForDrawingState(toolType, isDrawing, lineWidth);
    this.setCursor(cursorStyle);
  }

  /**
   * 设置自定义鼠标样式
   * @param cursor CSS cursor 值
   */
  public setCursor(cursor: string): void {
    this.container.style.cursor = cursor;
    
    if (this.interactionCanvas) {
      this.interactionCanvas.style.cursor = cursor;
    }
  }

  /**
   * 重置为默认鼠标样式
   */
  public resetCursor(): void {
    this.setCursor('default');
  }

  /**
   * 销毁光标处理器，清理所有资源
   */
  public destroy(): void {
    // 重置光标样式
    this.resetCursor();
    
    // 清理Canvas引用
    this.interactionCanvas = null;
    
    console.log('🗑️ CursorHandler destroyed');
  }

  // ============================================
  // 私有方法 - 样式生成
  // ============================================

  /**
   * 获取绘制状态的鼠标样式
   * @param tool 工具类型
   * @param isDrawing 是否正在绘制
   * @param lineWidth 线宽
   * @returns CSS cursor 值
   */
  private getCursorForDrawingState(toolType: ToolType, isDrawing: boolean, lineWidth: number): string {
    if (!isDrawing) {
      return this.getCursorForTool(toolType);
    }

    // 绘制状态下的特殊样式
    const drawingCursorMap: Record<ToolType, string> = {
      // 画笔绘制中 - 使用动态大小的实心圆点
      'pen': this.getPenDrawingCursor(lineWidth),
      'brush': this.getPenDrawingCursor(lineWidth),
      
      // 橡皮擦绘制中 - 使用动态大小的空心圆
      'eraser': this.getEraserDrawingCursor(lineWidth),
      
      // 选择工具绘制中 - 使用十字光标
      'select': 'crosshair',
      
      // 几何图形绘制中 - 使用十字光标
      'rect': 'crosshair',
      'circle': 'crosshair',
      'line': 'crosshair',
      'polygon': 'crosshair',
      
      // 文字工具绘制中
      'text': 'text',
      
      // 变换工具绘制中
      'transform': 'move'
    };
    
    return drawingCursorMap[toolType] || this.getCursorForTool(toolType);
  }

  /**
   * 获取工具对应的鼠标样式
   * @param tool 工具类型
   * @param lineWidth 当前线宽
   * @returns CSS cursor 值
   */
  private getCursorForTool(toolType: ToolType): string {
    const cursorMap: Record<ToolType, string> = {
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
    
    return cursorMap[toolType] || 'default';
  }

  /**
   * 获取画笔工具的动态鼠标样式
   * @param lineWidth 当前线宽
   * @returns CSS cursor 值
   */
  private getPenCursor(lineWidth: number): string {
    // 根据线宽调整画笔图标大小，最小16px，最大32px
    const size = Math.max(16, Math.min(32, 16 + lineWidth * 2));
    const hotspotX = Math.floor(size * 0.1); // 笔尖位置
    const hotspotY = Math.floor(size * 0.9);
    
    return `url("data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m12 19 7-7 3 3-7 7-3-3z'/%3E%3Cpath d='m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z'/%3E%3Cpath d='m2 2 7.586 7.586'/%3E%3Ccircle cx='11' cy='11' r='2'/%3E%3C/svg%3E") ${hotspotX} ${hotspotY}, auto`;
  }

  /**
   * 获取橡皮擦工具的动态鼠标样式
   * @param lineWidth 当前线宽（橡皮擦大小）
   * @returns CSS cursor 值
   */
  private getEraserCursor(lineWidth: number): string {
    // 根据线宽调整橡皮擦图标大小，最小20px，最大40px
    const size = Math.max(20, Math.min(40, 20 + lineWidth * 2));
    const hotspot = Math.floor(size / 2);
    
    return `url("data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m7 21-4.3-4.3c-1-1-1-2.5 0-3.5l9.6-9.6c1-1 2.5-1 3.5 0l5.2 5.2c1 1 1 2.5 0 3.5L13 21'/%3E%3Cpath d='M22 21H7'/%3E%3Cpath d='m5 11 9 9'/%3E%3C/svg%3E") ${hotspot} ${hotspot}, auto`;
  }

  /**
   * 获取画笔绘制状态的鼠标样式
   * @param lineWidth 当前线宽
   * @returns CSS cursor 值
   */
  private getPenDrawingCursor(lineWidth: number): string {
    // 根据线宽调整圆点大小，确保可见性
    const radius = Math.max(2, Math.min(16, Math.ceil(lineWidth / 2)));
    const size = radius * 2 + 4; // 留出边距
    const center = size / 2;
    
    return `url("data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'%3E%3Ccircle cx='${center}' cy='${center}' r='${radius}' fill='%23000' opacity='0.8'/%3E%3C/svg%3E") ${center} ${center}, auto`;
  }

  /**
   * 获取橡皮擦绘制状态的鼠标样式
   * @param lineWidth 当前线宽（橡皮擦大小）
   * @returns CSS cursor 值
   */
  private getEraserDrawingCursor(lineWidth: number): string {
    // 根据线宽调整圆圈大小，橡皮擦通常比画笔大一些
    const radius = Math.max(4, Math.min(20, lineWidth));
    const size = radius * 2 + 6; // 留出边距
    const center = size / 2;
    
    return `url("data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'%3E%3Ccircle cx='${center}' cy='${center}' r='${radius}' fill='none' stroke='%23666' stroke-width='2' opacity='0.8'/%3E%3C/svg%3E") ${center} ${center}, auto`;
  }

  /**
   * 获取矩形工具的鼠标样式
   * @param lineWidth 当前线宽
   * @returns CSS cursor 值
   */
  private getRectCursor(lineWidth: number): string {
    // 根据线宽调整矩形图标大小，最小20px，最大32px
    const size = Math.max(20, Math.min(32, 20 + lineWidth * 1.5));
    const hotspot = Math.floor(size / 2);
    
    return `url("data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='18' height='18' rx='2' ry='2'/%3E%3C/svg%3E") ${hotspot} ${hotspot}, auto`;
  }

  /**
   * 获取圆形工具的鼠标样式
   * @param lineWidth 当前线宽
   * @returns CSS cursor 值
   */
  private getCircleCursor(lineWidth: number): string {
    // 根据线宽调整圆形图标大小，最小20px，最大32px
    const size = Math.max(20, Math.min(32, 20 + lineWidth * 1.5));
    const hotspot = Math.floor(size / 2);
    
    return `url("data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3C/svg%3E") ${hotspot} ${hotspot}, auto`;
  }
} 