import { CanvasEngine } from './core/CanvasEngine';
import { ToolManager, type ToolType } from './tools/ToolManager';
import { HistoryManager } from './history/HistoryManager';
import { EventManager } from './events/EventManager';
import { ShortcutManager } from './shortcuts/ShortcutManager';
import { ExportManager } from './utils/ExportManager';
import { SelectionManager } from './core/SelectionManager';
import { PerformanceManager, type PerformanceConfig, type MemoryStats } from './core/PerformanceManager';
import { DrawingHandler } from './handlers/DrawingHandler';
import { CursorHandler } from './handlers/CursorHandler';
import { StateHandler, type DrawBoardState } from './handlers/StateHandler';
import { PerformanceMode } from './tools/DrawTool';
import type { DrawAction } from './tools/DrawTool';
import type { DrawEvent } from './events/EventManager';
import type { StrokeConfig } from './tools/stroke/StrokeTypes';
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
  /** 画板背景色，默认为透明 */
  backgroundColor?: string;
  /** 是否启用触摸支持，默认为true */
  enableTouch?: boolean;
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
  // 静态单例管理
  // ============================================
  
  /** 容器到DrawBoard实例的映射，确保每个容器只有一个实例 */
  private static instances: WeakMap<HTMLElement, DrawBoard> = new WeakMap();
  
  /**
   * 获取或创建DrawBoard实例（单例模式）
   */
  public static getInstance(container: HTMLCanvasElement | HTMLDivElement, config?: Partial<DrawBoardConfig>): DrawBoard {
    const existingInstance = DrawBoard.instances.get(container);
    
    if (existingInstance) {
      console.log('✅ Returning existing DrawBoard instance for container');
      return existingInstance;
    }
    
    console.log('🔧 Creating new DrawBoard instance for container');
    const newInstance = new DrawBoard(container, config);
    DrawBoard.instances.set(container, newInstance);
    
    return newInstance;
  }
  
  /**
   * 销毁指定容器的DrawBoard实例
   */
  public static destroyInstance(container: HTMLElement): boolean {
    const instance = DrawBoard.instances.get(container);
    if (instance) {
      instance.destroy();
      DrawBoard.instances.delete(container);
      console.log('✅ DrawBoard instance destroyed and removed from registry');
      return true;
    }
    return false;
  }

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
    try {
      // 同步初始化核心组件（移除插件系统的异步复杂性）
      this.initializeCoreComponents(container, config);
      
    } catch (error) {
      console.error('DrawBoard初始化失败:', error);
      // 清理已初始化的资源
      this.safeDestroy();
      throw new Error(`DrawBoard初始化失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }




  // ============================================
  // 初始化方法
  // ============================================

  private initializeCoreComponents(container: HTMLCanvasElement | HTMLDivElement, config: DrawBoardConfig): void {
    this.canvasEngine = new CanvasEngine(container);
    
    // 直接初始化工具管理器（无需异步）
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

    // 初始化处理器
    this.initializeHandlers();

    // 绑定事件
    this.bindEvents();

    // 启用快捷键
    if (config.enableShortcuts !== false) {
      this.enableShortcuts();
    }

    console.log('=== DrawBoard 初始化完成 ===');
  }

  private initializeHandlers(): void {
    // 首先初始化状态处理器（不依赖其他处理器）
    this.stateHandler = new StateHandler(
      this.toolManager,
      this.historyManager,
      this.selectionManager,
      this.performanceManager
    );

    // 然后初始化绘制处理器（可以安全地使用stateHandler）
    this.drawingHandler = new DrawingHandler(
      this.canvasEngine,
      this.toolManager,
      this.historyManager,
      this.selectionManager,
      this.performanceManager,
      () => this.stateHandler.emitStateChange()
    );

    // 最后将drawingHandler设置给stateHandler
    this.stateHandler.setDrawingHandler(this.drawingHandler);

    // 初始化鼠标样式处理器
    const interactionCanvas = this.canvasEngine.getLayer('interaction')?.canvas;
    this.cursorHandler = new CursorHandler(this.container, interactionCanvas);
  }

  private bindEvents(): void {
    this.eventManager.on('mousedown', this.handleDrawStart.bind(this));
    this.eventManager.on('mousemove', this.handleDrawMove.bind(this));
    this.eventManager.on('mouseup', this.handleDrawEnd.bind(this));
    this.eventManager.on('touchstart', this.handleDrawStart.bind(this));
    this.eventManager.on('touchmove', this.handleDrawMove.bind(this));
    this.eventManager.on('touchend', this.handleDrawEnd.bind(this));
  }

  /**
   * 启用快捷键
   */
  private setupShortcuts(): void {
    this.shortcutManager.enable();
  }

  // ============================================
  // 配置和快捷键管理
  // ============================================

  /**
   * 启用快捷键
   */
  private enableShortcuts(): void {
    if (this.shortcutManager) {
      this.shortcutManager.enable();
      // logger.debug('快捷键已启用'); // logger is not defined in this file
    }
  }

  /**
   * 设置当前工具
   */
  public async setCurrentTool(toolType: ToolType): Promise<void> {
    await this.toolManager.setCurrentTool(toolType);
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
    // 创建一个默认的DrawEvent
    const event = {
      type: 'mouseup' as const,
      point: { x: 0, y: 0 },
      pressure: 0,
      timestamp: Date.now()
    };
    this.drawingHandler.handleDrawEnd(event);
    this.updateCursor();
  }

  // ============================================
  // 公共API - 工具管理
  // ============================================
  
  public setTool(type: ToolType): void {
    // 异步加载工具，但不阻塞调用
    this.toolManager.setCurrentTool(type).then(() => {
      this.updateCursor();
      // 🔧 工具切换只需要更新鼠标样式，不需要重绘历史记录
      console.log('✅ Tool switched to:', type);
    }).catch(error => {
      console.error('Failed to set tool:', type, error);
    });
  }

  /**
   * 异步设置工具（推荐使用）
   */
  public async setToolAsync(type: ToolType): Promise<void> {
    await this.toolManager.setCurrentTool(type);
    this.updateCursor();
    // 🔧 工具切换只需要更新鼠标样式，不需要重绘历史记录
    console.log('✅ Tool switched to:', type, '(async)');
  }

  /**
   * 初始化默认工具（同步初始化常用工具）
   */
  public async initializeDefaultTools(): Promise<void> {
    // 预加载常用工具
    await this.toolManager.setCurrentTool('pen');
    console.log('默认工具初始化完成');
  }

  public getCurrentTool(): ToolType {
    return this.toolManager.getCurrentTool();
  }
  
  public setColor(color: string): void {
    this.canvasEngine.setContext({ strokeStyle: color, fillStyle: color });
    // 颜色改变不需要重绘，只影响后续绘制
  }
  
  public setLineWidth(width: number): void {
    this.canvasEngine.setContext({ lineWidth: width });
    this.updateCursor();
    // 线宽改变不需要重绘，只影响后续绘制
  }

  // ============================================
  // 公共API - 运笔效果
  // ============================================

  public setStrokeConfig(config: Partial<StrokeConfig>): void {
    const penTool = this.toolManager.getTool('pen');
    if (penTool && 'setStrokeConfig' in penTool) {
      (penTool as { setStrokeConfig: (config: Partial<StrokeConfig>) => void }).setStrokeConfig(config);
      // 配置改变不需要重绘，只影响后续绘制
    }
  }

  public getStrokeConfig(): StrokeConfig | null {
    const penTool = this.toolManager.getTool('pen');
    if (penTool && 'getStrokeConfig' in penTool) {
      return (penTool as { getStrokeConfig: () => StrokeConfig }).getStrokeConfig();
    }
    return null;
  }

  public setStrokePreset(preset: StrokePresetType): void {
    const penTool = this.toolManager.getTool('pen');
    if (penTool && 'setPreset' in penTool) {
      (penTool as { setPreset: (preset: StrokePresetType) => void }).setPreset(preset);
      // 预设改变不需要重绘，只影响后续绘制
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

  public undo(): boolean {
    const action = this.historyManager.undo();
    if (action) {
      this.drawingHandler.forceRedraw();
      return true;
    }
    return false;
  }

  public redo(): boolean {
    const action = this.historyManager.redo();
    if (action) {
      this.drawingHandler.forceRedraw();
      return true;
    }
    return false;
  }

  public clear(): void {
    this.historyManager.clear();
    this.drawingHandler.forceRedraw();
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
    // HistoryManager移除动作的正确方法
    selectedIds.forEach(id => {
      this.historyManager.removeActionById(id);
    });
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
    const currentTool = this.toolManager.getCurrentTool();
    const lineWidth = this.canvasEngine.getContext().lineWidth;
    
    // 暂时使用false作为isDrawing状态，稍后可以改进
    this.cursorHandler.updateCursor(currentTool, false, lineWidth);
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

  public setPerformanceMode(mode: PerformanceMode): void {
    this.performanceManager.setPerformanceMode(mode);
    // 性能模式改变可能影响缓存，需要重绘历史
    this.drawingHandler.forceRedraw();
  }

  public updatePerformanceConfig(config: Partial<PerformanceConfig>): void {
    this.performanceManager.updateConfig(config);
  }

  public getPerformanceStats(): MemoryStats {
    return this.performanceManager.getMemoryStats();
  }

  public clearPerformanceCache(): void {
    this.performanceManager.clearAllCaches();
    // 清除缓存后需要重绘历史
    this.drawingHandler.forceRedraw();
  }

  public recalculateComplexity(): void {
    // 重新计算复杂度可能影响缓存策略
    this.drawingHandler.forceRedraw();
  }

  public setForceRealTimeRender(enabled: boolean = true): void {
    // 设置强制实时渲染模式
    if (this.performanceManager) {
      // 可以通过performanceManager设置强制实时渲染
      this.performanceManager.setForceRealTimeRender(enabled);
    }
    
    // 如果启用强制实时渲染，立即重绘
    if (enabled) {
      this.drawingHandler.forceRedraw();
    }
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

  /**
   * 销毁DrawBoard实例
   */
  public destroy(): void {
    // 从静态单例映射中移除实例
    if (this.container) {
      DrawBoard.instances.delete(this.container);
      console.log('✅ DrawBoard instance removed from static registry');
    }
    
    this.safeDestroy();
  }

  /**
   * 安全的销毁方法，即使部分组件未初始化也能正常执行
   */
  private safeDestroy(): void {
    try {
      this.shortcutManager?.destroy();
      this.eventManager?.destroy();
      this.performanceManager?.destroy();
      this.stateHandler?.destroy();
      this.canvasEngine?.destroy();
    } catch (error) {
      console.error('销毁资源时出错:', error);
    }
  }
} 