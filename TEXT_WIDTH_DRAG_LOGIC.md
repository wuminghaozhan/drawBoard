# 文本宽度拖拽逻辑说明

## 📋 统一规范

文本区域使用：`points[0]`（起始位置）+ `width/height`（尺寸）

## 🔄 拖拽逻辑

### **拖拽右边锚点**
- ✅ 保持左边不动（`points[0].x` 不变）
- ✅ 右边跟随鼠标（`currentPoint.x`）
- ✅ 新宽度 = `currentPoint.x - originalStartX`
- ✅ 起始位置 = `originalStartX`（不变）

### **拖拽左边锚点**
- ✅ 保持右边不动（`originalRightX` 不变）
- ✅ 左边跟随鼠标（`currentPoint.x`）
- ✅ 新宽度 = `originalRightX - currentPoint.x`
- ✅ 起始位置 = `currentPoint.x`（跟随鼠标）

## 📊 高度重新计算

当宽度变化时：
1. ✅ `height` 被清除（设为 `undefined`）
2. ✅ `BoundsCalculator.calculateTextBounds` 检测到 `width` 存在但 `height` 不存在
3. ✅ 调用 `estimateMultilineTextHeight` 根据新的 `width` 重新计算高度
4. ✅ 高度会根据文本内容和新的宽度自动换行计算

## 🔍 代码流程

```
handleMouseMove
  └─> handleResizeAnchorDrag
      └─> anchorDragHandler.handleSingleSelectionDrag
          └─> handleTextWidthDrag (文本类型)
              └─> TransformOperations.resizeTextWidth
                  ├─> 更新 width
                  ├─> 更新 points[0].x (如果是左边)
                  └─> 清除 height (设为 undefined)
                      └─> BoundsCalculator 重新计算 height
```

## ✅ 验证点

1. ✅ 拖拽右边：左边位置不变，宽度实时变化
2. ✅ 拖拽左边：右边位置不变，宽度和起始位置实时变化
3. ✅ 宽度变化时，高度自动重新计算
4. ✅ 拖拽过程中实时更新（不是等到释放）

