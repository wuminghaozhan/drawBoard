# DrawBoard 画板库

一个功能强大的Canvas画板库，支持多种绘制工具和运笔效果。

## 📁 目录结构

```
src/libs/drawBoard/
├── index.ts                 # 主入口文件（简化，只做导出）
├── DrawBoard.ts            # 核心DrawBoard类
├── README.md               # 说明文档
├── api/                    # API导出模块
│   ├── index.ts           # API统一入口
│   ├── tools.ts           # 工具系统导出
│   ├── presets.ts         # 预设系统导出
│   ├── events.ts          # 事件系统导出
│   ├── core.ts            # 核心组件导出
│   ├── utils.ts           # 工具函数导出
│   └── constants.ts       # 常量配置导出
├── handlers/              # 处理器模块
│   └── DrawingHandler.ts  # 绘制处理器
├── tools/                 # 工具模块
│   ├── ToolManager.ts     # 工具管理器
│   ├── DrawTool.ts        # 基础绘制工具
│   ├── PenTool.ts         # 画笔工具
│   ├── RectTool.ts        # 矩形工具
│   ├── CircleTool.ts      # 圆形工具
│   ├── TextTool.ts        # 文字工具
│   ├── EraserTool.ts      # 橡皮擦工具
│   ├── SelectTool.ts      # 选择工具
│   └── StrokePresets.ts   # 运笔预设
├── core/                  # 核心模块
│   ├── CanvasEngine.ts    # Canvas引擎
│   └── SelectionManager.ts # 选择管理器
├── events/                # 事件模块
│   └── EventManager.ts    # 事件管理器
├── history/               # 历史模块
│   └── HistoryManager.ts  # 历史管理器
├── shortcuts/             # 快捷键模块
│   └── ShortcutManager.ts # 快捷键管理器
└── utils/                 # 工具模块
    └── ExportManager.ts   # 导出管理器
```

## 🚀 使用方式

### 基础使用

```typescript
import { DrawBoard } from '@/libs/drawBoard';

// 创建画板实例
const drawBoard = new DrawBoard(container, {
  maxHistorySize: 100,
  enableShortcuts: true,
  strokeConfig: {
    enablePressure: true,
    enableVelocity: true
  }
});
```

### 使用工厂函数

```typescript
import { createDrawBoard } from '@/libs/drawBoard/api/utils';

const drawBoard = createDrawBoard(container, config);
```

### 按需导入

```typescript
// 只导入需要的工具
import { PenTool, RectTool } from '@/libs/drawBoard/api/tools';

// 只导入预设相关
import { getAllStrokePresets, getStrokePreset } from '@/libs/drawBoard/api/presets';

// 只导入核心组件
import { CanvasEngine } from '@/libs/drawBoard/api/core';
```

## 🎯 优化亮点

### 1. **职责分离**
- `DrawBoard.ts`: 主要业务逻辑
- `DrawingHandler.ts`: 绘制处理逻辑
- `index.ts`: 纯导出入口

### 2. **模块化API**
- 按功能分组导出
- 支持按需导入
- 清晰的命名空间

### 3. **类型安全**
- 完整的TypeScript类型定义
- 严格的类型检查
- 良好的IDE支持

### 4. **易于扩展**
- 插件化工具系统
- 可配置的预设系统
- 事件驱动架构

## 📊 API 分组

### 核心 API
- `DrawBoard` - 主要画板类
- `DrawBoardConfig` - 配置接口

### 工具系统
- `ToolManager` - 工具管理器
- `PenTool`, `RectTool`, `CircleTool` 等 - 具体工具
- `StrokeConfig`, `StrokePoint` - 运笔配置

### 预设系统
- `StrokePresetType` - 预设类型
- `getAllStrokePresets()` - 获取所有预设
- `getStrokePreset()` - 获取特定预设

### 事件系统
- `EventManager` - 事件管理器
- `DrawEvent` - 绘制事件类型

### 核心组件
- `CanvasEngine` - Canvas引擎
- `SelectionManager` - 选择管理器
- `Point`, `SelectionBox` - 基础类型

### 工具函数
- `createDrawBoard()` - 工厂函数
- `HistoryManager` - 历史管理器
- `ExportManager` - 导出管理器

## 🔧 配置选项

```typescript
const config: DrawBoardConfig = {
  maxHistorySize: 100,        // 历史记录最大数量
  enableShortcuts: true,      // 启用快捷键
  strokeConfig: {             // 运笔配置
    enablePressure: true,     // 启用压力感应
    enableVelocity: true,     // 启用速度感应
    enableAngle: true,        // 启用角度感应
    pressureSensitivity: 0.8, // 压力敏感度
    velocitySensitivity: 0.6, // 速度敏感度
    minLineWidth: 1,          // 最小线宽
    maxLineWidth: 20,         // 最大线宽
    smoothing: 0.3,           // 平滑度
    opacityVariation: true    // 透明度变化
  }
};
```

## 🎨 预设系统

支持多种笔触预设：

- **书写工具**: 钢笔、铅笔、马克笔
- **艺术工具**: 毛笔、书法笔、水彩笔、油画笔
- **绘画工具**: 粉笔、蜡笔、喷漆
- **自定义**: 可自定义配置

## 📱 兼容性

- ✅ 桌面端浏览器
- ✅ 移动端浏览器
- ✅ 触屏设备
- ✅ 压力感应设备

## 🔄 版本信息

- **版本**: 1.0.0
- **作者**: DrawBoard Team
- **描述**: 一个功能强大的Canvas画板库，支持多种绘制工具和运笔效果 