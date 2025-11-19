import { ShortcutConfigManager, type ShortcutConfig, type ShortcutHandlers } from '../../libs/drawBoard/core/ShortcutConfigManager';
import type { ShortcutManager } from '../../libs/drawBoard/shortcuts/ShortcutManager';

describe('ShortcutConfigManager', () => {
  describe('createDefaultShortcuts', () => {
    const createMockHandlers = (): ShortcutHandlers => ({
      undo: jest.fn().mockResolvedValue(true),
      redo: jest.fn().mockResolvedValue(true),
      deleteSelection: jest.fn(),
      copySelection: jest.fn(),
      cutSelection: jest.fn(),
      pasteSelection: jest.fn().mockResolvedValue(undefined),
      selectAll: jest.fn(),
      clearSelection: jest.fn(),
      cancelDrag: jest.fn().mockReturnValue(false),
      saveAsImage: jest.fn(),
      saveAsJPEG: jest.fn()
    });

    it('应该为 Mac 平台创建正确的快捷键', () => {
      const handlers = createMockHandlers();
      const shortcuts = ShortcutConfigManager.createDefaultShortcuts(true, handlers);

      expect(shortcuts.length).toBeGreaterThan(0);
      
      // 检查 Mac 特定的快捷键
      const undoShortcut = shortcuts.find(s => s.description === '撤销');
      expect(undoShortcut).toBeDefined();
      expect(undoShortcut?.key).toBe('Meta+Z');

      const redoShortcut = shortcuts.find(s => s.description === '重做');
      expect(redoShortcut).toBeDefined();
      expect(redoShortcut?.key).toBe('Meta+Shift+Z');

      const copyShortcut = shortcuts.find(s => s.description === '复制选中内容');
      expect(copyShortcut).toBeDefined();
      expect(copyShortcut?.key).toBe('Meta+C');
    });

    it('应该为 Windows/Linux 平台创建正确的快捷键', () => {
      const handlers = createMockHandlers();
      const shortcuts = ShortcutConfigManager.createDefaultShortcuts(false, handlers);

      expect(shortcuts.length).toBeGreaterThan(0);
      
      // 检查 Windows/Linux 特定的快捷键
      const undoShortcut = shortcuts.find(s => s.description === '撤销');
      expect(undoShortcut).toBeDefined();
      expect(undoShortcut?.key).toBe('Ctrl+Z');

      const redoShortcut = shortcuts.find(s => s.description === '重做');
      expect(redoShortcut).toBeDefined();
      expect(redoShortcut?.key).toBe('Ctrl+Y');

      const copyShortcut = shortcuts.find(s => s.description === '复制选中内容');
      expect(copyShortcut).toBeDefined();
      expect(copyShortcut?.key).toBe('Ctrl+C');
    });

    it('应该包含所有必需的快捷键', () => {
      const handlers = createMockHandlers();
      const shortcuts = ShortcutConfigManager.createDefaultShortcuts(false, handlers);

      const descriptions = shortcuts.map(s => s.description);
      
      expect(descriptions).toContain('撤销');
      expect(descriptions).toContain('重做');
      expect(descriptions).toContain('删除选中内容');
      expect(descriptions).toContain('复制选中内容');
      expect(descriptions).toContain('剪切选中内容');
      expect(descriptions).toContain('粘贴');
      expect(descriptions).toContain('全选');
      expect(descriptions).toContain('取消选择/取消拖拽');
      expect(descriptions).toContain('保存为图片');
      expect(descriptions).toContain('另存为JPEG');
    });

    it('应该设置正确的优先级', () => {
      const handlers = createMockHandlers();
      const shortcuts = ShortcutConfigManager.createDefaultShortcuts(false, handlers);

      const undoShortcut = shortcuts.find(s => s.description === '撤销');
      expect(undoShortcut?.priority).toBe(10);

      const deleteShortcut = shortcuts.find(s => s.description === '删除选中内容');
      expect(deleteShortcut?.priority).toBe(9);

      const copyShortcut = shortcuts.find(s => s.description === '复制选中内容');
      expect(copyShortcut?.priority).toBe(8);

      const selectAllShortcut = shortcuts.find(s => s.description === '全选');
      expect(selectAllShortcut?.priority).toBe(7);

      const escapeShortcut = shortcuts.find(s => s.description === '取消选择/取消拖拽');
      expect(escapeShortcut?.priority).toBe(6);

      const saveShortcut = shortcuts.find(s => s.description === '保存为图片');
      expect(saveShortcut?.priority).toBe(5);
    });

    it('应该正确绑定处理器', () => {
      const handlers = createMockHandlers();
      const shortcuts = ShortcutConfigManager.createDefaultShortcuts(false, handlers);

      const undoShortcut = shortcuts.find(s => s.description === '撤销');
      undoShortcut?.handler();
      expect(handlers.undo).toHaveBeenCalled();

      const deleteShortcut = shortcuts.find(s => s.description === '删除选中内容');
      deleteShortcut?.handler();
      expect(handlers.deleteSelection).toHaveBeenCalled();
    });

    it('应该正确处理取消拖拽逻辑', () => {
      const handlers = createMockHandlers();
      handlers.cancelDrag = jest.fn().mockReturnValue(true);
      
      const shortcuts = ShortcutConfigManager.createDefaultShortcuts(false, handlers);
      const escapeShortcut = shortcuts.find(s => s.key === 'Escape');
      
      escapeShortcut?.handler();
      expect(handlers.cancelDrag).toHaveBeenCalled();
      expect(handlers.clearSelection).not.toHaveBeenCalled();
    });

    it('应该在未拖拽时清除选择', () => {
      const handlers = createMockHandlers();
      handlers.cancelDrag = jest.fn().mockReturnValue(false);
      
      const shortcuts = ShortcutConfigManager.createDefaultShortcuts(false, handlers);
      const escapeShortcut = shortcuts.find(s => s.key === 'Escape');
      
      escapeShortcut?.handler();
      expect(handlers.cancelDrag).toHaveBeenCalled();
      expect(handlers.clearSelection).toHaveBeenCalled();
    });
  });

  describe('registerShortcuts', () => {
    it('应该注册快捷键并返回成功数量', () => {
      const mockShortcutManager: jest.Mocked<ShortcutManager> = {
        registerBatch: jest.fn().mockReturnValue(5)
      } as any;

      const shortcuts: ShortcutConfig[] = [
        { key: 'Ctrl+Z', description: '撤销', handler: jest.fn(), priority: 10 },
        { key: 'Ctrl+Y', description: '重做', handler: jest.fn(), priority: 10 }
      ];

      const successCount = ShortcutConfigManager.registerShortcuts(mockShortcutManager, shortcuts);
      
      expect(mockShortcutManager.registerBatch).toHaveBeenCalledWith(shortcuts);
      expect(successCount).toBe(5);
    });

    it('应该处理空快捷键数组', () => {
      const mockShortcutManager: jest.Mocked<ShortcutManager> = {
        registerBatch: jest.fn().mockReturnValue(0)
      } as any;

      const successCount = ShortcutConfigManager.registerShortcuts(mockShortcutManager, []);
      
      expect(mockShortcutManager.registerBatch).toHaveBeenCalledWith([]);
      expect(successCount).toBe(0);
    });
  });

  describe('detectOS', () => {
    let originalPlatform: string;

    beforeEach(() => {
      originalPlatform = navigator.platform;
    });

    afterEach(() => {
      Object.defineProperty(navigator, 'platform', {
        writable: true,
        value: originalPlatform
      });
    });

    it('应该检测 Mac 平台', () => {
      Object.defineProperty(navigator, 'platform', {
        writable: true,
        value: 'MacIntel'
      });
      
      const os = ShortcutConfigManager.detectOS();
      expect(os).toBe('mac');
    });

    it('应该检测非 Mac 平台', () => {
      Object.defineProperty(navigator, 'platform', {
        writable: true,
        value: 'Win32'
      });
      
      const os = ShortcutConfigManager.detectOS();
      expect(os).toBe('other');
    });

    it('应该处理大小写不敏感', () => {
      Object.defineProperty(navigator, 'platform', {
        writable: true,
        value: 'macintel'
      });
      
      const os = ShortcutConfigManager.detectOS();
      expect(os).toBe('mac');
    });
  });
});

