# 🧪 测试计划 - DrawBoard 完整测试方案

## 📋 测试概述

本文档提供了 DrawBoard 项目的完整测试计划，包括单元测试、集成测试和性能基准测试。

**测试目标**: 
- 确保所有功能正确实现
- 性能优化达到预期效果
- 代码质量达到生产标准
- 测试覆盖率 ≥ 70%

---

## 📝 代码结构概览

### 核心模块

1. **Core 模块** - 核心功能
   - `CanvasEngine.ts` - Canvas 引擎
   - `VirtualLayerManager.ts` - 虚拟图层管理
   - `SelectionManager.ts` - 选择管理
   - `PerformanceManager.ts` - 性能管理
   - `ComplexityManager.ts` - 复杂度管理
   - `InitializationManager.ts` - 初始化管理 ⭐ 新增
   - `ShortcutConfigManager.ts` - 快捷键配置管理 ⭐ 新增

2. **Handlers 模块** - 处理器
   - `DrawingHandler.ts` - 绘制处理
   - `CursorHandler.ts` - 光标处理
   - `StateHandler.ts` - 状态处理
   - `EventCoordinator.ts` - 事件协调 ⭐ 新增
   - `RedrawManager.ts` - 重绘管理 ⭐ 新增
   - `CacheManager.ts` - 缓存管理 ⭐ 新增

3. **Tools 模块** - 工具
   - `SelectTool.ts` - 选择工具
   - `DrawTool.ts` - 绘制工具基类
   - `anchor/` - 锚点处理器
     - `BaseAnchorHandler.ts` - 基础锚点处理器 ⭐ 新增
     - `CircleAnchorHandler.ts` - 圆形锚点
     - `RectAnchorHandler.ts` - 矩形锚点
     - `TextAnchorHandler.ts` - 文本锚点
     - `LineAnchorHandler.ts` - 线条锚点

4. **Utils 模块** - 工具函数
   - `SpatialIndex.ts` - 空间索引
   - `MemoryMonitor.ts` - 内存监控
   - `AnchorUtils.ts` - 锚点工具 ⭐ 新增
   - `ShapeUtils.ts` - 图形工具 ⭐ 新增
   - `SafeExecutor.ts` - 安全执行器 ⭐ 新增
   - `Logger.ts` - 日志工具
   - `Constants.ts` - 配置常量 ⭐ 新增

5. **Eraser 模块** - 橡皮擦 ⭐ v4.1 新增
   - `EraserTool.ts` - 橡皮擦工具（只对 pen 类型起作用）
   - `eraser/PathSplitter.ts` - 路径分割器（可配置精度）
   - `eraser/SpatialIndex.ts` - 四叉树空间索引

---

## 1. 单元测试

### ✅ 已创建的测试文件

1. **zIndex 计算测试** - `src/__tests__/core/CanvasEngine.test.ts` ✅
2. **空间索引测试** - `src/__tests__/utils/SpatialIndex.test.ts` ✅
3. **内存监控测试** - `src/__tests__/utils/MemoryMonitor.test.ts` ✅
4. **圆形锚点测试** - `src/__tests__/tools/anchor/CircleAnchorHandler.test.ts` ✅
5. **拖拽配置和取消测试** - `src/__tests__/tools/SelectTool.test.ts` ✅

### ⏳ 待创建的测试文件

#### 1.6 工具函数测试 ⏳

**文件**: `src/__tests__/utils/AnchorUtils.test.ts`

**测试覆盖**:
- [ ] 计算中心点（`calculateCenterPoint`）
- [ ] 检查点是否在锚点内（`isPointInAnchor`）
- [ ] 锚点大小限制（`clampAnchorSize`）
- [ ] 锚点容差限制（`clampAnchorTolerance`）
- [ ] 获取锚点中心（`getAnchorCenter`）
- [ ] 计算锚点距离（`getAnchorDistance`）
- [ ] 边界值测试
- [ ] 异常输入处理

**文件**: `src/__tests__/utils/ShapeUtils.test.ts`

**测试覆盖**:
- [ ] 计算边界框（`calculateBounds`）
- [ ] 移动图形（`moveShape`）
- [ ] 点与边界框相交（`isPointInBounds`）
- [ ] 边界框相交（`isBoundsIntersect`）
- [ ] 合并边界框（`mergeBounds`）
- [ ] 验证边界框（`validateBounds`）
- [ ] 获取边界框中心（`getBoundsCenter`）
- [ ] 计算距离和角度（`getDistance`, `getAngle`）
- [ ] 边界值测试

**文件**: `src/__tests__/utils/SafeExecutor.test.ts`

**测试覆盖**:
- [ ] 同步执行成功（`execute`）
- [ ] 同步执行失败（`execute` with error）
- [ ] 异步执行成功（`executeAsync`）
- [ ] 异步执行失败（`executeAsync` with error）
- [ ] 重试机制（`retry`）
- [ ] 批量执行（`batch`）
- [ ] 错误处理和降级
- [ ] 超时处理

#### 1.7 基础类测试 ⏳

**文件**: `src/__tests__/tools/anchor/BaseAnchorHandler.test.ts`

**测试覆盖**:
- [ ] 移动处理（`handleMove`）
- [ ] 中心点计算（`calculateCenterPoint`）
- [ ] 边界框计算（`calculateBounds`）
- [ ] 边界验证（`validateBounds`）
- [ ] 点是否在锚点内（`isPointInAnchor`）
- [ ] 继承类功能验证

#### 1.8 管理器测试 ⏳

**文件**: `src/__tests__/handlers/EventCoordinator.test.ts`

**测试覆盖**:
- [ ] 构造函数初始化
- [ ] 处理绘制开始事件（`handleDrawStart`）
- [ ] 处理绘制移动事件（`handleDrawMove`）
- [ ] 处理绘制结束事件（`handleDrawEnd`）
- [ ] 选择工具特殊处理
- [ ] 其他工具正常流程
- [ ] 光标更新
- [ ] 错误处理
- [ ] 节流机制

**文件**: `src/__tests__/handlers/RedrawManager.test.ts`

**测试覆盖**:
- [ ] 构造函数初始化
- [ ] 全量重绘（`redrawAll`）
- [ ] 增量重绘（`redrawIncremental`）
- [ ] 几何图形重绘（`redrawGeometric`）
- [ ] 图层重绘（`redrawLayer`）
- [ ] Bottom 层重绘（`redrawBottomLayers`）
- [ ] Top 层重绘（`redrawTopLayers`）
- [ ] 选中图层重绘（`redrawSelectedLayer`）
- [ ] 选择工具UI重绘
- [ ] 错误处理和降级

**文件**: `src/__tests__/handlers/CacheManager.test.ts`

**测试覆盖**:
- [ ] 构造函数初始化
- [ ] 动作缓存管理（`checkAndUpdateActionCache`, `updateActionCache`）
- [ ] 缓存操作（`addActionToCache`, `removeActionFromCache`, `isActionCached`）
- [ ] 离屏缓存管理（`shouldUseOffscreenCache`, `getOffscreenCache`）
- [ ] 缓存失效（`invalidateOffscreenCache`）
- [ ] 缓存清理（`cleanupOffscreenCanvas`）
- [ ] 内存监控集成
- [ ] 缓存统计（`getCacheStats`）
- [ ] 清空所有缓存（`clearAllCache`）

**文件**: `src/__tests__/core/InitializationManager.test.ts`

**测试覆盖**:
- [ ] 初始化核心组件（`initializeCoreComponents`）
- [ ] 初始化处理器（`initializeHandlers`）
- [ ] 设置依赖关系（`setupDependencies`）
- [ ] 组件创建验证
- [ ] 依赖关系设置验证
- [ ] 错误处理
- [ ] 配置选项处理

**文件**: `src/__tests__/core/ShortcutConfigManager.test.ts`

**测试覆盖**:
- [ ] 创建默认快捷键（`createDefaultShortcuts`）
- [ ] Mac 平台快捷键
- [ ] Windows/Linux 平台快捷键
- [ ] 注册快捷键（`registerShortcuts`）
- [ ] 操作系统检测（`detectOS`）
- [ ] 快捷键优先级
- [ ] 错误处理

**文件**: `src/__tests__/core/SelectionManager.test.ts`

**测试覆盖**:
- [ ] 构造函数初始化
- [ ] 点选功能（`selectActionAtPoint`）
- [ ] 框选功能（`selectActionsInBox`）
- [ ] 空间索引集成
- [ ] 选择状态管理
- [ ] 错误处理

#### 1.9 配置常量测试 ⏳

**文件**: `src/__tests__/config/Constants.test.ts`

**测试覆盖**:
- [ ] 锚点配置常量
- [ ] 拖拽配置常量
- [ ] 空间索引配置常量
- [ ] 内存配置常量
- [ ] zIndex 配置常量
- [ ] 性能配置常量
- [ ] 图形配置常量
- [ ] 常量类型检查

---

## 2. 集成测试

### 2.1 管理器集成测试 ⏳

**文件**: `src/__tests__/integration/ManagerIntegration.test.ts`

**测试场景**:
- [ ] EventCoordinator 与 DrawingHandler 集成
- [ ] RedrawManager 与 CacheManager 集成
- [ ] InitializationManager 完整初始化流程
- [ ] ShortcutConfigManager 快捷键注册流程
- [ ] 管理器之间的依赖关系

### 2.2 空间索引性能集成测试 ⏳

**文件**: `src/__tests__/integration/SpatialIndexPerformance.test.ts`

```typescript
describe('空间索引性能集成测试', () => {
  it('应该在大量 actions 时提升点选性能', async () => {
    const actions = generateTestActions(2000);
    const selectTool = new SelectTool();
    selectTool.setLayerActions(actions, false);

    // 测试不使用空间索引的性能
    const start1 = performance.now();
    for (let i = 0; i < 100; i++) {
      selectTool.selectActionAtPoint({ x: 500, y: 500 }, 8);
    }
    const timeWithoutIndex = performance.now() - start1;

    // 测试使用空间索引的性能
    // ... 启用空间索引后测试

    // 验证性能提升
    expect(timeWithIndex).toBeLessThan(timeWithoutIndex);
  });
});
```

### 2.3 内存管理集成测试 ⏳

**文件**: `src/__tests__/integration/MemoryManagement.test.ts`

```typescript
describe('智能内存管理集成测试', () => {
  it('应该在内存紧张时自动禁用缓存', () => {
    const cacheManager = new CacheManager(canvasEngine, drawAction);
    
    // 模拟内存紧张场景
    const memoryMonitor = cacheManager.getMemoryMonitor();
    memoryMonitor.setMaxMemoryUsage(0.1); // 设置很低的阈值
    
    // 执行重绘操作
    // 验证缓存是否被禁用
  });
});
```

### 2.4 事件处理集成测试 ⏳

**文件**: `src/__tests__/integration/EventHandling.test.ts`

**测试场景**:
- [ ] 完整的事件处理流程（mousedown → mousemove → mouseup）
- [ ] 选择工具事件处理
- [ ] 其他工具事件处理
- [ ] 事件协调器与工具管理器集成
- [ ] 错误恢复机制

### 2.5 重绘流程集成测试 ⏳

**文件**: `src/__tests__/integration/RedrawFlow.test.ts`

**测试场景**:
- [ ] 全量重绘流程
- [ ] 增量重绘流程
- [ ] 图层重绘流程
- [ ] 缓存使用流程
- [ ] 性能优化验证

---

## 3. 性能基准测试

### 3.1 空间索引性能基准 ⏳

**文件**: `src/__tests__/benchmark/SpatialIndexBenchmark.test.ts`

```typescript
describe('空间索引性能基准', () => {
  const actionCounts = [100, 500, 1000, 2000, 5000];

  actionCounts.forEach(count => {
    it(`点选性能基准 - ${count} 个 actions`, () => {
      const actions = generateTestActions(count);
      const selectTool = new SelectTool();
      selectTool.setLayerActions(actions, false);

      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        selectTool.selectActionAtPoint({ x: 500, y: 500 }, 8);
      }
      const duration = performance.now() - start;

      console.log(`${count} actions: ${duration.toFixed(2)}ms`);
      // 记录基准数据
    });
  });
});
```

### 3.2 内存监控性能基准 ⏳

**文件**: `src/__tests__/benchmark/MemoryMonitorBenchmark.test.ts`

```typescript
describe('内存监控性能基准', () => {
  it('内存检查性能基准', () => {
    const monitor = new MemoryMonitor();
    
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      monitor.isMemoryUsageHigh();
    }
    const duration = performance.now() - start;
    
    console.log(`1000次检查: ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(100); // 应该在100ms内完成
  });
});
```

### 3.3 重绘性能基准 ⏳

**文件**: `src/__tests__/benchmark/RedrawBenchmark.test.ts`

**测试场景**:
- [ ] 全量重绘性能（不同数量的 actions）
- [ ] 增量重绘性能
- [ ] 图层重绘性能
- [ ] 缓存命中率影响
- [ ] 内存压力下的性能

### 3.4 缓存性能基准 ⏳

**文件**: `src/__tests__/benchmark/CacheBenchmark.test.ts`

**测试场景**:
- [ ] 缓存构建性能
- [ ] 缓存查询性能
- [ ] 缓存失效性能
- [ ] 内存使用情况

---

## 4. E2E 测试场景

### 4.1 拖拽取消流程 ⏳

```typescript
describe('拖拽取消 E2E 测试', () => {
  it('应该支持完整的拖拽取消流程', async () => {
    // 1. 选择图形
    // 2. 开始拖拽
    // 3. 移动鼠标
    // 4. 按下 ESC 键
    // 5. 验证图形恢复到原始位置
  });
});
```

### 4.2 圆形锚点交互 ⏳

```typescript
describe('圆形锚点交互 E2E 测试', () => {
  it('应该支持4个锚点 + 中心点的交互', async () => {
    // 1. 创建圆形
    // 2. 验证锚点数量（5个）
    // 3. 测试每个锚点的拖拽
    // 4. 测试中心点移动
  });
});
```

### 4.3 管理器协作流程 ⏳

```typescript
describe('管理器协作 E2E 测试', () => {
  it('应该支持完整的管理器协作流程', async () => {
    // 1. 初始化管理器
    // 2. 处理事件
    // 3. 触发重绘
    // 4. 管理缓存
    // 5. 验证结果
  });
});
```

---

## 5. 测试工具和配置

### 5.1 测试框架

已配置：
- **Jest** - 单元测试和集成测试 ✅
- **ts-jest** - TypeScript 支持 ✅
- **jest-environment-jsdom** - DOM 环境支持 ✅

### 5.2 测试配置

**jest.config.js** ✅ 已创建:
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/libs/drawBoard/**/*.ts',
    '!src/libs/drawBoard/**/*.d.ts',
    '!src/libs/drawBoard/**/index.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
};
```

### 5.3 测试脚本

**package.json** ✅ 已更新:
```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:benchmark": "jest --testPathPattern=benchmark"
  }
}
```

---

## 6. 测试执行计划

### 阶段 1: 单元测试

#### ✅ 已完成
- [x] zIndex 计算测试
- [x] 空间索引基础测试
- [x] 内存监控测试
- [x] 拖拽取消测试
- [x] 圆形锚点测试
- [x] 工具函数测试（AnchorUtils, ShapeUtils, SafeExecutor）✅
- [x] 缓存管理器测试（CacheManager）✅
- [x] 配置常量测试（Constants）✅

#### ⏳ 待实现
- [x] 基础类测试（BaseAnchorHandler）✅
- [x] 初始化管理器测试（InitializationManager）✅

### 阶段 2: 集成测试 ⏳ 待实现

- [ ] 管理器集成测试
- [ ] 空间索引性能集成测试
- [ ] 内存管理集成测试
- [ ] 事件处理集成测试
- [ ] 重绘流程集成测试

### 阶段 3: 性能基准测试 ⏳ 待实现

- [ ] 空间索引性能基准
- [ ] 内存监控性能基准
- [ ] 重绘性能基准
- [ ] 缓存性能基准
- [ ] 建立性能基线

### 阶段 4: E2E 测试 ⏳ 待实现

- [ ] 用户交互流程测试
- [ ] 大量数据场景测试
- [ ] 边界情况测试
- [ ] 管理器协作流程测试

---

## 7. 测试覆盖率目标

- **单元测试覆盖率**: ≥ 70% ⏳ 当前约 40%
- **集成测试覆盖率**: ≥ 60% ⏳ 待实现
- **关键路径覆盖率**: 100% ⏳ 待实现
- **管理器类覆盖率**: ≥ 80% ⏳ 待实现

---

## 8. 运行测试

### 安装依赖

```bash
npm install
```

### 运行所有测试

```bash
npm test
```

### 监听模式运行

```bash
npm run test:watch
```

### 生成覆盖率报告

```bash
npm run test:coverage
```

### 运行性能基准测试

```bash
npm run test:benchmark
```

### 运行特定测试文件

```bash
npm test -- EventCoordinator.test.ts
```

---

## 9. 测试文件统计

### ✅ 已创建的文件

#### 核心测试
1. ✅ `jest.config.js` - Jest 配置
2. ✅ `src/__tests__/setup.ts` - 测试环境设置
3. ✅ `src/__tests__/core/CanvasEngine.test.ts` - zIndex 测试
4. ✅ `src/__tests__/README.md` - 测试说明文档

#### 工具函数测试
5. ✅ `src/__tests__/utils/SpatialIndex.test.ts` - 空间索引测试
6. ✅ `src/__tests__/utils/MemoryMonitor.test.ts` - 内存监控测试
7. ✅ `src/__tests__/utils/AnchorUtils.test.ts` - 锚点工具测试 ⭐ 新增
8. ✅ `src/__tests__/utils/ShapeUtils.test.ts` - 图形工具测试 ⭐ 新增
9. ✅ `src/__tests__/utils/SafeExecutor.test.ts` - 安全执行器测试 ⭐ 新增

#### 工具测试
10. ✅ `src/__tests__/tools/anchor/CircleAnchorHandler.test.ts` - 圆形锚点测试
11. ✅ `src/__tests__/tools/SelectTool.test.ts` - 拖拽配置测试
18. ✅ `src/__tests__/tools/anchor/BaseAnchorHandler.test.ts` - 基础锚点处理器测试 ⭐ 新增

#### 管理器测试
12. ✅ `src/__tests__/handlers/CacheManager.test.ts` - 缓存管理器测试 ⭐ 新增
13. ✅ `src/__tests__/handlers/EventCoordinator.test.ts` - 事件协调器测试 ⭐ 新增
14. ✅ `src/__tests__/handlers/RedrawManager.test.ts` - 重绘管理器测试 ⭐ 新增
15. ✅ `src/__tests__/core/ShortcutConfigManager.test.ts` - 快捷键配置管理器测试 ⭐ 新增
16. ✅ `src/__tests__/core/SelectionManager.test.ts` - 选择管理器测试 ⭐ 新增
19. ✅ `src/__tests__/core/InitializationManager.test.ts` - 初始化管理器测试 ⭐ 新增

#### 配置测试
17. ✅ `src/__tests__/config/Constants.test.ts` - 配置常量测试 ⭐ 新增

### ⏳ 待创建的文件

#### 集成测试
1. ⏳ `src/__tests__/integration/ManagerIntegration.test.ts`
2. ⏳ `src/__tests__/integration/SpatialIndexPerformance.test.ts`
3. ⏳ `src/__tests__/integration/MemoryManagement.test.ts`
4. ⏳ `src/__tests__/integration/EventHandling.test.ts`
5. ⏳ `src/__tests__/integration/RedrawFlow.test.ts`

#### 性能基准测试
6. ⏳ `src/__tests__/benchmark/SpatialIndexBenchmark.test.ts`
7. ⏳ `src/__tests__/benchmark/MemoryMonitorBenchmark.test.ts`
8. ⏳ `src/__tests__/benchmark/RedrawBenchmark.test.ts`
9. ⏳ `src/__tests__/benchmark/CacheBenchmark.test.ts`

---

## 10. 测试优先级

### 🔴 高优先级（立即执行）

1. **工具函数测试**
   - AnchorUtils.test.ts
   - ShapeUtils.test.ts
   - SafeExecutor.test.ts

2. **管理器核心测试**
   - EventCoordinator.test.ts
   - RedrawManager.test.ts
   - CacheManager.test.ts

### 🟡 中优先级（近期执行）

3. **初始化和管理器测试**
   - InitializationManager.test.ts
   - ShortcutConfigManager.test.ts
   - SelectionManager.test.ts

4. **基础类测试**
   - BaseAnchorHandler.test.ts

### 🟢 低优先级（后续优化）

5. **集成测试**
   - ManagerIntegration.test.ts
   - EventHandling.test.ts
   - RedrawFlow.test.ts

6. **性能基准测试**
   - 所有 benchmark 测试

---

## 11. 测试最佳实践

### 测试命名

- 使用描述性的测试名称
- 遵循 `should [expected behavior] when [condition]` 格式
- 使用中文描述（与代码注释保持一致）

### 测试组织

- 使用 `describe` 组织相关测试
- 使用 `beforeEach` 和 `afterEach` 设置测试环境
- 每个测试应该独立，不依赖其他测试

### 测试覆盖

- 测试正常流程
- 测试边界值
- 测试异常情况
- 测试错误处理

### 性能测试

- 建立性能基线
- 监控性能回归
- 记录性能数据

---

## 📝 总结

### ✅ 已完成

- ✅ 核心单元测试已创建（19个文件）
- ✅ Jest 配置已设置
- ✅ 测试脚本已添加到 package.json
- ✅ 测试文档已完善
- ✅ 工具函数测试已完成（AnchorUtils, ShapeUtils, SafeExecutor）
- ✅ 管理器测试已完成（CacheManager, EventCoordinator, RedrawManager, ShortcutConfigManager, SelectionManager, InitializationManager）
- ✅ 基础类测试已完成（BaseAnchorHandler）
- ✅ 配置常量测试已完成

### ⏳ 待完成

1. **集成测试** - 5个文件
2. **性能基准测试** - 4个文件

**总计**: 9个测试文件待创建

### 📊 测试进度

- **单元测试**: 16/16 完成 (100%) ✅
- **集成测试**: 0/5 完成 (0%)
- **性能测试**: 0/4 完成 (0%)
- **总体进度**: 16/25 完成 (64%) ⬆️⬆️

---

**测试状态**: ✅ 单元测试已完成（100%）  
**下一步**: 创建集成测试和性能基准测试  
**目标**: 达到 70% 测试覆盖率
