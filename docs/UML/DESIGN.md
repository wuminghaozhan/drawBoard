# 📐 DrawBoard UML 设计图

## 1. 整体架构图

```mermaid
graph TB
    subgraph "用户界面层"
        UI[React 组件]
    end
    
    subgraph "应用层"
        DB[DrawBoard<br/>门面类]
        API1[ToolAPI]
        API2[SelectionAPI]
        API3[LayerAPI]
        API4[HistoryAPI]
    end
    
    subgraph "业务逻辑层"
        DH[DrawingHandler<br/>绘制处理]
        STC[SelectToolCoordinator<br/>选择协调器]
        SH[StateHandler<br/>状态处理]
        CH[CursorHandler<br/>光标处理]
    end
    
    subgraph "核心服务层"
        TM[ToolManager]
        HM[HistoryManager]
        PM[PerformanceManager]
        SM[SelectionManager]
        VLM[VirtualLayerManager]
    end
    
    subgraph "基础设施层"
        EB[EventBus<br/>事件总线]
        CF[CacheFactory<br/>缓存工厂]
        DRM[DirtyRectManager<br/>脏矩形]
        EM[EventManager<br/>DOM事件]
        EH[ErrorHandler<br/>错误处理]
        LG[Logger<br/>日志]
    end
    
    subgraph "渲染引擎层"
        CE[CanvasEngine]
        BG[background 层]
        DR[draw 层]
        IT[interaction 层]
    end
    
    UI --> DB
    DB --> API1 & API2 & API3 & API4
    DB --> DH & STC & SH & CH
    DH --> TM & HM & VLM
    STC --> TM & DH & HM
    SH --> SM & PM
    
    DH & STC & VLM & HM -.-> EB
    DH --> DRM & CF
    TM & EM --> CE
    CE --> BG & DR & IT
    
    style DB fill:#e1f5fe
    style CE fill:#e8f5e9
    style EB fill:#fff3e0
    style STC fill:#fce4ec
```

---

## 2. 核心类图

```mermaid
classDiagram
    class DrawBoard {
        -canvasEngine: CanvasEngine
        -toolManager: ToolManager
        -historyManager: HistoryManager
        -virtualLayerManager: VirtualLayerManager
        -drawingHandler: DrawingHandler
        -selectToolCoordinator: SelectToolCoordinator
        -eventBus: EventBus
        +getInstance(container): DrawBoard
        +setTool(type): void
        +undo(): boolean
        +redo(): boolean
        +destroy(): void
    }
    
    class EventBus {
        -subscribers: Map~string, Subscriber[]~
        +on(event, handler): unsubscribe
        +once(event, handler): unsubscribe
        +emit(event, payload): void
        +off(event, handler): void
    }
    
    class SelectToolCoordinator {
        -toolManager: ToolManager
        -drawingHandler: DrawingHandler
        -eventBus: EventBus
        +handleDrawStart(event): void
        +handleDrawMove(event): object
        +handleDrawEnd(event): DrawAction[]
        +syncLayerDataToSelectTool(): void
    }
    
    class CanvasEngine {
        -layers: Map~string, Canvas~
        -dynamicLayers: Map~string, Canvas~
        +getDrawLayer(): Context2D
        +getInteractionLayer(): Context2D
        +createDynamicLayer(id, zIndex): Canvas
        +splitDrawLayer(zIndex): void
        +mergeDrawLayers(): void
    }
    
    class VirtualLayerManager {
        -virtualLayers: Map~string, VirtualLayer~
        -actionLayerMap: Map~string, string~
        -eventBus: EventBus
        +createVirtualLayer(name): VirtualLayer
        +deleteVirtualLayer(id): boolean
        +setActiveVirtualLayer(id): boolean
        +getLayerActions(id): DrawAction[]
    }
    
    class ToolManager {
        -currentTool: ToolType
        -toolFactory: ToolFactory
        +setCurrentTool(type): void
        +getCurrentToolInstance(): DrawTool
    }
    
    class DrawTool {
        <<abstract>>
        +name: string
        +type: ToolType
        +draw(ctx, action): void
        +getActionType(): string
    }
    
    class SelectTool {
        -selectedActions: DrawAction[]
        -transformOperations: TransformOperations
        -anchorGenerator: AnchorGenerator
        -anchorDragHandler: AnchorDragHandler
        -boundsCalculator: BoundsCalculator
        -hitTestManager: HitTestManager
        -boxSelectionManager: BoxSelectionManager
        -selectionRenderer: SelectionRenderer
        +handleMouseDown(point): string
        +handleMouseMove(point): DrawAction
        +handleMouseUp(): DrawAction[]
        +draw(ctx): void
    }
    
    class DrawingHandler {
        -isDrawing: boolean
        -currentAction: DrawAction
        -dirtyRectManager: DirtyRectManager
        -eventBus: EventBus
        +handleDrawStart(event): void
        +handleDrawMove(event): void
        +handleDrawEnd(event): void
        +forceRedraw(): void
        +markActionDirty(action): void
    }
    
    class DirtyRectManager {
        -dirtyRects: Bounds[]
        -canvasSize: Size
        +markDirty(bounds): void
        +merge(): void
        +redrawIfNeeded(ctx, callback): boolean
        +setDebugEnabled(enabled): void
    }
    
    class CacheFactory {
        <<static>>
        +createSimple(): SimpleCache
        +createLRU(config): LRUCache
        +createComplexityAware(w, h): ComplexityAwareCache
        +createForScenario(scenario): Cache
        +getOrCreate(key, factory): Cache
    }
    
    class HistoryManager {
        -history: DrawAction[]
        -undoneActions: DrawAction[]
        -eventBus: EventBus
        +addAction(action): void
        +undo(): DrawAction[]
        +redo(): DrawAction[]
        +getHistory(): DrawAction[]
    }
    
    DrawBoard --> CanvasEngine
    DrawBoard --> ToolManager
    DrawBoard --> HistoryManager
    DrawBoard --> VirtualLayerManager
    DrawBoard --> DrawingHandler
    DrawBoard --> SelectToolCoordinator
    DrawBoard --> EventBus
    
    SelectToolCoordinator --> ToolManager
    SelectToolCoordinator --> DrawingHandler
    SelectToolCoordinator --> EventBus
    
    DrawingHandler --> DirtyRectManager
    DrawingHandler --> EventBus
    
    VirtualLayerManager --> EventBus
    HistoryManager --> EventBus
    
    ToolManager --> ToolFactory
    ToolFactory ..> DrawTool : creates
    
    DrawTool <|-- SelectTool
    DrawTool <|-- PenTool
    DrawTool <|-- RectTool
    DrawTool <|-- CircleTool
    DrawTool <|-- LineTool
    DrawTool <|-- PolygonTool
    DrawTool <|-- TextTool
    DrawTool <|-- EraserTool
    
    SelectTool --> TransformOperations
    SelectTool --> AnchorGenerator
    SelectTool --> AnchorDragHandler
    SelectTool --> BoundsCalculator
    SelectTool --> HitTestManager
    SelectTool --> BoxSelectionManager
    SelectTool --> SelectionRenderer
```

---

## 3. 绘制时序图

```mermaid
sequenceDiagram
    participant U as 用户
    participant EM as EventManager
    participant DH as DrawingHandler
    participant TM as ToolManager
    participant Tool as DrawTool
    participant HM as HistoryManager
    participant VLM as VirtualLayerManager
    participant EB as EventBus
    participant CE as CanvasEngine
    
    U->>EM: mousedown
    EM->>DH: handleDrawStart(point)
    DH->>TM: getCurrentToolInstance()
    TM-->>DH: tool
    DH->>DH: 创建 DrawAction
    DH->>VLM: 分配到图层
    
    loop 绘制中
        U->>EM: mousemove
        EM->>DH: handleDrawMove(point)
        DH->>DH: 更新 action.points
        DH->>Tool: draw(ctx, action)
        Tool->>CE: 绘制到 interaction 层
    end
    
    U->>EM: mouseup
    EM->>DH: handleDrawEnd()
    DH->>HM: addAction(action)
    HM->>EB: emit('action:created')
    DH->>VLM: 标记缓存过期
    DH->>DH: forceRedraw()
    DH->>Tool: draw(ctx, action)
    Tool->>CE: 绘制到 draw 层
```

---

## 4. 选择工具时序图（含脏矩形优化）

```mermaid
sequenceDiagram
    participant U as 用户
    participant EM as EventManager
    participant STC as SelectToolCoordinator
    participant ST as SelectTool
    participant DRM as DirtyRectManager
    participant EB as EventBus
    participant DH as DrawingHandler
    participant CE as CanvasEngine
    
    U->>EM: mousedown
    EM->>STC: handleDrawStart(point)
    STC->>ST: handleMouseDown(point)
    
    alt 点击到 action
        ST->>ST: HitTestManager.isPointInAction()
        ST->>ST: 进入变换模式
        ST->>ST: AnchorGenerator.generate()
    else 空白区域
        ST->>ST: BoxSelectionManager.start()
    end
    
    loop 拖拽中
        U->>EM: mousemove
        EM->>STC: handleDrawMove(point)
        STC->>DRM: markActionDirty(oldBounds)
        STC->>ST: handleMouseMove(point)
        
        alt 变换模式
            ST->>ST: AnchorDragHandler.handle()
            ST->>ST: TransformOperations.scale()
        else 框选模式
            ST->>ST: BoxSelectionManager.update()
        end
        
        STC->>DRM: markActionDirty(newBounds)
        STC->>DH: redrawDirtyRects()
        DRM->>DRM: merge()
        DRM->>CE: 局部重绘
    end
    
    U->>EM: mouseup
    EM->>STC: handleDrawEnd()
    STC->>ST: handleMouseUp()
    ST-->>STC: updatedActions
    STC->>EB: emit('selection:changed')
    STC->>DH: forceRedraw()
```

---

## 5. EventBus 事件流图

```mermaid
graph LR
    subgraph "发布者"
        STC[SelectToolCoordinator]
        HM[HistoryManager]
        DH[DrawingHandler]
        TM[ToolManager]
    end
    
    subgraph "EventBus"
        EB((EventBus))
    end
    
    subgraph "订阅者"
        VLM[VirtualLayerManager]
        HM2[HistoryManager]
        DH2[DrawingHandler]
    end
    
    STC -->|selection:changed| EB
    STC -->|action:updated| EB
    HM -->|history:changed| EB
    DH -->|redraw:requested| EB
    TM -->|tool:changed| EB
    
    EB -->|action:updated| VLM
    EB -->|selection:changed| VLM
    EB -->|history:undo| HM2
    EB -->|tool:changed| DH2
    EB -->|redraw:requested| DH2
    
    style EB fill:#fff3e0,stroke:#ff9800,stroke-width:2px
```

---

## 6. 模块依赖图

```mermaid
graph LR
    subgraph "入口"
        DB[DrawBoard]
    end
    
    subgraph "API"
        TA[ToolAPI]
        SA[SelectionAPI]
        LA[LayerAPI]
        HA[HistoryAPI]
    end
    
    subgraph "处理器"
        DH[DrawingHandler]
        STC[SelectToolCoordinator]
        SH[StateHandler]
        CH[CursorHandler]
        CM[CacheManager]
        RM[RedrawManager]
    end
    
    subgraph "管理器"
        TM[ToolManager]
        HM[HistoryManager]
        PM[PerformanceManager]
        SM[SelectionManager]
        VLM[VirtualLayerManager]
    end
    
    subgraph "基础设施"
        EB[EventBus]
        CF[CacheFactory]
        DRM[DirtyRectManager]
        EM[EventManager]
    end
    
    subgraph "工具"
        TF[ToolFactory]
        ST[SelectTool]
        PT[PenTool]
        RT[RectTool]
    end
    
    subgraph "引擎"
        CE[CanvasEngine]
    end
    
    DB --> TA & SA & LA & HA
    DB --> DH & STC & SH & CH
    DH --> TM & HM & VLM & CM & RM
    DH --> DRM & EB
    STC --> TM & DH & HM & EB
    VLM --> EB
    HM --> EB
    TM --> TF
    TF --> ST & PT & RT
    DH & TM --> CE
    
    style DB fill:#ffeb3b
    style CE fill:#4caf50,color:#fff
    style EB fill:#ff9800,color:#fff
    style STC fill:#e91e63,color:#fff
```

---

## 7. 图层结构图

```mermaid
graph TB
    subgraph "物理 Canvas 层"
        IT[interaction 层<br/>z-index: 1000<br/>事件接收]
        SL[selection 动态层<br/>z-index: 100+<br/>选区/锚点]
        DT[draw-top 层<br/>z-index: 3<br/>可选]
        DS[draw-selected 层<br/>z-index: 2<br/>可选]
        DBL[draw-bottom 层<br/>z-index: 1<br/>可选]
        DR[draw 层<br/>z-index: 1<br/>默认]
        BG[background 层<br/>z-index: 0<br/>背景/网格]
    end
    
    subgraph "虚拟图层"
        VL1[VirtualLayer 1<br/>zIndex: 0]
        VL2[VirtualLayer 2<br/>zIndex: 1]
        VL3[VirtualLayer 3<br/>zIndex: 2]
    end
    
    subgraph "动态拆分模式"
        VL1 -.-> DBL
        VL2 -.-> DS
        VL3 -.-> DT
    end
    
    subgraph "默认模式"
        VL1 & VL2 & VL3 -.-> DR
    end
    
    IT --> SL --> DT --> DS --> DBL --> BG
    IT --> SL --> DR --> BG
    
    style IT fill:#e3f2fd
    style SL fill:#fff3e0
    style DS fill:#e8f5e9,stroke:#4caf50,stroke-width:2px
    style DR fill:#e8f5e9
```

---

## 8. SelectTool 子模块架构

```mermaid
graph TB
    subgraph "SelectTool"
        ST[SelectTool<br/>主控制器]
    end
    
    subgraph "变换操作"
        TO[TransformOperations<br/>缩放/旋转/平移]
        BC[BoundsCalculator<br/>边界计算]
    end
    
    subgraph "锚点系统"
        AG[AnchorGenerator<br/>锚点生成]
        ADH[AnchorDragHandler<br/>锚点拖拽]
        ACM[AnchorCacheManager<br/>锚点缓存]
    end
    
    subgraph "选择系统"
        HTM[HitTestManager<br/>命中测试]
        BSM[BoxSelectionManager<br/>框选]
        DSM[DragStateManager<br/>拖拽状态]
    end
    
    subgraph "渲染系统"
        SR[SelectionRenderer<br/>选区渲染]
        BCM[BoundsCacheManager<br/>边界缓存]
    end
    
    subgraph "事件处理"
        MEH[MouseEventHandler<br/>鼠标事件]
    end
    
    ST --> TO & BC
    ST --> AG & ADH & ACM
    ST --> HTM & BSM & DSM
    ST --> SR & BCM
    ST --> MEH
    
    TO --> BC
    ADH --> AG
    SR --> BCM
    
    style ST fill:#e91e63,color:#fff
    style TO fill:#9c27b0,color:#fff
    style AG fill:#2196f3,color:#fff
    style HTM fill:#4caf50,color:#fff
    style SR fill:#ff9800,color:#fff
```

---

## 9. 设计模式应用

```mermaid
graph TB
    subgraph "门面模式"
        F1[DrawBoard] --> F2[简化 API]
    end
    
    subgraph "工厂模式"
        FA1[ToolFactory] --> FA2[createTool]
        FA3[CacheFactory] --> FA4[createForScenario]
    end
    
    subgraph "观察者模式"
        O1[EventBus] --> O2[on/emit]
        O3[EventManager] --> O4[DOM事件]
    end
    
    subgraph "命令模式"
        C1[HistoryManager] --> C2[DrawAction]
        C2 --> C3[undo/redo]
    end
    
    subgraph "策略模式"
        S1[ToolManager] --> S2[setCurrentTool]
        S2 --> S3[不同绘制策略]
    end
    
    subgraph "协调器模式"
        CO1[SelectToolCoordinator] --> CO2[协调多组件]
    end
    
    style F1 fill:#e1f5fe
    style FA1 fill:#f3e5f5
    style FA3 fill:#f3e5f5
    style O1 fill:#fff3e0
    style O3 fill:#e8f5e9
    style C1 fill:#fff3e0
    style S1 fill:#fce4ec
    style CO1 fill:#e91e63,color:#fff
```

---

## 10. 缓存层级图

```mermaid
graph TB
    subgraph "脏矩形优化"
        DR[DirtyRectManager<br/>局部重绘]
    end
    
    subgraph "离屏缓存"
        OC[OffscreenCacheManager<br/>历史动作 > 100]
    end
    
    subgraph "图层缓存"
        VLC[VirtualLayer.cacheCanvas<br/>每图层独立]
    end
    
    subgraph "LRU 缓存"
        BC[BoundsCache<br/>边界框]
        AC[AnchorCache<br/>锚点]
    end
    
    subgraph "复杂度缓存"
        CC[ComplexityAwareCache<br/>优先缓存复杂动作]
    end
    
    DR --> OC
    OC --> VLC
    VLC --> BC & AC
    BC & AC --> CC
    
    style DR fill:#f44336,color:#fff
    style OC fill:#ff9800,color:#fff
    style VLC fill:#4caf50,color:#fff
    style BC fill:#2196f3,color:#fff
    style CC fill:#9c27b0,color:#fff
```

---

**文档版本**: 4.0  
**最后更新**: 2024-12  
**主要更新**:
- 新增 EventBus 事件总线图
- 新增 SelectToolCoordinator 协调器
- 新增脏矩形优化时序图
- 新增 SelectTool 子模块架构图
- 新增缓存层级图
- 更新类图包含新组件
