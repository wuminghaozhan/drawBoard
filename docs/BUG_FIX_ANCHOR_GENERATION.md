# 锚点生成问题修复

## 问题描述

1. **第一次选择圆形时**：有选区但没有锚点（`anchorPointsCount: 0`）
2. **后续选择其他圆形时**：选区和锚点都消失了

## 问题分析

### 1. 锚点生成失败的原因

从日志看：
- `SelectTool.draw: 生成锚点后 {anchorPointsCount: 0, centerAnchorPoint: false}`
- 说明 `generateResizeAnchorPoints()` 被调用，但返回了空数组

可能的原因：
1. `getSelectedActionsBounds()` 返回 `null`，导致 `generateResizeAnchorPoints()` 提前返回
2. `getActionBoundingBox()` 计算圆形边界框时出现问题
3. `CircleAnchorHandler.generateAnchors()` 返回空数组

### 2. 后续选择时选区和锚点消失的原因

从日志看：
- 图层切换时，`setActiveVirtualLayer` 会触发 `syncLayerDataToSelectTool`
- `setLayerActions` 可能会过滤掉选中的actions
- 即使有恢复逻辑，但时序问题可能导致恢复失败

## 修复方案

### 1. 增强边界框验证

**文件**: `SelectTool.ts`

```typescript
// 在getActionBoundingBox中增强验证
if (action.type === 'circle' && action.points.length >= 2) {
  // ... 计算边界框
  
  // 验证边界框有效性
  if (!isFinite(bounds.x) || !isFinite(bounds.y) || 
      !isFinite(bounds.width) || !isFinite(bounds.height) ||
      bounds.width <= 0 || bounds.height <= 0) {
    // 返回默认边界框，确保不会返回无效值
    return { x: center.x - 50, y: center.y - 50, width: 100, height: 100 };
  }
}
```

### 2. 增强getSelectedActionsBounds验证

**文件**: `SelectTool.ts`

```typescript
// 在getSelectedActionsBounds中增强验证
for (const action of actionsToUse) {
  const bounds = this.getActionBoundingBox(action);
  
  // 检查边界框是否有效（包括null检查）
  if (!bounds || !isFinite(bounds.x) || !isFinite(bounds.y) || 
      !isFinite(bounds.width) || !isFinite(bounds.height) ||
      bounds.width <= 0 || bounds.height <= 0) {
    logger.warn('SelectTool.getSelectedActionsBounds: 发现无效的边界框', { 
      bounds, 
      actionId: action.id,
      actionType: action.type,
      pointsCount: action.points.length
    });
    continue;
  }
  // ...
}
```

### 3. 增强generateResizeAnchorPoints错误处理

**文件**: `SelectTool.ts`

```typescript
// 如果锚点数量为0，尝试使用fallback边界框
if (this.anchorPoints.length === 0 && !this.centerAnchorPoint) {
  logger.error('SelectTool.generateResizeAnchorPoints: 锚点生成失败');
  
  // 尝试使用fallback边界框重新生成
  const fallbackBounds = bounds || { x: 0, y: 0, width: 100, height: 100 };
  try {
    const fallbackAnchors = handler.generateAnchors(action, fallbackBounds);
    if (fallbackAnchors.length > 0) {
      this.anchorPoints = fallbackAnchors.filter(anchor => !anchor.isCenter);
      this.centerAnchorPoint = fallbackAnchors.find(anchor => anchor.isCenter) || null;
    }
  } catch (error) {
    logger.error('SelectTool.generateResizeAnchorPoints: fallback生成锚点也失败', error);
  }
}
```

### 4. 优化图层切换时的选择保留

**文件**: `DrawBoard.ts`

```typescript
// 使用Promise替代setTimeout，确保执行顺序
Promise.resolve().then(() => {
  const selectedActionsAfterSwitch = currentTool.getSelectedActions();
  if (selectedActionsAfterSwitch.length === 0 && selectedActionsBeforeSwitch.length > 0) {
    // 恢复选择
    currentTool.setSelectedActions(selectedActionsBeforeSwitch);
    // 触发重绘
    this.drawingHandler.forceRedraw();
  }
}).catch(error => {
  logger.error('individual模式：恢复选择失败', error);
});
```

### 5. 确保individual模式下所有actions都在layerActions中

**文件**: `DrawBoard.ts`

```typescript
if (mode === 'individual') {
  // individual模式：使用所有actions，确保选中的actions不会被过滤
  layerActions = allActions;
  logger.debug('syncLayerDataToSelectTool: individual模式，使用所有actions', {
    totalActions: allActions.length
  });
}
```

## 测试建议

1. **测试圆形锚点生成**
   - 绘制圆形后选择，检查是否有锚点
   - 检查边界框计算是否正确

2. **测试图层切换**
   - 选择圆形后切换图层，检查选择是否保留
   - 检查锚点是否正确显示

3. **测试多次选择**
   - 选择第一个圆形
   - 选择第二个圆形
   - 检查选区和锚点是否正确显示

## 预期效果

修复后：
- ✅ 第一次选择圆形时，应该显示选区和锚点
- ✅ 后续选择其他圆形时，选区和锚点应该正确显示
- ✅ 图层切换时，选择状态应该保留

---

*修复日期：2024-01-XX*
