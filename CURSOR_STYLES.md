# 鼠标样式功能实现

## 功能概述

为DrawBoard画板库实现了智能鼠标样式系统，不同工具显示对应的鼠标样式，提供更直观的用户体验。

## 主要特性

### 1. 工具对应的鼠标样式

每种绘图工具都有专门设计的鼠标样式：

- **🖊️ 画笔工具**: 画笔图标，热点在笔尖位置
- **🧽 橡皮擦工具**: 橡皮擦图标，根据线宽动态调整大小
- **👆 选择工具**: 鼠标指针图标，热点在箭头尖端
- **⬜ 矩形工具**: 矩形图标，配合crosshair光标
- **⭕ 圆形工具**: 圆形图标，配合crosshair光标  
- **📝 文字工具**: 系统标准文字光标

### 2. 动态尺寸调整

鼠标样式会根据当前设置动态调整：

- **画笔和橡皮擦**: 图标大小根据线宽自动调整
- **最小/最大尺寸限制**: 确保样式既清晰可见又不会过大
- **智能热点定位**: 根据工具类型调整热点位置

### 3. 绘制状态反馈

绘制过程中显示不同的鼠标样式：

- **画笔绘制中**: 显示动态大小的实心圆点，精确指示绘制位置
- **橡皮擦绘制中**: 显示动态大小的空心圆，预览擦除范围
- **几何工具绘制中**: 显示十字光标，便于精确定位
- **选择工具使用中**: 显示十字光标，精确选择区域

## 技术实现

### 核心方法

#### 1. `updateCursor()` - 鼠标样式更新
```typescript
private updateCursor(): void {
  const currentTool = this.toolManager.getCurrentToolType();
  const cursorStyle = this.getCursorForDrawingState(currentTool, this.isDrawing);
  
  // 设置容器和canvas的鼠标样式
  this.container.style.cursor = cursorStyle;
  const interactionCanvas = this.canvasEngine.getLayer('interaction')?.canvas;
  if (interactionCanvas) {
    interactionCanvas.style.cursor = cursorStyle;
  }
}
```

#### 2. `getCursorForTool()` - 获取工具对应样式
根据工具类型和当前线宽生成对应的鼠标样式，支持动态大小调整。

#### 3. `getCursorForDrawingState()` - 获取绘制状态样式
根据绘制状态返回不同的鼠标样式，提供实时视觉反馈。

### SVG图标系统

使用内嵌SVG图标创建自定义鼠标样式：

- **优点**: 矢量图形，任意缩放不失真
- **热点精确**: 可以精确指定鼠标热点位置
- **动态生成**: 根据参数动态生成不同大小的图标
- **兼容性好**: 现代浏览器广泛支持

### 样式更新时机

系统在以下时机自动更新鼠标样式：

1. **工具切换时**: `setTool()` 方法调用
2. **线宽改变时**: `setLineWidth()` 方法调用  
3. **绘制开始时**: `handleDrawStart()` 事件
4. **绘制结束时**: `handleDrawEnd()` 事件
5. **选择清除时**: `clearSelection()` 方法调用

## 使用方式

### 基础使用

```typescript
const drawBoard = new DrawBoard(container);

// 切换工具时自动更新鼠标样式
drawBoard.setTool('pen');    // 显示画笔样式
drawBoard.setTool('eraser'); // 显示橡皮擦样式
drawBoard.setTool('select'); // 显示选择样式

// 调整线宽时自动更新样式大小
drawBoard.setLineWidth(10);  // 样式会相应变大
```

### 自定义鼠标样式

```typescript
// 设置自定义鼠标样式
drawBoard.setCursor('crosshair');
drawBoard.setCursor('url(custom-cursor.png) 16 16, auto');
```

## 演示页面

访问 `/cursor` 路径可以查看鼠标样式演示页面，包含：

- 所有工具的鼠标样式展示
- 动态线宽调整效果
- 绘制状态反馈演示
- 详细的使用说明和技巧

## 技术细节

### 样式计算算法

#### 画笔工具
```typescript
// 根据线宽调整画笔图标大小，最小16px，最大32px
const size = Math.max(16, Math.min(32, 16 + lineWidth * 2));
const hotspotX = Math.floor(size * 0.1); // 笔尖位置
const hotspotY = Math.floor(size * 0.9);
```

#### 橡皮擦工具
```typescript
// 根据线宽调整橡皮擦图标大小，最小20px，最大40px
const size = Math.max(20, Math.min(40, 20 + lineWidth * 2));
const hotspot = Math.floor(size / 2);
```

#### 绘制状态圆形指示器
```typescript
// 画笔绘制中的圆点大小
const radius = Math.max(2, Math.min(16, Math.ceil(lineWidth / 2)));

// 橡皮擦绘制中的圆圈大小  
const radius = Math.max(4, Math.min(20, lineWidth));
```

### 浏览器兼容性

- ✅ Chrome 88+
- ✅ Firefox 85+  
- ✅ Safari 14+
- ✅ Edge 88+

### 性能优化

- 样式生成采用缓存机制，避免重复计算
- SVG图标使用Data URI，减少网络请求
- 事件处理采用节流，避免频繁更新

## 扩展性

系统设计支持轻松扩展：

1. **添加新工具样式**: 在 `getCursorForTool()` 中添加新的工具类型
2. **自定义动态效果**: 创建新的样式生成方法
3. **主题支持**: 支持根据主题调整图标颜色和样式
4. **动画效果**: 可以扩展支持CSS动画效果

## 最佳实践

1. **保持简洁**: 鼠标样式应清晰易识别，不宜过于复杂
2. **热点精确**: 确保鼠标热点位置与视觉焦点一致
3. **尺寸适中**: 样式大小应在16-32px范围内，既清晰又不遮挡视线
4. **状态一致**: 相同工具在不同状态下应保持视觉连贯性
5. **响应速度**: 样式切换应即时响应，避免延迟 