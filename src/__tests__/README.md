# 🧪 单元测试说明

## 📋 测试文件结构

```
src/__tests__/
├── setup.ts                          # Jest 测试环境配置
├── core/
│   └── CanvasEngine.test.ts          # zIndex 计算测试
├── utils/
│   ├── SpatialIndex.test.ts         # 空间索引测试
│   └── MemoryMonitor.test.ts        # 内存监控测试
└── tools/
    ├── SelectTool.test.ts            # 拖拽配置和取消测试
    └── anchor/
        └── CircleAnchorHandler.test.ts  # 圆形锚点测试
```

## 🚀 运行测试

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

## 📊 测试覆盖范围

### 已实现的测试

1. **CanvasEngine.calculateDynamicLayerZIndex**
   - ✅ 基础 zIndex 计算
   - ✅ 最大限制测试
   - ✅ 负数输入处理
   - ✅ 边界值测试

2. **SpatialIndex**
   - ✅ 索引构建
   - ✅ 点查询
   - ✅ 边界框查询
   - ✅ 清空索引
   - ✅ 画布尺寸更新

3. **MemoryMonitor**
   - ✅ 内存使用率获取
   - ✅ 内存紧张判断
   - ✅ 阈值设置
   - ✅ 缓存机制
   - ✅ 浏览器兼容性

4. **CircleAnchorHandler**
   - ✅ 锚点生成（4个边界 + 1个中心）
   - ✅ 锚点位置计算
   - ✅ 边缘锚点拖拽
   - ✅ 中心点移动
   - ✅ 半径限制

5. **SelectTool**
   - ✅ 拖拽配置（构造函数和更新）
   - ✅ 拖拽取消
   - ✅ 空间索引集成

## 🔧 测试配置

测试使用 Jest + ts-jest + jsdom 环境。

配置文件：`jest.config.js`

## 📝 添加新测试

1. 在对应的目录下创建 `.test.ts` 文件
2. 使用 `describe` 和 `it` 组织测试用例
3. 使用 `beforeEach` 和 `afterEach` 设置测试环境
4. 运行 `npm test` 验证测试

## 🎯 测试最佳实践

1. **测试命名**：使用描述性的测试名称
2. **测试隔离**：每个测试应该独立，不依赖其他测试
3. **边界测试**：测试边界值和异常情况
4. **覆盖率**：目标覆盖率 ≥ 70%

