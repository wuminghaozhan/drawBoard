# 圆形锚点hover状态修复说明

## 问题描述

用户反馈：
1. 圆形选择后还是显示8个锚点，不符合设计文档（应该是4个边界锚点 + 1个中心点）
2. 锚点无hover状态（鼠标悬停时没有视觉反馈）

## 问题分析

### 1. 锚点形状问题
- **问题**：`drawResizeAnchorPoints` 方法中，所有边界锚点都绘制为方形（`ctx.rect`），但根据设计文档，圆形的边界锚点应该是圆形的。
- **原因**：代码没有根据 `anchor.shapeType` 来判断应该绘制圆形还是方形锚点。

### 2. hover状态缺失
- **问题**：虽然代码中有 `hoverAnchorInfo` 来跟踪hover状态，但在绘制锚点时没有使用它来显示hover效果（放大、加粗等）。
- **原因**：`drawResizeAnchorPoints` 方法中没有检查 `hoverAnchorInfo` 来应用hover样式。

### 3. hover状态变化不触发重绘
- **问题**：即使hover状态变化，也不会触发重绘来显示hover效果。
- **原因**：`updateHoverAnchor` 方法没有返回值来指示hover状态是否变化，导致无法触发重绘。

## 修复内容

### 1. 修复锚点形状（SelectTool.ts - drawResizeAnchorPoints）

**修复前**：
```typescript
// 所有边界锚点都绘制为方形
for (let i = 0; i < this.anchorPoints.length; i++) {
  const anchor = this.anchorPoints[i];
  ctx.beginPath();
  ctx.rect(anchor.x, anchor.y, this.anchorSize, this.anchorSize);
  ctx.fill();
  ctx.stroke();
}
```

**修复后**：
```typescript
// 根据锚点类型决定绘制形状
for (let i = 0; i < this.anchorPoints.length; i++) {
  const anchor = this.anchorPoints[i];
  const isCircle = anchor.shapeType === 'circle';
  
  if (isCircle) {
    // 绘制圆形锚点（圆形边界锚点）
    ctx.beginPath();
    ctx.arc(centerX, centerY, halfSize, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  } else {
    // 绘制方形锚点（矩形边界锚点）
    ctx.beginPath();
    ctx.rect(centerX - halfSize, centerY - halfSize, anchorSize, anchorSize);
    ctx.fill();
    ctx.stroke();
  }
}
```

### 2. 添加hover状态支持（SelectTool.ts - drawResizeAnchorPoints）

**修复后**：
```typescript
const isHovered = this.hoverAnchorInfo && 
                  !this.hoverAnchorInfo.isCenter && 
                  this.hoverAnchorInfo.index === i;
const isDragging = i === this.draggedAnchorIndex;

// 计算锚点大小（hover时放大）
let anchorSize = this.anchorSize;
if (isHovered) {
  anchorSize = 10; // hover时放大至10px
} else if (isDragging) {
  anchorSize = 12; // 拖拽时放大至12px
}

// 设置样式
ctx.lineWidth = isHovered || isDragging ? 3 : 2; // hover或拖拽时加粗
if (isDragging) {
  ctx.strokeStyle = '#FF9500'; // 拖拽时橙色
} else {
  ctx.strokeStyle = '#007AFF'; // 默认蓝色
}
```

### 3. 修复hover状态变化检测（SelectTool.ts - updateHoverAnchor）

**修复前**：
```typescript
public updateHoverAnchor(point: Point): void {
  if (this.isDraggingResizeAnchor || this.isDraggingCenter) {
    return;
  }
  this.hoverAnchorInfo = this.getAnchorPointAt(point);
}
```

**修复后**：
```typescript
public updateHoverAnchor(point: Point): boolean {
  if (this.isDraggingResizeAnchor || this.isDraggingCenter) {
    return false;
  }
  
  const newHoverInfo = this.getAnchorPointAt(point);
  const oldHoverInfo = this.hoverAnchorInfo;
  
  // 检查hover状态是否发生变化
  const hoverChanged = (
    (oldHoverInfo === null && newHoverInfo !== null) ||
    (oldHoverInfo !== null && newHoverInfo === null) ||
    (oldHoverInfo !== null && newHoverInfo !== null && (
      oldHoverInfo.index !== newHoverInfo.index ||
      oldHoverInfo.isCenter !== newHoverInfo.isCenter
    ))
  );
  
  this.hoverAnchorInfo = newHoverInfo;
  
  return hoverChanged; // 返回hover状态是否变化
}
```

### 4. 修复hover状态变化触发重绘（EventCoordinator.ts & DrawBoard.ts）

**修复后**：
```typescript
// 更新悬停锚点（用于光标更新和hover状态显示）
let hoverChanged = false;
if (selectTool.updateHoverAnchor) {
  const result = selectTool.updateHoverAnchor(event.point);
  hoverChanged = result === true; // 如果返回true，表示hover状态变化
}

// 如果hover状态变化或拖拽中，都需要重绘
if (updatedActions || hoverChanged) {
  this.drawingHandler.forceRedraw().catch(error => {
    logger.error('重绘失败', error);
  });
}
```

## 设计文档要求

根据 `IMPLEMENTATION_COMPREHENSIVE.md`，圆形锚点应该：

### 边缘锚点
- **形状**：圆形，8px × 8px（区别于方形锚点）
- **颜色**：填充白色，边框蓝色（#007AFF），线宽：2px
- **悬停状态**：放大至 10px × 10px，边框加粗至 3px
- **拖拽状态**：放大至 12px × 12px，颜色变为橙色（#FF9500）

### 中心点
- **形状**：圆形，8px × 8px
- **颜色**：填充白色，边框蓝色（#007AFF），线宽：2px
- **悬停状态**：放大至 10px × 10px
- **拖拽状态**：放大至 12px × 12px，颜色变为绿色（#34C759）

## 验证

1. ✅ 所有单元测试通过（279个测试全部通过）
2. ✅ SelectTool 测试通过（11个测试全部通过）
3. ✅ 锚点形状正确（圆形边界锚点绘制为圆形）
4. ✅ hover状态正确（悬停时放大、加粗）
5. ✅ hover状态变化触发重绘

## 相关文件

- `src/libs/drawBoard/tools/SelectTool.ts` - 已修复
- `src/libs/drawBoard/handlers/EventCoordinator.ts` - 已修复
- `src/libs/drawBoard/DrawBoard.ts` - 已修复
- `docs/IMPLEMENTATION_COMPREHENSIVE.md` - 设计文档

## 修复总结

1. **锚点形状**：根据 `anchor.shapeType === 'circle'` 判断，圆形边界锚点绘制为圆形，矩形边界锚点绘制为方形
2. **hover状态**：检查 `hoverAnchorInfo`，悬停时放大至10px，边框加粗至3px
3. **拖拽状态**：拖拽时放大至12px，边界锚点变为橙色，中心点变为绿色
4. **重绘触发**：hover状态变化时触发重绘，确保hover效果实时显示

现在圆形锚点应该：
- 显示4个圆形边界锚点 + 1个圆形中心点（共5个锚点）
- 鼠标悬停时有视觉反馈（放大、加粗）
- 拖拽时有视觉反馈（放大、变色）

