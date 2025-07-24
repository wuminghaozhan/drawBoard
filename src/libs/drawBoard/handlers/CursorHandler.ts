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
    
    logger.info('🗑️ CursorHandler destroyed');
  }

  // ============================================
  // 私有方法 - 样式生成
  // ============================================

  /**
   * 获取绘制状态的鼠标样式
   * @param tool 工具类型
   * @param isDrawing 是否正在绘制
   * @param _lineWidth 线宽（当前未使用）
   * @returns CSS cursor 值
   */
  private getCursorForDrawingState(toolType: ToolType, isDrawing: boolean, _lineWidth: number): string {
    if (!isDrawing) {
      return this.getCursorForTool(toolType);
    }

    // 绘制状态下的特殊样式 - 简化版本，使用基础光标
    const drawingCursorMap: Record<ToolType, string> = {
      // 画笔绘制中 - 使用十字光标
      'pen': 'crosshair',
      'brush': 'crosshair',
      
      // 橡皮擦绘制中 - 使用十字光标
      'eraser': 'crosshair',
      
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


} 