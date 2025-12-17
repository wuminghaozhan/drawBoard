# 📚 DrawBoard 文档中心

## 📖 核心文档

| 文档 | 说明 | 适合人群 |
|------|------|---------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 系统架构设计、模块结构、设计模式 | 所有技术人员 |
| [FEATURES.md](./FEATURES.md) | 功能特性清单、EDB文件解析支持 | 产品/测试 |
| [TESTING_PLAN.md](./TESTING_PLAN.md) | 测试计划、用例、执行策略 | 测试人员 |

---

## 📊 目录结构

```
docs/
├── README.md              # 本文档
├── ARCHITECTURE.md        # ⭐ 架构设计（核心）
├── FEATURES.md            # 功能特性
├── TESTING_PLAN.md        # 测试计划
├── guides/                # 使用指南
│   ├── QUICK_START_TRANSFORM.md
│   ├── SELECTION_USAGE_GUIDE.md
│   ├── CURSOR_STYLES.md
│   └── ...
└── UML/                   # UML 设计图
    ├── README.md
    └── DESIGN.md          # 精简版 UML 设计
```

---

## 🎯 快速导航

### 新手入门
1. 阅读 [ARCHITECTURE.md](./ARCHITECTURE.md) 了解整体架构
2. 查看 [FEATURES.md](./FEATURES.md) 了解功能特性
3. 参考 [guides/](./guides/) 学习具体功能

### 开发者
1. 阅读 [ARCHITECTURE.md](./ARCHITECTURE.md) 理解系统设计
2. 查看 [UML/DESIGN.md](./UML/DESIGN.md) 了解类图和时序图
3. 参考 [guides/](./guides/) 学习功能扩展

---

## 🏗️ 架构亮点 (v4.1)

### 六层架构
```
UI层 → 应用层 → 业务逻辑层 → 核心服务层 → 基础设施层 → 渲染引擎层
```

### 核心特性
- **EventBus 事件总线** - 类型安全的组件间通信
- **脏矩形算法** - 拖拽性能提升 50-80%
- **统一缓存工厂** - CacheFactory 场景化创建
- **SelectTool 模块化** - 11 个专注子模块
- **DrawingHandler 子模块** - 离屏缓存、动作渲染、脏矩形处理
- **旋转手柄** - 拖拽旋转锚点自由旋转选中对象
- **文本框模式** - 拖拽边中点调整宽度，文字自动换行
- **交互式文字编辑** - 单击创建、双击编辑、双击选词

### v4.1 新增特性
- **智能橡皮擦** - 只对 pen 类型起作用，实时擦除效果，可配置精度
- **图层锁定** - 锁定的图层无法拖拽/变换，操作栏置灰
- **选择操作栏** - 复制、删除、样式编辑、图层控制（置顶/置底）
- **边界智能约束** - 拖拽时图形不变形，整体受限于画布边界
- **闭合图形填充** - 圆、矩形、多边形支持填充色

### 性能优化
- 多级缓存（离屏 Canvas、虚拟图层、LRU、锚点）
- 空间索引（四叉树）加速点选/框选和橡皮擦检测
- 智能事件节流（鼠标 16ms、触摸 8ms）
- 脏矩形局部重绘
- 橡皮擦非 pen 图层缓存复用

---

## 📈 项目统计

| 指标 | 数值 |
|------|------|
| TypeScript 文件 | 104 个 |
| 代码行数 | ~35,000 行 |
| 测试用例 | 394 个 |
| 测试套件 | 23 个 |
| 模块目录 | 18 个 |
| 工具类型 | 10+ 种 |
| 编译错误 | 0 |
| Linter 错误 | 0 |

---

## 🔧 核心模块

| 模块 | 职责 | 行数 |
|------|------|------|
| `DrawBoard.ts` | 主类门面 | ~1,880 |
| `CanvasEngine.ts` | 多层 Canvas 引擎 | ~1,336 |
| `VirtualLayerManager.ts` | 虚拟图层管理 | ~1,794 |
| `SelectTool.ts` | 选择工具 | ~2,480 |
| `DrawingHandler.ts` | 绘制处理 | ~2,250 |

---

## 📦 基础设施层

```
infrastructure/
├── cache/          # 缓存系统 (CacheFactory, LRUCache)
├── error/          # 错误处理 (ErrorHandler, SafeExecutor)
├── events/         # 事件系统 (EventBus, EventManager)
├── logging/        # 日志系统 (Logger)
└── performance/    # 性能工具 (DirtyRectManager, SpatialIndex)
```

---

**文档版本**: 4.1  
**最后更新**: 2024-12
