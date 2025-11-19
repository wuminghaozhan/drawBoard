# 强制刷新指南 - 圆形锚点修复

## ⚠️ 重要：代码已修改但未生效

代码修改已经完成并验证正确，但浏览器可能缓存了旧代码。

## 🔥 立即执行的强制刷新步骤

### 1. 停止开发服务器
```bash
# 在运行 npm run dev 的终端按 Ctrl+C 停止服务器
```

### 2. 清除所有缓存
```bash
# 清除 Vite 缓存
rm -rf node_modules/.vite

# 清除 dist 目录（如果存在）
rm -rf dist
```

### 3. 重新启动开发服务器
```bash
npm run dev
```

### 4. 在浏览器中执行以下操作

#### Chrome/Edge:
1. 按 `F12` 打开开发者工具
2. 右键点击浏览器刷新按钮
3. 选择"清空缓存并硬性重新加载"（Empty Cache and Hard Reload）

或者：
1. 按 `Ctrl+Shift+Delete` (Windows) 或 `Cmd+Shift+Delete` (Mac)
2. 选择"缓存的图片和文件"
3. 时间范围选择"全部时间"
4. 点击"清除数据"
5. 关闭并重新打开浏览器标签页

#### Firefox:
1. 按 `Ctrl+Shift+Delete` (Windows) 或 `Cmd+Shift+Delete` (Mac)
2. 选择"缓存"
3. 时间范围选择"全部"
4. 点击"立即清除"
5. 按 `Ctrl+F5` 强制刷新

### 5. 验证修复

1. **绘制一个圆形**：使用圆形工具（⭕）绘制
2. **切换到选择工具**：点击选择工具（🎯）
3. **选中圆形**：点击圆形（只选择一个）
4. **检查锚点**：
   - 应该看到 **4个圆形边界锚点**（上、下、左、右）
   - 应该看到 **1个圆形中心点**
   - 总共 **5个锚点**（不是8个）

### 6. 检查浏览器控制台

打开开发者工具（F12），查看控制台日志：

**应该看到：**
```
SelectTool: 生成锚点 - action.type="circle", action.id="xxx"
SelectTool: 已注册的处理器类型: circle, rect, text, line
✅ CircleAnchorHandler: 生成了 5 个锚点 (4 个边界锚点 + 1 个中心点)
```

**如果看到：**
```
❌ SelectTool: 未找到图形类型 "xxx" 的处理器，使用默认8个锚点
```
说明 action.type 不是 'circle'，需要检查绘制工具。

## 🐛 如果还是8个锚点

### 检查1：确认只选择了一个圆形
- 多选场景会使用8个锚点
- 确保只选择了一个圆形

### 检查2：确认使用了圆形工具
- 确保使用圆形工具（⭕）绘制，不是其他工具
- 检查控制台日志中的 action.type 值

### 检查3：检查浏览器控制台
- 打开 F12 开发者工具
- 查看 Console 标签页
- 查找关于锚点生成的日志
- 截图或复制日志内容

## 📝 代码修改确认

已确认以下代码修改正确：

✅ `CircleAnchorHandler.ts` - 生成4个边界锚点 + 1个中心点，所有锚点设置 `shapeType: 'circle'`
✅ `SelectTool.ts` - `drawResizeAnchorPoints` 检查 `shapeType === 'circle'` 绘制圆形锚点
✅ `SelectTool.ts` - `updateHoverAnchor` 返回 boolean 触发重绘
✅ `EventCoordinator.ts` - hover 状态变化时触发重绘
✅ `DrawBoard.ts` - hover 状态变化时触发重绘

## 🚨 如果问题仍然存在

请提供：
1. 浏览器控制台的完整日志（特别是关于锚点生成的日志）
2. action.type 的值（从日志中获取）
3. 浏览器版本和操作系统信息
4. 是否只选择了一个圆形（不是多选）

