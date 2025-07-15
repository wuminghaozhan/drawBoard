import { CanvasEngine } from './core/CanvasEngine';
import { ToolManager, type ToolType } from './tools/ToolManager';
import { HistoryManager } from './history/HistoryManager';
import { EventManager } from './events/EventManager';
import { ShortcutManager } from './shortcuts/ShortcutManager';
import { ExportManager } from './utils/ExportManager';
import { SelectionManager } from './core/SelectionManager';
import { PerformanceManager, type PerformanceConfig } from './core/PerformanceManager';
import { DrawingHandler } from './handlers/DrawingHandler';
import { CursorHandler } from './handlers/CursorHandler';
import { StateHandler, type DrawBoardState } from './handlers/StateHandler';
import { PerformanceMode } from './tools/DrawTool';
import type { DrawAction } from './tools/DrawTool';
import type { DrawEvent } from './events/EventManager';
import type { StrokeConfig } from './tools/PenTool';
import type { StrokePresetType } from './tools/StrokePresets';

/**
 * DrawBoard 配置接口
 * 定义了画板初始化时的各种配置选项
 */
export interface DrawBoardConfig {
  /** 历史记录最大数量，默认为50 */
  maxHistorySize?: number;
  /** 是否启用快捷键，默认为true */
  enableShortcuts?: boolean;
  /** 运笔效果配置 */
  strokeConfig?: Partial<StrokeConfig>;
  /** 性能配置 */
  performanceConfig?: Partial<PerformanceConfig>;
}

/**
 * DrawBoard 主类 - Canvas画板的核心控制器
 * 
 * 这是整个画板系统的门面类，负责协调各个子系统的工作：
 * - 提供统一的公共API接口
 * - 协调各个处理器和管理器
 * - 处理初始化和配置
 * - 管理生命周期
 * 
 * 重构后的架构：
 * - DrawingHandler: 处理绘制逻辑
 * - CursorHandler: 处理鼠标样式
 * - StateHandler: 处理状态管理
 * - 各种Manager: 处理具体功能模块
 * 
 * @example
 * ```typescript
 * // 基础使用
 * const drawBoard = new DrawBoard(container);
 * 
 * // 带配置的使用
 * const drawBoard = new DrawBoard(container, {
 *   maxHistorySize: 200,
 *   enableShortcuts: true,
 *   strokeConfig: {
 *     enablePressure: true,
 *     pressureSensitivity: 0.8
 *   }
 * });
 * 
 * // 设置工具和属性
 * drawBoard.setTool('pen');
 * drawBoard.setColor('#ff0000');
 * drawBoard.setLineWidth(3);
 * 
 * // 使用预设
 * drawBoard.setStrokePreset('brush');
 * ```
 */
export class DrawBoard {
  // ============================================
  // 核心管理器实例
  // ============================================
  
  /** Canvas引擎 - 管理多层Canvas的渲染和交互 */
  private canvasEngine!: CanvasEngine;
  
  /** 工具管理器 - 管理所有绘制工具的切换和状态 */
  private toolManager!: ToolManager;
  
  /** 历史记录管理器 - 管理撤销/重做功能 */
  private historyManager!: HistoryManager;
  
  /** 事件管理器 - 处理鼠标、触摸等输入事件 */
  private eventManager!: EventManager;
  
  /** 快捷键管理器 - 管理键盘快捷键 */
  private shortcutManager!: ShortcutManager;
  
  /** 导出管理器 - 处理图像导出功能 */
  private exportManager!: ExportManager;
  
  /** 选择管理器 - 管理选择区域和选中内容 */
  private selectionManager!: SelectionManager;

  /** 性能管理器 - 管理预渲染缓存和性能优化 */
  private performanceManager!: PerformanceManager;

  // ============================================
  // 处理器实例
  // ============================================

  /** 绘制处理器 - 处理绘制相关逻辑 */
  private drawingHandler!: DrawingHandler;

  /** 鼠标样式处理器 - 处理鼠标样式管理 */
  private cursorHandler!: CursorHandler;

  /** 状态处理器 - 处理状态管理 */
  private stateHandler!: StateHandler;

  /** 容器元素引用 */
  private container!: HTMLElement;

  /**
   * 构造函数 - 初始化DrawBoard实例
   * 
   * @param container - Canvas容器元素，可以是HTMLCanvasElement或HTMLDivElement
   * @param config - 配置选项，包含历史记录大小、快捷键开关、运笔配置等
   */
  constructor(container: HTMLCanvasElement | HTMLDivElement, config: DrawBoardConfig = {}) {
    // 初始化核心组件
    this.initializeCoreComponents(container, config);
    
    // 初始化处理器
    this.initializeHandlers();
    
    // 绑定事件
    this.bindEvents();
    
    // 设置快捷键
    if (config.enableShortcuts !== false) {
      this.setupShortcuts();
    }

    // 设置初始鼠标样式
    this.updateCursor();
  }

  // ============================================
  // 初始化方法
  // ============================================

  private initializeCoreComponents(container: HTMLCanvasElement | HTMLDivElement, config: DrawBoardConfig): void {
    this.canvasEngine = new CanvasEngine(container);
    this.toolManager = new ToolManager();
    this.historyManager = new HistoryManager();
    this.selectionManager = new SelectionManager();
    this.performanceManager = new PerformanceManager(config.performanceConfig);
    
    // 保存容器元素引用
    this.container = container instanceof HTMLCanvasElement ? container : container;
    
    // 事件管理器绑定到交互层
    const interactionCanvas = this.canvasEngine.getLayer('interaction')?.canvas;
    if (!interactionCanvas) {
      console.error('交互层canvas未找到');
      this.eventManager = new EventManager(
        container instanceof HTMLCanvasElement ? container : document.createElement('canvas')
      );
    } else {
      this.eventManager = new EventManager(interactionCanvas);
    }
    
    this.shortcutManager = new ShortcutManager();
    this.exportManager = new ExportManager(this.canvasEngine.getCanvas());

    // 配置
    if (config.maxHistorySize) {
      this.historyManager.setMaxHistorySize(config.maxHistorySize);
    }

    // 配置运笔效果
    if (config.strokeConfig) {
      this.setStrokeConfig(config.strokeConfig);
    }
  }

  private initializeHandlers(): void {
    // 初始化绘制处理器
    this.drawingHandler = new DrawingHandler(
      this.canvasEngine,
      this.toolManager,
      this.historyManager,
      this.selectionManager,
      this.performanceManager,
      () => this.stateHandler?.emitStateChange()
    );

    // 初始化鼠标样式处理器
    const interactionCanvas = this.canvasEngine.getLayer('interaction')?.canvas;
    this.cursorHandler = new CursorHandler(this.container, interactionCanvas);

    // 初始化状态处理器
    this.stateHandler = new StateHandler(
      this.toolManager,
      this.historyManager,
      this.selectionManager,
      this.performanceManager,
      this.drawingHandler
    );
  }

  private bindEvents(): void {
    this.eventManager.on('mousedown', this.handleDrawStart.bind(this));
    this.eventManager.on('mousemove', this.handleDrawMove.bind(this));
    this.eventManager.on('mouseup', this.handleDrawEnd.bind(this));
    this.eventManager.on('touchstart', this.handleDrawStart.bind(this));
    this.eventManager.on('touchmove', this.handleDrawMove.bind(this));
    this.eventManager.on('touchend', this.handleDrawEnd.bind(this));
  }

  private setupShortcuts(): void {
    this.shortcutManager.register('KeyB', '画笔工具', () => this.setTool('pen'));
    this.shortcutManager.register('KeyR', '矩形工具', () => this.setTool('rect'));
    this.shortcutManager.register('KeyC', '圆形工具', () => this.setTool('circle'));
    this.shortcutManager.register('KeyT', '文字工具', () => this.setTool('text'));
    this.shortcutManager.register('KeyE', '橡皮擦', () => this.setTool('eraser'));
    this.shortcutManager.register('KeyS', '选择工具', () => this.setTool('select'));
    this.shortcutManager.register('KeyZ', '撤销', () => this.undo());
    this.shortcutManager.register('KeyY', '重做', () => this.redo());
    this.shortcutManager.register('Delete', '删除选中内容', () => this.deleteSelection());
    this.shortcutManager.register('Escape', '取消选择', () => this.clearSelection());
  }

  // ============================================
  // 事件处理
  // ============================================

  private handleDrawStart(event: DrawEvent): void {
    this.drawingHandler.handleDrawStart(event);
    this.updateCursor();
  }

  private handleDrawMove(event: DrawEvent): void {
    this.drawingHandler.handleDrawMove(event);
  }

  private handleDrawEnd(): void {
    this.drawingHandler.handleDrawEnd();
    this.updateCursor();
  }

  // ============================================
  // 公共API - 工具管理
  // ============================================
  
  public setTool(tool: ToolType): void {
    this.toolManager.setCurrentTool(tool);
    
    // 清除当前动作和交互层
    this.drawingHandler.clearCurrentAction();
    
    // 如果切换到非选择工具，清除选择
    if (tool !== 'select') {
      this.clearSelection();
    }

    // 更新鼠标样式
    this.updateCursor();
  }

  public getCurrentTool(): ToolType {
    return this.toolManager.getCurrentToolType();
  }
  
  public setColor(color: string): void {
    this.canvasEngine.setContext({ strokeStyle: color, fillStyle: color });
  }
  
  public setLineWidth(width: number): void {
    this.canvasEngine.setContext({ lineWidth: width });
    // 更新鼠标样式以反映新的线宽
    this.updateCursor();
  }

  // ============================================
  // 公共API - 运笔效果
  // ============================================

  public setStrokeConfig(config: Partial<StrokeConfig>): void {
    const penTool = this.toolManager.getTool('pen');
    if (penTool && 'setStrokeConfig' in penTool) {
      (penTool as { setStrokeConfig: (config: Partial<StrokeConfig>) => void }).setStrokeConfig(config);
    }
  }

  public getStrokeConfig(): StrokeConfig | null {
    const penTool = this.toolManager.getTool('pen');
    if (penTool && 'getStrokeConfig' in penTool) {
      return (penTool as { getStrokeConfig: () => StrokeConfig }).getStrokeConfig();
    }
    return null;
  }

  public setStrokePreset(presetType: StrokePresetType): void {
    const penTool = this.toolManager.getTool('pen');
    if (penTool && 'setPreset' in penTool) {
      (penTool as { setPreset: (presetType: StrokePresetType) => void }).setPreset(presetType);
    }
  }

  public getCurrentStrokePreset(): StrokePresetType | null {
    const penTool = this.toolManager.getTool('pen');
    if (penTool && 'getCurrentPreset' in penTool) {
      return (penTool as { getCurrentPreset: () => StrokePresetType | null }).getCurrentPreset();
    }
    return null;
  }

  // ============================================
  // 公共API - 历史记录管理
  // ============================================

  public undo(): void {
    this.historyManager.undo();
    this.drawingHandler.forceRedraw();
  }

  public redo(): void {
    this.historyManager.redo();
    this.drawingHandler.forceRedraw();
  }

  public clear(): void {
    this.historyManager.clear();
    this.canvasEngine.clear();
    this.canvasEngine.clear('interaction');
  }

  public canUndo(): boolean {
    return this.historyManager.canUndo();
  }

  public canRedo(): boolean {
    return this.historyManager.canRedo();
  }

  // ============================================
  // 公共API - 选择操作
  // ============================================

  public clearSelection(): void {
    this.selectionManager.clearSelection();
    this.drawingHandler.forceRedraw();
    this.updateCursor();
  }

  public deleteSelection(): void {
    if (!this.selectionManager.hasSelection()) return;
    
    const selectedIds = this.selectionManager.getSelectedActionIdsForDeletion();
    this.historyManager.removeActions(selectedIds);
    this.selectionManager.clearSelection();
    this.drawingHandler.forceRedraw();
  }

  public copySelection(): DrawAction[] {
    if (!this.selectionManager.hasSelection()) return [];
    return this.selectionManager.copySelectedActions();
  }

  public hasSelection(): boolean {
    return this.selectionManager.hasSelection();
  }

  public getSelectedActions(): DrawAction[] {
    return this.selectionManager.getSelectedActions().map(item => item.action);
  }

  // ============================================
  // 公共API - 鼠标样式
  // ============================================

  public setCursor(cursor: string): void {
    this.cursorHandler.setCursor(cursor);
  }

  private updateCursor(): void {
    const currentTool = this.toolManager.getCurrentToolType();
    const drawingState = this.drawingHandler.getDrawingState();
    const currentLineWidth = this.canvasEngine.getContext().lineWidth;
    
    this.cursorHandler.updateCursor(currentTool, drawingState.isDrawing, currentLineWidth);
  }

  // ============================================
  // 公共API - 状态管理
  // ============================================

  public getState(): DrawBoardState {
    return this.stateHandler.getState();
  }

  public onStateChange(callback: (state: DrawBoardState) => void): () => void {
    return this.stateHandler.onStateChange(callback);
  }

  // ============================================
  // 公共API - 布局和显示
  // ============================================
  
  public resize(): void {
    this.canvasEngine.resize();
    this.drawingHandler.forceRedraw();
  }

  public showGrid(show: boolean = true, gridSize: number = 20): void {
    if (show) {
      this.canvasEngine.drawGrid(gridSize);
    } else {
      this.canvasEngine.clear('background');
    }
  }

  public setLayerVisible(layerName: string, visible: boolean): void {
    this.canvasEngine.setLayerVisible(layerName, visible);
  }

  public getLayerContext(layerName: string): CanvasRenderingContext2D | null {
    const layer = this.canvasEngine.getLayer(layerName);
    return layer?.ctx || null;
  }

  // ============================================
  // 公共API - 导出功能
  // ============================================

  public saveAsImage(filename?: string): void {
    this.exportManager.saveAsImage(filename);
  }

  public saveAsJPEG(filename?: string, quality?: number): void {
    this.exportManager.saveAsJPEG(filename, quality);
  }

  public copyToClipboard(): Promise<boolean> {
    return this.exportManager.copyToClipboard();
  }

  public getDataURL(type?: string, quality?: number): string {
    return this.exportManager.getDataURL(type, quality);
  }

  // ============================================
  // 公共API - 性能管理
  // ============================================

  public setPerformanceMode(mode: 'auto' | 'high_performance' | 'low_memory' | 'balanced'): void {
    this.performanceManager.setPerformanceMode(mode as PerformanceMode);
  }

  public updatePerformanceConfig(config: Partial<PerformanceConfig>): void {
    this.performanceManager.updateConfig(config);
  }

  public getPerformanceStats() {
    return this.performanceManager.getMemoryStats();
  }

  public clearPerformanceCache(): void {
    this.performanceManager.clearAllCaches();
  }

  public recalculateComplexity(): void {
    const history = this.historyManager.getHistory();
    history.forEach(action => {
      action.complexityScore = undefined;
      action.preRenderedCache = undefined;
    });
    this.drawingHandler.forceRedraw();
  }

  public setForceRealTimeRender(enabled: boolean): void {
    const history = this.historyManager.getHistory();
    history.forEach(action => {
      action.forceRealTimeRender = enabled;
    });
    this.drawingHandler.forceRedraw();
  }

  // ============================================
  // 公共API - 其他工具函数
  // ============================================

  public getHistory(): DrawAction[] {
    return this.historyManager.getHistory();
  }

  public getToolNames(): Array<{ type: ToolType; name: string }> {
    return this.toolManager.getToolNames();
  }

  public getShortcuts(): Array<{ key: string; description: string }> {
    return this.shortcutManager.getShortcuts().map(s => ({
      key: s.key,
      description: s.description
    }));
  }

  // ============================================
  // 生命周期管理
  // ============================================

  public destroy(): void {
    this.shortcutManager.destroy();
    this.eventManager.destroy();
    this.performanceManager.clearAllCaches();
    this.stateHandler.destroy();
  }
} 