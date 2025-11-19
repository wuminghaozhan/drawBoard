# 圆形锚点问题排查指南

## 问题现象

在 `/selection` 路由下：
1. 圆形选择后还是显示8个锚点（应该是4个边界锚点 + 1个中心点）
2. 锚点没有hover效果

## 排查步骤

### 1. 清除浏览器缓存

**Chrome/Edge:**
- 按 `Ctrl+Shift+Delete` (Windows) 或 `Cmd+Shift+Delete` (Mac)
- 选择"缓存的图片和文件"
- 点击"清除数据"
- 或者按 `Ctrl+F5` (Windows) 或 `Cmd+Shift+R` (Mac) 强制刷新

**Firefox:**
- 按 `Ctrl+Shift+Delete` (Windows) 或 `Cmd+Shift+Delete` (Mac)
- 选择"缓存"
- 点击"立即清除"
- 或者按 `Ctrl+F5` 强制刷新

### 2. 清除 Vite 缓存

```bash
# 清除 Vite 缓存
rm -rf node_modules/.vite

# 重新启动开发服务器
npm run dev
```

### 3. 检查代码是否正确编译

```bash
# 检查 TypeScript 编译
npm run build

# 或者只检查类型
npx tsc --noEmit
```

### 4. 验证代码修改

检查以下文件是否正确修改：

1. **CircleAnchorHandler.ts** - 应该生成4个边界锚点 + 1个中心点
   ```typescript
   // 应该看到：
   anchors.push(
     { x: center.x - halfSize, y: center.y - radius - halfSize, type: 'top', cursor: 'n-resize', shapeType: 'circle', isCenter: false },
     { x: center.x - halfSize, y: center.y + radius - halfSize, type: 'bottom', cursor: 's-resize', shapeType: 'circle', isCenter: false },
     { x: center.x - radius - halfSize, y: center.y - halfSize, type: 'left', cursor: 'w-resize', shapeType: 'circle', isCenter: false },
     { x: center.x + radius - halfSize, y: center.y - halfSize, type: 'right', cursor: 'e-resize', shapeType: 'circle', isCenter: false }
   );
   ```

2. **SelectTool.ts** - drawResizeAnchorPoints 方法应该检查 shapeType
   ```typescript
   // 应该看到：
   const isCircle = anchor.shapeType === 'circle';
   if (isCircle) {
     // 绘制圆形锚点
     ctx.arc(centerX, centerY, halfSize, 0, 2 * Math.PI);
   }
   ```

3. **SelectTool.ts** - updateHoverAnchor 应该返回 boolean
   ```typescript
   // 应该看到：
   public updateHoverAnchor(point: Point): boolean {
     // ...
     return hoverChanged;
   }
   ```

### 5. 检查浏览器控制台

打开浏览器开发者工具（F12），检查：
- 是否有 JavaScript 错误
- 是否有 TypeScript 编译错误
- 网络请求是否成功

### 6. 验证 DrawBoard 实例

在浏览器控制台执行：

```javascript
// 获取 DrawBoard 实例
const drawBoard = window.drawBoard; // 如果有的话

// 或者通过 React DevTools 检查
// 检查 SelectTool 是否正确初始化
```

### 7. 调试锚点生成

在 `SelectionDemo` 页面添加调试代码：

```typescript
// 在 SelectionDemo/index.tsx 中添加
useEffect(() => {
  if (drawBoardRef.current) {
    const debugInfo = drawBoardRef.current.getSelectionDebugInfo();
    console.log('SelectTool Debug Info:', debugInfo);
    
    // 检查锚点数量
    if (debugInfo.selectToolDebugInfo) {
      console.log('锚点数量:', debugInfo.selectToolDebugInfo.anchorPointsCount);
    }
  }
}, [currentTool, hasSelection]);
```

### 8. 检查是否有其他代码覆盖

搜索项目中是否有其他地方定义了锚点：

```bash
# 搜索锚点相关代码
grep -r "generateAnchors\|drawResizeAnchorPoints" src/
```

## 常见问题

### Q: 为什么还是8个锚点？

**A:** 可能的原因：
1. 浏览器缓存未清除
2. Vite 缓存未清除
3. 代码没有重新编译
4. 使用了旧的 DrawBoard 实例

**解决方案：**
1. 清除浏览器缓存并强制刷新
2. 清除 Vite 缓存：`rm -rf node_modules/.vite`
3. 重启开发服务器：`npm run dev`
4. 检查代码是否正确保存

### Q: 为什么没有hover效果？

**A:** 可能的原因：
1. `updateHoverAnchor` 没有被调用
2. `hoverChanged` 没有触发重绘
3. `hoverAnchorInfo` 没有正确更新

**解决方案：**
1. 检查 `EventCoordinator` 和 `DrawBoard` 是否正确调用 `updateHoverAnchor`
2. 检查 `hoverChanged` 是否正确触发重绘
3. 在浏览器控制台检查 `hoverAnchorInfo` 的值

### Q: 如何验证修复是否生效？

**A:** 验证步骤：
1. 绘制一个圆形
2. 切换到选择工具
3. 点击圆形选中它
4. 应该看到：
   - 4个圆形边界锚点（上、下、左、右）
   - 1个圆形中心点
   - 鼠标悬停时锚点放大并加粗
   - 拖拽时锚点变色

## 快速修复命令

```bash
# 1. 清除所有缓存
rm -rf node_modules/.vite
rm -rf dist

# 2. 重新安装依赖（如果需要）
npm install

# 3. 重新启动开发服务器
npm run dev

# 4. 在浏览器中强制刷新
# Windows: Ctrl+F5
# Mac: Cmd+Shift+R
```

## 联系支持

如果以上步骤都无法解决问题，请提供：
1. 浏览器控制台的错误信息
2. 代码修改的详细说明
3. 复现步骤
4. 浏览器版本和操作系统信息

