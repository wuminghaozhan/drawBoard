# DrawBoard 导出格式标准

## 概述

DrawBoard 支持两种导出格式：
- **v1 格式**: 原始 DrawAction 格式（向后兼容）
- **v2 格式**: 标准化 Shape 格式（语义化，推荐）

## 标准格式 v2 (推荐)

### 设计原则

1. **语义化**: 使用图形的自然属性而非底层实现
2. **最小化**: 只包含重建图形所需的最少信息
3. **可读性**: JSON 格式易于人工阅读和编辑
4. **类型独立**: 每种形状都有独立的标准结构

### 文件结构

```json
{
  "formatVersion": "2.0.0",
  "appVersion": "1.0.0",
  "exportedAt": "2025-12-15T10:30:00.000Z",
  "canvas": {
    "width": 800,
    "height": 600,
    "backgroundColor": "#ffffff"
  },
  "layers": [...],
  "shapes": [...],
  "metadata": {...}
}
```

---

## 各工具类型的标准格式

### 1. 画笔 (Pen)

自由曲线，由多个点组成路径。

```json
{
  "type": "pen",
  "id": "shape-123",
  "path": [
    { "x": 100, "y": 100, "pressure": 0.5 },
    { "x": 120, "y": 110, "pressure": 0.7 },
    { "x": 150, "y": 105, "pressure": 0.6 }
  ],
  "style": {
    "strokeStyle": "#000000",
    "lineWidth": 2,
    "lineCap": "round",
    "lineJoin": "round"
  },
  "timestamp": 1734251400000
}
```

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| type | "pen" | ✅ | 类型标识 |
| id | string | ✅ | 唯一标识符 |
| path | PressurePoint[] | ✅ | 路径点列表 |
| path[].x | number | ✅ | X 坐标 |
| path[].y | number | ✅ | Y 坐标 |
| path[].pressure | number | ❌ | 压感值 0-1 |
| style | StyleContext | ✅ | 样式 |
| transform | TransformProps | ❌ | 变换 |
| timestamp | number | ✅ | 时间戳 |

---

### 2. 圆形 (Circle)

由圆心和半径定义。绘制时 `points[0]` 是圆心，`points[length-1]` 是圆周上的点。

```json
{
  "type": "circle",
  "id": "shape-456",
  "center": { "x": 200, "y": 150 },
  "radius": 50,
  "context": {
    "strokeStyle": "#ff0000",
    "lineWidth": 2
  },
  "timestamp": 1734251400000
}
```

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| type | "circle" | ✅ | 类型标识 |
| id | string | ✅ | 唯一标识符 |
| center | Point2D | ✅ | 圆心坐标 |
| radius | number | ✅ | 半径 |
| style | StyleContext | ✅ | 样式 |
| filled | boolean | ❌ | 是否填充 |
| transform | TransformProps | ❌ | 变换 |
| timestamp | number | ✅ | 时间戳 |

---

### 3. 矩形 (Rect)

由左上角坐标和宽高定义。绘制时 `points[0]` 和 `points[length-1]` 是对角点。

```json
{
  "type": "rect",
  "id": "shape-789",
  "position": { "x": 100, "y": 100 },
  "width": 200,
  "height": 150,
  "context": {
    "strokeStyle": "#0000ff",
    "lineWidth": 2
  },
  "timestamp": 1734251400000
}
```

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| type | "rect" | ✅ | 类型标识 |
| id | string | ✅ | 唯一标识符 |
| x | number | ✅ | 左上角 X |
| y | number | ✅ | 左上角 Y |
| width | number | ✅ | 宽度 |
| height | number | ✅ | 高度 |
| style | StyleContext | ✅ | 样式 |
| filled | boolean | ❌ | 是否填充 |
| cornerRadius | number | ❌ | 圆角半径 |
| transform | TransformProps | ❌ | 变换 |
| timestamp | number | ✅ | 时间戳 |

---

### 4. 直线 (Line)

由起点和终点定义。绘制时 `points[0]` 是起点，`points[length-1]` 是终点。

```json
{
  "type": "line",
  "id": "shape-012",
  "start": { "x": 50, "y": 50 },
  "end": { "x": 250, "y": 150 },
  "context": {
    "strokeStyle": "#333333",
    "lineWidth": 2
  },
  "timestamp": 1734251400000
}
```

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| type | "line" | ✅ | 类型标识 |
| id | string | ✅ | 唯一标识符 |
| start | Point2D | ✅ | 起点坐标 |
| end | Point2D | ✅ | 终点坐标 |
| style | StyleContext | ✅ | 样式 |
| lineType | "solid" \| "dashed" \| "arrow" | ❌ | 线条类型 |
| arrowStyle | "none" \| "start" \| "end" \| "both" | ❌ | 箭头样式 |
| dashPattern | number[] | ❌ | 虚线模式 |
| transform | TransformProps | ❌ | 变换 |
| timestamp | number | ✅ | 时间戳 |

---

### 5. 文字 (Text)

由位置和文本内容定义。

```json
{
  "type": "text",
  "id": "shape-345",
  "position": { "x": 100, "y": 200 },
  "content": "Hello World",
  "fontSize": 24,
  "fontFamily": "Arial",
  "color": "#000000",
  "textAlign": "left",
  "width": 200,
  "lineHeight": 1.5,
  "timestamp": 1734251400000
}
```

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| type | "text" | ✅ | 类型标识 |
| id | string | ✅ | 唯一标识符 |
| position | Point2D | ✅ | 文字位置 |
| content | string | ✅ | 文本内容 |
| fontSize | number | ✅ | 字体大小 |
| fontFamily | string | ✅ | 字体 |
| color | string | ✅ | 文本颜色 |
| textAlign | "left" \| "center" \| "right" | ❌ | 对齐方式 |
| width | number | ❌ | 文本框宽度（启用换行） |
| height | number | ❌ | 文本框高度 |
| lineHeight | number | ❌ | 行高倍数 |
| transform | TransformProps | ❌ | 变换 |
| timestamp | number | ✅ | 时间戳 |

---

### 6. 多边形 (Polygon)

多边形支持两种格式：
- **center-radius 格式**：规则多边形，由中心、半径、边数定义
- **vertices 格式**：变换后的多边形，由顶点列表定义

绘制时 `points[0]` 是中心，`points[length-1]` 是边上的点。

#### 规则多边形（center-radius 格式）

```json
{
  "type": "polygon",
  "id": "shape-678",
  "format": "center-radius",
  "polygonType": "hexagon",
  "center": { "x": 200, "y": 200 },
  "radius": 80,
  "sides": 6,
  "context": {
    "strokeStyle": "#009900",
    "lineWidth": 2
  },
  "timestamp": 1734251400000
}
```

#### 星形（带内半径）

```json
{
  "type": "polygon",
  "id": "shape-901",
  "format": "center-radius",
  "polygonType": "star",
  "center": { "x": 150, "y": 150 },
  "radius": 60,
  "sides": 5,
  "innerRadius": 30,
  "context": {
    "strokeStyle": "#ffcc00",
    "lineWidth": 2
  },
  "timestamp": 1734251400000
}
```

#### 变换后的多边形（vertices 格式）

当多边形被选择工具变换后，转换为顶点列表格式：

```json
{
  "type": "polygon",
  "id": "shape-234",
  "format": "vertices",
  "polygonType": "hexagon",
  "vertices": [
    { "x": 100, "y": 100 },
    { "x": 200, "y": 80 },
    { "x": 220, "y": 180 },
    { "x": 120, "y": 200 },
    { "x": 80, "y": 150 },
    { "x": 90, "y": 110 }
  ],
  "closed": true,
  "context": {
    "strokeStyle": "#990099",
    "lineWidth": 2
  },
  "timestamp": 1734251400000
}
```

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| type | "polygon" | ✅ | 类型标识 |
| id | string | ✅ | 唯一标识符 |
| format | "center-radius" \| "vertices" | ✅ | 格式类型 |
| polygonType | string | ✅ | 多边形类型 |
| center | Point2D | center-radius 格式需要 | 中心点 |
| radius | number | center-radius 格式需要 | 外接圆半径 |
| sides | number | ❌ | 边数（默认按类型推断） |
| vertices | Point2D[] | vertices 格式需要 | 顶点列表 |
| innerRadius | number | 星形需要 | 内半径 |
| closed | boolean | vertices 格式 | 是否闭合 |
| context | ExportedContext | ✅ | 样式 |
| timestamp | number | ✅ | 时间戳 |

**多边形类型与默认边数：**
| polygonType | 默认边数 |
|-------------|----------|
| triangle | 3 |
| pentagon | 5 |
| hexagon | 6 |
| star | 5 |
| custom | 6 |

---

## 通用类型定义

### Point2D

```typescript
interface Point2D {
  x: number;
  y: number;
}
```

### StyleContext

```typescript
interface StyleContext {
  strokeStyle: string;       // 线条颜色
  fillStyle?: string;        // 填充颜色
  lineWidth: number;         // 线宽
  lineCap?: 'butt' | 'round' | 'square';
  lineJoin?: 'miter' | 'round' | 'bevel';
  globalAlpha?: number;      // 透明度 0-1
}
```

### TransformProps

```typescript
interface TransformProps {
  rotation?: number;         // 旋转角度（弧度）
  scaleX?: number;          // X 缩放
  scaleY?: number;          // Y 缩放
}
```

### LayerInfo

```typescript
interface LayerInfo {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;      // 0-1
  locked: boolean;
  zIndex: number;
  shapeIds: string[];   // 该图层包含的形状 ID
}
```

---

## 使用示例

### 导出标准格式

```typescript
// 在 SelectionDemo 中使用
const handleExportStandardFormat = () => {
  drawBoard.downloadAsJSON({
    filename: 'my-drawing.json'
  });
};
```

### 导入标准格式

```typescript
const handleImport = async () => {
  const file = await openFileDialog();
  const json = await file.text();
  drawBoard.importFromJSON(json);
};
```

---

## 版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| 2.0.0 | 2025-12-15 | 标准化 Shape 格式，每种工具独立结构 |
| 1.0.0 | 2025-12-14 | 初始版本，DrawAction 格式 |

