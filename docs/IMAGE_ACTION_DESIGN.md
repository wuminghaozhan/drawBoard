# 🖼️ 图片 Action 设计文档

## 📋 概述

图片 Action 是一种特殊的 DrawAction，用于在画布上插入和管理图片。本文档详细说明了图片 Action 的数据结构、功能特性和使用方式。

## 🎯 设计原则

1. **类型安全**：使用 TypeScript 接口定义，确保类型安全
2. **扩展性**：支持多种图片源（URL、base64、blob）
3. **性能优化**：支持图片缓存和预加载
4. **功能完整**：支持变换、裁剪、元数据等高级功能
5. **向后兼容**：保留静态方法以支持旧代码

## 📊 数据结构

### ImageAction 接口

```typescript
export interface ImageAction extends DrawAction {
  type: 'image';
  
  // 图片源数据
  imageUrl: string;                    // 图片 URL 或 base64
  imageSourceType?: ImageSourceType;   // 源类型：'url' | 'base64' | 'blob'
  originalWidth?: number;              // 原始宽度
  originalHeight?: number;             // 原始高度
  
  // 显示属性
  imageWidth: number;                  // 显示宽度（必需）
  imageHeight: number;                 // 显示高度（必需）
  maintainAspectRatio?: boolean;       // 是否保持宽高比
  
  // 运行时属性（不序列化）
  imageElement?: HTMLImageElement | ImageBitmap;  // 缓存的图片元素
  loadState?: ImageLoadState;         // 加载状态
  loadError?: string;                  // 加载错误信息
  
  // 变换属性
  rotation?: number;                   // 旋转角度（度）
  scaleX?: number;                     // 水平缩放比例
  scaleY?: number;                     // 垂直缩放比例
  opacity?: number;                    // 透明度（0-1）
  
  // 裁剪属性
  cropX?: number;                      // 裁剪区域 x
  cropY?: number;                      // 裁剪区域 y
  cropWidth?: number;                  // 裁剪区域宽度
  cropHeight?: number;                 // 裁剪区域高度
  
  // 元数据
  fileName?: string;                   // 文件名
  mimeType?: string;                   // MIME 类型
  fileSize?: number;                   // 文件大小（字节）
  description?: string;                // 描述
  tags?: string[];                     // 标签
}
```

### 核心属性说明

#### 1. 图片源数据
- **imageUrl**: 图片的 URL 或 base64 字符串
- **imageSourceType**: 自动检测或手动指定源类型
- **originalWidth/originalHeight**: 图片的原始尺寸，用于保持宽高比

#### 2. 显示属性
- **imageWidth/imageHeight**: 图片在画布上的显示尺寸
- **maintainAspectRatio**: 是否在调整大小时保持宽高比

#### 3. 运行时属性
- **imageElement**: 缓存的图片元素（不序列化，仅运行时使用）
- **loadState**: 图片加载状态（'pending' | 'loading' | 'loaded' | 'error'）
- **loadError**: 加载失败时的错误信息

#### 4. 变换属性
- **rotation**: 旋转角度（度，0-360）
- **scaleX/scaleY**: 水平和垂直缩放比例（默认 1）
- **opacity**: 透明度（0-1，默认 1）

#### 5. 裁剪属性
- **cropX/cropY**: 裁剪区域的起始坐标（相对于原始图片）
- **cropWidth/cropHeight**: 裁剪区域的尺寸

#### 6. 元数据
- **fileName**: 图片文件名
- **mimeType**: MIME 类型（如 'image/png', 'image/jpeg'）
- **fileSize**: 文件大小（字节）
- **description**: 图片描述
- **tags**: 图片标签数组

## 🔧 API 使用

### 创建图片 Action

```typescript
import { ImageTool } from './tools/ImageTool';

const imageTool = new ImageTool();

// 方式1：使用选项对象（推荐）
const imageAction = imageTool.createImageAction({
  imageUrl: 'https://example.com/image.png',
  position: { x: 100, y: 100 },
  width: 300,
  height: 200,
  maintainAspectRatio: true,
  fileName: 'example.png',
  description: '示例图片',
  tags: ['example', 'demo']
});

// 方式2：使用静态方法（向后兼容）
const imageAction2 = ImageTool.createImageAction(
  'data:image/png;base64,...',
  100, 100,
  300, 200
);
```

### 更新图片 Action

```typescript
// 更新位置和尺寸
const updated = imageTool.updateImageAction(imageAction, {
  position: { x: 200, y: 200 },
  width: 400,
  height: 300
});

// 更新变换属性
const transformed = imageTool.updateImageAction(imageAction, {
  rotation: 45,
  scale: { x: 1.5, y: 1.5 },
  opacity: 0.8
});

// 更新裁剪区域
const cropped = imageTool.updateImageAction(imageAction, {
  crop: {
    x: 10,
    y: 10,
    width: 200,
    height: 200
  }
});
```

### 事件监听

```typescript
const unsubscribe = imageTool.on((event) => {
  switch (event.type) {
    case 'imageCreated':
      console.log('图片已创建', event.action);
      break;
    case 'imageUpdated':
      console.log('图片已更新', event.action);
      break;
    case 'imageLoaded':
      console.log('图片加载完成', event.action);
      break;
    case 'imageLoadError':
      console.error('图片加载失败', event.error);
      break;
  }
});

// 取消订阅
unsubscribe();
```

## 📤 导出/导入格式

### 导出格式

```json
{
  "id": "image-1234567890-abc",
  "type": "image",
  "position": { "x": 100, "y": 100 },
  "imageUrl": "https://example.com/image.png",
  "imageWidth": 300,
  "imageHeight": 200,
  "originalWidth": 600,
  "originalHeight": 400,
  "maintainAspectRatio": true,
  "rotation": 45,
  "scaleX": 1.5,
  "scaleY": 1.5,
  "opacity": 0.8,
  "crop": {
    "x": 10,
    "y": 10,
    "width": 200,
    "height": 200
  },
  "fileName": "example.png",
  "mimeType": "image/png",
  "fileSize": 102400,
  "description": "示例图片",
  "tags": ["example", "demo"],
  "context": {
    "strokeStyle": "transparent",
    "lineWidth": 0,
    "fillStyle": "transparent"
  },
  "timestamp": 1234567890,
  "virtualLayerId": "layer-1"
}
```

### 导入支持

导入时会自动恢复所有属性，包括：
- 位置和尺寸
- 变换属性（旋转、缩放、透明度）
- 裁剪区域
- 元数据（文件名、描述、标签等）

## 🎨 功能特性

### 1. 图片加载
- 支持 URL、base64、blob 三种格式
- 自动检测图片源类型
- 异步加载，不阻塞 UI
- 加载状态跟踪
- 错误处理和占位符显示

### 2. 图片缓存
- 自动缓存已加载的图片
- 避免重复加载相同 URL
- 支持预加载
- 支持缓存清理

### 3. 图片变换
- 位置移动
- 尺寸调整
- 旋转
- 缩放
- 透明度调整

### 4. 图片裁剪
- 支持裁剪区域定义
- 裁剪后重新绘制

### 5. 元数据管理
- 文件名
- MIME 类型
- 文件大小
- 描述和标签

## 🔄 与其他 Action 的集成

### 选择工具支持
- ✅ 支持选择图片
- ✅ 支持锚点调整大小
- ✅ 支持移动和变换

### 导出/导入支持
- ✅ 完整导出所有属性
- ✅ 完整导入并恢复状态

### 历史记录支持
- ✅ 支持 undo/redo
- ✅ 支持历史记录管理

### 虚拟图层支持
- ✅ 支持图层管理
- ✅ 支持图层锁定
- ✅ 支持图层可见性

## 📝 使用示例

### 基本使用

```typescript
// 插入图片
const imageAction = await drawBoard.insertImage(
  'https://example.com/image.png',
  100, 100,  // 位置
  300, 200   // 尺寸
);

// 选择图片
drawBoard.setTool('select');
// ... 用户选择图片 ...

// 调整图片大小（通过锚点）
// ... 用户拖拽锚点 ...

// 删除图片
drawBoard.deleteSelection();
```

### 高级使用

```typescript
// 创建带元数据的图片
const imageTool = new ImageTool();
const imageAction = imageTool.createImageAction({
  imageUrl: 'data:image/png;base64,...',
  position: { x: 100, y: 100 },
  width: 300,
  height: 200,
  fileName: 'my-image.png',
  mimeType: 'image/png',
  fileSize: 102400,
  description: '我的图片',
  tags: ['personal', 'photo']
});

// 添加变换
const transformed = imageTool.updateImageAction(imageAction, {
  rotation: 45,
  scale: { x: 1.5, y: 1.5 },
  opacity: 0.8
});

// 添加裁剪
const cropped = imageTool.updateImageAction(imageAction, {
  crop: {
    x: 10,
    y: 10,
    width: 200,
    height: 200
  }
});
```

## ⚠️ 注意事项

1. **图片元素不序列化**：`imageElement` 属性仅在运行时使用，导出时会被忽略
2. **加载状态**：`loadState` 和 `loadError` 仅在运行时使用，导出时会被忽略
3. **base64 大小**：base64 格式会增加约 33% 的文件大小，大图片建议使用 URL
4. **跨域问题**：使用 URL 时需要注意 CORS 策略
5. **内存管理**：大量图片时注意清理缓存

## 🚀 未来扩展

- [ ] 支持图片滤镜
- [ ] 支持图片编辑（亮度、对比度等）
- [ ] 支持图片压缩
- [ ] 支持图片格式转换
- [ ] 支持图片链接（引用外部图片）
- [ ] 支持图片占位符模板

