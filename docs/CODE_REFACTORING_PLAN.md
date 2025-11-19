# 🔧 代码重构计划 - 高可用、高复用、清晰、可维护

## 📋 审查发现的问题

### 1. 代码规模问题

- **SelectTool.ts**: 3586行，139个成员变量/方法
- **DrawBoard.ts**: 2063行，116个成员变量/方法
- **文件过大**，违反单一职责原则

### 2. 代码重复问题

#### 2.1 锚点处理器重复代码
- `CircleAnchorHandler`、`RectAnchorHandler`、`TextAnchorHandler`、`LineAnchorHandler` 都有相似的：
  - `anchorSize` 常量
  - `handleMove` 方法
  - `calculateCenterPoint` 方法
  - 边界检查逻辑

#### 2.2 工具类重复代码
- 多个工具类都有相似的：
  - 点验证逻辑
  - 边界计算
  - 绘制上下文获取

### 3. 职责不清问题

- **SelectTool** 承担了太多职责：
  - 选择逻辑
  - 拖拽处理
  - 锚点管理
  - 变换处理
  - 空间索引管理
  - 缓存管理

### 4. 可复用性不足

- 缺少通用的工具函数库
- 缺少统一的配置管理
- 缺少统一的错误处理模式

---

## 🎯 重构目标

### 1. 高可用
- 完善的错误处理
- 边界情况处理
- 降级策略

### 2. 高复用
- 提取公共工具函数
- 创建基础类/接口
- 统一配置管理

### 3. 清晰
- 单一职责原则
- 清晰的模块划分
- 完善的文档

### 4. 可维护
- 模块化设计
- 易于测试
- 易于扩展

---

## 🔄 重构方案

### 阶段1: 提取公共工具函数

#### 1.1 创建锚点工具类

**文件**: `src/libs/drawBoard/utils/AnchorUtils.ts`

```typescript
/**
 * 锚点工具类
 * 提供锚点相关的通用功能
 */
export class AnchorUtils {
  static readonly DEFAULT_ANCHOR_SIZE = 8;
  static readonly DEFAULT_ANCHOR_TOLERANCE = 6;
  
  /**
   * 计算中心点
   */
  static calculateCenterPoint(points: Point[]): Point {
    if (points.length === 0) return { x: 0, y: 0 };
    const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / points.length, y: sum.y / points.length };
  }
  
  /**
   * 检查点是否在锚点范围内
   */
  static isPointInAnchor(point: Point, anchor: AnchorPoint, tolerance: number): boolean {
    const dx = point.x - (anchor.x + AnchorUtils.DEFAULT_ANCHOR_SIZE / 2);
    const dy = point.y - (anchor.y + AnchorUtils.DEFAULT_ANCHOR_SIZE / 2);
    return Math.sqrt(dx * dx + dy * dy) <= tolerance;
  }
  
  /**
   * 限制锚点大小
   */
  static clampAnchorSize(size: number): number {
    return Math.max(4, Math.min(20, size));
  }
}
```

#### 1.2 创建图形工具类

**文件**: `src/libs/drawBoard/utils/ShapeUtils.ts`

```typescript
/**
 * 图形工具类
 * 提供图形相关的通用功能
 */
export class ShapeUtils {
  /**
   * 计算边界框
   */
  static calculateBounds(points: Point[]): Bounds {
    if (points.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
    
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    
    return {
      x: minX,
      y: minY,
      width: maxX - minX || 10,
      height: maxY - minY || 10
    };
  }
  
  /**
   * 检查点是否在图形内
   */
  static isPointInShape(point: Point, shape: DrawAction, tolerance: number = 8): boolean {
    // 通用实现，各工具类可以覆盖
    return false;
  }
  
  /**
   * 移动图形
   */
  static moveShape(shape: DrawAction, deltaX: number, deltaY: number, canvasBounds?: { width: number; height: number }): DrawAction {
    const newPoints = shape.points.map(p => {
      let newX = p.x + deltaX;
      let newY = p.y + deltaY;
      
      // 限制在画布范围内
      if (canvasBounds) {
        newX = Math.max(0, Math.min(canvasBounds.width, newX));
        newY = Math.max(0, Math.min(canvasBounds.height, newY));
      }
      
      return { x: newX, y: newY };
    });
    
    return { ...shape, points: newPoints };
  }
}
```

#### 1.3 创建基础锚点处理器

**文件**: `src/libs/drawBoard/tools/anchor/BaseAnchorHandler.ts`

```typescript
/**
 * 基础锚点处理器
 * 提供锚点处理器的通用功能
 */
export abstract class BaseAnchorHandler implements ShapeAnchorHandler {
  protected readonly anchorSize: number = AnchorUtils.DEFAULT_ANCHOR_SIZE;
  
  /**
   * 抽象方法：生成锚点
   */
  abstract generateAnchors(action: DrawAction, bounds: Bounds): AnchorPoint[];
  
  /**
   * 抽象方法：处理锚点拖拽
   */
  abstract handleAnchorDrag(
    action: DrawAction,
    anchorType: AnchorType,
    startPoint: Point,
    currentPoint: Point,
    dragStartBounds: Bounds,
    dragStartAction?: DrawAction
  ): DrawAction | null;
  
  /**
   * 通用方法：移动图形
   */
  public handleMove(
    action: DrawAction,
    deltaX: number,
    deltaY: number,
    canvasBounds?: { width: number; height: number }
  ): DrawAction | null {
    // 验证 delta 值
    if (isNaN(deltaX) || isNaN(deltaY) || !isFinite(deltaX) || !isFinite(deltaY)) {
      return null;
    }
    
    return ShapeUtils.moveShape(action, deltaX, deltaY, canvasBounds);
  }
  
  /**
   * 通用方法：计算中心点
   */
  public calculateCenterPoint(action: DrawAction): Point {
    return AnchorUtils.calculateCenterPoint(action.points);
  }
}
```

### 阶段2: 拆分 SelectTool

#### 2.1 创建选择管理器

**文件**: `src/libs/drawBoard/tools/select/SelectionManager.ts`

```typescript
/**
 * 选择管理器
 * 负责选择逻辑的管理
 */
export class SelectionManager {
  private allActions: DrawAction[] = [];
  private selectedActions: DrawAction[] = [];
  private spatialIndex: SpatialIndex | null = null;
  
  /**
   * 点选
   */
  selectActionAtPoint(point: Point, tolerance: number): DrawAction | null {
    // 选择逻辑
  }
  
  /**
   * 框选
   */
  selectActionsInBox(bounds: Bounds): DrawAction[] {
    // 框选逻辑
  }
  
  /**
   * 清空选择
   */
  clearSelection(): void {
    this.selectedActions = [];
  }
}
```

#### 2.2 创建拖拽管理器

**文件**: `src/libs/drawBoard/tools/select/DragManager.ts`

```typescript
/**
 * 拖拽管理器
 * 负责拖拽逻辑的管理
 */
export class DragManager {
  private dragStartState: DragStartState | null = null;
  private dragConfig: DragConfig;
  
  /**
   * 保存拖拽前状态
   */
  saveDragStartState(actions: DrawAction[], bounds: Bounds): void {
    // 保存状态
  }
  
  /**
   * 取消拖拽
   */
  cancelDrag(): boolean {
    // 取消逻辑
  }
  
  /**
   * 处理拖拽
   */
  handleDrag(point: Point, delta: Point): DrawAction[] | null {
    // 拖拽逻辑
  }
}
```

#### 2.3 创建锚点管理器

**文件**: `src/libs/drawBoard/tools/select/AnchorManager.ts`

```typescript
/**
 * 锚点管理器
 * 负责锚点的生成和管理
 */
export class AnchorManager {
  private anchorPoints: AnchorPoint[] = [];
  private shapeHandlers: Map<string, ShapeAnchorHandler> = new Map();
  
  /**
   * 生成锚点
   */
  generateAnchors(actions: DrawAction[]): AnchorPoint[] {
    // 生成逻辑
  }
  
  /**
   * 检查点击是否在锚点上
   */
  findAnchorAtPoint(point: Point): AnchorPoint | null {
    // 查找逻辑
  }
}
```

### 阶段3: 统一配置管理

#### 3.1 创建配置常量

**文件**: `src/libs/drawBoard/config/Constants.ts`

```typescript
/**
 * 配置常量
 * 统一管理所有配置常量
 */
export const ConfigConstants = {
  // 锚点配置
  ANCHOR: {
    DEFAULT_SIZE: 8,
    MIN_SIZE: 4,
    MAX_SIZE: 20,
    DEFAULT_TOLERANCE: 6,
    MIN_TOLERANCE: 2,
    MAX_TOLERANCE: 15,
    CACHE_TTL: 100
  },
  
  // 拖拽配置
  DRAG: {
    DEFAULT_SENSITIVITY: 0.7,
    MIN_SENSITIVITY: 0,
    MAX_SENSITIVITY: 1,
    DEFAULT_MIN_DISTANCE: 3,
    MIN_DISTANCE: 1,
    MAX_DISTANCE: 10
  },
  
  // 空间索引配置
  SPATIAL_INDEX: {
    POINT_SELECT_THRESHOLD: 1000,
    BOX_SELECT_THRESHOLD: 500
  },
  
  // 内存配置
  MEMORY: {
    DEFAULT_MAX_USAGE: 0.8,
    CHECK_INTERVAL: 5000
  }
};
```

### 阶段4: 错误处理和降级策略

#### 4.1 统一错误处理

**文件**: `src/libs/drawBoard/utils/ErrorHandler.ts` (已存在，需要增强)

```typescript
/**
 * 错误处理工具
 * 提供统一的错误处理模式
 */
export class ErrorHandler {
  /**
   * 安全执行函数
   */
  static safeExecute<T>(
    fn: () => T,
    fallback: T,
    errorMessage?: string
  ): T {
    try {
      return fn();
    } catch (error) {
      logger.error(errorMessage || '执行失败', error);
      return fallback;
    }
  }
  
  /**
   * 安全执行异步函数
   */
  static async safeExecuteAsync<T>(
    fn: () => Promise<T>,
    fallback: T,
    errorMessage?: string
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      logger.error(errorMessage || '异步执行失败', error);
      return fallback;
    }
  }
}
```

---

## 📊 重构优先级

### 高优先级（立即执行）

1. ✅ 提取锚点工具类 (`AnchorUtils.ts`)
2. ✅ 提取图形工具类 (`ShapeUtils.ts`)
3. ✅ 创建基础锚点处理器 (`BaseAnchorHandler.ts`)
4. ✅ 统一配置常量 (`Constants.ts`)

### 中优先级（1-2周内）

5. ⏳ 拆分选择管理器 (`SelectionManager.ts`)
6. ⏳ 拆分拖拽管理器 (`DragManager.ts`)
7. ⏳ 拆分锚点管理器 (`AnchorManager.ts`)
8. ⏳ 增强错误处理

### 低优先级（后续优化）

9. ⏳ 性能优化
10. ⏳ 添加更多单元测试
11. ⏳ 文档完善

---

## ✅ 重构检查清单

- [ ] 提取公共工具函数
- [ ] 创建基础类/接口
- [ ] 拆分大文件
- [ ] 统一配置管理
- [ ] 增强错误处理
- [ ] 更新单元测试
- [ ] 更新文档

---

**重构状态**: 🟡 进行中  
**预计完成时间**: 2-3周

