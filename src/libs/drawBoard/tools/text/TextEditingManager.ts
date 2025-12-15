/**
 * 文字编辑管理器
 * 
 * 职责：
 * - 管理文字输入的 DOM 元素
 * - 处理文字输入、编辑、提交流程
 * - 支持实时预览
 * - 支持双击编辑已有文字
 */

import { logger } from '../../infrastructure/logging/Logger';
import type { TextAction } from '../../types/TextTypes';
import type { Point } from '../../core/CanvasEngine';

/** 文字编辑配置 */
export interface TextEditingConfig {
  /** 默认字体大小 */
  defaultFontSize: number;
  /** 默认字体 */
  defaultFontFamily: string;
  /** 默认颜色 */
  defaultColor: string;
  /** 最小宽度 */
  minWidth: number;
  /** 最小高度 */
  minHeight: number;
  /** 输入框内边距 */
  padding: number;
  /** 光标闪烁间隔 (ms) */
  cursorBlinkInterval: number;
  /** 是否显示边框（编辑时） */
  showBorder: boolean;
}

/** 文字编辑状态 */
export interface TextEditingState {
  isEditing: boolean;
  position: Point | null;
  text: string;
  fontSize: number;
  fontFamily: string;
  color: string;
  actionId: string | null;
}

/** 文字提交事件数据 */
export interface TextCommitEvent {
  text: string;
  position: Point;
  fontSize: number;
  fontFamily: string;
  color: string;
  actionId: string | null;
  isNew: boolean;
}

/** 文字变化事件数据 */
export interface TextChangeEvent {
  text: string;
  position: Point;
  fontSize: number;
  fontFamily: string;
  color: string;
}

type TextEditingEventHandler = {
  'textCommit': (event: TextCommitEvent) => void;
  'textChange': (event: TextChangeEvent) => void;
  'editStart': (position: Point) => void;
  'editEnd': () => void;
  'editCancel': () => void;
};

export class TextEditingManager {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private inputElement: HTMLTextAreaElement | null = null;
  private inputWrapper: HTMLDivElement | null = null;
  
  private config: TextEditingConfig;
  private state: TextEditingState;
  
  private eventHandlers: Map<keyof TextEditingEventHandler, Set<Function>> = new Map();
  
  // 绑定的事件处理器引用（用于移除）
  private boundHandlers: {
    onInput: () => void;
    onBlur: (e: FocusEvent) => void;
    onKeydown: (e: KeyboardEvent) => void;
    onMousedown: (e: MouseEvent) => void;
  };
  
  // 待处理的 blur 定时器（用于清理）
  private pendingBlurTimer: ReturnType<typeof setTimeout> | null = null;
  
  // 是否已销毁
  private isDestroyed: boolean = false;
  
  private static readonly DEFAULT_CONFIG: TextEditingConfig = {
    defaultFontSize: 16,
    defaultFontFamily: 'Arial, sans-serif',
    defaultColor: '#000000',
    minWidth: 20,
    minHeight: 24,
    padding: 4,
    cursorBlinkInterval: 500,
    showBorder: true
  };
  
  constructor(
    container: HTMLElement,
    canvas: HTMLCanvasElement,
    config: Partial<TextEditingConfig> = {}
  ) {
    this.container = container;
    this.canvas = canvas;
    this.config = { ...TextEditingManager.DEFAULT_CONFIG, ...config };
    
    this.state = {
      isEditing: false,
      position: null,
      text: '',
      fontSize: this.config.defaultFontSize,
      fontFamily: this.config.defaultFontFamily,
      color: this.config.defaultColor,
      actionId: null
    };
    
    // 绑定事件处理器
    this.boundHandlers = {
      onInput: this.handleInput.bind(this),
      onBlur: this.handleBlur.bind(this),
      onKeydown: this.handleKeydown.bind(this),
      onMousedown: this.handleContainerMousedown.bind(this)
    };
    
    this.setupInputElement();
    
    logger.debug('TextEditingManager 初始化完成');
  }
  
  /**
   * 设置输入元素
   */
  private setupInputElement(): void {
    // 创建包装器
    this.inputWrapper = document.createElement('div');
    this.inputWrapper.className = 'drawboard-text-input-wrapper';
    Object.assign(this.inputWrapper.style, {
      position: 'absolute',
      display: 'none',
      zIndex: '2000',
      pointerEvents: 'auto'
    });
    
    // 创建输入框
    this.inputElement = document.createElement('textarea');
    this.inputElement.className = 'drawboard-text-input';
    Object.assign(this.inputElement.style, {
      border: this.config.showBorder ? '1px dashed #1890ff' : 'none',
      outline: 'none',
      background: 'transparent',
      resize: 'none',
      overflow: 'hidden',
      padding: `${this.config.padding}px`,
      margin: '0',
      minWidth: `${this.config.minWidth}px`,
      minHeight: `${this.config.minHeight}px`,
      fontFamily: this.config.defaultFontFamily,
      fontSize: `${this.config.defaultFontSize}px`,
      color: this.config.defaultColor,
      lineHeight: '1.2',
      whiteSpace: 'pre-wrap',
      wordWrap: 'break-word',
      boxSizing: 'border-box'
    });
    
    this.inputWrapper.appendChild(this.inputElement);
    this.container.appendChild(this.inputWrapper);
    
    // 绑定事件
    this.inputElement.addEventListener('input', this.boundHandlers.onInput);
    this.inputElement.addEventListener('blur', this.boundHandlers.onBlur);
    this.inputElement.addEventListener('keydown', this.boundHandlers.onKeydown);
    
    // 监听容器点击（用于判断是否点击了输入框外部）
    this.container.addEventListener('mousedown', this.boundHandlers.onMousedown);
  }
  
  /**
   * 开始编辑（新建文字）
   */
  public startEditing(position: Point, options: Partial<{
    fontSize: number;
    fontFamily: string;
    color: string;
  }> = {}): void {
    // 如果已经在编辑中，忽略重复调用（避免双击触发多次导致闪烁）
    if (this.state.isEditing) {
      logger.debug('TextEditingManager.startEditing: 已在编辑中，忽略重复调用');
      return;
    }
    
    this.state = {
      isEditing: true,
      position,
      text: '',
      fontSize: options.fontSize ?? this.config.defaultFontSize,
      fontFamily: options.fontFamily ?? this.config.defaultFontFamily,
      color: options.color ?? this.config.defaultColor,
      actionId: null
    };
    
    this.showInputAt(position);
    this.emit('editStart', position);
    
    logger.debug('开始文字编辑（新建）', { position });
  }
  
  /**
   * 编辑已有文字
   */
  public editExisting(action: TextAction, canvasBounds: DOMRect): void {
    if (this.state.isEditing) {
      this.finishEditing();
    }
    
    if (!action.points || action.points.length === 0) {
      logger.warn('无法编辑：action 没有位置信息');
      return;
    }
    
    const position = action.points[0];
    
    this.state = {
      isEditing: true,
      position,
      text: action.text || '',
      fontSize: action.fontSize ?? this.config.defaultFontSize,
      fontFamily: action.fontFamily ?? this.config.defaultFontFamily,
      color: action.context?.fillStyle as string ?? this.config.defaultColor,
      actionId: action.id
    };
    
    this.showInputAt(position, canvasBounds);
    
    // 设置已有文字
    if (this.inputElement) {
      this.inputElement.value = this.state.text;
      this.autoResize();
      
      // 选中所有文字
      this.inputElement.select();
    }
    
    this.emit('editStart', position);
    
    logger.debug('开始文字编辑（已有）', { actionId: action.id, text: action.text });
  }
  
  /**
   * 在指定位置显示输入框
   */
  private showInputAt(position: Point, canvasBounds?: DOMRect): void {
    if (!this.inputWrapper || !this.inputElement) {
      logger.warn('TextEditingManager.showInputAt: 输入元素未创建', {
        hasWrapper: !!this.inputWrapper,
        hasInput: !!this.inputElement
      });
      return;
    }
    
    const bounds = canvasBounds || this.canvas.getBoundingClientRect();
    const containerBounds = this.container.getBoundingClientRect();
    
    // 计算相对于容器的位置
    const relativeX = bounds.left - containerBounds.left + position.x;
    const relativeY = bounds.top - containerBounds.top + position.y;
    
    logger.debug('TextEditingManager.showInputAt: 显示输入框', {
      position,
      canvasBounds: bounds,
      containerBounds,
      relativeX,
      relativeY
    });
    
    // 设置样式
    this.inputElement.style.fontSize = `${this.state.fontSize}px`;
    this.inputElement.style.fontFamily = this.state.fontFamily;
    this.inputElement.style.color = this.state.color;
    
    // 定位
    this.inputWrapper.style.left = `${relativeX - this.config.padding}px`;
    this.inputWrapper.style.top = `${relativeY - this.config.padding}px`;
    this.inputWrapper.style.display = 'block';
    
    logger.info('TextEditingManager.showInputAt: 输入框已显示', {
      wrapperDisplay: this.inputWrapper.style.display,
      wrapperLeft: this.inputWrapper.style.left,
      wrapperTop: this.inputWrapper.style.top,
      isInDOM: document.body.contains(this.inputWrapper)
    });
    
    // 聚焦 - 延迟执行以避免与 mousedown 事件冲突
    this.inputElement.value = '';
    
    // 使用 requestAnimationFrame 确保 DOM 更新后再聚焦
    requestAnimationFrame(() => {
      if (this.inputElement && this.state.isEditing) {
        this.inputElement.focus();
        logger.debug('TextEditingManager.showInputAt: 输入框已聚焦');
      }
    });
  }
  
  /**
   * 完成编辑
   */
  public finishEditing(): void {
    if (!this.state.isEditing) return;
    
    const text = this.inputElement?.value.trim() || '';
    
    // 保存 actionId，因为 resetState 会清除它
    const editingActionId = this.state.actionId;
    
    if (text && this.state.position) {
      const event: TextCommitEvent = {
        text,
        position: this.state.position,
        fontSize: this.state.fontSize,
        fontFamily: this.state.fontFamily,
        color: this.state.color,
        actionId: this.state.actionId,
        isNew: this.state.actionId === null
      };
      
      this.emit('textCommit', event);
      logger.debug('文字编辑完成', event);
    }
    
    this.hideInput();
    this.resetState();
    // 传递 actionId 给 editEnd 事件，用于区分是哪个编辑会话结束
    this.emit('editEnd', { actionId: editingActionId });
  }
  
  /**
   * 取消编辑
   */
  public cancelEditing(): void {
    if (!this.state.isEditing) return;
    
    // 保存 actionId，因为 resetState 会清除它
    const editingActionId = this.state.actionId;
    
    this.hideInput();
    this.resetState();
    // 传递 actionId 给 editCancel 事件
    this.emit('editCancel', { actionId: editingActionId });
    // 同时触发 editEnd 事件，保持一致性
    this.emit('editEnd', { actionId: editingActionId });
    
    logger.debug('文字编辑已取消');
  }
  
  /**
   * 隐藏输入框
   */
  private hideInput(): void {
    if (this.inputWrapper) {
      this.inputWrapper.style.display = 'none';
    }
    if (this.inputElement) {
      this.inputElement.value = '';
    }
  }
  
  /**
   * 重置状态
   */
  private resetState(): void {
    this.state = {
      isEditing: false,
      position: null,
      text: '',
      fontSize: this.config.defaultFontSize,
      fontFamily: this.config.defaultFontFamily,
      color: this.config.defaultColor,
      actionId: null
    };
  }
  
  /**
   * 处理输入
   */
  private handleInput(): void {
    if (!this.inputElement || !this.state.position) return;
    
    this.state.text = this.inputElement.value;
    this.autoResize();
    
    // 发出实时变化事件
    this.emit('textChange', {
      text: this.state.text,
      position: this.state.position,
      fontSize: this.state.fontSize,
      fontFamily: this.state.fontFamily,
      color: this.state.color
    });
  }
  
  /**
   * 自动调整输入框大小
   */
  private autoResize(): void {
    if (!this.inputElement) return;
    
    // 重置高度以获取正确的 scrollHeight
    this.inputElement.style.height = 'auto';
    this.inputElement.style.width = 'auto';
    
    // 计算内容宽度
    const tempSpan = document.createElement('span');
    tempSpan.style.visibility = 'hidden';
    tempSpan.style.position = 'absolute';
    tempSpan.style.whiteSpace = 'pre';
    tempSpan.style.font = `${this.state.fontSize}px ${this.state.fontFamily}`;
    tempSpan.textContent = this.inputElement.value || ' ';
    document.body.appendChild(tempSpan);
    
    const contentWidth = Math.max(tempSpan.offsetWidth + 10, this.config.minWidth);
    document.body.removeChild(tempSpan);
    
    // 设置尺寸
    this.inputElement.style.width = `${contentWidth + this.config.padding * 2}px`;
    this.inputElement.style.height = `${Math.max(this.inputElement.scrollHeight, this.config.minHeight)}px`;
  }
  
  /**
   * 处理失焦
   */
  private handleBlur(_e: FocusEvent): void {
    // ⭐ 在 blur 发生时捕获当前的 actionId
    // 这样在延迟回调中可以判断是否仍然是同一个编辑会话
    const blurActionId = this.state.actionId;
    const blurText = this.inputElement?.value || '';
    
    // 清除之前的 blur 定时器（如果有）
    if (this.pendingBlurTimer) {
      clearTimeout(this.pendingBlurTimer);
      this.pendingBlurTimer = null;
    }
    
    // 延迟处理，避免点击其他按钮时立即关闭
    // 增加延迟时间，确保双击等复合事件有足够时间完成
    this.pendingBlurTimer = setTimeout(() => {
      this.pendingBlurTimer = null;
      
      // ⭐ 检查组件是否已销毁
      if (this.isDestroyed) {
        return;
      }
      
      // ⭐ 检查是否仍然是同一个编辑会话
      // 如果 actionId 已经变化（切换到其他文字），则不处理这个 blur
      if (this.state.actionId !== blurActionId) {
        logger.debug('TextEditingManager.handleBlur: actionId 已变化，跳过', {
          blurActionId,
          currentActionId: this.state.actionId
        });
        return;
      }
      
      // 再次检查是否仍在编辑状态
      // 如果在这段时间内 focus 被恢复，则不关闭
      if (this.state.isEditing && this.inputElement) {
        // 只有当输入框不是当前焦点，且输入框确实存在于 DOM 中时才关闭
        const isInputFocused = document.activeElement === this.inputElement;
        const isInputInDOM = document.body.contains(this.inputElement);
        
        if (!isInputFocused && isInputInDOM) {
          // 检查是否有文字输入，如果没有则只是取消编辑
          const hasText = blurText.trim().length > 0;
          if (hasText) {
            logger.debug('TextEditingManager.handleBlur: 输入框失焦，完成编辑');
            this.finishEditing();
          } else {
            logger.debug('TextEditingManager.handleBlur: 输入框失焦，无内容，取消编辑');
            this.cancelEditing();
          }
        }
      }
    }, 300); // 增加到 300ms
  }
  
  /**
   * 处理键盘事件
   */
  private handleKeydown(e: KeyboardEvent): void {
    // 阻止事件冒泡，防止 DrawBoard 的快捷键处理器拦截输入框内的键盘事件
    // 特别是 Backspace/Delete 键，它们被 DrawBoard 绑定为删除选中内容
    e.stopPropagation();
    
    if (e.key === 'Escape') {
      e.preventDefault();
      this.cancelEditing();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      // 单独 Enter 完成编辑，Shift+Enter 换行
      e.preventDefault();
      this.finishEditing();
    }
    // 其他键（包括 Backspace、Delete、字母、数字等）正常处理，不阻止默认行为
  }
  
  /**
   * 处理容器点击
   */
  private handleContainerMousedown(e: MouseEvent): void {
    // 如果点击的不是输入框，则完成编辑
    if (this.state.isEditing && 
        this.inputElement && 
        !this.inputElement.contains(e.target as Node)) {
      // 不立即完成，让 blur 事件处理
    }
  }
  
  /**
   * 更新配置
   */
  public updateConfig(config: Partial<TextEditingConfig>): void {
    this.config = { ...this.config, ...config };
    
    if (this.inputElement) {
      if (config.defaultFontFamily) {
        this.inputElement.style.fontFamily = config.defaultFontFamily;
      }
      if (config.defaultFontSize) {
        this.inputElement.style.fontSize = `${config.defaultFontSize}px`;
      }
      if (config.defaultColor) {
        this.inputElement.style.color = config.defaultColor;
      }
    }
  }
  
  /**
   * 设置字体大小（编辑中）
   */
  public setFontSize(size: number): void {
    this.state.fontSize = size;
    if (this.inputElement && this.state.isEditing) {
      this.inputElement.style.fontSize = `${size}px`;
      this.autoResize();
    }
  }
  
  /**
   * 设置字体（编辑中）
   */
  public setFontFamily(family: string): void {
    this.state.fontFamily = family;
    if (this.inputElement && this.state.isEditing) {
      this.inputElement.style.fontFamily = family;
      this.autoResize();
    }
  }
  
  /**
   * 设置颜色（编辑中）
   */
  public setColor(color: string): void {
    this.state.color = color;
    if (this.inputElement && this.state.isEditing) {
      this.inputElement.style.color = color;
    }
  }
  
  /**
   * 获取当前状态
   */
  public getState(): Readonly<TextEditingState> {
    return { ...this.state };
  }
  
  /**
   * 是否正在编辑
   */
  public isEditing(): boolean {
    return this.state.isEditing;
  }
  
  /**
   * 选中当前光标位置的单词
   * 用于双击选中单词的功能
   */
  public selectWordAtCursor(): void {
    if (!this.inputElement || !this.state.isEditing) return;
    
    const text = this.inputElement.value;
    const cursorPos = this.inputElement.selectionStart ?? 0;
    
    if (text.length === 0) return;
    
    // 找到单词的开始和结束位置
    const wordBoundary = this.findWordBoundary(text, cursorPos);
    
    // 设置选区
    this.inputElement.setSelectionRange(wordBoundary.start, wordBoundary.end);
    
    logger.debug('选中单词', { 
      word: text.substring(wordBoundary.start, wordBoundary.end),
      start: wordBoundary.start,
      end: wordBoundary.end
    });
  }
  
  /**
   * 查找单词边界
   */
  private findWordBoundary(text: string, position: number): { start: number; end: number } {
    // 单词分隔符（包括空格、标点等）
    const wordSeparators = /[\s,.\-:;!?'"()[\]{}\/\\<>@#$%^&*+=|~`]/;
    
    // 确保位置在有效范围内
    position = Math.max(0, Math.min(position, text.length));
    
    // 找到单词开始位置
    let start = position;
    while (start > 0 && !wordSeparators.test(text[start - 1])) {
      start--;
    }
    
    // 找到单词结束位置
    let end = position;
    while (end < text.length && !wordSeparators.test(text[end])) {
      end++;
    }
    
    // 如果没有选中任何内容（位置在分隔符上），尝试选中前一个或后一个单词
    if (start === end) {
      // 尝试选中后面的单词
      if (end < text.length) {
        while (end < text.length && wordSeparators.test(text[end])) {
          end++;
        }
        start = end;
        while (end < text.length && !wordSeparators.test(text[end])) {
          end++;
        }
      }
      // 如果还是没有，尝试选中前面的单词
      if (start === end && start > 0) {
        start--;
        while (start > 0 && wordSeparators.test(text[start])) {
          start--;
        }
        end = start + 1;
        while (start > 0 && !wordSeparators.test(text[start - 1])) {
          start--;
        }
      }
    }
    
    return { start, end };
  }
  
  /**
   * 选中所有文本
   */
  public selectAll(): void {
    if (!this.inputElement || !this.state.isEditing) return;
    this.inputElement.select();
  }
  
  /**
   * 订阅事件
   */
  public on<K extends keyof TextEditingEventHandler>(
    event: K,
    handler: TextEditingEventHandler[K]
  ): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
    
    return () => this.off(event, handler);
  }
  
  /**
   * 取消订阅
   */
  public off<K extends keyof TextEditingEventHandler>(
    event: K,
    handler: TextEditingEventHandler[K]
  ): void {
    this.eventHandlers.get(event)?.delete(handler);
  }
  
  /**
   * 发出事件
   */
  private emit<K extends keyof TextEditingEventHandler>(
    event: K,
    ...args: Parameters<TextEditingEventHandler[K]>
  ): void {
    this.eventHandlers.get(event)?.forEach(handler => {
      try {
        (handler as Function)(...args);
      } catch (error) {
        logger.error(`TextEditingManager 事件处理器错误 [${event}]`, error);
      }
    });
  }
  
  /**
   * 销毁
   */
  public destroy(): void {
    // 标记为已销毁，防止定时器回调执行
    this.isDestroyed = true;
    
    // 清除待处理的 blur 定时器
    if (this.pendingBlurTimer) {
      clearTimeout(this.pendingBlurTimer);
      this.pendingBlurTimer = null;
    }
    
    // 移除事件监听
    if (this.inputElement) {
      this.inputElement.removeEventListener('input', this.boundHandlers.onInput);
      this.inputElement.removeEventListener('blur', this.boundHandlers.onBlur);
      this.inputElement.removeEventListener('keydown', this.boundHandlers.onKeydown);
    }
    
    this.container.removeEventListener('mousedown', this.boundHandlers.onMousedown);
    
    // 移除 DOM 元素
    if (this.inputWrapper && this.inputWrapper.parentNode) {
      this.inputWrapper.parentNode.removeChild(this.inputWrapper);
    }
    
    // 清理状态
    this.eventHandlers.clear();
    this.inputElement = null;
    this.inputWrapper = null;
    
    logger.debug('TextEditingManager 已销毁');
  }
}

