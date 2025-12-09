# 等待机制和防重复调用优化

## 优化内容

### 1. 改进等待机制

#### 问题
之前的实现使用固定时间等待（10ms × 3次 = 30ms），存在以下问题：
- 如果异步操作需要更长时间，等待可能不够
- 如果异步操作很快完成，等待是浪费的
- 不够灵活，无法根据实际情况调整

#### 解决方案
改进为更灵活的等待机制：
- **最大等待时间**：50ms（从30ms增加到50ms，给异步操作更多时间）
- **检查间隔**：5ms（从10ms减少到5ms，更频繁地检查，减少不必要的等待）
- **动态计算检查次数**：`Math.ceil(maxWaitTime / checkInterval)` = 10次

#### 代码改进
```typescript
// 之前：固定时间等待
for (let i = 0; i < 3; i++) {
  await new Promise(resolve => setTimeout(resolve, 10));
  // ...
}

// 现在：灵活的等待机制
const maxWaitTime = 50; // 最大等待时间：50ms
const checkInterval = 5; // 检查间隔：5ms
const maxIterations = Math.ceil(maxWaitTime / checkInterval); // 最多检查10次

for (let i = 0; i < maxIterations; i++) {
  await new Promise(resolve => setTimeout(resolve, checkInterval));
  // ...
  if (selectedActions.length > 0) {
    break; // 一旦恢复就立即退出
  }
}
```

#### 优势
1. ✅ **更灵活**：可以根据实际情况调整等待时间和检查间隔
2. ✅ **更高效**：一旦选择恢复就立即退出，不浪费时间
3. ✅ **更可靠**：增加了最大等待时间，给异步操作更多时间完成
4. ✅ **更好的日志**：记录实际等待时间和迭代次数，便于调试

### 2. 添加防重复调用机制

#### 问题
`syncLayerDataToSelectTool` 可能被多次调用，导致：
- 重复执行相同的逻辑
- 可能导致选择状态不一致
- 影响性能

#### 解决方案
添加 `isSyncingLayerData` 标志位来防止重复调用：
- 在方法开始时检查标志位，如果正在同步则跳过
- 在方法开始时设置标志位
- 在 `finally` 块中重置标志位，确保即使发生异常也能重置

#### 代码实现
```typescript
// 添加标志位
private isSyncingLayerData: boolean = false;

// 在方法中使用
private syncLayerDataToSelectTool(preserveSelection: boolean = false): void {
  // 防重复调用机制
  if (this.isSyncingLayerData) {
    logger.debug('syncLayerDataToSelectTool: 正在同步中，跳过重复调用', {
      preserveSelection
    });
    return;
  }
  
  this.isSyncingLayerData = true;
  
  try {
    // ... 同步逻辑
  } catch (error) {
    logger.error('同步图层数据到选择工具失败', error);
  } finally {
    // 重置同步标志位，允许下次调用
    this.isSyncingLayerData = false;
  }
}
```

#### 优势
1. ✅ **防止重复调用**：确保同一时间只有一个同步操作在执行
2. ✅ **异常安全**：使用 `finally` 块确保标志位总是被重置
3. ✅ **性能优化**：避免不必要的重复执行
4. ✅ **状态一致性**：确保选择状态的一致性

## 测试建议

### 等待机制测试
1. ✅ 测试选择快速恢复的情况（应该很快退出等待）
2. ✅ 测试选择需要较长时间恢复的情况（应该等待足够的时间）
3. ✅ 测试选择无法恢复的情况（应该记录警告日志）

### 防重复调用测试
1. ✅ 测试快速连续调用 `syncLayerDataToSelectTool` 的情况
2. ✅ 测试在同步过程中发生异常的情况（标志位应该被正确重置）
3. ✅ 测试正常同步完成的情况（标志位应该被正确重置）

## 性能影响

### 等待机制
- **之前**：固定等待30ms（无论是否需要）
- **现在**：最多等待50ms，但一旦恢复就立即退出
- **影响**：在大多数情况下，实际等待时间会更短，性能更好

### 防重复调用
- **之前**：可能重复执行同步逻辑
- **现在**：重复调用会被跳过
- **影响**：减少不必要的执行，提升性能

## 总结

这两项优化：
1. ✅ **改进了等待机制**：更灵活、更高效、更可靠
2. ✅ **添加了防重复调用机制**：确保状态一致性，提升性能
3. ✅ **保持了代码质量**：使用 `finally` 块确保异常安全
4. ✅ **增强了可调试性**：添加了详细的日志记录

这些优化应该能够解决之前发现的问题，并提升整体性能和可靠性。
