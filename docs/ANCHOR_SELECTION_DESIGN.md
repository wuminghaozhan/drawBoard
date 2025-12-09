# 锚点选区功能实现设计文档

## 一、概述

本文档描述 DrawBoard 中锚点选区功能的完整实现设计，包括架构、接口、各图形类型的锚点处理逻辑，以及优化后的代码结构。

## 二、架构设计

### 2.1 整体架构

```
SelectTool (选择工具)
    ├── 选择功能
    │   ├── 点选 (Point Selection)
    │   ├── 框选 (Box Selection)
    │   └── 多选 (Multi Selection)
    │
    ├── 锚点系统
    │   ├── 锚点生成 (generateResizeAnchorPoints)
    │   ├── 锚点绘制 (drawResizeAnchorPoints)
    │   ├── 锚点交互 (handleResizeAnchorDrag)
    │   └── 锚点缓存 (anchorCache)
    │
    └── 图形处理器映射 (shapeHandlers)
        ├── CircleAnchorHandler (圆形)
        ├── RectAnchorHandler (矩形)
        ├── TextAnchorHandler (文字)
        ├── LineAnchorHandler (直线)
        ├── PenAnchorHandler (路径)
        └── PolygonAnchorHandler (多边形)
```

### 2.2 核心组件

#### 2.2.1 SelectTool

`SelectTool` 是选择工具的核心类，负责：
- 管理选中状态 (`selectedActions`)
- 生成和绘制锚点
- 处理锚点拖拽交互
- 协调各个图形处理器

**关键属性**：
```typescript
private shapeHandlers: Map<string, ShapeAnchorHandler> = new Map();
private anchorPoints: AnchorPoint[] = [];
private centerAnchorPoint: AnchorPoint | null = null;
private isDraggingResizeAnchor: boolean = false;
private anchorCache: { anchors: AnchorPoint[]; actionIds: string[]; timestamp: number } | null = null;
```

#### 2.2.2 BaseAnchorHandler

`BaseAnchorHandler` 是所有锚点处理器的基类，提供：
- 公共方法（移动、计算中心点、边界验证等）
- 标准锚点生成方法
- 通用缩放方法

**公共方法**：
- `generateStandardAnchors()` - 生成8个标准锚点
- `generateCenterAnchor()` - 生成中心点锚点
- `scaleAction()` - 通用缩放方法
- `getEdgeDragScaleCenter()` - 边中点拖拽缩放中心
- `getCornerDragScaleCenter()` - 角点拖拽缩放中心
- `validateAndClampBounds()` - 边界框验证
- `calculateNewBounds()` - 计算新边界框
- `handleMove()` - 移动图形
- `calculateCenterPoint()` - 计算中心点

#### 2.2.3 ShapeAnchorHandler 接口

所有锚点处理器必须实现此接口：

```typescript
interface ShapeAnchorHandler {
  generateAnchors(action: DrawAction, bounds: Bounds): AnchorPoint[];
  handleAnchorDrag(
    action: DrawAction,
    anchorType: AnchorType,
    startPoint: Point,
    currentPoint: Point,
    dragStartBounds: Bounds,
    dragStartAction?: DrawAction
  ): DrawAction | null;
  handleMove(
    action: DrawAction,
    deltaX: number,
    deltaY: number,
    canvasBounds?: { width: number; height: number }
  ): DrawAction | null;
  calculateCenterPoint(action: DrawAction, bounds?: Bounds): Point;
}
```

## 三、锚点布局设计

### 3.1 各图形类型的锚点布局

| 图形类型 | 锚点数量 | 锚点布局 | 特殊说明 |
|---------|---------|---------|---------|
| **圆形 (circle)** | 5个 | 4个边界（上/下/左/右）+ 1个中心 | 半径精确控制，角度限制 |
| **矩形 (rect)** | 9个 | 8个标准（4角+4边）+ 1个中心 | 标准缩放 |
| **文字 (text)** | 9个 | 8个标准（4角+4边）+ 1个中心 | 字体大小调整 |
| **直线 (line)** | 3个 | 2个端点（起点/终点）+ 1个中心 | 端点编辑 |
| **路径 (pen/brush/eraser)** | 9个 | 8个标准（4角+4边）+ 1个中心 | 路径缩放 |
| **多边形 (polygon)** | N+1个 | N个顶点 + 1个中心 | 顶点编辑 |

### 3.2 标准锚点布局（8个标准锚点）

```
┌─────────────────────────┐
│  ●        ●        ●   │  ← top-left, top, top-right
│                         │
│  ●                     │  ← left
│         ●              │  ← center (中心点)
│                     ●  │  ← right
│                         │
│  ●        ●        ●   │  ← bottom-left, bottom, bottom-right
└─────────────────────────┘
```

**锚点类型**：
- **角点**：`top-left`, `top-right`, `bottom-right`, `bottom-left`
- **边中点**：`top`, `right`, `bottom`, `left`
- **中心点**：`center`

### 3.3 特殊锚点布局

#### 3.3.1 圆形锚点（5个）

```
        ● (top)
        
● (left)  ● (center)  ● (right)
        
        ● (bottom)
```

- **4个边界锚点**：上、下、左、右，用于调整半径
- **1个中心点**：用于移动整个圆形
- **半径计算**：基于圆心到边缘点的距离
- **角度限制**：拖拽时边缘点角度限制在 ±45° 范围内

#### 3.3.2 直线锚点（3个）

```
● (start) ──────────── ● (end)
            ● (center)
```

- **起点锚点**：`type: 'start'`，位于 `action.points[0]`
- **终点锚点**：`type: 'end'`，位于 `action.points[action.points.length - 1]`
- **中心点**：线段中点，用于移动整条直线

#### 3.3.3 多边形锚点（N+1个）

```
        ● (vertex)
        
    ●       ● (center)      ●
    
        ●           ●
```

- **N个顶点锚点**：`type: 'vertex'`，每个顶点一个锚点，支持独立移动
- **1个中心点**：`type: 'center'`，用于移动整个多边形
- **设计理念**：参考 Photoshop、Figma 等流行设计工具，提供直观的顶点编辑体验
- **顶点计算**：
  - 如果 `action.points` 包含所有顶点（≥3个点），直接使用
  - 如果 `action.points` 只有2个点（中心+边缘），根据多边形类型计算顶点

## 四、交互设计

### 4.1 锚点拖拽交互

#### 4.1.1 中心点拖拽

**功能**：移动整个图形

**实现**：
- 所有处理器都使用 `BaseAnchorHandler.handleMove()` 方法
- 计算鼠标移动距离 (`deltaX`, `deltaY`)
- 对所有点应用相同的偏移
- 边界限制由 `SelectTool` 统一处理

#### 4.1.2 边中点拖拽

**功能**：只改变对应边的位置和尺寸，对边保持不动

**缩放中心**：对边的中点

**示例**（拖拽上边）：
```
拖拽前：         拖拽后：
┌─────┐         ┌─────┐
│     │         │     │
│     │   →     │     │
└─────┘         └─────┘
   ↑                ↑
固定点           固定点
```

**实现**：
- 计算新的边界框（只改变对应边）
- 计算缩放比例 (`scaleX`, `scaleY`)
- 使用 `getEdgeDragScaleCenter()` 获取缩放中心
- 使用 `scaleAction()` 应用缩放变换

#### 4.1.3 角点拖拽

**功能**：同时改变两个相邻边的位置和尺寸，对角点保持不动

**缩放中心**：对角点（固定点）

**示例**（拖拽左上角）：
```
拖拽前：         拖拽后：
┌─────┐         ┌─────┐
│     │         │     │
│     │   →     │     │
└─────┘         └─────┘
   ↑                ↑
固定点           固定点
```

**实现**：
- 计算新的边界框（同时改变两个相邻边）
- 计算缩放比例
- 使用 `getCornerDragScaleCenter()` 获取缩放中心
- 使用 `scaleAction()` 应用缩放变换

### 4.2 特殊交互

#### 4.2.1 圆形半径调整

**特点**：
- 半径精确跟随鼠标到圆心的距离
- 边缘点角度限制在 ±45° 范围内（根据锚点类型）
- 提供更直观的拖拽体验

**实现**：
```typescript
// 计算鼠标到圆心的距离（新半径）
const mouseToCenterDistance = Math.sqrt(
  Math.pow(currentPoint.x - center.x, 2) + 
  Math.pow(currentPoint.y - center.y, 2)
);

// 根据锚点类型限制角度
const angleRanges = {
  'top': { min: -135°, max: -45°, preferred: -90° },
  'bottom': { min: 45°, max: 135°, preferred: 90° },
  'left': { min: 135°, max: -135°, preferred: 180° },
  'right': { min: -45°, max: 45°, preferred: 0° }
};
```

#### 4.2.2 直线端点编辑

**特点**：
- 起点和终点可以独立调整
- 中心点用于移动整条直线
- 保持 `points` 数组结构，只更新对应端点

**实现**：
```typescript
// 更新起点
const newPoints = action.points.map((point, index) => {
  if (index === 0) {
    return { ...point, x: newStartX, y: newStartY };
  }
  return point;
});

// 更新终点
const newPoints = action.points.map((point, index) => {
  if (index === action.points.length - 1) {
    return { ...point, x: newEndX, y: newEndY };
  }
  return point;
});
```

#### 4.2.3 文字字体大小调整

**特点**：
- 拖拽锚点时改变字体大小，位置固定
- 使用等比例缩放，保持文字比例
- 限制字体大小范围（8-72px）

**实现**：
```typescript
// 计算缩放比例（等比例）
const scaleX = newBounds.width / dragStartBounds.width;
const scaleY = newBounds.height / dragStartBounds.height;
const uniformScale = Math.min(scaleX, scaleY);

// 计算新的字体大小
let newFontSize = originalFontSize * uniformScale;
newFontSize = Math.max(8, Math.min(72, newFontSize));
```

#### 4.2.4 多边形顶点编辑

**特点**：
- 每个顶点独立移动，其他顶点保持不变
- 中心点用于移动整个多边形
- 支持直接编辑顶点位置，提供更直观的编辑体验
- 兼容基于中心+半径绘制的正多边形（自动转换为顶点列表）

**实现**：
```typescript
// 找到最接近拖拽开始点的顶点
let closestVertexIndex = -1;
let minDistance = Infinity;

for (let i = 0; i < vertices.length; i++) {
  const distance = Math.sqrt(
    Math.pow(startPoint.x - vertices[i].x, 2) + 
    Math.pow(startPoint.y - vertices[i].y, 2)
  );
  if (distance < minDistance) {
    minDistance = distance;
    closestVertexIndex = i;
  }
}

// 更新顶点位置
const newVertices = [...vertices];
newVertices[closestVertexIndex] = {
  ...vertices[closestVertexIndex],
  x: newX,
  y: newY
};
```

**顶点计算**：
- 如果 `action.points.length >= 3`：直接作为顶点列表使用
- 如果 `action.points.length === 2`：根据 `polygonType` 和 `sides` 计算顶点
  - `triangle`: 3个顶点
  - `pentagon`: 5个顶点
  - `hexagon`: 6个顶点
  - `star`: 5个外顶点
  - `custom`: 根据 `sides` 参数

## 五、代码结构

### 5.1 文件组织

```
src/libs/drawBoard/tools/anchor/
├── AnchorTypes.ts              # 类型定义
├── BaseAnchorHandler.ts        # 基类（公共方法）
├── CircleAnchorHandler.ts      # 圆形处理器
├── RectAnchorHandler.ts        # 矩形处理器
├── TextAnchorHandler.ts        # 文字处理器
├── LineAnchorHandler.ts        # 直线处理器
├── PenAnchorHandler.ts         # 路径处理器
└── PolygonAnchorHandler.ts     # 多边形处理器
```

### 5.2 核心类和方法

#### 5.2.1 BaseAnchorHandler

**公共方法**：
- `generateStandardAnchors(bounds, shapeType)` - 生成8个标准锚点
- `generateCenterAnchor(bounds, shapeType)` - 生成中心点锚点
- `scaleAction(action, scaleX, scaleY, centerX, centerY)` - 通用缩放方法
- `getEdgeDragScaleCenter(edgeType, bounds)` - 边中点拖拽缩放中心
- `getCornerDragScaleCenter(cornerType, bounds)` - 角点拖拽缩放中心
- `validateAndClampBounds(bounds, minSize)` - 边界框验证
- `calculateNewBounds(bounds, anchorType, deltaX, deltaY)` - 计算新边界框
- `handleMove(action, deltaX, deltaY, canvasBounds)` - 移动图形
- `calculateCenterPoint(action)` - 计算中心点

**抽象方法**（子类必须实现）：
- `generateAnchors(action, bounds)` - 生成锚点
- `handleAnchorDrag(...)` - 处理锚点拖拽

#### 5.2.2 各处理器实现

**RectAnchorHandler**：
```typescript
generateAnchors() {
  // 使用 generateCenterAnchor() 和 generateStandardAnchors()
}

handleAnchorDrag() {
  // 边中点：使用 getEdgeDragScaleCenter() 和 scaleAction()
  // 角点：使用 getCornerDragScaleCenter() 和 scaleAction()
}
```

**PenAnchorHandler**：
- 与 RectAnchorHandler 相同的实现逻辑
- 使用相同的公共方法

**PolygonAnchorHandler**：
```typescript
generateAnchors() {
  // 为每个顶点生成锚点（type: 'vertex'）
  // 生成中心点（type: 'center'）
}

handleAnchorDrag() {
  // 中心点：使用 handleMove() 移动整个多边形
  // 顶点：使用 handleVertexDrag() 移动单个顶点
}
```

**TextAnchorHandler**：
```typescript
generateAnchors() {
  // 使用 generateCenterAnchor() 和 generateStandardAnchors()
}

handleAnchorDrag() {
  // 使用 calculateNewBounds() 计算新边界框
  // 计算字体大小调整（特殊逻辑）
}
```

**CircleAnchorHandler**：
```typescript
generateAnchors() {
  // 特殊实现：4个边界锚点 + 1个中心点
  // 基于圆心和半径计算锚点位置
}

handleAnchorDrag() {
  // 特殊实现：半径精确控制，角度限制
}
```

**LineAnchorHandler**：
```typescript
generateAnchors() {
  // 特殊实现：2个端点锚点 + 1个中心点
}

handleAnchorDrag() {
  // 特殊实现：端点编辑
}
```

### 5.3 SelectTool 集成

**注册处理器**：
```typescript
this.shapeHandlers.set('circle', new CircleAnchorHandler());
this.shapeHandlers.set('rect', new RectAnchorHandler());
this.shapeHandlers.set('text', new TextAnchorHandler());
this.shapeHandlers.set('line', new LineAnchorHandler());
this.shapeHandlers.set('polygon', new PolygonAnchorHandler());
this.shapeHandlers.set('pen', new PenAnchorHandler());
this.shapeHandlers.set('brush', new PenAnchorHandler());
this.shapeHandlers.set('eraser', new PenAnchorHandler());
```

**生成锚点**：
```typescript
const handler = this.shapeHandlers.get(action.type);
if (handler) {
  const anchors = handler.generateAnchors(action, bounds);
  this.anchorPoints = anchors.filter(anchor => !anchor.isCenter);
  this.centerAnchorPoint = anchors.find(anchor => anchor.isCenter) || null;
}
```

**处理拖拽**：
```typescript
const handler = this.shapeHandlers.get(action.type);
if (handler) {
  const updatedAction = handler.handleAnchorDrag(
    action,
    anchor.type,
    startPoint,
    currentPoint,
    bounds
  );
  // 边界限制和更新
}
```

## 六、性能优化

### 6.1 锚点缓存

**缓存策略**：
- 缓存生成的锚点，避免重复计算
- 缓存键：`selectedActions` 的 ID 列表
- 缓存有效期：`ANCHOR_CACHE_TTL` (100ms)
- 拖拽时强制清除缓存，使用最新状态

**实现**：
```typescript
private anchorCache: {
  anchors: AnchorPoint[];
  actionIds: string[];
  timestamp: number;
} | null = null;

// 检查缓存有效性
if (this.anchorCache && 
    this.anchorCache.actionIds.join(',') === actionIds.join(',') &&
    Date.now() - this.anchorCache.timestamp < ANCHOR_CACHE_TTL) {
  return this.anchorCache.anchors;
}
```

### 6.2 边界框缓存

**缓存策略**：
- 缓存选中图形的边界框
- 拖拽时跳过缓存，使用最新状态
- 拖拽结束后更新缓存

### 6.3 拖拽敏感度

**配置**：
- `MIN_DRAG_DISTANCE` - 最小拖拽距离（3px）
- `DRAG_SENSITIVITY` - 拖拽敏感度（0.5，圆形除外）
- 圆形使用精确控制（敏感度 1.0）

## 七、边界限制

### 7.1 统一边界限制

**策略**：
- 所有边界限制由 `SelectTool` 统一处理
- 处理器只负责计算新的图形状态
- 边界限制在 `handleResizeAnchorDrag` 中统一应用

**实现**：
```typescript
// 限制点在画布范围内
if (canvasBounds) {
  const clampedAction = {
    ...updatedAction,
    points: updatedAction.points.map(p => ({
      ...p,
      x: Math.max(0, Math.min(canvasBounds.width, p.x)),
      y: Math.max(0, Math.min(canvasBounds.height, p.y))
    }))
  };
}
```

### 7.2 最小尺寸限制

**策略**：
- 使用 `validateAndClampBounds()` 验证边界框
- 默认最小尺寸：10px
- 无效操作返回 `null`

## 八、视觉反馈

### 8.1 锚点绘制

**样式**：
- **标准锚点**：正方形，8x8px
- **圆形锚点**：圆形，半径 4px（用于圆形图形）
- **中心点**：圆形，半径 4px

**状态**：
- **默认状态**：填充色 `#FFFFFF`，描边色 `#007AFF`，描边宽度 2px
- **悬停状态**：填充色 `#007AFF`，描边色 `#FFFFFF`，尺寸增大 2px
- **拖拽状态**：与悬停状态相同

**实现**：
```typescript
// 圆形锚点（用于圆形图形）
if (anchor.shapeType === 'circle') {
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fillStyle = isHover ? '#007AFF' : '#FFFFFF';
  ctx.strokeStyle = isHover ? '#FFFFFF' : '#007AFF';
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();
} else {
  // 标准锚点（正方形）
  ctx.fillRect(x, y, size, size);
  ctx.strokeRect(x, y, size, size);
}
```

### 8.2 光标样式

**锚点类型对应的光标**：
- `center` - `move`
- `top-left`, `bottom-right` - `nw-resize`
- `top-right`, `bottom-left` - `ne-resize`
- `top`, `bottom` - `n-resize`, `s-resize`
- `left`, `right` - `w-resize`, `e-resize`
- `start`, `end` - `crosshair`
- `vertex` - `move`（多边形顶点）

## 九、优化成果

### 9.1 代码减少

- **总代码减少**：约 430 行（38%）
- **RectAnchorHandler**：减少 ~120 行（40%）
- **PenAnchorHandler**：减少 ~120 行（39%）
- **PolygonAnchorHandler**：重构为顶点编辑模式（参考 Photoshop/Figma 设计）
- **TextAnchorHandler**：减少 ~70 行（35%）

### 9.2 代码质量提升

- **代码复用性**：公共方法提取到基类
- **可维护性**：修改锚点布局只需修改一处
- **一致性**：统一的错误处理和边界验证
- **扩展性**：新增图形类型只需实现特殊逻辑

### 9.3 清理工作

- **移除未使用的导入**：`logger`, `BoundsValidator`, `AnchorUtils`
- **删除重复方法**：`CircleAnchorHandler.calculateNewBounds()`, `CircleAnchorHandler.handleMove()`
- **删除未使用方法**：`LineAnchorHandler.getCanvasBounds()`

## 十、使用示例

### 10.1 基本使用

```typescript
// 在 SelectTool 中注册处理器
this.shapeHandlers.set('rect', new RectAnchorHandler());

// 生成锚点
const handler = this.shapeHandlers.get(action.type);
const anchors = handler.generateAnchors(action, bounds);

// 处理拖拽
const updatedAction = handler.handleAnchorDrag(
  action,
  anchorType,
  startPoint,
  currentPoint,
  dragStartBounds
);
```

### 10.2 扩展新图形类型

```typescript
// 1. 创建处理器类
export class CustomAnchorHandler extends BaseAnchorHandler {
  generateAnchors(action: DrawAction, bounds: Bounds): AnchorPoint[] {
    // 使用公共方法生成标准锚点
    const anchors = [this.generateCenterAnchor(bounds, 'custom')];
    anchors.push(...this.generateStandardAnchors(bounds, 'custom'));
    return anchors;
  }
  
  handleAnchorDrag(...): DrawAction | null {
    // 实现特殊拖拽逻辑
    // 或使用公共方法 scaleAction()
  }
}

// 2. 在 SelectTool 中注册
this.shapeHandlers.set('custom', new CustomAnchorHandler());
```

## 十一、多边形锚点设计说明

### 11.1 设计理念

多边形的锚点设计参考了 **Photoshop**、**Figma**、**Sketch** 等流行设计工具的最佳实践：

1. **顶点编辑优先**：每个顶点都有独立的锚点，支持直接编辑
2. **直观的交互**：拖拽顶点即可改变多边形形状，符合用户直觉
3. **灵活的编辑**：支持任意多边形的顶点编辑，不限于正多边形

### 11.2 实现细节

#### 11.2.1 顶点计算

多边形工具可能使用两种方式存储数据：
- **顶点列表**：`action.points` 包含所有顶点坐标（≥3个点）
- **中心+半径**：`action.points` 只包含中心点和边缘点（2个点）

`PolygonAnchorHandler` 会自动识别并处理这两种情况：

```typescript
// 如果 points.length >= 3，尝试作为顶点列表
if (action.points.length >= 3) {
  return action.points; // 直接使用
}

// 如果 points.length === 2，计算顶点
if (action.points.length === 2) {
  return this.calculateVerticesFromCenterAndRadius(action);
}
```

#### 11.2.2 顶点拖拽

拖拽顶点时：
1. 找到最接近拖拽开始点的顶点
2. 计算移动距离
3. 更新该顶点位置
4. 其他顶点保持不变

这提供了精确的顶点编辑能力，用户可以：
- 调整单个顶点的位置
- 改变多边形的形状
- 创建不规则多边形

#### 11.2.3 兼容性处理

对于基于中心+半径绘制的正多边形：
- 首次编辑顶点时，自动转换为顶点列表格式
- 保留 `polygonType` 信息，便于后续识别
- 转换后支持完全自由的顶点编辑

### 11.3 与其他方案的对比

| 特性 | 旧方案（边界框缩放） | 新方案（顶点编辑） |
|------|-------------------|------------------|
| 锚点数量 | 9个（固定） | N+1个（动态，N为顶点数） |
| 编辑方式 | 缩放整个多边形 | 编辑单个顶点 |
| 灵活性 | 只能缩放 | 可以任意变形 |
| 用户体验 | 类似矩形 | 类似 Photoshop/Figma |
| 适用场景 | 正多边形 | 任意多边形 |

### 11.4 锚点布局示例

**正六边形（6个顶点）**：
```
        ● (vertex)
        
    ●               ●
    
● (center)      ●
    
    ●               ●
    
        ● (vertex)
```

**三角形（3个顶点）**：
```
        ● (vertex)
        
    ● (center)
    
● (vertex)      ● (vertex)
```

## 十二、总结

锚点选区功能采用**策略模式**和**模板方法模式**，通过 `BaseAnchorHandler` 基类提供公共方法，各图形处理器实现特殊逻辑。这种设计：

1. **减少代码重复**：公共逻辑集中在基类
2. **提高可维护性**：修改公共逻辑只需修改一处
3. **增强扩展性**：新增图形类型只需实现特殊逻辑
4. **统一交互体验**：所有图形使用相同的交互模式
5. **优化性能**：通过缓存和敏感度控制提升性能
6. **符合流行设计**：多边形采用顶点编辑，符合用户习惯

整个系统设计清晰、结构合理、易于维护和扩展。

