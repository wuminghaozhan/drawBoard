# 🔒 锁定状态重构影响范围评估

## 📋 重构目标

将锁定状态从 `DrawAction.layerLocked` 迁移到 `VirtualLayer.locked`，锁定状态只归属于虚拟图层，action 通过 `virtualLayerId` 查询虚拟图层来获取锁定状态。

## 🎯 架构原则

1. **单一数据源**：锁定状态只存储在 `VirtualLayer.locked` 中
2. **查询而非存储**：action 不存储锁定状态，通过查询虚拟图层获取
3. **向后兼容**：保留 `DrawAction.layerLocked` 属性定义（可选），但不使用
4. **模式限制**：
   - **individual 模式**：每个 action 对应一个图层，锁定 action = 锁定图层 ✅
   - **grouped 模式**：多个 action 共享图层，锁定功能应该禁用或重新设计 ⚠️
     - 原因：选中一个 action 不能代表整个图层，锁定会影响到图层中的其他 action

## 📊 影响范围分析

### 1. 核心接口定义

#### `DrawTool.ts` - DrawAction 接口
- **位置**: `src/libs/drawBoard/tools/DrawTool.ts:117`
- **当前状态**: `layerLocked?: boolean;` 属性定义
- **影响**: 
  - ✅ **保留**：保持接口定义（向后兼容）
  - ❌ **不再使用**：代码中不再读写此属性
- **风险**: 低（可选属性，不影响现有代码）

### 2. SelectTool 相关（核心修改）

#### `SelectTool.ts` - 锁定状态检查和使用
- **位置**: `src/libs/drawBoard/tools/SelectTool.ts`
- **影响点**:
  1. `isActionLocked()` (535行) - 需要改为查询虚拟图层
  2. `isSelectionLocked()` (525行) - 依赖 `isActionLocked()`
  3. `setLayerActions()` (596-619行) - 移除锁定状态保留逻辑
  4. `handleResizeAnchorDrag()` (1569-1576行) - 移除锁定状态保留
  5. `syncAndRefreshAfterDrag()` (2383-2447行) - 移除锁定状态保留
  6. `moveSelectedAction()` (2578-2584行) - 移除锁定状态保留
  7. `moveSelectedActions()` (2612-2624行) - 移除锁定状态保留
  8. `scaleSelectedAction()` (2659-2665行) - 移除锁定状态保留
  9. `scaleSelectedActions()` (2688-2700行) - 移除锁定状态保留
  10. `rotateSelectedAction()` (2851-2857行) - 移除锁定状态保留
  11. `rotateSelectedActions()` (2885-2897行) - 移除锁定状态保留
  12. `toggleSelectedActionsLock()` (512-516行) - 移除本地锁定状态设置
  13. `handleMouseDown()` (1925, 1949, 1973行) - 锁定检查逻辑不变
  14. `handleMouseMove()` (2089行) - 锁定检查逻辑不变
- **风险**: 高（核心逻辑，需要仔细测试）

### 3. HistoryManager 相关

#### `HistoryManager.ts` - 锁定状态保留逻辑
- **位置**: `src/libs/drawBoard/history/HistoryManager.ts`
- **影响点**:
  1. `updateAction()` (893-901行) - 移除锁定状态保留逻辑
  2. `updateAction()` 重做栈分支 (924-932行) - 移除锁定状态保留逻辑
  3. `updateActionWithoutHistory()` (972-980行) - 移除锁定状态保留逻辑
  4. `updateActionWithoutHistory()` 重做栈分支 (999-1007行) - 移除锁定状态保留逻辑
- **风险**: 中（历史记录管理，需要确保不影响 undo/redo）

### 4. SelectToolCoordinator 相关

#### `SelectToolCoordinator.ts` - 锁定状态同步
- **位置**: `src/libs/drawBoard/handlers/SelectToolCoordinator.ts`
- **影响点**:
  1. `handleUpdatedActions()` (321-328行) - 移除锁定状态保留逻辑
  2. **新增方法**: 添加 `isActionLocked(action: DrawAction): boolean` 查询方法
- **风险**: 中（协调器逻辑，需要确保查询方法正确）

### 5. DrawBoardSelectionAPI 相关

#### `DrawBoardSelectionAPI.ts` - 锁定状态切换
- **位置**: `src/libs/drawBoard/api/DrawBoardSelectionAPI.ts`
- **影响点**:
  1. `toggleSelectionLock()` (354-376行) - 简化逻辑，只设置虚拟图层锁定状态
  2. 移除同步到 HistoryManager 和 SelectTool 的逻辑
- **风险**: 中（API 层，需要确保 UI 状态正确更新）

### 6. SelectionToolbar 相关

#### `SelectionToolbar.ts` - 锁定状态显示
- **位置**: `src/libs/drawBoard/tools/select/SelectionToolbar.ts`
- **影响点**:
  1. `updateState()` (1636-1638行) - 改为通过虚拟图层查询锁定状态
  2. **需要**: 添加查询锁定状态的方法（通过 SelectToolCoordinator）
- **风险**: 低（UI 层，主要是显示逻辑）

### 7. VirtualLayerManager 相关

#### `VirtualLayerManager.ts` - action 创建时设置 layerLocked
- **位置**: `src/libs/drawBoard/core/VirtualLayerManager.ts`
- **影响点**:
  1. `handleDefaultMode()` (845行) - 移除 `action.layerLocked = defaultLayer.locked;`
  2. `handleIndividualMode()` (879行) - 移除 `action.layerLocked = layer.locked;`
  3. `handleGroupedMode()` (916行) - 移除 `action.layerLocked = targetLayer.locked;`
  4. `syncActionLayerProperties()` (1079行) - 移除 `action.layerLocked = layer.locked;`
- **风险**: 低（创建逻辑，移除即可）

### 8. 数据导出/导入相关

#### `DataExporter.ts` / `DataImporter.ts`
- **位置**: `src/libs/drawBoard/utils/DataExporter.ts`, `DataImporter.ts`
- **影响点**:
  1. `exportAction()` - 不导出 `layerLocked`（已确认：只导出 `virtualLayerId`）
  2. `exportLayer()` - 导出 `VirtualLayer.locked`（已确认：正确）
  3. `importAction()` - 不导入 `layerLocked`（已确认：只导入 `virtualLayerId`）
  4. `importFromJSON()` - 导入图层时设置 `VirtualLayer.locked`
- **风险**: 低（导出/导入逻辑已正确，锁定状态在图层中）

## 🔧 重构步骤

### 阶段1：添加查询方法
1. ✅ 在 `SelectToolCoordinator` 中添加 `isActionLocked(action: DrawAction): boolean` 方法
2. ✅ 在 `SelectToolCoordinator` 中添加 `isSelectionLocked(actions: DrawAction[]): boolean` 方法
3. ✅ 在 `SelectTool` 中添加查询锁定状态的委托方法

### 阶段2：重构锁定状态检查
1. ✅ 修改 `SelectTool.isActionLocked()` 通过 SelectToolCoordinator 查询
2. ✅ 修改 `SelectTool.isSelectionLocked()` 使用新的查询方法
3. ✅ 修改 `SelectionToolbar.updateState()` 使用新的查询方法

### 阶段3：移除锁定状态保留逻辑
1. ✅ 移除 `HistoryManager` 中所有锁定状态保留逻辑
2. ✅ 移除 `SelectToolCoordinator.handleUpdatedActions()` 中锁定状态保留逻辑
3. ✅ 移除 `SelectTool` 中所有拖拽操作的锁定状态保留逻辑
4. ✅ 移除 `VirtualLayerManager` 中设置 `action.layerLocked` 的逻辑

### 阶段4：简化锁定状态设置
1. ✅ 简化 `DrawBoardSelectionAPI.toggleSelectionLock()` 只设置虚拟图层
2. ✅ 移除 `SelectTool.toggleSelectedActionsLock()` 中的本地设置逻辑

### 阶段5：测试和验证
1. ✅ 测试锁定状态检查
2. ✅ 测试锁定后拖拽阻止
3. ✅ 测试锁定状态切换
4. ✅ 测试数据导出/导入
5. ✅ 测试 undo/redo

## ⚠️ 注意事项

1. **向后兼容**：保留 `DrawAction.layerLocked` 属性定义，但不使用
2. **性能考虑**：查询虚拟图层需要访问 VirtualLayerManager，可能需要缓存
3. **数据迁移**：旧数据可能包含 `layerLocked`，导入时需要从图层同步
4. **测试覆盖**：确保所有锁定相关场景都有测试

## 📈 预期收益

1. **架构清晰**：锁定状态只归属于虚拟图层，符合设计原则
2. **代码简化**：移除大量锁定状态同步逻辑
3. **维护容易**：单一数据源，不会出现不一致
4. **性能提升**：减少不必要的属性同步操作

