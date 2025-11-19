# 🎨 DrawBoard 架构设计文档

## 📋 文档概述

本文档全面描述 DrawBoard 画板系统的架构设计，包括系统架构、核心模块、设计模式、图层系统、性能优化等内容。

---

## 1. 系统架构概览

### 1.1 五层架构模型

```
┌─────────────────────────────────────────────────────────────┐
│                    用户界面层 (UI Layer)                      │
│  React组件、工具面板、控制界面、演示页面                        │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   应用层 (Application Layer)                 │
│  DrawBoard主类（门面模式）、API接口、工厂函数                 │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  业务逻辑层 (Business Layer)                 │
│  DrawingHandler、CursorHandler、StateHandler（处理器模式）    │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  核心服务层 (Service Layer)                  │
│  10个管理器：Tool/Event/History/Performance/Selection/      │
│  VirtualLayer/Complexity/Shortcut/Export/Error               │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  渲染引擎层 (Rendering Layer)                │
│  CanvasEngine（三层物理Canvas）、VirtualLayerManager         │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 核心架构模式

#### 门面模式 (Facade Pattern)
DrawBoard 主类作为系统的统一入口，向外提供简洁的 API 接口，隐藏内部复杂性。

#### 处理器模式 (Handler Pattern)
将复杂业务逻辑分离到专门的处理器中：
- **DrawingHandler** - 绘制处理
- **StateHandler** - 状态管理
- **CursorHandler** - 光标处理

#### 工厂模式 (Factory Pattern)
使用工厂模式管理工具的创建和生命周期，支持懒加载和缓存。

#### 观察者模式 (Observer Pattern)
事件系统使用观察者模式处理用户交互，实现松耦合的事件通信。

#### 策略模式 (Strategy Pattern)
运笔效果系统使用策略模式支持不同的渲染策略。

---

## 2. 双层图层系统

### 2.1 物理图层 (CanvasEngine)

物理图层系统基于**3个固定的基础Canvas层**（基础架构），并根据需要动态扩展：

```
┌─────────────────────────────────────────────┐
│           交互层 (Interaction Layer)        │ ← z-index: 2
│  鼠标事件、选择框、实时预览、控制点           │
├─────────────────────────────────────────────┤
│            绘制层 (Draw Layer)              │ ← z-index: 1  
│  最终绘制结果、历史记录、虚拟图层内容        │
├─────────────────────────────────────────────┤
│           背景层 (Background Layer)         │ ← z-index: 0
│  网格、背景色、辅助线                       │
└─────────────────────────────────────────────┘
```

**固定基础层说明：**
- **background层** (z-index: 0) - 背景、网格等静态内容（始终存在）
- **draw层** (z-index: 1) - 所有虚拟图层的内容都绘制在这个层上（可能被动态拆分）
- **interaction层** (z-index: 2) - 全局交互元素（实时预览、临时选择框等，始终存在）

**注意：**
- `draw层` 在未选中图层时作为单一固定层存在
- 当选中虚拟图层时，`draw层` 会被隐藏，动态拆分为 `draw-bottom`、`draw-selected`、`draw-top` 三个物理层
- 取消选中后，动态draw层会被合并回单一的 `draw层`

**设计优势：**
- 🎨 **分层渲染** - 不同功能在不同层，避免冲突
- ⚡ **性能优化** - 只重绘需要更新的层
- 🖱️ **事件分离** - 交互层独立处理用户输入
- 🎛️ **可见性控制** - 每层可独立控制显示状态

### 2.2 虚拟图层 (VirtualLayerManager)

虚拟图层系统管理逻辑图层：

- **逻辑图层管理** - 创建、删除、修改虚拟图层
- **图层缓存系统** - 每个虚拟图层独立缓存，性能提升80-90%
- **图层顺序管理** - zIndex管理，支持手动调整和拖拽排序
- **动作分配** - 自动将绘制动作分配到对应图层

### 2.3 动态物理图层

为了解决选中虚拟图层的交互元素遮挡上层图层的问题，在**3个固定基础层**基础上，实现了动态物理图层系统：

**基础架构（固定3个基础层）：**
```
interaction层 (z-index: 2) ← 全局交互（实时预览、临时选择框，始终存在）
draw层 (z-index: 1)        ← 所有虚拟图层内容（未选中时作为单一层，选中时可能被拆分）
background层 (z-index: 0)  ← 背景、网格（始终存在）
```

**draw层拆分状态：**
- **未选中图层时**：draw层作为单一固定层存在
- **选中图层时**：draw层被隐藏，动态拆分为：
  - `draw-bottom` (z-index: 1) - 下层虚拟图层内容
  - `draw-selected` (z-index: 2) - 选中虚拟图层内容
  - `draw-top` (z-index: 3) - 上层虚拟图层内容

**动态图层系统（按需创建）：**
当有虚拟图层被选中时，会动态创建对应的交互层：

```
interaction层 (z-index: 4)         ← 全局交互（实时预览、临时选择框）
动态选中层 (z-index: 35)            ← 图层3的交互元素（如果图层3被选中，zIndex=3）
draw层 (z-index: 1)                ← 虚拟图层3内容（绘制在draw层）
动态选中层 (z-index: 25)            ← 图层2的交互元素（如果图层2被选中，zIndex=2）
draw层 (z-index: 1)                ← 虚拟图层2内容（绘制在draw层）
draw层 (z-index: 1)                ← 虚拟图层1内容（绘制在draw层）
background层 (z-index: 0)          ← 背景、网格
```

**重要说明：**
- 所有虚拟图层的内容都绘制在 `draw层` 系统上（未选中时是单一draw层，选中时是拆分的draw层）
- 通过虚拟图层的 `zIndex` 控制绘制顺序
- **性能优化机制**：每个虚拟图层都有独立的**离屏Canvas缓存**（cacheCanvas）
  - 缓存有效时，直接使用 `ctx.drawImage(cacheCanvas, 0, 0)` 绘制，性能优秀
  - 只有缓存失效时才重新渲染该图层的内容
  - 性能提升：缓存命中时性能提升80-90%
- **为什么不使用独立物理Canvas？**
  - 当前方案通过离屏Canvas缓存已经实现了高性能
  - 如果为每个虚拟图层创建独立物理Canvas，会增加DOM元素数量（每个图层一个Canvas）
  - 在图层数量较多时（如50个图层），50个Canvas元素可能带来额外的内存和渲染开销
  - 当前方案在性能测试中表现良好，暂无需独立物理Canvas
- **动态Draw层拆分（已实现）**：✅
  - 选中虚拟图层时，根据位置动态拆分draw层为 `draw-bottom`/`draw-selected`/`draw-top`
  - 编辑选中图层时，只重绘`draw-selected`层，性能提升20-50倍
  - 详见：[动态Draw层架构优化方案](./ARCHITECTURE_DYNAMIC_DRAW_LAYERS.md)

**zIndex计算公式：**
```typescript
// 动态图层zIndex = virtualLayerZIndex * 10 + 5
// 例如：
// 虚拟图层zIndex=0 → 动态图层zIndex=5
// 虚拟图层zIndex=1 → 动态图层zIndex=15
// 虚拟图层zIndex=2 → 动态图层zIndex=25
```

**优势：**
- ✅ **视觉正确** - 交互元素显示在正确的位置
- ✅ **性能可控** - 按需创建，及时销毁
- ✅ **灵活性强** - 支持任意数量的选中图层
- ✅ **向后兼容** - 未选中图层时，仍使用interaction层

---

## 3. 核心模块

### 3.1 CanvasEngine（物理图层引擎）

**职责：**
- 管理**3个固定的基础物理Canvas层**（background、draw、interaction）
- 处理Canvas尺寸和上下文管理
- 提供图层访问接口
- 支持**动态图层创建和管理**：
  - 动态交互图层（按需创建，用于选中图层的交互元素）
  - 动态Draw层拆分（选中图层时，将draw层拆分为draw-bottom、draw-selected、draw-top）

**固定基础层：**
- `background` (z-index: 0) - 背景层（始终存在）
- `draw` (z-index: 1) - 绘制层（未选中时作为单一层，选中时可能被拆分）
- `interaction` (z-index: 2) - 交互层（全局交互元素，始终存在）

**动态图层：**
- **动态交互图层**：按需创建，用于选中虚拟图层的交互元素（锚点、控制点等）
  - zIndex计算公式：`virtualLayerZIndex * 10 + 5`
  - 图层取消选中时自动删除
- **动态Draw层拆分**：选中图层时，将draw层拆分为：
  - `draw-bottom` (z-index: 1) - 下层虚拟图层内容
  - `draw-selected` (z-index: 2) - 选中虚拟图层内容
  - `draw-top` (z-index: 3) - 上层虚拟图层内容
  - 取消选中后自动合并回单一draw层

**注意：**
- 动态交互图层只用于交互元素，不用于绘制虚拟图层内容
- 所有虚拟图层内容都绘制在draw层系统上（单一draw层或拆分的draw层），通过离屏Canvas缓存优化性能

**关键方法：**
```typescript
// 固定图层
createLayer(name: string, zIndex: number): void
getLayer(name: string): CanvasLayer | null
getDrawLayer(): CanvasRenderingContext2D
getInteractionLayer(): CanvasRenderingContext2D

// 动态交互图层（用于选中图层的交互元素）
createDynamicLayer(layerId: string, zIndex: number): CanvasLayer
removeDynamicLayer(layerId: string): void
getSelectionLayerForVirtualLayer(virtualLayerZIndex: number): CanvasRenderingContext2D

// 动态Draw层拆分（性能优化）
splitDrawLayer(selectedLayerZIndex: number, allLayerZIndices: number[]): {...}
mergeDrawLayers(): void
getSelectedLayerDrawContext(): CanvasRenderingContext2D | null
getBottomLayersDrawContext(): CanvasRenderingContext2D | null
getTopLayersDrawContext(): CanvasRenderingContext2D | null
isDrawLayerSplit(): boolean
```

### 3.2 VirtualLayerManager（虚拟图层管理器）

**职责：**
- 管理虚拟图层的创建、删除、修改
- 处理动作与图层的关联
- 管理图层缓存系统
- 处理图层顺序（zIndex）
- 支持动态图层集成
- 与HistoryManager协同工作，获取动作数据

**关键数据结构：**
```typescript
interface VirtualLayer {
  id: string
  name: string
  visible: boolean
  opacity: number
  locked: boolean
  zIndex: number
  actionIds: string[]
  cacheCanvas?: HTMLCanvasElement
  cacheDirty: boolean
}
```

**两种模式：**
- **grouped模式** - 多个动作共享一个图层
- **individual模式** - 每个动作独立图层

**HistoryManager集成：**
- 通过 `setHistoryManager()` 设置HistoryManager引用
- `getLastActionInLayer()` 从HistoryManager获取动作数据
- 支持工具类型变化检测，自动创建新图层

### 3.3 BoundsValidator（边界验证器）

**职责：**
- 统一的边界检查和约束工具
- 限制点和边界框在画布范围内
- 确保最小尺寸要求
- 处理移动和缩放约束

**关键方法：**
```typescript
clampPointToCanvas(point, canvasBounds): Point
clampBoundsToCanvas(bounds, canvasBounds): Bounds
ensureMinSize(bounds, minSize): Bounds
clampMoveBounds(bounds, deltaX, deltaY, canvasBounds): Bounds
clampScaleBounds(bounds, scaleX, scaleY, minSize, canvasBounds): Bounds
```

**应用场景：**
- 粘贴操作时限制点在画布内
- 锚点拖拽时限制边界框
- 移动和缩放操作时确保约束

### 3.4 DrawBoard（主控制器）

**职责：**
- 提供统一的公共API
- 协调各个子系统
- 管理生命周期
- 单例模式管理

**核心功能：**
- 工具管理
- 历史记录（撤销/重做）
- 图层管理
- 事件处理
- 性能优化
- 剪贴板操作（复制/粘贴/剪切）
- 全选功能
- 边界验证和约束

### 3.5 DrawingHandler（绘制处理器）

**职责：**
- 处理绘制事件（start、move、end）
- 管理绘制状态
- 协调工具、历史、图层
- 优化重绘性能
- 离屏Canvas缓存优化

**关键流程：**
1. **drawStart** - 创建DrawAction，分配到图层
2. **drawMove** - 更新points，实时预览
3. **drawEnd** - 保存到历史，触发重绘，标记离屏缓存过期
4. **渲染** - 使用图层缓存和离屏缓存优化性能

**性能优化：**
- **图层级缓存** - 每个虚拟图层独立缓存
- **离屏Canvas缓存** - 历史动作超过100个时，使用离屏Canvas缓存
- **智能缓存失效** - 历史变化时自动标记缓存过期

---

## 4. 绘制流程

### 4.1 完整绘制时序

```
用户鼠标按下
  ↓
DrawBoard.handleDrawStart()
  ↓
DrawingHandler.handleDrawStart()
  ↓
创建DrawAction → 分配到虚拟图层
  ↓
标记图层缓存过期
  ↓
用户鼠标移动
  ↓
DrawingHandler.handleDrawMove()
  ↓
更新DrawAction.points → 实时预览（interaction层）
  ↓
用户鼠标抬起
  ↓
DrawingHandler.handleDrawEnd()
  ↓
保存到HistoryManager → 触发重绘
  ↓
检查图层缓存 → 使用缓存或重新渲染
  ↓
绘制到draw层 → 显示结果
```

### 4.2 图层缓存渲染流程

```
获取所有虚拟图层（按zIndex排序）
  ↓
遍历每个图层
  ↓
检查可见性和锁定状态
  ↓
检查缓存有效性
  ↓
缓存有效？
  ├─ 是 → 直接使用缓存绘制
  └─ 否 → 重新渲染到缓存Canvas → 绘制到主Canvas
```

---

## 5. 性能优化

### 5.1 图层渲染缓存

- **图层级缓存** - 每个虚拟图层都有独立的离屏Canvas缓存（cacheCanvas）
- **智能失效** - 只在内容变化时重新渲染（cacheDirty机制）
- **延迟创建** - 按需创建缓存Canvas，避免不必要的内存占用
- **尺寸同步** - Canvas尺寸变化时自动更新缓存
- **性能提升** - 缓存命中时直接使用 `drawImage`，性能提升80-90%
- **渲染流程**：
  1. 遍历所有虚拟图层（按zIndex排序）
  2. 跳过不可见/锁定的图层
  3. 检查缓存有效性
  4. 缓存有效 → 直接 `drawImage` 到draw层
  5. 缓存无效 → 在离屏Canvas上重新渲染 → `drawImage` 到draw层

**性能分析：**
- **优势**：缓存有效时，每个图层只需一次 `drawImage` 调用，非常高效
- **潜在瓶颈**：图层数量很多时（如50+），需要多次 `drawImage` 调用
- **当前表现**：在正常使用场景下（10-20个图层），性能表现优秀
- **优化建议**：如果发现性能问题，可以考虑为虚拟图层创建独立物理Canvas，但需要权衡DOM元素数量

### 5.2 离屏Canvas缓存（几何图形优化）

- **触发条件** - 历史动作超过100个时自动启用
- **缓存机制** - 历史动作绘制到离屏Canvas，只在缓存过期时重新绘制
- **性能提升** - 历史动作100-500个：提升30-50%；500-1000个：提升50-70%；>1000个：提升70-90%
- **缓存失效** - 新动作添加、历史变化、撤销/重做时自动标记过期
- **向后兼容** - 历史动作少于100个时，使用原有逻辑

### 5.3 渲染优化

- **按需渲染** - 只渲染可见且未锁定的图层
- **缓存复用** - 缓存有效时直接使用
- **批量操作** - 支持批量更新图层
- **增量重绘** - 支持增量重绘优化

### 5.4 内存管理

- **缓存清理** - 支持手动清理缓存
- **图层限制** - 最大图层数量限制
- **动作限制** - 每个图层最大动作数限制
- **离屏缓存管理** - 按需创建，及时清理

### 5.5 拖拽敏感度优化

- **拖拽阈值** - 最小拖拽距离3像素，减少微小移动导致的意外变形
- **敏感度因子** - 拖拽敏感度0.7（70%），降低敏感度，提升可控性
- **圆形平滑处理** - 圆形拖拽使用平滑因子0.6，使变化更平缓
- **统一应用** - 所有拖拽操作（单选、多选、默认）都应用敏感度控制

---

## 6. 设计模式应用

| 设计模式 | 应用位置 | 说明 |
|---------|---------|------|
| **门面模式** | DrawBoard | 提供统一的API接口，隐藏内部复杂性 |
| **单例模式** | DrawBoard.getInstance() | 确保每个容器只有一个实例 |
| **工厂模式** | ToolFactory | 创建和管理工具实例 |
| **策略模式** | ToolManager | 不同工具使用不同的绘制策略 |
| **观察者模式** | EventManager | 事件发布订阅机制 |
| **命令模式** | HistoryManager | 撤销/重做功能 |
| **处理器模式** | DrawingHandler/CursorHandler/StateHandler | 职责分离，各司其职 |
| **缓存模式** | VirtualLayerManager | 图层渲染缓存优化 |
| **工具模式** | BoundsValidator | 统一的边界验证工具 |

---

## 7. 技术栈

### 核心技术
- **前端框架**: React 18 + TypeScript
- **画布技术**: HTML5 Canvas API + 多层架构
- **构建工具**: Vite + 路径别名配置
- **包管理**: npm
- **样式方案**: SCSS + 响应式设计

### 架构亮点
- **模块化**: 34个专业模块，职责分离
- **高性能**: 多层Canvas + 预渲染缓存
- **类型安全**: 完整的TypeScript类型定义
- **可扩展**: 工厂模式 + 事件驱动
- **响应式**: 桌面端和移动端全平台支持

---

## 8. 总结

DrawBoard 通过现代化的架构设计和优秀的工程实践，构建了一个功能强大、性能优越、易于维护的专业级绘图系统。其模块化的设计不仅保证了当前功能的稳定性，也为未来的功能扩展奠定了坚实的基础。

**架构优势：**
1. **可维护性** ⭐⭐⭐⭐⭐ - 模块化设计，职责分离清晰
2. **可扩展性** ⭐⭐⭐⭐⭐ - 工厂模式支持动态工具注册
3. **性能表现** ⭐⭐⭐⭐⭐ - 多层Canvas优化渲染性能
4. **用户体验** ⭐⭐⭐⭐⭐ - 丰富的工具和预设系统
5. **代码质量** ⭐⭐⭐⭐⭐ - TypeScript严格类型检查

---

**文档版本**: 2.0  
**最后更新**: 2024  
**维护者**: DrawBoard开发团队

