# 🔌 DrawBoard 插件化工具系统使用指南

## 📋 概述

DrawBoard 的插件化工具系统提供了强大的扩展能力，允许开发者：
- ✅ 创建自定义绘图工具
- ✅ 动态加载和卸载工具
- ✅ 管理工具依赖关系
- ✅ 完整的工具生命周期管理
- ✅ 向后兼容现有API

## 🚀 快速开始

### 1. 基础使用

```typescript
import { DrawBoard } from '@/libs/drawBoard';

// 创建画板实例（插件系统自动初始化）
const drawBoard = new DrawBoard(container);

// 等待插件系统初始化完成
await new Promise(resolve => setTimeout(resolve, 100));

// 使用内置工具（现在通过插件系统提供）
drawBoard.setTool('pen');
drawBoard.setTool('rect');
```

### 2. 获取插件信息

```typescript
import { pluginManager, getPluginStats } from '@/libs/drawBoard/api/plugins';

// 获取所有插件信息
const plugins = pluginManager.getAllPlugins();
console.log('已注册插件数量:', plugins.length);

// 获取统计信息
const stats = getPluginStats();
console.log('插件统计:', stats);
/*
输出示例:
{
  total: 8,
  active: 8,
  error: 0,
  builtin: 8,
  external: 0,
  byStatus: { active: 8 }
}
*/

// 获取可用工具类型
const toolTypes = pluginManager.getActiveToolTypes();
console.log('可用工具:', toolTypes);
// ['pen', 'rect', 'circle', 'line', 'polygon', 'text', 'eraser', 'select']
```

## 🛠️ 开发自定义插件

### 1. 使用 PluginSDK 创建简单工具

```typescript
import { PluginSDK, createSimplePlugin } from '@/libs/drawBoard/api/plugins';

// 创建一个简单的点工具
const DotToolPlugin = createSimplePlugin(
  // 插件元数据
  {
    id: 'custom.dot',
    name: '点工具',
    version: '1.0.0',
    description: '在画布上绘制圆点',
    author: '我的团队',
    tags: ['simple', 'dot', 'point']
  },
  // 工具信息
  'dot',        // 工具类型
  '点',         // 工具名称
  // 绘制函数
  (ctx, action) => {
    if (action.points.length === 0) return;
    
    const point = action.points[0];
    const radius = action.context.lineWidth || 3;
    
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, 2 * Math.PI);
    ctx.fill();
  }
);

// 注册插件
await drawBoard.getToolManager().registerToolPlugin(DotToolPlugin);

// 使用新工具
drawBoard.setTool('dot');
```

### 2. 使用 PluginBuilder 创建复杂工具

```typescript
import { PluginSDK } from '@/libs/drawBoard/api/plugins';

// 创建心形工具类
class HeartTool extends PluginSDK.SimpleDrawTool {
  constructor(config = {}) {
    super('心形', 'heart', config);
  }

  public draw(ctx, action) {
    const points = this.getStartAndEndPoints(action);
    if (!points) return;

    const originalContext = this.saveContext(ctx);
    this.setContext(ctx, action.context);
    this.setupActionMetadata(action);

    this.drawHeart(ctx, points.start, points.end);

    this.restoreContext(ctx, originalContext);
  }

  private drawHeart(ctx, center, edge) {
    const size = this.getDistance(center, edge);
    
    ctx.beginPath();
    
    // 心形的数学方程
    for (let t = 0; t <= 2 * Math.PI; t += 0.1) {
      const x = center.x + size * (16 * Math.sin(t) ** 3) / 16;
      const y = center.y - size * (13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t)) / 16;
      
      if (t === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    
    ctx.closePath();
    ctx.fill();
    if (ctx.lineWidth > 0) {
      ctx.stroke();
    }
  }
}

// 使用 PluginBuilder 构建插件
const HeartToolPlugin = PluginSDK.createBuilder()
  .setMetadata({
    id: 'custom.heart',
    name: '心形工具',
    version: '1.0.0',
    description: '绘制心形的浪漫工具',
    author: '浪漫开发者',
    tags: ['geometry', 'heart', 'romantic'],
    compatibleVersion: '>=1.0.0'
  })
  .setTool('heart', '心形', HeartTool)
  .setInitialize(async () => {
    console.log('❤️ 心形工具已准备就绪！');
  })
  .setDestroy(async () => {
    console.log('💔 心形工具已卸载');
  })
  .setValidateConfig((config) => {
    // 配置验证逻辑
    return true;
  })
  .build();

// 注册并使用
await pluginManager.registerPlugin(HeartToolPlugin);
drawBoard.setTool('heart');
```

### 3. 带配置的插件

```typescript
// 创建可配置的星形工具
import { StarToolPlugin } from '@/libs/drawBoard/api/plugins';

// 带自定义配置注册
await pluginManager.registerPlugin(StarToolPlugin, {
  config: {
    points: 8,              // 8角星
    innerRadiusRatio: 0.3,  // 内径比例
    filled: true            // 填充星形
  }
});

// 使用星形工具
drawBoard.setTool('star');
```

## 🎮 插件管理

### 1. 动态插件管理

```typescript
// 查询插件状态
const pluginInfo = pluginManager.getPlugin('custom.heart');
console.log('插件状态:', pluginInfo?.status);

// 注销插件
await pluginManager.unregisterPlugin('custom.heart');

// 批量注册插件
import { registerPlugins } from '@/libs/drawBoard/api/plugins';

const result = await registerPlugins([
  DotToolPlugin,
  HeartToolPlugin,
  StarToolPlugin
], { autoInitialize: true });

console.log('成功注册:', result.success);
console.log('注册失败:', result.failed);
```

### 2. 插件事件监听

```typescript
// 监听插件状态变化
pluginManager.on('plugin:registered', (info) => {
  console.log(`插件已注册: ${info.plugin.toolName}`);
});

pluginManager.on('plugin:activated', (info) => {
  console.log(`插件已激活: ${info.plugin.toolName}`);
  // 更新UI工具栏
  updateToolbar();
});

pluginManager.on('plugin:error', (info, error) => {
  console.error(`插件错误: ${info.plugin.toolName}`, error);
  // 显示错误提示
  showErrorNotification(`工具 ${info.plugin.toolName} 出现错误`);
});
```

### 3. 在 React 组件中使用

```typescript
import React, { useState, useEffect } from 'react';
import { pluginManager } from '@/libs/drawBoard/api/plugins';
import PluginManager from '@/components/PluginManager';

function DrawBoardApp() {
  const [drawBoard, setDrawBoard] = useState(null);
  const [showPluginManager, setShowPluginManager] = useState(false);
  const [availableTools, setAvailableTools] = useState([]);

  useEffect(() => {
    // 监听插件变化，更新工具列表
    const updateTools = () => {
      const tools = pluginManager.getActiveToolTypes();
      setAvailableTools(tools);
    };

    pluginManager.on('plugin:activated', updateTools);
    pluginManager.on('plugin:unregistered', updateTools);
    
    updateTools(); // 初始化
    
    return () => {
      pluginManager.off('plugin:activated');
      pluginManager.off('plugin:unregistered');
    };
  }, []);

  return (
    <div>
      {/* 工具栏 */}
      <div className="toolbar">
        {availableTools.map(toolType => (
          <button
            key={toolType}
            onClick={() => drawBoard?.setTool(toolType)}
          >
            {pluginManager.getToolName(toolType)}
          </button>
        ))}
        
        {/* 插件管理按钮 */}
        <button onClick={() => setShowPluginManager(true)}>
          🔌 插件管理
        </button>
      </div>

      {/* 画板 */}
      <div ref={containerRef} className="draw-board-container" />

      {/* 插件管理器 */}
      {showPluginManager && (
        <PluginManager
          pluginManager={pluginManager}
          onClose={() => setShowPluginManager(false)}
        />
      )}
    </div>
  );
}
```

## 🏗️ 高级功能

### 1. 插件依赖管理

```typescript
// 创建依赖其他插件的工具
const AdvancedToolPlugin = PluginSDK.createBuilder()
  .setMetadata({
    id: 'advanced.compound',
    name: '复合工具',
    version: '1.0.0',
    dependencies: ['custom.heart', 'custom.dot'], // 依赖其他插件
  })
  .setTool('compound', '复合', CompoundTool)
  .build();

// 插件系统会自动检查依赖
await pluginManager.registerPlugin(AdvancedToolPlugin);
```

### 2. 插件配置验证

```typescript
const ConfigurablePlugin = PluginSDK.createBuilder()
  .setMetadata({
    id: 'configurable.tool',
    name: '可配置工具',
    version: '1.0.0'
  })
  .setTool('configurable', '可配置', ConfigurableTool)
  .setValidateConfig((config) => {
    // 使用 SDK 提供的验证工具
    const validators = PluginSDK.validateConfig;
    
    return validators.required(['size', 'color'])(config) &&
           validators.type('size', 'number')(config) &&
           validators.range('size', 1, 100)(config);
  })
  .build();
```

### 3. 插件兼容性检查

```typescript
import { checkPluginCompatibility } from '@/libs/drawBoard/api/plugins';

// 检查插件兼容性
const isCompatible = checkPluginCompatibility(MyPlugin, '1.2.0');
if (!isCompatible) {
  console.warn('插件与当前版本不兼容');
}
```

## 📦 完整示例：创建一个画笔压感插件

```typescript
import { PluginSDK } from '@/libs/drawBoard/api/plugins';

// 压感画笔工具
class PressurePenTool extends PluginSDK.SimpleDrawTool {
  constructor(config = {}) {
    super('压感画笔', 'pressure_pen', {
      sensitivity: 0.8,
      minWidth: 1,
      maxWidth: 20,
      ...config
    });
  }

  public draw(ctx, action) {
    if (action.points.length < 2) return;

    const originalContext = this.saveContext(ctx);
    this.setContext(ctx, action.context);
    this.setupActionMetadata(action, true); // 支持缓存

    this.drawPressurePath(ctx, action.points);

    this.restoreContext(ctx, originalContext);
  }

  private drawPressurePath(ctx, points) {
    const { sensitivity, minWidth, maxWidth } = this.config;
    
    for (let i = 0; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      
      // 模拟压力（基于绘制密度）
      const pressure = this.calculatePressure(current, next, points, i);
      const lineWidth = minWidth + (maxWidth - minWidth) * pressure * sensitivity;
      
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(current.x, current.y);
      ctx.lineTo(next.x, next.y);
      ctx.stroke();
    }
  }

  private calculatePressure(current, next, allPoints, index) {
    // 简化的压力计算：基于相邻点的距离
    const distance = Math.sqrt(
      Math.pow(next.x - current.x, 2) + Math.pow(next.y - current.y, 2)
    );
    
    // 距离越小，压力越大
    return Math.max(0.1, Math.min(1.0, 1 - distance / 50));
  }
}

// 创建插件
const PressurePenPlugin = PluginSDK.createBuilder()
  .setMetadata({
    id: 'advanced.pressure_pen',
    name: '压感画笔插件',
    version: '1.0.0',
    description: '支持压力感应的高级画笔工具',
    author: '高级开发者',
    tags: ['advanced', 'pressure', 'drawing'],
    compatibleVersion: '>=1.0.0'
  })
  .setTool('pressure_pen', '压感画笔', PressurePenTool)
  .setInitialize(async () => {
    console.log('🎨 压感画笔插件初始化完成');
  })
  .setValidateConfig((config) => {
    const validators = PluginSDK.validateConfig;
    return validators.range('sensitivity', 0, 1)(config) &&
           validators.range('minWidth', 0.5, 10)(config) &&
           validators.range('maxWidth', 5, 50)(config);
  })
  .build();

// 使用插件
await pluginManager.registerPlugin(PressurePenPlugin, {
  config: {
    sensitivity: 0.9,
    minWidth: 1,
    maxWidth: 25
  }
});

drawBoard.setTool('pressure_pen');
```

## 🎯 最佳实践

### 1. 插件命名规范
- 使用域名式命名：`company.category.toolname`
- 内置插件：`builtin.*`
- 自定义插件：`custom.*` 或 `mycompany.*`

### 2. 版本管理
- 遵循语义版本控制（SemVer）
- 在元数据中指明兼容版本
- 及时更新依赖版本

### 3. 错误处理
- 在插件中添加适当的错误处理
- 提供有意义的错误信息
- 实现优雅的降级机制

### 4. 性能考虑
- 合理设置复杂度评分
- 考虑是否需要缓存支持
- 避免在绘制函数中进行重型计算

### 5. 用户体验
- 提供清晰的插件描述
- 合理的配置选项和默认值
- 考虑移动端适配

## 🔧 故障排除

### 常见问题

1. **插件注册失败**
   ```typescript
   // 检查插件ID是否重复
   const existing = pluginManager.getPlugin('my.plugin.id');
   if (existing) {
     await pluginManager.unregisterPlugin('my.plugin.id');
   }
   await pluginManager.registerPlugin(MyPlugin);
   ```

2. **工具不显示**
   ```typescript
   // 检查插件状态
   const info = pluginManager.getPlugin('my.plugin.id');
   console.log('插件状态:', info?.status);
   
   // 手动初始化
   if (info?.status === 'registered') {
     await pluginManager.initializePlugin('my.plugin.id');
   }
   ```

3. **绘制异常**
   ```typescript
   // 在工具类中添加错误处理
   public draw(ctx, action) {
     try {
       // 绘制逻辑
     } catch (error) {
       console.error('绘制错误:', error);
       // 回退到简单绘制
       this.drawFallback(ctx, action);
     }
   }
   ```

通过这个插件化系统，DrawBoard 现在具备了强大的扩展能力，可以支持各种自定义绘图工具的开发和集成！🎉 