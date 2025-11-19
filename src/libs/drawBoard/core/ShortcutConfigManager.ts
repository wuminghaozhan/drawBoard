import type { ShortcutManager } from '../shortcuts/ShortcutManager';
import { logger } from '../utils/Logger';

/**
 * 快捷键配置接口
 */
export interface ShortcutConfig {
  key: string;
  description: string;
  handler: () => void | Promise<void>;
  priority: number;
}

/**
 * 快捷键处理器接口
 */
export interface ShortcutHandlers {
  undo: () => Promise<boolean>;
  redo: () => Promise<boolean>;
  deleteSelection: () => void;
  copySelection: () => void;
  cutSelection: () => void;
  pasteSelection: () => Promise<void>;
  selectAll: () => void;
  clearSelection: () => void;
  cancelDrag: () => boolean;
  saveAsImage: () => void;
  saveAsJPEG: () => void;
}

/**
 * 快捷键配置管理器
 * 负责快捷键的配置和注册，提高代码可维护性
 */
export class ShortcutConfigManager {
  /**
   * 创建默认快捷键配置
   */
  static createDefaultShortcuts(
    isMac: boolean,
    handlers: ShortcutHandlers
  ): ShortcutConfig[] {
    const shortcuts: ShortcutConfig[] = [];
    
    // 撤销/重做
    if (isMac) {
      shortcuts.push(
        { key: 'Meta+Z', description: '撤销', handler: async () => { await handlers.undo(); }, priority: 10 },
        { key: 'Meta+Shift+Z', description: '重做', handler: async () => { await handlers.redo(); }, priority: 10 }
      );
    } else {
      shortcuts.push(
        { key: 'Ctrl+Z', description: '撤销', handler: async () => { await handlers.undo(); }, priority: 10 },
        { key: 'Ctrl+Y', description: '重做', handler: async () => { await handlers.redo(); }, priority: 10 },
        { key: 'Ctrl+Shift+Z', description: '重做 (备用)', handler: async () => { await handlers.redo(); }, priority: 10 }
      );
    }
    
    // 删除
    shortcuts.push(
      { key: 'Delete', description: '删除选中内容', handler: handlers.deleteSelection, priority: 9 },
      { key: 'Backspace', description: '删除选中内容', handler: handlers.deleteSelection, priority: 9 }
    );
    
    // 复制/剪切/粘贴
    if (isMac) {
      shortcuts.push(
        { key: 'Meta+C', description: '复制选中内容', handler: handlers.copySelection, priority: 8 },
        { key: 'Meta+X', description: '剪切选中内容', handler: handlers.cutSelection, priority: 8 },
        { key: 'Meta+V', description: '粘贴', handler: () => handlers.pasteSelection(), priority: 8 }
      );
    } else {
      shortcuts.push(
        { key: 'Ctrl+C', description: '复制选中内容', handler: handlers.copySelection, priority: 8 },
        { key: 'Ctrl+X', description: '剪切选中内容', handler: handlers.cutSelection, priority: 8 },
        { key: 'Ctrl+V', description: '粘贴', handler: () => handlers.pasteSelection(), priority: 8 }
      );
    }
    
    // 全选
    if (isMac) {
      shortcuts.push(
        { key: 'Meta+A', description: '全选', handler: handlers.selectAll, priority: 7 }
      );
    } else {
      shortcuts.push(
        { key: 'Ctrl+A', description: '全选', handler: handlers.selectAll, priority: 7 }
      );
    }
    
    // 取消选择 / 取消拖拽
    shortcuts.push({
      key: 'Escape',
      description: '取消选择/取消拖拽',
      handler: () => {
        const wasDragging = handlers.cancelDrag();
        if (!wasDragging) {
          handlers.clearSelection();
        }
      },
      priority: 6
    });
    
    // 保存
    if (isMac) {
      shortcuts.push(
        { key: 'Meta+S', description: '保存为图片', handler: handlers.saveAsImage, priority: 5 },
        { key: 'Meta+Shift+S', description: '另存为JPEG', handler: handlers.saveAsJPEG, priority: 5 }
      );
    } else {
      shortcuts.push(
        { key: 'Ctrl+S', description: '保存为图片', handler: handlers.saveAsImage, priority: 5 },
        { key: 'Ctrl+Shift+S', description: '另存为JPEG', handler: handlers.saveAsJPEG, priority: 5 }
      );
    }
    
    return shortcuts;
  }
  
  /**
   * 注册快捷键
   */
  static registerShortcuts(
    shortcutManager: ShortcutManager,
    configs: ShortcutConfig[]
  ): number {
    const successCount = shortcutManager.registerBatch(configs);
    logger.info(`已注册 ${successCount} 个快捷键`);
    return successCount;
  }
  
  /**
   * 检测操作系统
   */
  static detectOS(): 'mac' | 'other' {
    return navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? 'mac' : 'other';
  }
}

