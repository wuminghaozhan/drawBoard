export type ShortcutHandler = () => void;

export interface Shortcut {
  key: string;
  description: string;
  handler: ShortcutHandler;
}

export class ShortcutManager {
  private shortcuts: Map<string, Shortcut> = new Map();
  private isEnabled: boolean = true;

  constructor() {
    this.bindEvents();
  }

  private bindEvents(): void {
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.isEnabled) return;

    const shortcut = this.shortcuts.get(e.code);
    if (shortcut) {
      e.preventDefault();
      shortcut.handler();
    }
  }

  public register(key: string, description: string, handler: ShortcutHandler): void {
    this.shortcuts.set(key, { key, description, handler });
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

  public destroy(): void {
    this.shortcuts.clear();
  }
} 