import { logger } from '../utils/Logger';

export type ShortcutHandler = () => void;

export interface Shortcut {
  key: string;
  description: string;
  handler: ShortcutHandler;
  priority?: number; // 优先级，数字越大优先级越高
}

export interface ShortcutKey {
  code: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
}

export class ShortcutManager {
  private shortcuts: Map<string, Shortcut> = new Map();
  private isEnabled: boolean = true;
  private boundHandleKeyDown: (e: KeyboardEvent) => void; // 绑定的事件处理器

  constructor() {
    // 绑定事件处理器，避免内存泄漏
    this.boundHandleKeyDown = this.handleKeyDown.bind(this);
    this.bindEvents();
  }

  // 绑定事件处理器
  private bindEvents(): void {
    document.addEventListener('keydown', this.boundHandleKeyDown);
  }

  // 解绑事件处理器
  private unbindEvents(): void {
    document.removeEventListener('keydown', this.boundHandleKeyDown);
  }

  // 处理键盘事件
  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.isEnabled) return;

    // 解析快捷键组合
    const shortcutKey = this.parseKeyEvent(e);
    const shortcutId = this.createShortcutId(shortcutKey);
    
    const shortcut = this.shortcuts.get(shortcutId);
    if (shortcut) {
      e.preventDefault();
      e.stopPropagation();
      shortcut.handler();
    }
  }

  /**
   * 解析键盘事件为快捷键对象
   */
  private parseKeyEvent(e: KeyboardEvent): ShortcutKey {
    return {
      code: e.code,
      ctrl: e.ctrlKey,
      alt: e.altKey,
      shift: e.shiftKey,
      meta: e.metaKey
    };
  }

  /**
   * 创建快捷键ID
   */
  private createShortcutId(key: ShortcutKey): string {
    const parts = [];
    if (key.ctrl) parts.push('Ctrl');
    if (key.alt) parts.push('Alt');
    if (key.shift) parts.push('Shift');
    if (key.meta) parts.push('Meta');
    parts.push(key.code);
    return parts.join('+');
  }



  /**
   * 注册快捷键
   * @param key 快捷键字符串，如 "Ctrl+S", "Alt+Shift+A"
   * @param description 快捷键描述
   * @param handler 处理函数
   * @param priority 优先级（可选）
   * @returns 是否注册成功
   */
  public register(key: string, description: string, handler: ShortcutHandler, priority: number = 0): boolean {
    try {
      // 验证快捷键格式
      if (!this.validateShortcut(key)) {
        logger.warn(`无效的快捷键格式: ${key}`);
        return false;
      }

      // 检查冲突
      if (this.shortcuts.has(key)) {
        const existing = this.shortcuts.get(key)!;
        if (existing.priority && existing.priority >= priority) {
          logger.warn(`快捷键冲突: ${key}，已存在更高优先级的快捷键`);
          return false;
        }
      }

              this.shortcuts.set(key, { key, description, handler, priority });
        logger.info(`快捷键注册成功: ${key} - ${description}`);
        return true;
    } catch (error) {
      logger.error(`注册快捷键失败: ${key}`, error);
      return false;
    }
  }

  /**
   * 验证快捷键格式
   */
  private validateShortcut(key: string): boolean {
    if (!key || typeof key !== 'string') return false;
    
    const parts = key.split('+').map(s => s.trim());
    if (parts.length === 0) return false;
    
    // 检查是否至少有一个按键
    const hasKey = parts.some(part => 
      !['ctrl', 'alt', 'shift', 'meta'].includes(part.toLowerCase())
    );
    
    return hasKey;
  }

  /**
   * 检查快捷键冲突
   */
  public hasConflict(key: string): boolean {
    return this.shortcuts.has(key);
  }

  /**
   * 获取冲突的快捷键
   */
  public getConflicts(key: string): Shortcut[] {
    const conflicts: Shortcut[] = [];
    for (const [shortcutKey, shortcut] of this.shortcuts) {
      if (shortcutKey === key) {
        conflicts.push(shortcut);
      }
    }
    return conflicts;
  }

  public unregister(key: string): void {
    this.shortcuts.delete(key);
  }

  public enable(): void {
    this.isEnabled = true;
  }

  public disable(): void {
    this.isEnabled = false;
  }

  public getShortcuts(): Shortcut[] {
    return Array.from(this.shortcuts.values());
  }

  public getShortcut(key: string): Shortcut | undefined {
    return this.shortcuts.get(key);
  }

  /**
   * 批量注册快捷键
   */
  public registerBatch(shortcuts: Array<{key: string, description: string, handler: ShortcutHandler, priority?: number}>): number {
    let successCount = 0;
    for (const shortcut of shortcuts) {
      if (this.register(shortcut.key, shortcut.description, shortcut.handler, shortcut.priority)) {
        successCount++;
      }
    }
    return successCount;
  }

  /**
   * 批量注销快捷键
   */
  public unregisterBatch(keys: string[]): number {
    let successCount = 0;
    for (const key of keys) {
      if (this.shortcuts.has(key)) {
        this.shortcuts.delete(key);
        successCount++;
      }
    }
    return successCount;
  }

  /**
   * 格式化快捷键显示
   */
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

  /**
   * 获取所有快捷键的格式化列表
   */
  public getFormattedShortcuts(): Array<{key: string, formattedKey: string, description: string}> {
    return this.getShortcuts().map(shortcut => ({
      key: shortcut.key,
      formattedKey: this.formatShortcut(shortcut.key),
      description: shortcut.description
    }));
  }

  /**
   * 检查快捷键是否启用
   */
  public getEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * 获取快捷键数量
   */
  public getShortcutCount(): number {
    return this.shortcuts.size;
  }

  /**
   * 清空所有快捷键
   */
  public clear(): void {
    this.shortcuts.clear();
  }

  /**
   * 按优先级排序获取快捷键
   */
  public getShortcutsByPriority(): Shortcut[] {
    return this.getShortcuts().sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  public destroy(): void {
    this.shortcuts.clear();
    this.unbindEvents();
    this.isEnabled = false;
    logger.info('🗑️ ShortcutManager destroyed');
  }
} 