import { logger } from '../utils/Logger';

export type ShortcutHandler = () => void;

export interface Shortcut {
  key: string;
  description: string;
  handler: ShortcutHandler;
  priority?: number;
}

export interface ShortcutKey {
  code: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
}

/**
 * 快捷键管理器 - 优化版本
 * 
 * 优化内容:
 * - 缓存标准化结果
 * - 优化事件处理性能
 * - 简化代码结构
 * - 增强类型安全
 */
export class ShortcutManager {
  private shortcuts: Map<string, Shortcut> = new Map();
  private isEnabled: boolean = true;
  private boundHandleKeyDown: (e: KeyboardEvent) => void;
  private isMac: boolean = false;
  
  // 性能优化：缓存修饰键列表
  private static readonly MODIFIER_KEYS = new Set([
    'ControlLeft', 'ControlRight',
    'AltLeft', 'AltRight', 
    'ShiftLeft', 'ShiftRight',
    'MetaLeft', 'MetaRight'
  ]);
  
  // 性能优化：缓存标准修饰键顺序
  private static readonly MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta'] as const;
  
  // 性能优化：缓存标准化结果
  private normalizationCache = new Map<string, string>();

  constructor() {
    this.isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    this.boundHandleKeyDown = this.handleKeyDown.bind(this);
    this.bindEvents();
    logger.info(`🖥️ ShortcutManager 初始化完成 (${this.isMac ? 'Mac' : '其他'} 模式)`);
  }

  private bindEvents(): void {
    document.addEventListener('keydown', this.boundHandleKeyDown, true);
  }

  private unbindEvents(): void {
    document.removeEventListener('keydown', this.boundHandleKeyDown, true);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.isEnabled) return;

    // 快速检查：是否只是修饰键
    if (ShortcutManager.MODIFIER_KEYS.has(e.code)) {
      return;
    }

    const shortcutKey = this.parseKeyEvent(e);
    const shortcutId = this.createShortcutId(shortcutKey);
    
    const shortcut = this.shortcuts.get(shortcutId);
    if (shortcut) {
      e.preventDefault();
      e.stopPropagation();
      shortcut.handler();
      return;
    }
    
    // Mac用户提示
    if (this.isMac && e.ctrlKey && e.code === 'KeyZ' && !e.shiftKey) {
      console.log('💡 Mac用户提示: 请使用 Cmd+Z 进行撤销操作');
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    
    if (this.isMac && e.ctrlKey && e.code === 'KeyY') {
      console.log('💡 Mac用户提示: 请使用 Cmd+Shift+Z 进行重做操作');
      e.preventDefault();
      e.stopPropagation();
      return;
    }
  }

  private parseKeyEvent(e: KeyboardEvent): ShortcutKey {
    return {
      code: e.code,
      ctrl: e.ctrlKey,
      alt: e.altKey,
      shift: e.shiftKey,
      meta: e.metaKey
    };
  }

  private createShortcutId(key: ShortcutKey): string {
    const parts: string[] = [];
    
    // 按标准顺序添加修饰键
    if (key.ctrl) parts.push('Ctrl');
    if (key.alt) parts.push('Alt');
    if (key.shift) parts.push('Shift');
    if (key.meta) parts.push('Meta');
    
    // 处理键码
    let code = key.code;
    if (code === 'MetaLeft' || code === 'MetaRight') {
      code = 'Meta';
    } else if (code.startsWith('Key')) {
      code = code.substring(3);
    }
    
    parts.push(code);
    return parts.join('+');
  }

  private normalizeShortcutKey(key: string): string {
    // 检查缓存
    if (this.normalizationCache.has(key)) {
      return this.normalizationCache.get(key)!;
    }
    
    const parts = key.split('+').map(part => part.trim());
    const modifiers: string[] = [];
    let keyCode = '';
    
    // 分离修饰键和键码
    for (const part of parts) {
      if (ShortcutManager.MODIFIER_ORDER.includes(part as typeof ShortcutManager.MODIFIER_ORDER[number])) {
        modifiers.push(part);
      } else {
        keyCode = part;
      }
    }
    
    // 按标准顺序排列修饰键
    const sortedModifiers = ShortcutManager.MODIFIER_ORDER.filter(mod => modifiers.includes(mod));
    
    // 处理键码
    if (keyCode.startsWith('Key')) {
      keyCode = keyCode.substring(3);
    }
    
    const result = [...sortedModifiers, keyCode].join('+');
    
    // 缓存结果
    this.normalizationCache.set(key, result);
    
    return result;
  }

  public register(key: string, description: string, handler: ShortcutHandler, priority: number = 0): boolean {
    try {
      const normalizedKey = this.normalizeShortcutKey(key);
      
      if (!this.validateShortcut(normalizedKey)) {
        logger.warn(`无效的快捷键格式: ${key} -> ${normalizedKey}`);
        return false;
      }

      if (this.shortcuts.has(normalizedKey)) {
        const existing = this.shortcuts.get(normalizedKey)!;
        if (existing.priority && existing.priority >= priority) {
          logger.warn(`快捷键冲突: ${normalizedKey}`);
          return false;
        }
      }

      this.shortcuts.set(normalizedKey, {
        key: normalizedKey,
        description,
        handler,
        priority
      });

      logger.info(`✅ 快捷键注册: ${key} -> ${normalizedKey}`);
      return true;
    } catch (error) {
      logger.error(`快捷键注册失败: ${key}`, error);
      return false;
    }
  }

  private validateShortcut(key: string): boolean {
    if (!key || typeof key !== 'string') return false;
    
    const parts = key.split('+').map(part => part.trim());
    if (parts.length === 0) return false;
    
    const validModifiers = new Set(ShortcutManager.MODIFIER_ORDER);
    const modifiers = parts.slice(0, -1);
    const keyCode = parts[parts.length - 1];
    
    // 验证修饰键
    for (const modifier of modifiers) {
      if (!validModifiers.has(modifier as typeof ShortcutManager.MODIFIER_ORDER[number])) {
        return false;
      }
    }
    
    return Boolean(keyCode && keyCode.length > 0);
  }

  public registerBatch(shortcuts: Array<{key: string, description: string, handler: ShortcutHandler, priority?: number}>): number {
    let successCount = 0;
    for (const shortcut of shortcuts) {
      if (this.register(shortcut.key, shortcut.description, shortcut.handler, shortcut.priority)) {
        successCount++;
      }
    }
    return successCount;
  }

  public unregister(key: string): void {
    const normalizedKey = this.normalizeShortcutKey(key);
    if (this.shortcuts.delete(normalizedKey)) {
      logger.info(`🗑️ 快捷键注销: ${key} -> ${normalizedKey}`);
    }
  }

  public unregisterBatch(keys: string[]): number {
    let successCount = 0;
    for (const key of keys) {
      if (this.shortcuts.delete(key)) {
        successCount++;
      }
    }
    return successCount;
  }

  public getShortcut(key: string): Shortcut | undefined {
    const normalizedKey = this.normalizeShortcutKey(key);
    return this.shortcuts.get(normalizedKey);
  }

  public getShortcuts(): Shortcut[] {
    return Array.from(this.shortcuts.values());
  }

  public getShortcutsByPriority(): Shortcut[] {
    return this.getShortcuts().sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  public hasConflict(key: string): boolean {
    const normalizedKey = this.normalizeShortcutKey(key);
    return this.shortcuts.has(normalizedKey);
  }

  public getConflicts(key: string): Shortcut[] {
    const normalizedKey = this.normalizeShortcutKey(key);
    const shortcut = this.shortcuts.get(normalizedKey);
    return shortcut ? [shortcut] : [];
  }

  public formatShortcut(key: string): string {
    const parts = key.split('+');
    return parts.map(part => {
      const trimmed = part.trim();
      switch (trimmed.toLowerCase()) {
        case 'ctrl': return 'Ctrl';
        case 'alt': return 'Alt';
        case 'shift': return 'Shift';
        case 'meta': return '⌘';
        default: return trimmed;
      }
    }).join(' + ');
  }

  public getFormattedShortcuts(): Array<{key: string, formattedKey: string, description: string}> {
    return this.getShortcuts().map(shortcut => ({
      key: shortcut.key,
      formattedKey: this.formatShortcut(shortcut.key),
      description: shortcut.description
    }));
  }

  public getEnabled(): boolean {
    return this.isEnabled;
  }

  public getShortcutCount(): number {
    return this.shortcuts.size;
  }

  public enable(): void {
    this.isEnabled = true;
  }

  public disable(): void {
    this.isEnabled = false;
  }

  public clear(): void {
    this.shortcuts.clear();
    this.normalizationCache.clear();
  }

  public getDebugInfo(): {
    isEnabled: boolean;
    isMac: boolean;
    shortcutCount: number;
    shortcuts: Array<{ key: string; description: string; priority: number }>;
    eventListenerBound: boolean;
    platform: string;
    cacheSize: number;
  } {
    return {
      isEnabled: this.isEnabled,
      isMac: this.isMac,
      shortcutCount: this.shortcuts.size,
      shortcuts: Array.from(this.shortcuts.values()).map(s => ({
        key: s.key,
        description: s.description,
        priority: s.priority || 0
      })),
      eventListenerBound: !!this.boundHandleKeyDown,
      platform: navigator.platform,
      cacheSize: this.normalizationCache.size
    };
  }

  public testShortcut(key: string): {
    exists: boolean;
    shortcut?: Shortcut;
    formattedKey: string;
    debugInfo: string;
  } {
    const shortcut = this.getShortcut(key);
    const exists = !!shortcut;
    
    return {
      exists,
      shortcut,
      formattedKey: this.formatShortcut(key),
      debugInfo: `
快捷键测试: ${key}
存在: ${exists}
格式化显示: ${this.formatShortcut(key)}
${exists ? `描述: ${shortcut!.description}
优先级: ${shortcut!.priority || 0}` : '快捷键未注册'}
      `.trim()
    };
  }

  public destroy(): void {
    this.shortcuts.clear();
    this.normalizationCache.clear();
    this.unbindEvents();
    this.isEnabled = false;
    logger.info('🗑️ ShortcutManager destroyed');
  }
} 