# 圆形锚点调试指南

## 问题
圆形选择后还是显示8个锚点，而不是4个边界锚点 + 1个中心点。

## 调试步骤

### 1. 检查浏览器控制台

打开浏览器开发者工具（F12），查看控制台是否有以下日志：

**如果看到：**
```
CircleAnchorHandler: 生成了 5 个锚点 (4 个边界锚点 + 1 个中心点)
```
说明代码正常工作。

**如果看到：**
```
SelectTool: 未找到图形类型 "xxx" 的处理器，使用默认8个锚点
```
说明 `action.type` 不是 `'circle'`，需要检查绘制工具是否正确设置了类型。

### 2. 检查 action.type

在浏览器控制台执行：

```javascript
// 获取 DrawBoard 实例（需要先选中一个圆形）
// 在 SelectionDemo 页面，选中圆形后执行：

// 方法1：通过调试按钮
// 点击页面上的"🔍 调试选择"按钮，查看 SelectTool 调试信息

// 方法2：直接检查
// 在 SelectTool 的 generateResizeAnchorPoints 方法中添加断点
// 检查 action.type 的值
```

### 3. 验证代码修改

检查以下文件是否正确修改：

1. **CircleAnchorHandler.ts** - 应该生成5个锚点（4个边界 + 1个中心）
2. **SelectTool.ts** - 应该使用 CircleAnchorHandler 处理圆形
3. **SelectTool.ts** - drawResizeAnchorPoints 应该检查 shapeType

### 4. 清除缓存

```bash
# 清除 Vite 缓存
rm -rf node_modules/.vite

# 清除浏览器缓存
# Chrome: Ctrl+Shift+Delete (Windows) 或 Cmd+Shift+Delete (Mac)
# 选择"缓存的图片和文件"，点击"清除数据"

# 强制刷新浏览器
# Windows: Ctrl+F5
# Mac: Cmd+Shift+R
```

### 5. 检查 action.type 设置

如果 action.type 不是 'circle'，检查：

1. **CircleTool.ts** - 是否正确设置了 `getActionType()` 返回 'circle'
2. **DrawingHandler.ts** - `createDrawAction` 是否正确设置了 `type` 字段
3. **ToolManager** - 是否正确获取了工具类型

### 6. 添加更多调试信息

在 `SelectTool.ts` 的 `generateResizeAnchorPoints` 方法中添加：

```typescript
logger.debug('SelectTool: 生成锚点', {
  actionType: action.type,
  hasHandler: !!handler,
  handlerType: handler?.constructor?.name,
  anchorsCount: anchors?.length || 0
});
```

### 7. 检查多选场景

如果选择了多个图形，会使用 `generateMultiSelectionAnchors`，这会生成8个锚点。确保只选择了一个圆形。

## 常见问题

### Q: 为什么还是8个锚点？

**A:** 可能的原因：
1. `action.type` 不是 `'circle'`，所以没有找到 CircleAnchorHandler
2. 选择了多个图形（多选场景使用8个锚点）
3. 浏览器缓存未清除
4. 代码没有重新编译

**解决方案：**
1. 检查浏览器控制台的日志，确认 action.type 的值
2. 确保只选择了一个圆形
3. 清除缓存并强制刷新
4. 重启开发服务器

### Q: 如何确认 action.type 的值？

**A:** 在浏览器控制台执行：

```javascript
// 在 SelectionDemo 页面，选中圆形后
// 点击"🔍 调试选择"按钮，查看调试信息
// 或者添加断点在 SelectTool.generateResizeAnchorPoints 方法中
```

### Q: 代码修改了但没生效？

**A:** 可能的原因：
1. Vite 缓存未清除
2. 浏览器缓存未清除
3. 代码没有保存
4. 开发服务器没有重新编译

**解决方案：**
1. 清除 Vite 缓存：`rm -rf node_modules/.vite`
2. 清除浏览器缓存并强制刷新
3. 检查代码是否保存
4. 重启开发服务器：`npm run dev`

## 预期行为

修复后，圆形选择应该：
- 显示 4 个圆形边界锚点（上、下、左、右）
- 显示 1 个圆形中心点
- 鼠标悬停时锚点放大并加粗
- 拖拽时锚点变色

## 联系支持

如果以上步骤都无法解决问题，请提供：
1. 浏览器控制台的完整日志
2. action.type 的值
3. 是否选择了多个图形
4. 浏览器版本和操作系统信息

