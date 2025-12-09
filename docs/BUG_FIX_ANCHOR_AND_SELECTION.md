# 锚点生成和选择保留问题修复

## 问题描述

1. **锚点生成失败**：第一次选择圆形后，`anchorPointsCount: 0`，锚点没有生成
2. **选择丢失**：后续选择其他圆形时，选区和锚点都没有了

## 问题分析

### 1. 锚点生成失败

**可能原因**：
- `action.points.length < 2` 导致 `CircleAnchorHandler.generateAnchors()` 返回空数组
- `getActionBoundingBox()` 返回无效边界框
- `handler.generateAnchors()` 调用失败

**日志证据**：
```
SelectTool.draw: 生成锚点后 {anchorPointsCount: 0, centerAnchorPoint: false}
```

### 2. 选择丢失

**可能原因**：
- individual模式下，图层切换时，`setLayerActions` 过滤掉了选中的action
- `setActiveVirtualLayer` 触发 `syncLayerDataToSelectTool`，但选择被过滤
- 恢复选择的逻辑执行时机不对

**日志证据**：
- `setLayerActions` 被多次调用
- 选择状态在图层切换后丢失

## 修复方案

### 1. 增强锚点生成日志和错误处理

**文件**: `SelectTool.ts`, `CircleAnchorHandler.ts`

**改动**：
1. 在 `CircleAnchorHandler.generateAnchors()` 中添加详细日志
2. 在 `SelectTool.generateResizeAnchorPoints()` 中添加边界框验证和fallback逻辑
3. 添加锚点生成失败的详细错误日志

**代码**：
```typescript
// CircleAnchorHandler.ts
public generateAnchors(action: DrawAction, bounds: Bounds): AnchorPoint[] {
  logger.debug('CircleAnchorHandler.generateAnchors: 开始生成锚点', {
    actionType: action.type,
    actionId: action.id,
    pointsCount: action.points.length,
    bounds
  });
  
  if (action.points.length < 2) {
    logger.warn('CircleAnchorHandler.generateAnchors: action.points.length < 2', {
      actionId: action.id,
      pointsCount: action.points.length
    });
    return [];
  }
  // ... 生成锚点逻辑
  logger.info('CircleAnchorHandler.generateAnchors: 锚点生成完成', {
    totalAnchors: anchors.length,
    radius,
    center: { x: center.x, y: center.y }
  });
}

// SelectTool.ts
// 验证边界框有效性
if (!actionBounds || actionBounds.width <= 0 || actionBounds.height <= 0) {
  logger.warn('边界框无效，使用fallback');
  const fallbackBounds = bounds || { x: 0, y: 0, width: 100, height: 100 };
  const anchors = handler.generateAnchors(action, fallbackBounds);
  // ...
}
```

### 2. 修复individual模式下选择被过滤的问题

**文件**: `SelectTool.ts`, `DrawBoard.ts`

**改动**：
1. 在 `setLayerActions` 中，如果action有 `virtualLayerId`，也保留选择
2. 在 `syncLayerDataToSelectTool` 中，使用 `setTimeout` 确保恢复选择的时机正确
3. 恢复选择后，触发重绘以重新生成锚点

**代码**：
```typescript
// SelectTool.ts - setLayerActions
// 如果action有virtualLayerId，说明它属于某个图层，也应该保留
if (selectedAction.virtualLayerId) {
  logger.debug('选中的action不在新的actions中，但有virtualLayerId，保留选择');
  return true;
}

// DrawBoard.ts - syncLayerDataToSelectTool
// 使用setTimeout确保在syncLayerDataToSelectTool之后恢复
setTimeout(() => {
  const selectedActionsAfterSwitch = currentTool.getSelectedActions();
  if (selectedActionsAfterSwitch.length === 0 && selectedActionsBeforeSwitch.length > 0) {
    currentTool.setSelectedActions(selectedActionsBeforeSwitch);
    // 触发重绘以重新生成锚点
    this.drawingHandler.forceRedraw();
  }
}, 0);
```

### 3. 清除锚点缓存

**文件**: `SelectTool.ts`

**改动**：
- 在 `setLayerActions` 中，当进入变换模式时，清除锚点缓存
- 确保锚点重新生成

## 测试建议

1. **锚点生成测试**：
   - 选择单个圆形，检查是否生成5个锚点（4个边界 + 1个中心）
   - 检查控制台日志，确认 `CircleAnchorHandler.generateAnchors` 被正确调用
   - 检查边界框是否有效

2. **选择保留测试**：
   - 在individual模式下，选择圆形
   - 切换到其他圆形，检查选择是否保留
   - 检查选区和锚点是否正常显示

3. **边界情况测试**：
   - 快速切换选择
   - 选择多个圆形
   - 图层切换时的选择状态

## 预期效果

修复后：
- ✅ 选择圆形后，应该生成5个锚点（4个边界 + 1个中心）
- ✅ 切换选择时，选区和锚点应该正常显示
- ✅ individual模式下，图层切换时选择应该保留

---

*修复日期：2024-01-XX*
*修复人：AI Assistant*
