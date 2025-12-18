# 文本区域尺寸规范统一 - 影响范围评估报告

## 📋 统一规范

**文本区域统一使用：`points[0]`（起始位置）+ `width/height`（尺寸）**

不再使用两个端点（`points[0]` 和 `points[1]`）来定义文本区域。

---

## ✅ 已统一的核心模块

### 1. **边界计算模块**
- ✅ `BoundsCalculator.calculateTextBounds` - 统一使用 `points[0]` + `width/height`
- ✅ `HitTestManager.getActionBoundingBox` - 统一使用 `points[0]` + `width/height`
- ✅ `HitTestManager.isPointInTextAction` - 使用 `getActionBoundingBox`，间接统一
- ✅ `DrawBoard.isPointInTextBounds` - 统一使用 `points[0]` + `width/height`

### 2. **文本创建模块**
- ✅ `TextTool.createTextAction` - 创建时设置 `points: [position]` 和 `width/height`
- ✅ `TextTool.estimateTextBounds` - 估算方法返回 `width/height`

### 3. **文本变换模块**
- ✅ `TransformOperations.resizeTextWidth` - 调整宽度时清除 `height`，强制重新计算
- ✅ `TransformOperations.scaleText` - 缩放文本时更新 `points[0]` 和 `fontSize`

### 4. **文本选择模块**
- ✅ `SelectTool.updateSelectedTextStyle` - 更新样式时重新计算 `width/height`
- ✅ `DrawBoardSelectionAPI.updateTextStyle` - 更新样式时重新计算 `width/height`

### 5. **数据序列化模块**
- ✅ `ShapeConverter.toTextShape` - 导出时使用 `points[0]` 和 `width/height`
- ✅ `ShapeConverter.fromTextShape` - 导入时恢复 `points: [position]` 和 `width/height`
- ✅ `DataImporter.importAction` - 导入时正确处理 `width/height` 属性

---

## 🔍 详细影响范围分析

### **核心影响模块（14个文件）**

| 模块 | 文件 | 状态 | 说明 |
|------|------|------|------|
| **边界计算** | `BoundsCalculator.ts` | ✅ 已统一 | 使用 `points[0]` + `width/height` |
| **边界计算** | `HitTestManager.ts` | ✅ 已统一 | 使用 `points[0]` + `width/height` |
| **文本工具** | `TextTool.ts` | ✅ 已统一 | 创建时设置 `points[0]` + `width/height` |
| **文本变换** | `TransformOperations.ts` | ✅ 已统一 | `resizeTextWidth` 清除 `height` |
| **文本选择** | `SelectTool.ts` | ✅ 已统一 | 更新样式时重新计算 `width/height` |
| **选择API** | `DrawBoardSelectionAPI.ts` | ✅ 已统一 | 更新样式时重新计算 `width/height` |
| **主类** | `DrawBoard.ts` | ✅ 已统一 | `isPointInTextBounds` 使用统一规范 |
| **数据转换** | `ShapeConverter.ts` | ✅ 已统一 | 序列化/反序列化正确处理 |
| **数据导入** | `DataImporter.ts` | ✅ 已统一 | 导入时恢复 `width/height` |
| **数据导出** | `DataExporter.ts` | ✅ 已统一 | 通过 `ShapeConverter` 导出 |
| **类型定义** | `TextTypes.ts` | ✅ 已定义 | `TextAction` 接口包含 `width/height` |
| **锚点处理** | `TextAnchorHandler.ts` | ✅ 已统一 | 只生成左右边中点锚点 |
| **拖拽处理** | `AnchorDragHandler.ts` | ✅ 已统一 | 使用 `width` 属性计算新宽度 |
| **协调器** | `SelectToolCoordinator.ts` | ✅ 已统一 | `hasActionChanges` 检查 `width` 变化 |

---

## ⚠️ 潜在问题点

### 1. **字体大小变化时的宽度处理** ✅ 已修复
**位置：** `SelectTool.updateSelectedTextStyle` (line 458-490)  
**位置：** `DrawBoardSelectionAPI.updateTextStyle` (line 600-635)

**修复：** 
- ✅ 多行模式（有 `width`）：保持 `width`，只重新计算 `height`
- ✅ 单行模式（无 `width`）：重新计算 `width` 和 `height`

### 2. **文本缩放时的处理** ✅ 已修复
**位置：** `TransformOperations.scaleAction` (line 87-110)

**修复：** 
- ✅ 如果 `width/height` 存在，按比例缩放
- ✅ 如果不存在，清除让系统根据新的 `fontSize` 重新计算

---

## 📊 兼容性评估

### **向后兼容性：** ✅ 良好
- 旧数据导入时，`DataImporter` 会正确处理 `width/height` 属性
- 如果旧数据没有 `width/height`，系统会使用估算方法
- `ShapeConverter` 在导入时会恢复 `points: [position]` 格式

### **数据迁移：** ✅ 无需迁移
- 新规范与旧数据兼容
- 旧数据会自动使用估算方法计算边界

---

## 🎯 测试建议

### **功能测试**
1. ✅ 创建文本 - 验证 `points[0]` 和 `width/height` 正确设置
2. ✅ 调整文本宽度 - 验证 `width` 更新，`height` 重新计算
3. ✅ 选择文本 - 验证选区边界正确
4. ✅ 点击文本 - 验证命中检测正确
5. ✅ 导出/导入 - 验证数据序列化正确
6. ✅ 字体大小变化 - 验证 `width/height` 正确处理

### **边界情况测试**
1. ⚠️ 多行文本改变字体大小 - 验证 `width` 保持不变
2. ⚠️ 单行文本改变字体大小 - 验证 `width` 重新计算
3. ✅ 文本宽度调整后释放 - 验证选区边界正确
4. ✅ 空文本 - 验证边界计算正确
5. ✅ 超长文本 - 验证多行高度计算正确

---

## 📝 总结

### **已完成：** ✅
- 所有核心模块已统一使用 `points[0]` + `width/height` 规范
- 边界计算、命中检测、数据序列化都已统一
- 向后兼容性良好

### **已优化：** ✅
- ✅ 字体大小变化时的宽度处理逻辑 - 多行模式保持 `width`，只重新计算 `height`
- ✅ 文本缩放时的 `width/height` 更新 - 按比例缩放或清除让系统重新计算

### **风险评估：** 🟢 低风险
- 修改集中在文本相关模块
- 不影响其他图形类型
- 向后兼容，不会破坏现有数据

