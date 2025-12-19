# 📖 DrawBoard 使用指南

## 📋 指南清单

| 指南 | 说明 |
|------|------|
| [QUICK_START_TRANSFORM.md](./QUICK_START_TRANSFORM.md) | 变换工具快速入门 |
| [SELECTION_USAGE_GUIDE.md](./SELECTION_USAGE_GUIDE.md) | 选择功能使用指南 |
| [POLYLINE_USAGE_GUIDE.md](./POLYLINE_USAGE_GUIDE.md) | 折线工具使用指南 ⭐ NEW |
| [CURSOR_STYLES.md](./CURSOR_STYLES.md) | 光标样式配置 |
| [MOBILE_ADAPTATION.md](./MOBILE_ADAPTATION.md) | 移动端适配 |
| [PLUGIN_SYSTEM_USAGE.md](./PLUGIN_SYSTEM_USAGE.md) | 插件系统使用 |
| [PROTOCOL_PARSER_USAGE.md](./PROTOCOL_PARSER_USAGE.md) | 协议解析器使用 |
| [TEST_PAGE_GUIDE.md](./TEST_PAGE_GUIDE.md) | 测试页面指南 |

---

## 🎯 快速开始

### 基础使用

```typescript
import { DrawBoard } from '@/libs/drawBoard';

// 创建画板实例
const drawBoard = DrawBoard.getInstance(container, {
  maxHistorySize: 100,
  enableShortcuts: true,
});

// 设置工具
await drawBoard.setTool('pen');

// 设置颜色和线宽
drawBoard.setColor('#ff0000');
drawBoard.setLineWidth(3);

// 撤销/重做
await drawBoard.undo();
await drawBoard.redo();

// 销毁实例
await drawBoard.destroy();
```

### 选择功能

```typescript
// 切换到选择工具
await drawBoard.setTool('select');

// 获取选中的 actions
const selected = drawBoard.getSelectedActions();

// 全选
drawBoard.selectAll();

// 删除选中
await drawBoard.deleteSelection();

// 复制/剪切/粘贴
drawBoard.copySelection();
drawBoard.cutSelection();
await drawBoard.pasteSelection();

// 复制选中（通过选择操作栏）
await drawBoard.duplicateSelection();

// 更新选中图形样式
await drawBoard.updateSelectionStyle({
  strokeColor: '#ff0000',
  fillColor: 'rgba(255,0,0,0.2)',
  lineWidth: 3
});

// 图层控制
await drawBoard.moveSelectionToTop();
await drawBoard.moveSelectionToBottom();

// 锁定/解锁
await drawBoard.toggleSelectionLock(true);  // 锁定
await drawBoard.toggleSelectionLock(false); // 解锁
```

### 图层管理

```typescript
// 创建图层
const layer = drawBoard.createVirtualLayer('新图层');

// 设置活动图层
drawBoard.setActiveVirtualLayer(layer.id);

// 获取所有图层
const layers = drawBoard.getAllVirtualLayers();

// 设置图层可见性
drawBoard.setVirtualLayerVisible(layer.id, false);

// 删除图层
drawBoard.deleteVirtualLayer(layer.id);
```

---

**最后更新**: 2024-12
