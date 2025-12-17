/**
 * 选区浮动工具栏
 * 
 * 在选中图形后（非拖拽状态），显示在选区正下方的浮动工具栏
 * 提供快捷操作：锚点显示、描边颜色、填充颜色、锁定、图层管理、复制、删除
 */

import type { DrawAction } from '../DrawTool';
import { logger } from '../../infrastructure/logging/Logger';

/**
 * 工具栏配置
 */
export interface SelectionToolbarConfig {
  /** 工具栏与选区的间距 */
  gap: number;
  /** 工具栏背景色 */
  backgroundColor: string;
  /** 工具栏圆角 */
  borderRadius: number;
  /** 按钮大小 */
  buttonSize: number;
  /** 按钮间距 */
  buttonGap: number;
  /** 动画持续时间 */
  animationDuration: number;
}

/**
 * 工具栏事件回调
 */
export interface SelectionToolbarCallbacks {
  /** 切换锚点显示 */
  onToggleAnchors?: (visible: boolean) => void;
  /** 描边颜色变更 */
  onStrokeColorChange?: (color: string) => void;
  /** 填充颜色变更 */
  onFillColorChange?: (color: string) => void;
  /** 线宽变更 */
  onLineWidthChange?: (width: number) => void;
  /** 文本颜色变更 */
  onTextColorChange?: (color: string) => void;
  /** 字体大小变更 */
  onFontSizeChange?: (size: number) => void;
  /** 字体粗细变更 */
  onFontWeightChange?: (weight: string) => void;
  /** 锁定/解锁 */
  onToggleLock?: (locked: boolean) => void;
  /** 置于顶层 */
  onMoveToTop?: () => void;
  /** 置于底层 */
  onMoveToBottom?: () => void;
  /** 复制 */
  onDuplicate?: () => void;
  /** 删除 */
  onDelete?: () => void;
}

/**
 * 工具栏状态
 */
interface ToolbarState {
  anchorsVisible: boolean;
  isLocked: boolean;
  strokeColor: string;
  fillColor: string;
  lineWidth: number;
  // 文本相关
  textColor: string;
  fontSize: number;
  fontWeight: string;
  // 当前选中的 action 类型
  actionType: string;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: SelectionToolbarConfig = {
  gap: 12,
  backgroundColor: 'rgba(45, 45, 45, 0.95)',
  borderRadius: 8,
  buttonSize: 32,
  buttonGap: 4,
  animationDuration: 150
};

/**
 * 选区浮动工具栏
 */
export class SelectionToolbar {
  private container: HTMLElement | null = null;
  private toolbar: HTMLDivElement | null = null;
  private config: SelectionToolbarConfig;
  private callbacks: SelectionToolbarCallbacks;
  private state: ToolbarState;
  private isVisible: boolean = false;
  private currentBounds: { x: number; y: number; width: number; height: number } | null = null;
  
  // 图形样式输入引用
  private strokeColorInput: HTMLInputElement | null = null;
  private fillColorInput: HTMLInputElement | null = null;
  private lineWidthInput: HTMLInputElement | null = null;
  
  // 文本样式输入引用
  private textColorInput: HTMLInputElement | null = null;
  private fontSizeInput: HTMLInputElement | null = null;
  private fontWeightSelect: HTMLSelectElement | null = null;
  
  // 按钮引用
  private anchorButton: HTMLButtonElement | null = null;
  private lockButton: HTMLButtonElement | null = null;
  private styleButton: HTMLButtonElement | null = null;
  private layerButton: HTMLButtonElement | null = null;
  private duplicateButton: HTMLButtonElement | null = null;
  private deleteButton: HTMLButtonElement | null = null;
  
  // 需要在锁定时禁用的按钮列表（不包括锁定按钮本身）
  private disableableButtons: HTMLButtonElement[] = [];
  
  // 样式面板引用
  private stylePanel: HTMLDivElement | null = null;
  private stylePanelVisible: boolean = false;
  private fillColorRow: HTMLDivElement | null = null;
  
  // 图层面板引用
  private layerPanel: HTMLDivElement | null = null;
  private layerPanelVisible: boolean = false;
  
  // 图形/文本样式容器引用
  private shapeStyleContainer: HTMLDivElement | null = null;
  private textStyleContainer: HTMLDivElement | null = null;
  
  // 支持填充色的闭合图形类型
  private static readonly CLOSED_SHAPE_TYPES = ['circle', 'rect', 'polygon'];
  
  // 颜色变化节流（16ms ≈ 60fps，使用单个全局 timer）
  private static readonly COLOR_CHANGE_THROTTLE_MS = 16;
  private lastColorChangeTime: number = 0;
  private colorChangeTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingColorChanges: { stroke?: string; fill?: string } = {};

  constructor(
    container: HTMLElement,
    callbacks: SelectionToolbarCallbacks = {},
    config: Partial<SelectionToolbarConfig> = {}
  ) {
    this.container = container;
    this.callbacks = callbacks;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      anchorsVisible: true,
      isLocked: false,
      strokeColor: '#000000',
      fillColor: 'transparent',
      lineWidth: 2,
      textColor: '#000000',
      fontSize: 16,
      fontWeight: 'normal',
      actionType: ''
    };
    
    this.createToolbar();
  }

  /**
   * 执行待处理的颜色变化
   */
  private flushPendingColorChanges(): void {
    const { stroke, fill } = this.pendingColorChanges;
    
    if (stroke !== undefined) {
      this.onStrokeColorChange(stroke);
    }
    if (fill !== undefined) {
      this.onFillColorChange(fill);
    }
    
    this.pendingColorChanges = {};
    this.lastColorChangeTime = Date.now();
  }

  /**
   * 带节流的颜色变更（实时应用）
   * 使用单个全局 timer，合并同一帧内的颜色变化
   */
  private throttledColorChange(type: 'stroke' | 'fill', color: string): void {
    // 记录待处理的颜色变化
    this.pendingColorChanges[type] = color;
    
    const now = Date.now();
    
    if (now - this.lastColorChangeTime >= SelectionToolbar.COLOR_CHANGE_THROTTLE_MS) {
      // 超过节流间隔，立即执行
      if (this.colorChangeTimer !== null) {
        clearTimeout(this.colorChangeTimer);
        this.colorChangeTimer = null;
      }
      this.flushPendingColorChanges();
    } else if (this.colorChangeTimer === null) {
      // 节流期内且没有待处理的 timer，创建延迟执行
      this.colorChangeTimer = setTimeout(() => {
        this.flushPendingColorChanges();
        this.colorChangeTimer = null;
      }, SelectionToolbar.COLOR_CHANGE_THROTTLE_MS);
    }
    // 如果已有 timer 在等待，不需要创建新的，待处理的颜色已更新
  }

  /**
   * 创建工具栏 DOM
   */
  private createToolbar(): void {
    if (!this.container) return;
    
    // 创建工具栏容器
    this.toolbar = document.createElement('div');
    this.toolbar.className = 'selection-toolbar';
    this.toolbar.style.cssText = `
      position: absolute;
      display: none;
      flex-direction: row;
      align-items: center;
      gap: ${this.config.buttonGap}px;
      padding: 6px 8px;
      background: ${this.config.backgroundColor};
      border-radius: ${this.config.borderRadius}px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1);
      z-index: 10000;
      pointer-events: auto;
      transform: translateX(-50%);
      opacity: 0;
      transition: opacity ${this.config.animationDuration}ms ease;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    `;
    
    // 创建各个按钮
    this.createButtons();
    
    this.container.appendChild(this.toolbar);
    logger.debug('SelectionToolbar: 工具栏已创建');
  }

  /**
   * 创建工具栏按钮
   */
  private createButtons(): void {
    if (!this.toolbar) return;
    
    // 清空禁用按钮列表
    this.disableableButtons = [];
    
    // 1. 锚点显示切换
    this.anchorButton = this.createButton(
      'anchor',
      this.getAnchorIcon(true),
      '显示/隐藏锚点',
      () => this.toggleAnchors()
    );
    this.toolbar.appendChild(this.anchorButton);
    this.disableableButtons.push(this.anchorButton);
    
    // 分隔线
    this.toolbar.appendChild(this.createSeparator());
    
    // 2. 样式编辑（展开面板：颜色 + 线宽）
    const styleGroup = this.createStyleButton();
    this.toolbar.appendChild(styleGroup);
    // styleButton 在 createStyleButton 中设置
    
    // 分隔线
    this.toolbar.appendChild(this.createSeparator());
    
    // 3. 锁定（不加入禁用列表，始终可用）
    this.lockButton = this.createButton(
      'lock',
      this.getLockIcon(false),
      '锁定/解锁',
      () => this.toggleLock()
    );
    this.toolbar.appendChild(this.lockButton);
    
    // 4. 图层管理
    const layerGroup = this.createLayerButtons();
    this.toolbar.appendChild(layerGroup);
    // layerButton 在 createLayerButtons 中设置
    
    // 分隔线
    this.toolbar.appendChild(this.createSeparator());
    
    // 5. 复制
    this.duplicateButton = this.createButton(
      'duplicate',
      this.getDuplicateIcon(),
      '复制',
      () => this.onDuplicate()
    );
    this.toolbar.appendChild(this.duplicateButton);
    this.disableableButtons.push(this.duplicateButton);
    
    // 6. 删除
    this.deleteButton = this.createButton(
      'delete',
      this.getDeleteIcon(),
      '删除',
      () => this.onDelete(),
      true // 危险操作
    );
    this.toolbar.appendChild(this.deleteButton);
    this.disableableButtons.push(this.deleteButton);
  }

  /**
   * 创建样式编辑按钮（展开面板）
   */
  private createStyleButton(): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'toolbar-style-container';
    container.style.cssText = `
      position: relative;
    `;
    
    // 样式按钮（显示当前颜色预览）
    const button = document.createElement('button');
    button.className = 'toolbar-btn toolbar-btn-style';
    button.title = '样式设置（颜色、线宽）';
    button.innerHTML = this.getStyleIcon();
    button.style.cssText = `
      width: ${this.config.buttonSize}px;
      height: ${this.config.buttonSize}px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      color: #ffffff;
      transition: background 0.15s ease;
      padding: 0;
      position: relative;
    `;
    
    // 颜色指示器（小圆点）
    const colorIndicator = document.createElement('div');
    colorIndicator.className = 'style-color-indicator';
    colorIndicator.style.cssText = `
      position: absolute;
      bottom: 2px;
      right: 2px;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: ${this.state.strokeColor};
      border: 1px solid rgba(255, 255, 255, 0.5);
    `;
    button.appendChild(colorIndicator);
    
    button.addEventListener('mouseenter', () => {
      button.style.background = 'rgba(255, 255, 255, 0.15)';
    });
    
    button.addEventListener('mouseleave', () => {
      if (!this.stylePanelVisible) {
        button.style.background = 'transparent';
      }
    });
    
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleStylePanel();
    });
    
    container.appendChild(button);
    
    // 保存引用并加入禁用列表
    this.styleButton = button;
    this.disableableButtons.push(button);
    
    // 创建展开面板
    this.stylePanel = this.createStylePanel();
    container.appendChild(this.stylePanel);
    
    return container;
  }

  /**
   * 创建样式展开面板
   */
  private createStylePanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = 'style-panel';
    panel.style.cssText = `
      position: absolute;
      top: calc(100% + 8px);
      left: 50%;
      transform: translateX(-50%);
      background: rgba(45, 45, 45, 0.98);
      border-radius: 10px;
      padding: 12px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1);
      display: none;
      flex-direction: column;
      gap: 12px;
      min-width: 180px;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      z-index: 10001;
    `;
    
    // ========== 图形样式容器 ==========
    this.shapeStyleContainer = document.createElement('div');
    this.shapeStyleContainer.className = 'shape-style-container';
    this.shapeStyleContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 12px;
    `;
    
    // 描边颜色
    const strokeRow = this.createStyleRow('描边颜色', 'stroke');
    this.shapeStyleContainer.appendChild(strokeRow);
    this.strokeColorInput = strokeRow.querySelector('input[type="color"]') as HTMLInputElement;
    
    // 填充颜色（只对闭合图形显示）
    this.fillColorRow = this.createStyleRow('填充颜色', 'fill');
    this.shapeStyleContainer.appendChild(this.fillColorRow);
    this.fillColorInput = this.fillColorRow.querySelector('input[type="color"]') as HTMLInputElement;
    
    // 分隔线
    const shapeSeparator = document.createElement('div');
    shapeSeparator.style.cssText = `
      height: 1px;
      background: rgba(255, 255, 255, 0.15);
      margin: 4px 0;
    `;
    this.shapeStyleContainer.appendChild(shapeSeparator);
    
    // 线宽
    const lineWidthRow = this.createLineWidthRow();
    this.shapeStyleContainer.appendChild(lineWidthRow);
    
    panel.appendChild(this.shapeStyleContainer);
    
    // ========== 文本样式容器 ==========
    this.textStyleContainer = document.createElement('div');
    this.textStyleContainer.className = 'text-style-container';
    this.textStyleContainer.style.cssText = `
      display: none;
      flex-direction: column;
      gap: 12px;
    `;
    
    // 文本颜色
    const textColorRow = this.createStyleRow('文本颜色', 'text');
    this.textStyleContainer.appendChild(textColorRow);
    this.textColorInput = textColorRow.querySelector('input[type="color"]') as HTMLInputElement;
    
    // 分隔线
    const textSeparator = document.createElement('div');
    textSeparator.style.cssText = `
      height: 1px;
      background: rgba(255, 255, 255, 0.15);
      margin: 4px 0;
    `;
    this.textStyleContainer.appendChild(textSeparator);
    
    // 字体大小
    const fontSizeRow = this.createFontSizeRow();
    this.textStyleContainer.appendChild(fontSizeRow);
    
    // 字体粗细
    const fontWeightRow = this.createFontWeightRow();
    this.textStyleContainer.appendChild(fontWeightRow);
    
    panel.appendChild(this.textStyleContainer);
    
    // 点击面板外部关闭
    document.addEventListener('click', (e) => {
      if (this.stylePanelVisible && !panel.contains(e.target as Node)) {
        const styleContainer = panel.parentElement;
        if (styleContainer && !styleContainer.contains(e.target as Node)) {
          this.hideStylePanel();
        }
      }
    });
    
    return panel;
  }

  /**
   * 创建样式行（颜色选择）
   */
  private createStyleRow(label: string, type: 'stroke' | 'fill' | 'text'): HTMLDivElement {
    const row = document.createElement('div');
    row.className = `style-row style-row-${type}`;
    row.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    `;
    
    // 标签
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.style.cssText = `
      color: rgba(255, 255, 255, 0.8);
      font-size: 12px;
      white-space: nowrap;
    `;
    row.appendChild(labelEl);
    
    // 颜色选择器容器
    const colorContainer = document.createElement('div');
    colorContainer.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
    `;
    
    // 获取默认颜色
    let defaultColor: string;
    if (type === 'stroke') {
      defaultColor = this.state.strokeColor;
    } else if (type === 'fill') {
      defaultColor = this.state.fillColor === 'transparent' ? '#ffffff' : this.state.fillColor;
    } else {
      defaultColor = this.state.textColor;
    }
    
    // 颜色预览
    const colorPreview = document.createElement('div');
    colorPreview.className = 'color-preview';
    const isStroke = type === 'stroke';
    colorPreview.style.cssText = `
      width: 24px;
      height: 24px;
      border-radius: ${isStroke ? '50%' : '4px'};
      cursor: pointer;
      border: 2px solid rgba(255, 255, 255, 0.3);
      ${isStroke ? `background: transparent; border-color: ${defaultColor}; border-width: 3px;` : `background: ${defaultColor};`}
      transition: transform 0.15s ease;
    `;
    
    colorPreview.addEventListener('mouseenter', () => {
      colorPreview.style.transform = 'scale(1.1)';
    });
    
    colorPreview.addEventListener('mouseleave', () => {
      colorPreview.style.transform = 'scale(1)';
    });
    
    // 隐藏的颜色输入
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = defaultColor;
    colorInput.style.cssText = `
      position: absolute;
      width: 0;
      height: 0;
      opacity: 0;
      pointer-events: none;
    `;
    
    // input 事件：实时应用颜色（带节流，避免频繁重绘）
    colorInput.addEventListener('input', (e) => {
      const color = (e.target as HTMLInputElement).value;
      // 更新 UI 预览
      if (type === 'stroke') {
        colorPreview.style.borderColor = color;
        // 更新按钮上的颜色指示器
        const indicator = this.toolbar?.querySelector('.style-color-indicator') as HTMLElement;
        if (indicator) {
          indicator.style.background = color;
        }
        this.throttledColorChange('stroke', color);
      } else if (type === 'fill') {
        colorPreview.style.background = color;
        this.throttledColorChange('fill', color);
      } else {
        // text 类型
        colorPreview.style.background = color;
        // 更新按钮上的颜色指示器
        const indicator = this.toolbar?.querySelector('.style-color-indicator') as HTMLElement;
        if (indicator) {
          indicator.style.background = color;
        }
        this.onTextColorChange(color);
      }
    });
    
    // change 事件：确保颜色选择器关闭时颜色一定被应用
    colorInput.addEventListener('change', (e) => {
      const color = (e.target as HTMLInputElement).value;
      
      if (type === 'text') {
        // 文本颜色直接应用
        this.onTextColorChange(color);
        return;
      }
      
      // 先处理另一种颜色的待处理变化（如果有）
      const otherType = type === 'stroke' ? 'fill' : 'stroke';
      const otherPendingColor = this.pendingColorChanges[otherType];
      
      // 清除 timer
      if (this.colorChangeTimer !== null) {
        clearTimeout(this.colorChangeTimer);
        this.colorChangeTimer = null;
      }
      
      // 应用另一种颜色的待处理变化
      if (otherPendingColor !== undefined) {
        if (otherType === 'stroke') {
          this.onStrokeColorChange(otherPendingColor);
        } else {
          this.onFillColorChange(otherPendingColor);
        }
      }
      
      // 清除所有待处理颜色
      this.pendingColorChanges = {};
      
      // 应用当前颜色
      if (type === 'stroke') {
        this.onStrokeColorChange(color);
      } else {
        this.onFillColorChange(color);
      }
      
      this.lastColorChangeTime = Date.now();
    });
    
    colorPreview.addEventListener('click', (e) => {
      e.stopPropagation();
      colorInput.click();
    });
    
    colorContainer.appendChild(colorPreview);
    colorContainer.appendChild(colorInput);
    row.appendChild(colorContainer);
    
    return row;
  }

  /**
   * 创建线宽行
   */
  private createLineWidthRow(): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'style-row style-row-linewidth';
    row.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    `;
    
    // 标签
    const label = document.createElement('span');
    label.textContent = '线宽';
    label.style.cssText = `
      color: rgba(255, 255, 255, 0.8);
      font-size: 12px;
      white-space: nowrap;
    `;
    row.appendChild(label);
    
    // 线宽控制容器
    const controlContainer = document.createElement('div');
    controlContainer.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
    `;
    
    // 滑块
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '1';
    slider.max = '20';
    slider.value = String(this.state.lineWidth);
    slider.style.cssText = `
      width: 60px;
      height: 4px;
      -webkit-appearance: none;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 2px;
      outline: none;
      cursor: pointer;
    `;
    
    // 数值显示
    const valueDisplay = document.createElement('span');
    valueDisplay.textContent = `${this.state.lineWidth}px`;
    valueDisplay.style.cssText = `
      color: #ffffff;
      font-size: 12px;
      min-width: 32px;
      text-align: right;
      font-family: monospace;
    `;
    
    slider.addEventListener('input', (e) => {
      const value = parseInt((e.target as HTMLInputElement).value, 10);
      valueDisplay.textContent = `${value}px`;
      this.onLineWidthChange(value);
    });
    
    this.lineWidthInput = slider;
    
    controlContainer.appendChild(slider);
    controlContainer.appendChild(valueDisplay);
    row.appendChild(controlContainer);
    
    return row;
  }

  /**
   * 创建字体大小行
   */
  private createFontSizeRow(): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'style-row style-row-fontsize';
    row.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    `;
    
    // 标签
    const label = document.createElement('span');
    label.textContent = '字体大小';
    label.style.cssText = `
      color: rgba(255, 255, 255, 0.8);
      font-size: 12px;
      white-space: nowrap;
    `;
    row.appendChild(label);
    
    // 字体大小控制容器
    const controlContainer = document.createElement('div');
    controlContainer.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
    `;
    
    // 滑块
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '8';
    slider.max = '72';
    slider.value = String(this.state.fontSize);
    slider.style.cssText = `
      width: 60px;
      height: 4px;
      -webkit-appearance: none;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 2px;
      outline: none;
      cursor: pointer;
    `;
    
    // 数值显示
    const valueDisplay = document.createElement('span');
    valueDisplay.textContent = `${this.state.fontSize}px`;
    valueDisplay.style.cssText = `
      color: #ffffff;
      font-size: 12px;
      min-width: 32px;
      text-align: right;
      font-family: monospace;
    `;
    
    slider.addEventListener('input', (e) => {
      const value = parseInt((e.target as HTMLInputElement).value, 10);
      valueDisplay.textContent = `${value}px`;
      this.onFontSizeChange(value);
    });
    
    this.fontSizeInput = slider;
    
    controlContainer.appendChild(slider);
    controlContainer.appendChild(valueDisplay);
    row.appendChild(controlContainer);
    
    return row;
  }

  /**
   * 创建字体粗细行
   */
  private createFontWeightRow(): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'style-row style-row-fontweight';
    row.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    `;
    
    // 标签
    const label = document.createElement('span');
    label.textContent = '字体粗细';
    label.style.cssText = `
      color: rgba(255, 255, 255, 0.8);
      font-size: 12px;
      white-space: nowrap;
    `;
    row.appendChild(label);
    
    // 下拉选择
    const select = document.createElement('select');
    select.style.cssText = `
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 4px;
      color: #ffffff;
      font-size: 12px;
      padding: 4px 8px;
      cursor: pointer;
      outline: none;
    `;
    
    const weights = [
      { value: 'normal', label: '正常' },
      { value: 'bold', label: '粗体' },
      { value: '100', label: '极细' },
      { value: '300', label: '细' },
      { value: '500', label: '中等' },
      { value: '700', label: '粗' },
      { value: '900', label: '极粗' }
    ];
    
    weights.forEach(({ value, label: text }) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      if (value === this.state.fontWeight) {
        option.selected = true;
      }
      select.appendChild(option);
    });
    
    select.addEventListener('change', (e) => {
      const value = (e.target as HTMLSelectElement).value;
      this.onFontWeightChange(value);
    });
    
    this.fontWeightSelect = select;
    row.appendChild(select);
    
    return row;
  }

  /**
   * 切换样式面板显示
   */
  private toggleStylePanel(): void {
    if (this.stylePanelVisible) {
      this.hideStylePanel();
    } else {
      this.showStylePanel();
    }
  }

  /**
   * 显示样式面板
   */
  private showStylePanel(): void {
    if (!this.stylePanel) return;
    
    // 先关闭图层面板
    this.hideLayerPanel();
    
    this.stylePanel.style.display = 'flex';
    this.stylePanelVisible = true;
    
    // 更新按钮样式
    const styleBtn = this.toolbar?.querySelector('.toolbar-btn-style') as HTMLElement;
    if (styleBtn) {
      styleBtn.style.background = 'rgba(255, 255, 255, 0.2)';
    }
  }

  /**
   * 隐藏样式面板
   */
  private hideStylePanel(): void {
    if (!this.stylePanel) return;
    this.stylePanel.style.display = 'none';
    this.stylePanelVisible = false;
    
    // 恢复按钮样式
    const styleBtn = this.toolbar?.querySelector('.toolbar-btn-style') as HTMLElement;
    if (styleBtn) {
      styleBtn.style.background = 'transparent';
    }
  }

  /**
   * 创建按钮
   */
  private createButton(
    id: string,
    icon: string,
    title: string,
    onClick: () => void,
    danger: boolean = false
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = `toolbar-btn toolbar-btn-${id}`;
    button.title = title;
    button.innerHTML = icon;
    button.style.cssText = `
      width: ${this.config.buttonSize}px;
      height: ${this.config.buttonSize}px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      color: ${danger ? '#ff6b6b' : '#ffffff'};
      transition: background 0.15s ease, transform 0.1s ease;
      padding: 0;
    `;
    
    button.addEventListener('mouseenter', () => {
      button.style.background = danger ? 'rgba(255, 107, 107, 0.2)' : 'rgba(255, 255, 255, 0.15)';
    });
    
    button.addEventListener('mouseleave', () => {
      button.style.background = 'transparent';
    });
    
    button.addEventListener('mousedown', () => {
      button.style.transform = 'scale(0.95)';
    });
    
    button.addEventListener('mouseup', () => {
      button.style.transform = 'scale(1)';
    });
    
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    
    return button;
  }

  /**
   * 创建颜色按钮
   */
  private createColorButton(
    id: string,
    title: string,
    defaultColor: string,
    onChange: (color: string) => void,
    supportTransparent: boolean = false
  ): HTMLDivElement {
    const group = document.createElement('div');
    group.className = `toolbar-color-group toolbar-color-${id}`;
    group.style.cssText = `
      position: relative;
      width: ${this.config.buttonSize}px;
      height: ${this.config.buttonSize}px;
    `;
    
    // 颜色预览按钮
    const preview = document.createElement('div');
    preview.className = 'color-preview';
    preview.title = title;
    preview.style.cssText = `
      width: 100%;
      height: 100%;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.1);
      transition: background 0.15s ease;
    `;
    
    // 颜色圆圈
    const colorCircle = document.createElement('div');
    colorCircle.className = 'color-circle';
    colorCircle.style.cssText = `
      width: 20px;
      height: 20px;
      border-radius: ${id === 'stroke' ? '50%' : '4px'};
      background: ${defaultColor};
      border: 2px solid rgba(255, 255, 255, 0.8);
      box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.2);
      ${id === 'stroke' ? 'border-width: 3px; background: transparent;' : ''}
    `;
    if (id === 'stroke') {
      colorCircle.style.borderColor = defaultColor;
    }
    preview.appendChild(colorCircle);
    
    // 隐藏的颜色输入
    const input = document.createElement('input');
    input.type = 'color';
    input.value = defaultColor;
    input.style.cssText = `
      position: absolute;
      width: 0;
      height: 0;
      opacity: 0;
      pointer-events: none;
    `;
    
    input.addEventListener('input', (e) => {
      const color = (e.target as HTMLInputElement).value;
      if (id === 'stroke') {
        colorCircle.style.borderColor = color;
      } else {
        colorCircle.style.background = color;
      }
      onChange(color);
    });
    
    preview.addEventListener('mouseenter', () => {
      preview.style.background = 'rgba(255, 255, 255, 0.2)';
    });
    
    preview.addEventListener('mouseleave', () => {
      preview.style.background = 'rgba(255, 255, 255, 0.1)';
    });
    
    preview.addEventListener('click', (e) => {
      e.stopPropagation();
      input.click();
    });
    
    group.appendChild(preview);
    group.appendChild(input);
    
    return group;
  }

  /**
   * 创建图层管理按钮（展开菜单形式）
   */
  private createLayerButtons(): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'toolbar-layer-container';
    container.style.cssText = `
      position: relative;
      display: flex;
      align-items: center;
    `;
    
    // 图层按钮
    const button = document.createElement('button');
    button.className = 'toolbar-btn toolbar-btn-layer';
    button.title = '图层排序';
    button.innerHTML = this.getLayerIcon();
    button.style.cssText = `
      width: ${this.config.buttonSize}px;
      height: ${this.config.buttonSize}px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      color: #ffffff;
      transition: background 0.15s ease;
    `;
    
    button.addEventListener('mouseenter', () => {
      button.style.background = 'rgba(255, 255, 255, 0.15)';
    });
    
    button.addEventListener('mouseleave', () => {
      if (!this.layerPanelVisible) {
        button.style.background = 'transparent';
      }
    });
    
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleLayerPanel();
    });
    
    container.appendChild(button);
    
    // 保存引用并加入禁用列表
    this.layerButton = button;
    this.disableableButtons.push(button);
    
    // 创建展开面板
    this.layerPanel = this.createLayerPanel();
    container.appendChild(this.layerPanel);
    
    return container;
  }
  
  /**
   * 创建图层展开面板
   */
  private createLayerPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = 'layer-panel';
    panel.style.cssText = `
      position: absolute;
      bottom: calc(100% + 8px);
      left: 50%;
      transform: translateX(-50%);
      background: rgba(50, 50, 50, 0.98);
      border-radius: 8px;
      padding: 6px;
      display: none;
      flex-direction: column;
      gap: 2px;
      min-width: 100px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 1000;
    `;
    
    // 置于顶层按钮
    const topButton = this.createLayerMenuItem('置于顶层', this.getLayerTopIcon(), () => {
      this.callbacks.onMoveToTop?.();
      this.hideLayerPanel();
    });
    
    // 置于底层按钮
    const bottomButton = this.createLayerMenuItem('置于底层', this.getLayerBottomIcon(), () => {
      this.callbacks.onMoveToBottom?.();
      this.hideLayerPanel();
    });
    
    panel.appendChild(topButton);
    panel.appendChild(bottomButton);
    
    // 点击面板外部关闭
    document.addEventListener('click', (e) => {
      if (this.layerPanelVisible && !panel.contains(e.target as Node)) {
        const layerContainer = panel.parentElement;
        if (layerContainer && !layerContainer.contains(e.target as Node)) {
          this.hideLayerPanel();
        }
      }
    });
    
    return panel;
  }
  
  /**
   * 创建图层菜单项
   */
  private createLayerMenuItem(label: string, icon: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'layer-menu-item';
    button.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 8px 12px;
      background: transparent;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      color: #ffffff;
      font-size: 13px;
      text-align: left;
      transition: background 0.15s ease;
      white-space: nowrap;
    `;
    
    button.innerHTML = `
      <span style="display: flex; align-items: center; justify-content: center; width: 18px; height: 18px; opacity: 0.8;">
        ${icon}
      </span>
      <span>${label}</span>
    `;
    
    button.addEventListener('mouseenter', () => {
      button.style.background = 'rgba(255, 255, 255, 0.1)';
    });
    
    button.addEventListener('mouseleave', () => {
      button.style.background = 'transparent';
    });
    
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    
    return button;
  }
  
  /**
   * 切换图层面板显示
   */
  private toggleLayerPanel(): void {
    if (this.layerPanelVisible) {
      this.hideLayerPanel();
    } else {
      this.showLayerPanel();
    }
  }
  
  /**
   * 显示图层面板
   */
  private showLayerPanel(): void {
    if (!this.layerPanel) return;
    
    // 先关闭样式面板
    this.hideStylePanel();
    
    this.layerPanel.style.display = 'flex';
    this.layerPanelVisible = true;
    
    // 更新按钮样式
    const layerBtn = this.toolbar?.querySelector('.toolbar-btn-layer') as HTMLElement;
    if (layerBtn) {
      layerBtn.style.background = 'rgba(255, 255, 255, 0.2)';
    }
  }
  
  /**
   * 隐藏图层面板
   */
  private hideLayerPanel(): void {
    if (!this.layerPanel) return;
    this.layerPanel.style.display = 'none';
    this.layerPanelVisible = false;
    
    // 恢复按钮样式
    const layerBtn = this.toolbar?.querySelector('.toolbar-btn-layer') as HTMLElement;
    if (layerBtn) {
      layerBtn.style.background = 'transparent';
    }
  }

  /**
   * 创建分隔线
   */
  private createSeparator(): HTMLDivElement {
    const separator = document.createElement('div');
    separator.className = 'toolbar-separator';
    separator.style.cssText = `
      width: 1px;
      height: 20px;
      background: rgba(255, 255, 255, 0.2);
      margin: 0 4px;
    `;
    return separator;
  }

  // ============================================
  // 图标 SVG
  // ============================================

  private getAnchorIcon(visible: boolean): string {
    if (visible) {
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <circle cx="3" cy="3" r="2" fill="currentColor"/>
        <circle cx="21" cy="3" r="2" fill="currentColor"/>
        <circle cx="3" cy="21" r="2" fill="currentColor"/>
        <circle cx="21" cy="21" r="2" fill="currentColor"/>
        <path d="M12 3 L12 0 M12 3 L9 6 M12 3 L15 6" stroke="currentColor" stroke-width="1.5"/>
      </svg>`;
    }
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" opacity="0.5">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" stroke-width="2"/>
    </svg>`;
  }

  private getLockIcon(locked: boolean): string {
    if (locked) {
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="11" width="18" height="11" rx="2"/>
        <path d="M7 11V7a5 5 0 0110 0v4"/>
      </svg>`;
    }
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="11" width="18" height="11" rx="2"/>
      <path d="M7 11V7a5 5 0 019.9-1"/>
    </svg>`;
  }

  private getLayerIcon(): string {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z"/>
      <path d="M2 17l10 5 10-5"/>
      <path d="M2 12l10 5 10-5"/>
    </svg>`;
  }

  private getLayerTopIcon(): string {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z"/>
      <path d="M2 17l10 5 10-5" opacity="0.4"/>
      <path d="M2 12l10 5 10-5" opacity="0.6"/>
    </svg>`;
  }
  
  private getLayerBottomIcon(): string {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" opacity="0.4"/>
      <path d="M2 17l10 5 10-5"/>
      <path d="M2 12l10 5 10-5" opacity="0.6"/>
    </svg>`;
  }

  private getDuplicateIcon(): string {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="9" y="9" width="13" height="13" rx="2"/>
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
    </svg>`;
  }

  private getDeleteIcon(): string {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M3 6h18"/>
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/>
      <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
      <line x1="10" y1="11" x2="10" y2="17"/>
      <line x1="14" y1="11" x2="14" y2="17"/>
    </svg>`;
  }

  private getStyleIcon(): string {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
    </svg>`;
  }

  // ============================================
  // 事件处理
  // ============================================

  private toggleAnchors(): void {
    this.state.anchorsVisible = !this.state.anchorsVisible;
    if (this.anchorButton) {
      this.anchorButton.innerHTML = this.getAnchorIcon(this.state.anchorsVisible);
    }
    this.callbacks.onToggleAnchors?.(this.state.anchorsVisible);
    logger.debug('SelectionToolbar: 切换锚点显示', { visible: this.state.anchorsVisible });
  }

  private toggleLock(): void {
    this.state.isLocked = !this.state.isLocked;
    if (this.lockButton) {
      this.lockButton.innerHTML = this.getLockIcon(this.state.isLocked);
    }
    // 更新按钮禁用状态
    this.updateButtonsDisabledState();
    this.callbacks.onToggleLock?.(this.state.isLocked);
    logger.debug('SelectionToolbar: 切换锁定状态', { locked: this.state.isLocked });
  }
  
  /**
   * 更新按钮禁用状态
   * 锁定时禁用除锁定按钮外的所有按钮
   */
  private updateButtonsDisabledState(): void {
    const isLocked = this.state.isLocked;
    
    for (const button of this.disableableButtons) {
      if (!button) continue;
      
      button.disabled = isLocked;
      
      if (isLocked) {
        // 禁用样式：灰色、不可点击
        button.style.opacity = '0.4';
        button.style.cursor = 'not-allowed';
        button.style.pointerEvents = 'none';
      } else {
        // 启用样式：恢复正常
        button.style.opacity = '1';
        button.style.cursor = 'pointer';
        button.style.pointerEvents = 'auto';
      }
    }
    
    // 隐藏展开的面板
    if (isLocked) {
      this.hideStylePanel();
      this.hideLayerPanel();
    }
  }

  private onStrokeColorChange(color: string): void {
    this.state.strokeColor = color;
    this.callbacks.onStrokeColorChange?.(color);
    logger.debug('SelectionToolbar: 描边颜色变更', { color });
  }

  private onFillColorChange(color: string): void {
    this.state.fillColor = color;
    this.callbacks.onFillColorChange?.(color);
    logger.debug('SelectionToolbar: 填充颜色变更', { color });
  }

  private onLineWidthChange(width: number): void {
    this.state.lineWidth = width;
    this.callbacks.onLineWidthChange?.(width);
    logger.debug('SelectionToolbar: 线宽变更', { width });
  }

  private onTextColorChange(color: string): void {
    this.state.textColor = color;
    this.callbacks.onTextColorChange?.(color);
    logger.debug('SelectionToolbar: 文本颜色变更', { color });
  }

  private onFontSizeChange(size: number): void {
    this.state.fontSize = size;
    this.callbacks.onFontSizeChange?.(size);
    logger.debug('SelectionToolbar: 字体大小变更', { size });
  }

  private onFontWeightChange(weight: string): void {
    this.state.fontWeight = weight;
    this.callbacks.onFontWeightChange?.(weight);
    logger.debug('SelectionToolbar: 字体粗细变更', { weight });
  }

  private onDuplicate(): void {
    this.callbacks.onDuplicate?.();
    logger.debug('SelectionToolbar: 复制操作');
  }

  private onDelete(): void {
    this.callbacks.onDelete?.();
    logger.debug('SelectionToolbar: 删除操作');
  }

  // ============================================
  // 公共方法
  // ============================================

  /**
   * 显示工具栏
   */
  public show(bounds: { x: number; y: number; width: number; height: number }): void {
    if (!this.toolbar || !this.container) return;
    
    this.currentBounds = bounds;
    
    // 计算位置：选区正下方居中
    const containerRect = this.container.getBoundingClientRect();
    const toolbarWidth = this.toolbar.offsetWidth || 300; // 预估宽度
    
    const left = bounds.x + bounds.width / 2;
    const top = bounds.y + bounds.height + this.config.gap;
    
    // 确保不超出容器边界
    const maxLeft = containerRect.width - toolbarWidth / 2 - 10;
    const minLeft = toolbarWidth / 2 + 10;
    const clampedLeft = Math.max(minLeft, Math.min(maxLeft, left));
    
    this.toolbar.style.left = `${clampedLeft}px`;
    this.toolbar.style.top = `${top}px`;
    this.toolbar.style.display = 'flex';
    
    // 触发动画
    requestAnimationFrame(() => {
      if (this.toolbar) {
        this.toolbar.style.opacity = '1';
      }
    });
    
    this.isVisible = true;
    logger.debug('SelectionToolbar: 显示工具栏', { bounds, position: { left: clampedLeft, top } });
  }

  /**
   * 更新位置（选区变化时调用）
   */
  public updatePosition(bounds: { x: number; y: number; width: number; height: number }): void {
    if (!this.isVisible || !this.toolbar || !this.container) return;
    
    this.currentBounds = bounds;
    
    const containerRect = this.container.getBoundingClientRect();
    const toolbarWidth = this.toolbar.offsetWidth || 300;
    
    const left = bounds.x + bounds.width / 2;
    const top = bounds.y + bounds.height + this.config.gap;
    
    const maxLeft = containerRect.width - toolbarWidth / 2 - 10;
    const minLeft = toolbarWidth / 2 + 10;
    const clampedLeft = Math.max(minLeft, Math.min(maxLeft, left));
    
    this.toolbar.style.left = `${clampedLeft}px`;
    this.toolbar.style.top = `${top}px`;
  }

  /**
   * 判断 action 类型是否支持填充色（闭合图形）
   */
  private isFillSupported(actionType: string): boolean {
    return SelectionToolbar.CLOSED_SHAPE_TYPES.includes(actionType);
  }

  /**
   * 更新状态（同步选中图形的属性）
   */
  public updateState(actions: DrawAction[]): void {
    if (actions.length === 0) return;
    
    // 获取第一个选中图形的属性
    const firstAction = actions[0];
    const isTextAction = firstAction.type === 'text';
    
    // 记录当前 action 类型
    this.state.actionType = firstAction.type;
    
    // 根据 action 类型切换样式面板
    if (this.shapeStyleContainer && this.textStyleContainer) {
      if (isTextAction) {
        this.shapeStyleContainer.style.display = 'none';
        this.textStyleContainer.style.display = 'flex';
      } else {
        this.shapeStyleContainer.style.display = 'flex';
        this.textStyleContainer.style.display = 'none';
      }
    }
    
    if (isTextAction) {
      // ========== 文本样式更新 ==========
      const textAction = firstAction as DrawAction & { 
        fontSize?: number; 
        fontWeight?: string;
        text?: string;
      };
      
      // 更新文本颜色（使用 fillStyle 作为文本颜色）
      if (firstAction.context?.fillStyle && this.textColorInput) {
        const color = firstAction.context.fillStyle as string;
        this.state.textColor = color === 'transparent' ? '#000000' : color;
        this.textColorInput.value = this.state.textColor;
        // 更新样式面板中的颜色预览
        const textColorPreview = this.stylePanel?.querySelector('.style-row-text .color-preview') as HTMLElement;
        if (textColorPreview) {
          textColorPreview.style.background = this.state.textColor;
        }
        // 更新按钮上的颜色指示器
        const indicator = this.toolbar?.querySelector('.style-color-indicator') as HTMLElement;
        if (indicator) {
          indicator.style.background = this.state.textColor;
        }
      }
      
      // 更新字体大小
      if (textAction.fontSize !== undefined && this.fontSizeInput) {
        this.state.fontSize = textAction.fontSize;
        this.fontSizeInput.value = String(textAction.fontSize);
        // 更新数值显示
        const valueDisplay = this.stylePanel?.querySelector('.style-row-fontsize span:last-child') as HTMLElement;
        if (valueDisplay) {
          valueDisplay.textContent = `${textAction.fontSize}px`;
        }
      }
      
      // 更新字体粗细
      if (textAction.fontWeight !== undefined && this.fontWeightSelect) {
        this.state.fontWeight = textAction.fontWeight;
        this.fontWeightSelect.value = textAction.fontWeight;
      }
    } else {
      // ========== 图形样式更新 ==========
      
      // 根据图形类型显示/隐藏填充色选项
      const supportsFill = this.isFillSupported(firstAction.type);
      if (this.fillColorRow) {
        this.fillColorRow.style.display = supportsFill ? 'flex' : 'none';
      }
    
    if (firstAction.context) {
      // 更新描边颜色
      if (firstAction.context.strokeStyle && this.strokeColorInput) {
        const color = firstAction.context.strokeStyle as string;
        this.state.strokeColor = color;
        this.strokeColorInput.value = color;
          // 更新样式面板中的颜色预览
          const strokePreview = this.stylePanel?.querySelector('.style-row-stroke .color-preview') as HTMLElement;
          if (strokePreview) {
            strokePreview.style.borderColor = color;
          }
          // 更新按钮上的颜色指示器
          const indicator = this.toolbar?.querySelector('.style-color-indicator') as HTMLElement;
          if (indicator) {
            indicator.style.background = color;
        }
      }
      
      // 更新填充颜色
      if (firstAction.context.fillStyle && this.fillColorInput) {
        const color = firstAction.context.fillStyle as string;
        this.state.fillColor = color;
        this.fillColorInput.value = color === 'transparent' ? '#ffffff' : color;
          // 更新样式面板中的颜色预览
          const fillPreview = this.stylePanel?.querySelector('.style-row-fill .color-preview') as HTMLElement;
          if (fillPreview) {
            fillPreview.style.background = color === 'transparent' ? '#ffffff' : color;
          }
        }
        
        // 更新线宽
        if (firstAction.context.lineWidth !== undefined && this.lineWidthInput) {
          const width = firstAction.context.lineWidth as number;
          this.state.lineWidth = width;
          this.lineWidthInput.value = String(width);
          // 更新数值显示
          const valueDisplay = this.stylePanel?.querySelector('.style-row-linewidth span:last-child') as HTMLElement;
          if (valueDisplay) {
            valueDisplay.textContent = `${width}px`;
          }
        }
      }
    }
    
    // 更新锁定状态（检查 action.locked 和 layerLocked）
    const isLocked = (firstAction as DrawAction & { locked?: boolean }).locked === true || 
                     firstAction.layerLocked === true;
    this.state.isLocked = isLocked;
    if (this.lockButton) {
      this.lockButton.innerHTML = this.getLockIcon(isLocked);
    }
    // 更新按钮禁用状态
    this.updateButtonsDisabledState();
  }

  /**
   * 设置回调
   */
  public setCallbacks(callbacks: Partial<SelectionToolbarCallbacks>): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * 获取当前状态
   */
  public getState(): ToolbarState {
    return { ...this.state };
  }

  /**
   * 是否可见
   */
  public getIsVisible(): boolean {
    return this.isVisible;
  }

  /**
   * 销毁工具栏
   */
  public destroy(): void {
    // 清理颜色节流 timer
    if (this.colorChangeTimer !== null) {
      clearTimeout(this.colorChangeTimer);
      this.colorChangeTimer = null;
    }
    this.pendingColorChanges = {};
    
    if (this.toolbar && this.container) {
      this.container.removeChild(this.toolbar);
    }
    this.toolbar = null;
    this.container = null;
    this.strokeColorInput = null;
    this.fillColorInput = null;
    this.lineWidthInput = null;
    this.anchorButton = null;
    this.lockButton = null;
    this.stylePanel = null;
    this.stylePanelVisible = false;
    this.fillColorRow = null;
    this.layerPanel = null;
    this.layerPanelVisible = false;
    logger.debug('SelectionToolbar: 工具栏已销毁');
  }

  /**
   * 隐藏时关闭样式面板
   */
  public hide(): void {
    this.hideStylePanel(); // 先关闭样式面板
    
    if (!this.toolbar) return;
    
    this.toolbar.style.opacity = '0';
    
    setTimeout(() => {
      if (this.toolbar) {
        this.toolbar.style.display = 'none';
      }
    }, this.config.animationDuration);
    
    this.isVisible = false;
    this.currentBounds = null;
    logger.debug('SelectionToolbar: 隐藏工具栏');
  }
}

