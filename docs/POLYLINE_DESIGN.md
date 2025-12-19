# 📐 折线（Polyline）工具设计文档

## 🎯 需求分析

折线（Polyline）是一种开放的、由多个线段连接而成的图形，与多边形（Polygon）的区别在于：
- **折线**：开放的，不闭合，有明确的起点和终点
- **多边形**：闭合的，首尾相连

## 🌐 市面上常见的交互方案

### 1. **Adobe Illustrator / Figma 方案**（推荐）
- **点击添加点**：每次点击添加一个新顶点
- **实时预览**：显示从最后一个点到鼠标位置的预览线
- **双击完成**：双击最后一个点完成绘制
- **ESC 取消**：按 ESC 键取消当前绘制
- **Enter 完成**：按 Enter 键完成绘制
- **Backspace 删除**：删除最后一个添加的点

### 2. **AutoCAD / SketchUp 方案**
- **点击添加点**：每次点击添加一个新顶点
- **坐标输入**：支持键盘输入精确坐标
- **捕捉功能**：自动吸附到网格、其他对象
- **右键完成**：右键菜单选择"完成"或"取消"

### 3. **在线绘图工具（如 Excalidraw）方案**
- **点击添加点**：每次点击添加一个新顶点
- **实时预览**：虚线预览从最后一个点到鼠标位置
- **双击完成**：双击完成绘制
- **ESC 取消**：按 ESC 取消
- **最小点数限制**：至少需要 2 个点（起点和终点）

## ✅ 推荐实现方案

基于代码库现有架构，推荐采用 **Adobe Illustrator / Figma 方案**，原因：
1. ✅ 用户熟悉度高
2. ✅ 交互直观
3. ✅ 与现有工具（Line、Polygon）风格一致
4. ✅ 易于实现

## 📋 详细交互设计

### 1. 绘制流程

```
1. 用户选择折线工具
   ↓
2. 点击画布 → 添加起点（第一个点）
   ↓
3. 移动鼠标 → 显示预览线（从起点到鼠标位置）
   ↓
4. 点击画布 → 添加第二个点（形成第一条线段）
   ↓
5. 移动鼠标 → 显示预览线（从最后一个点到鼠标位置）
   ↓
6. 继续点击 → 添加更多点（形成更多线段）
   ↓
7. 完成方式（三选一）：
   - 双击最后一个点 → 完成绘制
   - 按 Enter 键 → 完成绘制
   - 按 ESC 键 → 取消绘制
```

### 2. 交互细节

#### 2.1 点击添加点
- **第一次点击**：创建起点，开始绘制
- **后续点击**：添加新顶点，形成新的线段
- **最小点数**：至少需要 2 个点（起点和终点）

#### 2.2 实时预览
- **预览线样式**：虚线，半透明
- **预览线颜色**：使用当前描边颜色，透明度 50%
- **预览线宽度**：使用当前线宽
- **预览起点**：最后一个已添加的点
- **预览终点**：当前鼠标位置

#### 2.3 完成绘制
- **双击最后一个点**：完成绘制（推荐）
- **按 Enter 键**：完成绘制
- **按 ESC 键**：取消绘制，清除所有点

#### 2.4 删除点（可选）
- **按 Backspace 键**：删除最后一个添加的点
- **限制**：至少保留 2 个点（起点和终点）

#### 2.5 吸附功能（可选）
- **网格吸附**：当鼠标接近网格线时自动对齐
- **对象吸附**：当鼠标接近其他图形时自动对齐
- **点吸附**：当鼠标接近已存在的点时高亮显示

### 3. 视觉反馈

#### 3.1 绘制中的点
- **起点**：实心圆，颜色与描边色一致
- **中间点**：实心圆，颜色与描边色一致
- **当前鼠标位置**：空心圆，颜色与描边色一致

#### 3.2 预览线
- **样式**：虚线（dash: [5, 5]）
- **颜色**：描边颜色，透明度 50%
- **宽度**：当前线宽

#### 3.3 完成后的折线
- **样式**：实线
- **颜色**：描边颜色
- **宽度**：当前线宽

## 🔧 技术实现方案

### 1. 数据结构

```typescript
export interface PolylineAction extends DrawAction {
  type: 'polyline';
  points: Point[]; // 所有顶点，至少 2 个
  // 继承自 DrawAction：
  // - context: DrawContext (描边颜色、线宽等)
  // - id: string
  // - timestamp: number
}
```

### 2. 状态管理

```typescript
class PolylineTool extends DrawTool {
  private isDrawing: boolean = false; // 是否正在绘制
  private currentPoints: Point[] = []; // 当前绘制的点列表
  private previewPoint: Point | null = null; // 预览点（鼠标位置）
}
```

### 3. 事件处理

#### 3.1 handleDrawStart
```typescript
handleDrawStart(event: DrawEvent): void {
  if (!this.isDrawing) {
    // 开始新的折线
    this.isDrawing = true;
    this.currentPoints = [event.point];
  } else {
    // 添加新点
    this.currentPoints.push(event.point);
  }
}
```

#### 3.2 handleDrawMove
```typescript
handleDrawMove(event: DrawEvent): void {
  if (!this.isDrawing || this.currentPoints.length === 0) return;
  
  // 更新预览点
  this.previewPoint = event.point;
  
  // 触发重绘（显示预览）
  this.requestRedraw();
}
```

#### 3.3 handleDrawEnd
```typescript
handleDrawEnd(event: DrawEvent): void {
  // 不在这里完成绘制，等待双击或 Enter
  // 只更新预览点
  this.previewPoint = event.point;
}
```

#### 3.4 handleDoubleClick
```typescript
handleDoubleClick(event: DrawEvent): void {
  if (!this.isDrawing || this.currentPoints.length < 2) return;
  
  // 完成绘制
  this.finishDrawing();
}
```

#### 3.5 handleKeyDown
```typescript
handleKeyDown(event: KeyboardEvent): void {
  if (!this.isDrawing) return;
  
  switch (event.key) {
    case 'Enter':
      // 完成绘制
      if (this.currentPoints.length >= 2) {
        this.finishDrawing();
      }
      break;
    case 'Escape':
      // 取消绘制
      this.cancelDrawing();
      break;
    case 'Backspace':
      // 删除最后一个点
      if (this.currentPoints.length > 2) {
        this.currentPoints.pop();
        this.requestRedraw();
      }
      break;
  }
}
```

### 4. 绘制逻辑

#### 4.1 绘制折线
```typescript
draw(ctx: CanvasRenderingContext2D, action: PolylineAction): void {
  if (action.points.length < 2) return;
  
  ctx.beginPath();
  ctx.moveTo(action.points[0].x, action.points[0].y);
  
  for (let i = 1; i < action.points.length; i++) {
    ctx.lineTo(action.points[i].x, action.points[i].y);
  }
  
  ctx.stroke();
}
```

#### 4.2 绘制预览
```typescript
drawPreview(ctx: CanvasRenderingContext2D): void {
  if (this.currentPoints.length === 0 || !this.previewPoint) return;
  
  // 绘制已确定的线段
  if (this.currentPoints.length >= 2) {
    ctx.beginPath();
    ctx.moveTo(this.currentPoints[0].x, this.currentPoints[0].y);
    for (let i = 1; i < this.currentPoints.length; i++) {
      ctx.lineTo(this.currentPoints[i].x, this.currentPoints[i].y);
    }
    ctx.stroke();
  }
  
  // 绘制预览线（虚线）
  ctx.save();
  ctx.setLineDash([5, 5]);
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  const lastPoint = this.currentPoints[this.currentPoints.length - 1];
  ctx.moveTo(lastPoint.x, lastPoint.y);
  ctx.lineTo(this.previewPoint.x, this.previewPoint.y);
  ctx.stroke();
  ctx.restore();
  
  // 绘制点
  this.drawPoints(ctx);
}
```

#### 4.3 绘制点
```typescript
drawPoints(ctx: CanvasRenderingContext2D): void {
  const pointRadius = 4;
  
  // 绘制已确定的点
  this.currentPoints.forEach((point, index) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, pointRadius, 0, Math.PI * 2);
    ctx.fill();
  });
  
  // 绘制预览点（空心）
  if (this.previewPoint) {
    ctx.beginPath();
    ctx.arc(this.previewPoint.x, this.previewPoint.y, pointRadius, 0, Math.PI * 2);
    ctx.stroke();
  }
}
```

### 5. 完成绘制

```typescript
finishDrawing(): void {
  if (this.currentPoints.length < 2) {
    this.cancelDrawing();
    return;
  }
  
  // 创建 PolylineAction
  const action: PolylineAction = {
    id: generateId(),
    type: 'polyline',
    points: [...this.currentPoints],
    context: {
      strokeStyle: this.getCurrentStrokeStyle(),
      lineWidth: this.getCurrentLineWidth(),
      fillStyle: 'transparent'
    },
    timestamp: Date.now()
  };
  
  // 添加到历史记录
  this.addAction(action);
  
  // 重置状态
  this.reset();
}

cancelDrawing(): void {
  this.reset();
}

reset(): void {
  this.isDrawing = false;
  this.currentPoints = [];
  this.previewPoint = null;
}
```

## 📝 实现检查清单

### 核心功能
- [x] 点击添加点 ✅
- [x] 实时预览线 ✅
- [x] 双击完成绘制 ✅
- [x] Enter 完成绘制 ✅
- [x] ESC 取消绘制 ✅
- [x] Backspace 删除最后一个点 ✅

### 视觉反馈
- [x] 绘制点（实心圆）✅
- [x] 预览点（空心圆）✅
- [x] 预览线（虚线，半透明）✅
- [x] 已确定的线段（实线）✅

### 边界处理
- [x] 最小点数限制（至少 2 个点）✅
- [x] 工具切换时自动完成并保存（至少2个点）✅
- [x] 双击时检查点数 ✅
- [x] Enter 时检查点数 ✅

### 集成
- [x] 注册到 ToolFactory ✅
- [x] 添加到 ToolType ✅
- [x] 实现 HitTestManager 支持 ✅
- [x] 实现 AnchorHandler 支持（编辑时）✅
- [x] 添加到 ToolPanel（绘制工具组）✅
- [x] 工具切换自动保存 ✅

### 编辑功能
- [x] 选择折线后可以拖动顶点调整 ✅
- [x] 选择折线后可以移动整个折线 ✅
- [x] 边界框计算和显示 ✅

## 🎨 用户体验优化建议

### 1. 视觉提示
- **工具提示**：鼠标悬停时显示"点击添加点，双击完成"
- **状态栏**：显示当前点数，如"已添加 3 个点"

### 2. 快捷键提示
- **帮助提示**：首次使用时显示快捷键提示
- **工具栏提示**：工具图标上显示快捷键

### 3. 撤销/重做
- **支持撤销**：完成绘制后可以撤销
- **支持重做**：撤销后可以重做

### 4. 编辑模式
- **选择后编辑**：选择折线后可以拖动顶点调整
- **添加顶点**：在已存在的折线上添加新顶点
- **删除顶点**：删除折线上的顶点

## 🔗 参考实现

### 1. 现有工具参考
- **LineTool**：直线工具，参考其两点绘制逻辑
- **PolygonTool**：多边形工具，参考其顶点管理逻辑

### 2. 外部参考
- **Adobe Illustrator**：专业的矢量绘图工具
- **Figma**：在线设计工具
- **Excalidraw**：在线绘图工具

## 📚 相关文档

- [工具开发指南](./guides/TOOL_DEVELOPMENT.md)
- [选择工具实现](./SELECT_TOOL.md)
- [锚点系统](./ANCHOR_SYSTEM.md)

