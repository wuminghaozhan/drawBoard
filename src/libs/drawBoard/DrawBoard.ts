import { CanvasEngine } from './core/CanvasEngine';
import { ToolManager, type ToolType } from './tools/ToolManager';
import { HistoryManager } from './history/HistoryManager';
import { EventManager } from './events/EventManager';
import { ShortcutManager } from './shortcuts/ShortcutManager';
import { ExportManager } from './utils/ExportManager';
import { SelectionManager } from './core/SelectionManager';
import { PerformanceManager, type PerformanceConfig } from './core/PerformanceManager';
import { PerformanceMode } from './tools/DrawTool';
import type { DrawAction } from './tools/DrawTool';
import type { TextAction } from './tools/TextTool';
import type { DrawEvent } from './events/EventManager';
import type { SelectionBox } from './core/SelectionManager';
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
 * 这是整个画板系统的核心类，负责协调各个子系统的工作：
 * - Canvas引擎：管理多层Canvas的渲染
 * - 工具管理器：处理不同绘制工具的切换和使用
 * - 历史管理器：处理撤销/重做功能
 * - 事件管理器：处理用户输入事件
 * - 快捷键管理器：处理键盘快捷键
 * - 导出管理器：处理图像导出功能
 * - 选择管理器：处理选择和操作功能
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
  private canvasEngine: CanvasEngine;
  
  /** 工具管理器 - 管理所有绘制工具的切换和状态 */
  private toolManager: ToolManager;
  
  /** 历史记录管理器 - 管理撤销/重做功能 */
  private historyManager: HistoryManager;
  
  /** 事件管理器 - 处理鼠标、触摸等输入事件 */
  private eventManager: EventManager;
  
  /** 快捷键管理器 - 管理键盘快捷键 */
  private shortcutManager: ShortcutManager;
  
  /** 导出管理器 - 处理图像导出功能 */
  private exportManager: ExportManager;
  
  /** 选择管理器 - 管理选择区域和选中内容 */
  private selectionManager: SelectionManager;

  /** 性能管理器 - 管理预渲染缓存和性能优化 */
  private performanceManager: PerformanceManager;
  
  // ============================================
  // 绘制状态管理
  // ============================================
  
  /** 当前正在进行的绘制动作 */
  private currentAction: DrawAction | null = null;
  
  /** 是否正在绘制中 */
  private isDrawing: boolean = false;
  
  /** 是否需要重绘 */
  private needsRedraw: boolean = false;
  
  /** 是否正在选择中 */
  private isSelecting: boolean = false;

  /**
   * 构造函数 - 初始化DrawBoard实例
   * 
   * @param container - Canvas容器元素，可以是HTMLCanvasElement或HTMLDivElement
   * @param config - 配置选项，包含历史记录大小、快捷键开关、运笔配置等
   * 
   * @example
   * ```typescript
   * // 使用Canvas元素
   * const canvas = document.getElementById('canvas') as HTMLCanvasElement;
   * const drawBoard = new DrawBoard(canvas);
   * 
   * // 使用Div容器（会自动创建Canvas）
   * const container = document.getElementById('container') as HTMLDivElement;
   * const drawBoard = new DrawBoard(container, {
   *   maxHistorySize: 150,
   *   enableShortcuts: true
   * });
   * ```
   */
  constructor(container: HTMLCanvasElement | HTMLDivElement, config: DrawBoardConfig = {}) {
    this.canvasEngine = new CanvasEngine(container);
    this.toolManager = new ToolManager();
    this.historyManager = new HistoryManager();
    this.selectionManager = new SelectionManager();
    this.performanceManager = new PerformanceManager(config.performanceConfig);
    
    // 事件管理器绑定到交互层
    const interactionCanvas = this.canvasEngine.getLayer('interaction')?.canvas;
    if (!interactionCanvas) {
      console.error('交互层canvas未找到');
      // 使用原始canvas作为fallback
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

    // 绑定事件
    this.bindEvents();
    
    // 设置快捷键
    if (config.enableShortcuts !== false) {
      this.setupShortcuts();
    }
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
    // 注意：保存功能可以通过工具面板按钮或 Ctrl+S 实现
  }

  private handleDrawStart(event: DrawEvent): void {
    this.isDrawing = true;
    this.startAction(event.point);
  }

  private handleDrawMove(event: DrawEvent): void {
    if (!this.isDrawing) return;
    
    const toolType = this.toolManager.getCurrentToolType();
    
    // 文字工具不需要移动事件
    if (toolType === 'text') return;
    
    this.updateAction(event.point);
    this.scheduleRedraw();
  }

  private handleDrawEnd(): void {
    if (this.isDrawing && this.currentAction) {
      this.finishAction();
    }
    this.isDrawing = false;
    // 不需要在这里调用performRedraw，因为finishAction已经处理了重绘
  }

  private startAction(point: { x: number; y: number }): void {
    const currentTool = this.toolManager.getCurrentTool();
    if (!currentTool) {
      console.warn('当前工具未找到');
      return;
    }

    // 检查工具类型
    const toolType = this.toolManager.getCurrentToolType();
    console.log('开始绘制动作:', toolType, point);
    
    // 选择工具特殊处理
    if (toolType === 'select') {
      this.isSelecting = true;
      // 清除之前的选择
      this.selectionManager.clearSelection();
      this.performRedraw();
    }
    
    // 文字工具需要特殊处理
    if (toolType === 'text') {
      this.handleTextInput(point);
      return;
    }
    
    // 创建动作，添加时间戳
    const timestamp = Date.now();
    this.currentAction = {
      id: timestamp.toString(),
      type: toolType,
      points: [{ ...point, timestamp }],
      context: this.canvasEngine.getContext(),
      timestamp
    };
    
    console.log('创建动作:', this.currentAction);
  }

  private handleTextInput(point: { x: number; y: number }): void {
    const text = prompt('请输入文字：', '文字');
    if (text !== null) {
      this.currentAction = {
        id: Date.now().toString(),
        type: 'text',
        points: [point],
        context: this.canvasEngine.getContext(),
        timestamp: Date.now(),
        text: text,
        // 添加更多文字配置选项
        fontSize: 16,
        fontFamily: 'Arial',
        textAlign: 'left' as CanvasTextAlign,
        textBaseline: 'top' as CanvasTextBaseline
      } as TextAction;
      this.finishAction();
    }
  }

  private updateAction(point: { x: number; y: number }): void {
    if (this.currentAction) {
      const toolType = this.toolManager.getCurrentToolType();
      
      // 文字工具不需要移动事件，选择工具需要收集点
      if (toolType === 'text') {
        // 文字工具不收集移动点
        return;
      } else if (toolType === 'select') {
        // 选择工具需要至少两个点
        if (this.currentAction.points.length === 1) {
          this.currentAction.points.push({ ...point, timestamp: Date.now() });
        } else {
          // 更新最后一个点
          this.currentAction.points[this.currentAction.points.length - 1] = { ...point, timestamp: Date.now() };
        }
      } else {
        // 其他工具正常收集点，添加时间戳
        this.currentAction.points.push({ ...point, timestamp: Date.now() });
      }
      
      // 实时更新交互层显示
      this.updateInteractionLayer();
    }
  }

  private updateInteractionLayer(): void {
    if (this.currentAction) {
      // 清除交互层
      this.canvasEngine.clear('interaction');
      // 绘制当前操作到交互层
      this.drawAction(this.currentAction, 'interaction');
    }
  }

  private finishAction(): void {
    if (this.currentAction) {
      const toolType = this.toolManager.getCurrentToolType();
      
      // 选择工具特殊处理
      if (toolType === 'select' && this.isSelecting) {
        this.handleSelectionFinish();
        return;
      }
      
      console.log('=== 完成绘制动作 ===', this.currentAction);
      this.historyManager.addAction(this.currentAction);
      this.currentAction = null;
      
      // 清除交互层
      this.canvasEngine.clear('interaction');
      
      // 强制重绘绘制层，显示新添加的历史记录
      console.log('=== 强制重绘 ===');
      this.needsRedraw = true;
      this.performRedraw();
      
      // 触发状态更新事件
      this.emitStateChange();
    }
  }

  private handleSelectionFinish(): void {
    if (!this.currentAction || this.currentAction.points.length < 2) {
      this.isSelecting = false;
      this.currentAction = null;
      this.canvasEngine.clear('interaction');
      return;
    }

    // 计算选择框
    const start = this.currentAction.points[0];
    const end = this.currentAction.points[this.currentAction.points.length - 1];
    const selectionBox: SelectionBox = {
      left: Math.min(start.x, end.x),
      top: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y)
    };

    // 检测选择
    const history = this.historyManager.getHistory();
    const selectedIds = this.selectionManager.detectSelection(selectionBox, history);
    
    console.log('选择检测结果:', selectedIds.length, '个动作被选中');
    
    // 更新选择动作（在DrawBoard中管理选择框信息）
    this.currentAction.selected = selectedIds.length > 0;
    this.currentAction.selectedActions = selectedIds;
    this.currentAction.selectionBox = selectionBox;
    
    // 设置选择框到选择管理器
    this.selectionManager.setSelectionBox(selectionBox);
    
    this.isSelecting = false;
    this.currentAction = null;
    
    // 重绘显示选择结果
    this.performRedraw();
  }

  private emitStateChange(): void {
    // 可以在这里添加状态变化事件，供外部监听
    // const state = this.getState();
    // 这里可以触发自定义事件或回调
  }

  private scheduleRedraw(): void {
    if (!this.needsRedraw) {
      this.needsRedraw = true;
      requestAnimationFrame(() => {
        this.performRedraw();
      });
    }
  }

  private performRedraw(): void {
    if (!this.needsRedraw) return;
    console.log('=== 执行重绘 ===');
    
    // 先清空交互层，避免残影
    this.canvasEngine.clear('interaction');
    // 清除绘制层
    this.canvasEngine.clear('draw');
    
    // 重绘历史记录到绘制层 - 支持预渲染缓存优化
    const history = this.historyManager.getHistory();
    console.log('=== 重绘历史记录 ===', history.length, '个动作');
    
    const drawCtx = this.canvasEngine.getDrawLayer();
    const canvas = drawCtx.canvas;
    
    history.forEach(action => {
      // 尝试使用预渲染缓存
      if (this.performanceManager.shouldUseCache(action)) {
        console.log('使用缓存绘制:', action.id);
        this.performanceManager.drawFromCache(drawCtx, action);
      } else {
        console.log('实时绘制:', action.id);
        this.drawAction(action, 'draw');
        
        // 绘制完成后，检查是否应该创建缓存
        if (this.performanceManager.shouldCache(action)) {
          console.log('创建缓存:', action.id);
          const cache = this.performanceManager.createCache(action, canvas);
          if (cache) {
            action.preRenderedCache = cache;
          }
        }
      }
    });
    
    // 绘制当前操作到交互层
    if (this.currentAction) {
      console.log('=== 绘制当前操作到交互层 ===');
      this.drawAction(this.currentAction, 'interaction');
    }
    
    // 绘制选择手柄
    this.drawSelectionHandles();
    
    this.needsRedraw = false;
  }

  private drawSelectionHandles(): void {
    if (!this.selectionManager.hasSelection()) return;
    
    const ctx = this.canvasEngine.getInteractionLayer();
    this.selectionManager.drawHandles(ctx);
  }

  private drawAction(action: DrawAction, layerName: string = 'draw'): void {
    try {
      // 获取指定层的上下文
      let ctx: CanvasRenderingContext2D;
      if (layerName === 'draw') {
        ctx = this.canvasEngine.getDrawLayer();
      } else if (layerName === 'interaction') {
        ctx = this.canvasEngine.getInteractionLayer();
      } else {
        ctx = this.canvasEngine.getContext2D();
      }
      
      // 检查canvas尺寸
      const canvas = ctx.canvas;
      console.log(`绘制到${layerName}层, canvas尺寸:`, canvas.width, 'x', canvas.height);
      console.log(`canvas样式尺寸:`, canvas.style.width, 'x', canvas.style.height);
      
      // 检查第一个点的坐标
      if (action.points.length > 0) {
        const firstPoint = action.points[0];
        console.log(`第一个点坐标:`, firstPoint.x, firstPoint.y);
      }
      
      // 修复工具类型映射
      const toolType = action.type as ToolType;
      const currentTool = this.toolManager.getTool(toolType);
      if (currentTool) {
        console.log('绘制动作:', toolType, action.points.length, '个点');
        currentTool.draw(ctx, action);
      } else {
        console.warn('未找到工具:', toolType);
      }
    } catch (error) {
      console.error('绘制动作失败:', error);
    }
  }

  // 公共 API
  public setTool(tool: ToolType): void {
    this.toolManager.setCurrentTool(tool);
    // 切换工具时，重置当前操作并清空交互层
    this.currentAction = null;
    this.canvasEngine.clear('interaction');
    
    // 如果切换到非选择工具，清除选择
    if (tool !== 'select') {
      this.clearSelection();
    }
  }

  public getCurrentTool(): ToolType {
    return this.toolManager.getCurrentToolType();
  }
  
  public setColor(color: string): void {
    this.canvasEngine.setContext({ strokeStyle: color, fillStyle: color });
  }
  
  public setLineWidth(width: number): void {
    this.canvasEngine.setContext({ lineWidth: width });
  }

  // 运笔效果相关方法
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

  // 预设相关方法
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

  public undo(): void {
    this.historyManager.undo();
    this.performRedraw();
    this.canvasEngine.clear('interaction');
  }

  public redo(): void {
    this.historyManager.redo();
    this.performRedraw();
    this.canvasEngine.clear('interaction');
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
  
  public resize(): void {
    this.canvasEngine.resize();
    this.performRedraw();
    this.canvasEngine.clear('interaction');
  }

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

  /**
   * 获取画板状态信息
   * 包含当前工具、绘制状态、历史记录信息和内存使用情况
   */
  public getState(): {
    currentTool: ToolType;
    isDrawing: boolean;
    canUndo: boolean;
    canRedo: boolean;
    historyCount: number;
    memoryUsage?: number;
    performanceStats?: {
      currentCacheMemoryMB: number;
      currentCacheItems: number;
      cacheHitRate: number;
      estimatedTotalMemoryMB: number;
      underMemoryPressure: boolean;
    };
  } {
    const performanceStats = this.performanceManager.getMemoryStats();
    
    return {
      currentTool: this.toolManager.getCurrentToolType(),
      isDrawing: this.isDrawing,
      canUndo: this.historyManager.canUndo(),
      canRedo: this.historyManager.canRedo(),
      historyCount: this.historyManager.getHistoryCount(),
      memoryUsage: this.historyManager.getMemoryUsage(),
      performanceStats
    };
  }

  // 导出功能
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

  /**
   * 设置性能模式
   * 
   * @param mode 性能模式：
   *   - AUTO: 自动模式，根据设备性能自动选择
   *   - HIGH_PERFORMANCE: 高性能模式，优先使用预渲染缓存
   *   - LOW_MEMORY: 低内存模式，优先节省内存
   *   - BALANCED: 平衡模式，智能混合使用
   */
  public setPerformanceMode(mode: 'auto' | 'high_performance' | 'low_memory' | 'balanced'): void {
    this.performanceManager.setPerformanceMode(mode as PerformanceMode);
  }

  /**
   * 更新性能配置
   */
  public updatePerformanceConfig(config: Partial<PerformanceConfig>): void {
    this.performanceManager.updateConfig(config);
  }

  /**
   * 获取性能统计信息
   */
  public getPerformanceStats() {
    return this.performanceManager.getMemoryStats();
  }

  /**
   * 清空所有预渲染缓存
   * 可用于释放内存或调试
   */
  public clearPerformanceCache(): void {
    this.performanceManager.clearAllCaches();
  }

  /**
   * 强制重新计算所有action的复杂度评分
   * 可用于性能调优
   */
  public recalculateComplexity(): void {
    const history = this.historyManager.getHistory();
    history.forEach(action => {
      action.complexityScore = undefined; // 重置评分，下次绘制时重新计算
      action.preRenderedCache = undefined; // 清除缓存，下次绘制时重新创建
    });
    this.performRedraw();
  }

  /**
   * 设置强制实时绘制模式
   * 用于调试或性能对比
   */
  public setForceRealTimeRender(enabled: boolean): void {
    const history = this.historyManager.getHistory();
    history.forEach(action => {
      action.forceRealTimeRender = enabled;
    });
    this.performRedraw();
  }

  // ============================================
  // 内部方法 - 销毁和清理
  // ============================================

  public destroy(): void {
    this.shortcutManager.destroy();
    this.eventManager.destroy();
    this.performanceManager.clearAllCaches();
  }

  // 多层Canvas相关API
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

  // 选择操作相关方法
  public clearSelection(): void {
    this.selectionManager.clearSelection();
    this.performRedraw();
  }

  public deleteSelection(): void {
    if (!this.selectionManager.hasSelection()) return;
    
    const selectedIds = this.selectionManager.getSelectedActionIdsForDeletion();
    this.historyManager.removeActions(selectedIds);
    this.selectionManager.clearSelection();
    this.performRedraw();
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
} 