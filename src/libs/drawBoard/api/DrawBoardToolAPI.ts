import type { ToolType } from '../tools/DrawTool';
import type { StrokeConfig } from '../tools/stroke/StrokeTypes';
import type { StrokePresetType } from '../tools/StrokePresets';
import type { ToolManager } from '../tools/ToolManager';
import type { CanvasEngine } from '../core/CanvasEngine';
import type { ComplexityManager } from '../core/ComplexityManager';
import { logger } from '../infrastructure/logging/Logger';
import { ToolTypeGuards } from '../tools/ToolInterfaces';

/**
 * DrawBoard 工具管理 API
 * 
 * 封装所有工具相关的操作，包括：
 * - 工具切换和预加载
 * - 工具元数据查询
 * - 颜色和线宽设置
 * - 运笔效果配置
 * 
 * 通过组合模式，将工具相关的逻辑从 DrawBoard 主类中分离出来
 */
export class DrawBoardToolAPI {
  private toolManager: ToolManager;
  private canvasEngine: CanvasEngine;
  private syncLayerDataToSelectTool: () => void;
  private checkComplexityRecalculation: () => Promise<void>;
  private updateCursor: () => void;
  private forceRedraw: () => Promise<void>;
  private markNeedsClearSelectionUI?: () => void; // 标记需要清除选择UI

  constructor(
    toolManager: ToolManager,
    canvasEngine: CanvasEngine,
    _complexityManager: ComplexityManager, // 保留参数用于将来扩展
    syncLayerDataToSelectTool: () => void,
    checkComplexityRecalculation: () => Promise<void>,
    updateCursor: () => void,
    forceRedraw: () => Promise<void>,
    markNeedsClearSelectionUI?: () => void
  ) {
    this.toolManager = toolManager;
    this.canvasEngine = canvasEngine;
    this.syncLayerDataToSelectTool = syncLayerDataToSelectTool;
    this.checkComplexityRecalculation = checkComplexityRecalculation;
    this.updateCursor = updateCursor;
    this.forceRedraw = forceRedraw;
    this.markNeedsClearSelectionUI = markNeedsClearSelectionUI;
  }

  /**
   * 设置当前工具（异步版本，支持重量级工具）
   * @param toolType 工具类型
   */
  public async setTool(toolType: ToolType): Promise<void> {
    logger.debug('DrawBoardToolAPI.setTool: 开始切换工具', {
      toolType,
      currentTool: this.toolManager.getCurrentTool()
    });
    
    // 如果从select工具切换到其他工具，清除选择状态和UI
    const currentTool = this.toolManager.getCurrentTool();
    if (currentTool === 'select' && toolType !== 'select') {
      logger.info('DrawBoardToolAPI.setTool: 从select工具切换到其他工具，清除选择状态和UI', {
        fromTool: currentTool,
        toTool: toolType
      });
      
      // 先获取select工具实例并清除选择状态（在切换工具之前）
      const selectTool = this.toolManager.getCurrentToolInstance();
      if (selectTool && ToolTypeGuards.isSelectTool(selectTool)) {
        // 清除选择状态
        selectTool.clearSelection();
        logger.debug('DrawBoardToolAPI.setTool: 已清除选择状态', {
          selectedActionsCountBefore: selectTool.getSelectedActions().length
        });
      }
      
      // 先切换工具，然后触发重绘以清除选择工具的UI（选区和锚点）
      // 注意：需要在切换工具后重绘，这样drawSelectToolUI才能检测到工具不是select并清除UI
    }
    
    // 如果切换到select工具，先清理之前的绘制状态
    if (toolType === 'select') {
      // 清理DrawingHandler的绘制状态，避免isDrawing标志导致的问题
      // 注意：这里需要访问DrawingHandler，但DrawBoardToolAPI没有直接引用
      // 所以我们需要通过其他方式清理，或者让DrawBoard来处理
      logger.debug('DrawBoardToolAPI.setTool: 切换到选择工具，将在DrawBoard中清理绘制状态');
    }
    
    await this.toolManager.setCurrentTool(toolType);
    
    logger.debug('DrawBoardToolAPI.setTool: 工具已切换', {
      toolType,
      newTool: this.toolManager?.getCurrentTool(),
      toolInstance: !!this.toolManager?.getCurrentToolInstance()
    });
    
    // 如果从select工具切换到其他工具，立即清除选择UI并触发重绘
    if (currentTool === 'select' && toolType !== 'select') {
      // 【修复】直接触发重绘来清除选区UI，而不是只标记
      // 否则选区会一直保留直到下次完整重绘
      if (this.markNeedsClearSelectionUI) {
        this.markNeedsClearSelectionUI();
      }
      await this.forceRedraw();
      logger.debug('DrawBoardToolAPI.setTool: 已触发重绘以清除选择UI', {
        previousTool: currentTool,
        newTool: toolType
      });
    }
    
    // 切换到选择工具时，同步图层数据
    if (toolType === 'select') {
      logger.info('DrawBoardToolAPI.setTool: 切换到选择工具，同步图层数据');
      this.syncLayerDataToSelectTool();
      
      // 验证interaction层是否可访问
      const interactionLayer = this.canvasEngine.getLayer('interaction');
      if (interactionLayer) {
        const computedStyle = getComputedStyle(interactionLayer.canvas);
        logger.info('DrawBoardToolAPI.setTool: 验证interaction层状态', {
          pointerEvents: computedStyle.pointerEvents,
          zIndex: computedStyle.zIndex,
          display: computedStyle.display,
          visibility: computedStyle.visibility,
          width: interactionLayer.canvas.width,
          height: interactionLayer.canvas.height,
          offsetWidth: interactionLayer.canvas.offsetWidth,
          offsetHeight: interactionLayer.canvas.offsetHeight
        });
        
        // 测试：直接添加一个测试事件监听器，验证canvas是否可以接收事件
        const testHandler = () => {
          logger.info('✅ 测试事件监听器被触发！说明canvas可以接收事件');
        };
        interactionLayer.canvas.addEventListener('mousedown', testHandler, { once: true });
        logger.info('DrawBoardToolAPI.setTool: 已添加测试事件监听器，点击canvas应该看到测试日志');
        
        // 检查是否有其他图层遮挡interaction层
        const container = interactionLayer.canvas.parentElement;
        if (container) {
          const allCanvases = Array.from(container.querySelectorAll('canvas'));
          logger.info('DrawBoardToolAPI.setTool: 检查所有canvas元素', {
            totalCanvases: allCanvases.length,
            canvases: allCanvases.map(c => ({
              zIndex: getComputedStyle(c).zIndex,
              pointerEvents: getComputedStyle(c).pointerEvents,
              layerName: c.getAttribute('layer-name'),
              width: c.width,
              height: c.height,
              offsetWidth: c.offsetWidth,
              offsetHeight: c.offsetHeight
            }))
          });
          
          const canvasesAboveInteraction = allCanvases.filter(canvas => {
            const zIndex = parseFloat(getComputedStyle(canvas).zIndex);
            const pointerEvents = getComputedStyle(canvas).pointerEvents;
            return zIndex > 1000 && pointerEvents !== 'none';
          });
          
          if (canvasesAboveInteraction.length > 0) {
            logger.warn('⚠️ 发现可能遮挡interaction层的canvas元素', {
              count: canvasesAboveInteraction.length,
              canvases: canvasesAboveInteraction.map(c => ({
                zIndex: getComputedStyle(c).zIndex,
                pointerEvents: getComputedStyle(c).pointerEvents,
                layerName: c.getAttribute('layer-name')
              }))
            });
          } else {
            logger.info('✅ 没有发现遮挡interaction层的canvas元素');
          }
        } else {
          logger.warn('⚠️ 无法找到interaction层的父容器');
        }
      } else {
        logger.error('❌ 无法获取interaction层！');
      }
    }
    
    // 切换到复杂工具时检查复杂度
    if (['brush', 'pen'].includes(toolType)) {
      await this.checkComplexityRecalculation();
    }
    
    this.updateCursor();
    logger.debug('DrawBoardToolAPI.setTool: 工具切换完成', { toolType });
  }

  /**
   * 初始化默认工具（异步初始化常用工具）
   */
  public async initializeDefaultTools(): Promise<void> {
    // 预加载常用工具
    await this.toolManager.setCurrentTool('pen');
    logger.info('默认工具初始化完成');
  }

  /**
   * 预加载工具（后台加载，不阻塞UI）
   */
  public async preloadTool(type: ToolType): Promise<void> {
    await this.toolManager.preloadTool(type);
  }

  /**
   * 预加载多个工具
   */
  public async preloadTools(types: ToolType[]): Promise<void> {
    await this.toolManager.preloadTools(types);
  }

  /**
   * 获取工具加载状态
   * @returns 工具加载状态('idle' | 'loading' | 'ready' | 'error')
   */
  public getToolLoadingState(): 'idle' | 'loading' | 'ready' | 'error' {
    return this.toolManager.getLoadingState();
  }

  /**
   * 获取工具元数据
   */
  public getToolMetadata(type: ToolType) {
    return this.toolManager.getToolMetadata(type);
  }

  /**
   * 获取当前工具
   */
  public getCurrentTool(): ToolType {
    return this.toolManager.getCurrentTool();
  }

  /**
   * 获取工具名称列表
   */
  public getToolNames(): Array<{ type: ToolType; name: string }> {
    return this.toolManager.getToolNames();
  }
  
  /**
   * 验证颜色格式
   */
  private validateColor(color: string): boolean {
    // 支持格式: #RRGGBB, #RGB, rgb(r,g,b), rgba(r,g,b,a), 颜色名称
    const hexPattern = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
    const rgbPattern = /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)$/;
    const colorNamePattern = /^[a-zA-Z]+$/;
    
    return hexPattern.test(color) || rgbPattern.test(color) || colorNamePattern.test(color);
  }

  /**
   * 设置颜色
   * @param color 颜色（支持 #RRGGBB, #RGB, rgb(), rgba(), 颜色名称）
   */
  public setColor(color: string): void {
    if (!color || typeof color !== 'string') {
      logger.warn('颜色值无效', { color });
      return;
    }
    
    // 验证颜色格式
    if (!this.validateColor(color)) {
      logger.warn('颜色格式无效，支持格式: #RRGGBB, #RGB, rgb(), rgba(), 颜色名称', { color });
      return;
    }
    
    this.canvasEngine.setContext({ strokeStyle: color, fillStyle: color });
    // 颜色改变不需要重绘，只影响后续绘制
  }
  
  /**
   * 设置线宽
   * @param width 线宽（像素，建议范围 1-100）
   */
  public setLineWidth(width: number): void {
    if (!isFinite(width) || width <= 0) {
      logger.warn('线宽值无效，应为正数', { width });
      return;
    }
    
    // 限制线宽范围（防止过大值导致性能问题）
    const clampedWidth = Math.max(1, Math.min(100, width));
    if (clampedWidth !== width) {
      logger.warn('线宽超出建议范围 (1-100)，已自动调整', { original: width, clamped: clampedWidth });
    }
    
    this.canvasEngine.setContext({ lineWidth: clampedWidth });
    this.updateCursor();
    // 线宽改变不需要重绘，只影响后续绘制
  }

  // ============================================
  // 运笔效果
  // ============================================

  /**
   * 设置运笔效果配置
   * @param config 运笔效果配置
   */
  public async setStrokeConfig(config: Partial<StrokeConfig>): Promise<void> {
    try {
      const penTool = await this.toolManager.getTool('pen');
      if (penTool && ToolTypeGuards.isPenTool(penTool)) {
        penTool.setStrokeConfig(config);
        // 配置改变不需要重绘，只影响后续绘制
      } else {
        logger.warn('当前工具不是笔刷工具，无法设置运笔配置');
      }
    } catch (error) {
      logger.error('设置运笔配置失败', { config, error });
      throw error;
    }
  }

  /**
   * 获取运笔效果配置
   * @returns 运笔效果配置或null
   */
  public async getStrokeConfig(): Promise<StrokeConfig | null> {
    try {
      const penTool = await this.toolManager.getTool('pen');
      if (penTool && ToolTypeGuards.isPenTool(penTool)) {
        return penTool.getStrokeConfig();
      }
      return null;
    } catch (error) {
      logger.error('获取运笔配置失败', { error });
      return null;
    }
  }

  /**
   * 设置运笔预设
   * @param preset 运笔预设
   */
  public async setStrokePreset(preset: StrokePresetType): Promise<void> {
    try {
      const penTool = await this.toolManager.getTool('pen');
      if (penTool && ToolTypeGuards.isPenTool(penTool)) {
        penTool.setPreset(preset);
        // 预设改变不需要重绘，只影响后续绘制
      } else {
        logger.warn('当前工具不是笔刷工具，无法设置运笔预设');
      }
    } catch (error) {
      logger.error('设置运笔预设失败', { preset, error });
      throw error;
    }
  }

  /**
   * 获取当前笔刷预设
   * @returns 当前笔刷预设类型或null
   */
  public async getCurrentStrokePreset(): Promise<StrokePresetType | null> {
    try {
      const penTool = await this.toolManager.getTool('pen');
      if (penTool && ToolTypeGuards.isPenTool(penTool)) {
        return penTool.getCurrentPreset();
      }
      return null;
    } catch (error) {
      logger.error('获取当前笔刷预设失败', { error });
      return null;
    }
  }

  // ============================================
  // 文字工具相关方法
  // ============================================

  /**
   * 初始化文字工具的编辑管理器
   * @param container 容器元素
   */
  public async initializeTextToolEditing(container: HTMLElement): Promise<void> {
    try {
      logger.info('DrawBoardToolAPI.initializeTextToolEditing: 开始初始化', {
        hasContainer: !!container,
        containerTag: container?.tagName
      });
      
      const textTool = await this.toolManager.getTool('text');
      logger.debug('获取到 textTool', { 
        hasTextTool: !!textTool, 
        isTextTool: textTool ? ToolTypeGuards.isTextTool(textTool) : false 
      });
      
      if (textTool && ToolTypeGuards.isTextTool(textTool)) {
        // 使用 getLayer 方法获取 interaction 层的 canvas
        const interactionLayer = this.canvasEngine.getLayer('interaction');
        const canvas = interactionLayer?.canvas || this.canvasEngine.getCanvas();
        logger.debug('获取到 canvas', { 
          hasCanvas: !!canvas,
          layerName: interactionLayer ? 'interaction' : 'draw (fallback)',
          canvasSize: canvas ? { width: canvas.width, height: canvas.height } : null
        });
        
        textTool.initEditingManager(container, canvas);
        logger.info('文字工具编辑管理器已初始化');
      } else {
        logger.warn('无法获取文字工具实例或不符合 TextTool 接口');
      }
    } catch (error) {
      logger.error('初始化文字工具编辑管理器失败', { error });
    }
  }

  /**
   * 开始文字编辑（新建文字）
   * @param position 文字位置
   * @param options 文字选项
   */
  public async startTextEditing(position: { x: number; y: number }, options?: {
    fontSize?: number;
    fontFamily?: string;
    color?: string;
  }): Promise<void> {
    try {
      logger.info('DrawBoardToolAPI.startTextEditing: 开始文字编辑', { position, options });
      
      const textTool = await this.toolManager.getTool('text');
      if (textTool && ToolTypeGuards.isTextTool(textTool)) {
        textTool.startEditing(position, options);
        logger.debug('文字编辑已开始');
      } else {
        logger.warn('无法获取文字工具实例或不符合 TextTool 接口');
      }
    } catch (error) {
      logger.error('开始文字编辑失败', { error });
    }
  }

  /**
   * 完成文字编辑
   */
  public async finishTextEditing(): Promise<void> {
    try {
      const textTool = await this.toolManager.getTool('text');
      if (textTool && ToolTypeGuards.isTextTool(textTool)) {
        textTool.finishEditing();
      }
    } catch (error) {
      logger.error('完成文字编辑失败', { error });
    }
  }

  /**
   * 取消文字编辑
   */
  public async cancelTextEditing(): Promise<void> {
    try {
      const textTool = await this.toolManager.getTool('text');
      if (textTool && ToolTypeGuards.isTextTool(textTool)) {
        textTool.cancelEditing();
      }
    } catch (error) {
      logger.error('取消文字编辑失败', { error });
    }
  }

  /**
   * 检查文字工具是否正在编辑
   */
  public async isTextEditing(): Promise<boolean> {
    try {
      const textTool = await this.toolManager.getTool('text');
      if (textTool && ToolTypeGuards.isTextTool(textTool)) {
        return textTool.isEditing();
      }
      return false;
    } catch (error) {
      logger.error('检查文字编辑状态失败', { error });
      return false;
    }
  }

  /**
   * 设置文字工具的字体大小
   */
  public async setTextFontSize(size: number): Promise<void> {
    try {
      const textTool = await this.toolManager.getTool('text');
      if (textTool && ToolTypeGuards.isTextTool(textTool)) {
        textTool.setFontSize(size);
      }
    } catch (error) {
      logger.error('设置文字字体大小失败', { error });
    }
  }

  /**
   * 设置文字工具的字体
   */
  public async setTextFontFamily(family: string): Promise<void> {
    try {
      const textTool = await this.toolManager.getTool('text');
      if (textTool && ToolTypeGuards.isTextTool(textTool)) {
        textTool.setFontFamily(family);
      }
    } catch (error) {
      logger.error('设置文字字体失败', { error });
    }
  }

  /**
   * 设置文字颜色
   */
  public async setTextColor(color: string): Promise<void> {
    try {
      const textTool = await this.toolManager.getTool('text');
      if (textTool && ToolTypeGuards.isTextTool(textTool)) {
        textTool.setTextColor(color);
      }
    } catch (error) {
      logger.error('设置文字颜色失败', { error });
    }
  }
}

