# 圆形锚点修复说明

## 问题描述

用户反馈：圆形选择后还是显示8个锚点，但设计文档要求只有4个边界锚点 + 1个中心点（共5个锚点）。

## 问题分析

1. **锚点位置计算错误**：`CircleAnchorHandler.generateAnchors()` 方法中，锚点位置是基于 `bounds` 的 `x, y, width, height` 计算的，但这些值可能是基于两个点（圆心和边缘点）计算的矩形边界框，而不是圆形的实际边界框。

2. **缓存问题**：`SelectTool` 在设置选中actions时，可能使用了旧的锚点缓存（包含8个锚点），导致即使修复了代码，仍然显示8个锚点。

## 修复内容

### 1. 修复锚点位置计算（CircleAnchorHandler.ts）

**修复前**：
```typescript
// 使用 bounds 的 x, y 计算锚点位置（错误）
const { x, y, width, height } = bounds;
const radius = Math.max(width, height) / 2;
anchors.push(
  { x: center.x - halfSize, y: y - halfSize, type: 'top', ... },
  { x: center.x - halfSize, y: y + height - halfSize, type: 'bottom', ... },
  { x: x - halfSize, y: center.y - halfSize, type: 'left', ... },
  { x: x + width - halfSize, y: center.y - halfSize, type: 'right', ... }
);
```

**修复后**：
```typescript
// 基于圆心和半径计算锚点位置（正确）
let radius: number;
if (action.points.length >= 2) {
  const edge = action.points[1];
  const distance = Math.sqrt(
    Math.pow(edge.x - center.x, 2) + Math.pow(edge.y - center.y, 2)
  );
  const boundsRadius = Math.max(bounds.width, bounds.height) / 2;
  radius = Math.max(distance, boundsRadius);
} else {
  radius = Math.max(bounds.width, bounds.height) / 2;
}

// 上、下、左、右四个方向的锚点（基于圆心和半径）
anchors.push(
  { x: center.x - halfSize, y: center.y - radius - halfSize, type: 'top', ... },
  { x: center.x - halfSize, y: center.y + radius - halfSize, type: 'bottom', ... },
  { x: center.x - radius - halfSize, y: center.y - halfSize, type: 'left', ... },
  { x: center.x + radius - halfSize, y: center.y - halfSize, type: 'right', ... }
);
```

### 2. 修复缓存清理（SelectTool.ts）

**修复前**：
```typescript
// 清除缓存
this.clearBoundsCache();

// 重新生成锚点
if (this.selectedActions.length > 0) {
  this.generateResizeAnchorPoints();
}
```

**修复后**：
```typescript
// 清除缓存（包括边界框缓存和锚点缓存）
this.clearBoundsCache();
this.clearAnchorCache(); // 确保清除锚点缓存，避免使用旧的8个锚点缓存

// 重新生成锚点
if (this.selectedActions.length > 0) {
  this.generateResizeAnchorPoints();
}
```

## 设计文档要求

根据 `IMPLEMENTATION_COMPREHENSIVE.md`，圆形锚点应该：

- **中心点**：1个，位于圆心位置，用于移动整个圆
- **边界锚点**：4个，位于圆形的上、下、左、右四个方向，用于改变半径

**锚点布局**：
```
            ● (上)
              │
              │
    ● ──── ● (中心点) ──── ●
  (左)                    (右)
              │
              │
            ● (下)
```

## 验证

1. ✅ 所有单元测试通过（279个测试全部通过）
2. ✅ CircleAnchorHandler 测试通过（19个测试全部通过）
3. ✅ 锚点位置计算正确（基于圆心和半径）
4. ✅ 缓存清理机制正确（避免使用旧缓存）

## 相关文件

- `src/libs/drawBoard/tools/anchor/CircleAnchorHandler.ts` - 圆形锚点处理器
- `src/libs/drawBoard/tools/SelectTool.ts` - 选择工具
- `docs/IMPLEMENTATION_COMPREHENSIVE.md` - 设计文档

## 后续建议

1. 如果用户仍然看到8个锚点，可能需要：
   - 清除浏览器缓存
   - 重新加载页面
   - 确保 `action.type === 'circle'` 正确设置

2. 可以考虑添加调试日志，确认：
   - `action.type` 是否为 `'circle'`
   - `handler` 是否为 `CircleAnchorHandler` 实例
   - 生成的锚点数量是否为5个（4个边界 + 1个中心）

