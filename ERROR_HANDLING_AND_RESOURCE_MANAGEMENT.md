# DrawBoard 错误处理和资源管理系统

## 🎯 概述

本文档描述了DrawBoard系统中新实现的错误处理和资源管理系统，这两个系统是DrawBoard架构的重要组成部分，确保了系统的稳定性和资源管理的可靠性。

## 🛡️ 错误处理系统

### 核心组件

#### 1. DrawBoardError 类
- **功能**: 自定义错误类，继承自Error
- **特性**: 
  - 错误代码枚举化
  - 错误上下文信息
  - 可恢复性标记
  - 时间戳记录
  - 完整的堆栈跟踪

```typescript
export class DrawBoardError extends Error {
  public readonly code: DrawBoardErrorCode;
  public readonly context?: any;
  public readonly recoverable: boolean;
  public readonly timestamp: number;
}
```

#### 2. DrawBoardErrorCode 枚举
定义了系统中所有可能的错误类型：

```typescript
export enum DrawBoardErrorCode {
  // 初始化相关
  INITIALIZATION_FAILED = 'INIT_FAILED',
  CONTAINER_NOT_FOUND = 'CONTAINER_NOT_FOUND',
  
  // Canvas相关
  CANVAS_ERROR = 'CANVAS_ERROR',
  CONTEXT_2D_FAILED = 'CONTEXT_2D_FAILED',
  
  // 工具相关
  TOOL_ERROR = 'TOOL_ERROR',
  TOOL_NOT_FOUND = 'TOOL_NOT_FOUND',
  TOOL_LOADING_FAILED = 'TOOL_LOADING_FAILED',
  
  // 内存相关
  MEMORY_ERROR = 'MEMORY_ERROR',
  MEMORY_LIMIT_EXCEEDED = 'MEMORY_LIMIT_EXCEEDED',
  
  // 渲染相关
  RENDERING_ERROR = 'RENDERING_ERROR',
  DRAW_ACTION_FAILED = 'DRAW_ACTION_FAILED',
  
  // 资源管理相关
  RESOURCE_ERROR = 'RESOURCE_ERROR',
  RESOURCE_DESTROY_FAILED = 'RESOURCE_DESTROY_FAILED',
  
  // 其他
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}
```

#### 3. ErrorHandler 类
统一的错误处理器，提供：

- **错误处理**: 统一的错误处理逻辑
- **错误订阅**: 支持错误事件订阅
- **恢复策略**: 可配置的错误恢复策略
- **错误历史**: 错误记录和统计
- **并发保护**: 防止错误处理过程中的死锁

```typescript
export class ErrorHandler {
  // 单例模式
  public static getInstance(): ErrorHandler;
  
  // 错误处理
  public async handle(error: DrawBoardError): Promise<void>;
  
  // 错误订阅
  public onError(code: DrawBoardErrorCode, callback: (error: DrawBoardError) => void): () => void;
  
  // 恢复策略注册
  public registerRecoveryStrategy(strategy: ErrorRecoveryStrategy): void;
  
  // 统计和历史
  public getErrorStats(): ErrorStats;
  public getErrorHistory(): DrawBoardError[];
}
```

### 错误恢复策略

系统支持可配置的错误恢复策略：

```typescript
export interface ErrorRecoveryStrategy {
  code: DrawBoardErrorCode;
  recovery: (error: DrawBoardError) => Promise<boolean>;
  priority: number;
}
```

预定义的恢复策略包括：
- **工具加载失败**: 使用基础工具作为备选
- **内存错误**: 自动清理缓存
- **Canvas错误**: 重新创建Canvas

## 🔧 资源管理系统

### 核心组件

#### 1. DestroyableResource 接口
定义了可销毁资源的标准接口：

```typescript
export interface DestroyableResource {
  name: string;
  type: string;
  destroy(): void | Promise<void>;
  isDestroyed?: boolean;
}
```

#### 2. ResourceManager 类
资源管理器，负责：

- **资源注册**: 自动管理所有可销毁资源
- **生命周期管理**: 确保资源正确销毁
- **依赖关系处理**: 按依赖顺序销毁资源
- **内存监控**: 估算资源内存使用
- **泄漏检测**: 检测未销毁的资源

```typescript
export class ResourceManager {
  // 单例模式
  public static getInstance(): ResourceManager;
  
  // 资源管理
  public register(resource: DestroyableResource, name?: string): string;
  public async unregister(id: string): Promise<void>;
  
  // 资源查询
  public getResource(id: string): DestroyableResource | undefined;
  public getResourcesByType(type: string): DestroyableResource[];
  
  // 统计和监控
  public getStats(): ResourceStats;
  public checkResourceLeaks(): ResourceLeakInfo;
  
  // 清理和销毁
  public cleanupDestroyedResources(): void;
  public async destroy(): Promise<void>;
}
```

### 资源类型和依赖关系

系统定义了资源类型的依赖关系，确保正确的销毁顺序：

```typescript
const dependencies: Record<string, string[]> = {
  'canvas': ['drawing', 'event', 'tool'],
  'drawing': ['tool', 'history'],
  'event': ['drawing'],
  'tool': ['factory'],
  'history': [],
  'factory': [],
  'performance': ['cache'],
  'cache': [],
  'selection': ['drawing'],
  'shortcut': ['event'],
  'export': ['canvas'],
  'virtualLayer': ['drawing']
};
```

### 内存估算

系统提供简单的内存使用估算：

```typescript
private estimateResourceMemory(resource: DestroyableResource): number {
  const baseMemory = 1024; // 1KB 基础内存
  
  switch (resource.type) {
    case 'canvas': return baseMemory * 10; // 10KB
    case 'cache': return baseMemory * 5;   // 5KB
    case 'tool': return baseMemory * 2;    // 2KB
    case 'history': return baseMemory * 3; // 3KB
    default: return baseMemory;
  }
}
```

## 🔌 集成到DrawBoard

### 1. DrawBoard类集成

```typescript
export class DrawBoard {
  // 错误处理和资源管理实例
  private errorHandler: ErrorHandler;
  private resourceManager: ResourceManager;
  
  constructor(container: HTMLCanvasElement | HTMLDivElement, config: DrawBoardConfig = {}) {
    // 初始化错误处理和资源管理
    this.errorHandler = ErrorHandler.getInstance();
    this.resourceManager = ResourceManager.getInstance();
    
    try {
      // 初始化其他组件...
      this.registerAsResource();
    } catch (error) {
      const drawBoardError = DrawBoardError.fromError(
        error as Error,
        DrawBoardErrorCode.INITIALIZATION_FAILED,
        { container, config }
      );
      await this.errorHandler.handle(drawBoardError);
      throw error;
    }
  }
  
  // 资源注册
  private registerAsResource(): void {
    this.resourceManager.register({
      name: 'DrawBoard',
      type: 'drawBoard',
      destroy: async () => {
        await this.destroy();
      }
    }, 'DrawBoard主实例');
  }
}
```

### 2. 公共API

DrawBoard提供了错误处理和资源管理的公共API：

```typescript
// 错误处理API
public getErrorStats(): ErrorStats;
public getErrorHistory(): DrawBoardError[];
public clearErrorHistory(): void;
public onError(code: DrawBoardErrorCode, callback: (error: DrawBoardError) => void): () => void;

// 资源管理API
public getResourceStats(): ResourceStats;
public checkResourceLeaks(): ResourceLeakInfo;
public cleanupDestroyedResources(): void;
```

## 📊 演示页面

创建了专门的错误处理和资源管理演示页面 (`/error-handling`)，提供：

### 功能特性
- **错误测试**: 模拟不同类型的错误
- **实时监控**: 显示资源统计和错误历史
- **泄漏检测**: 检查资源泄漏并提供建议
- **交互式界面**: 直观的错误和资源管理界面

### 界面组件
- **错误测试按钮**: 触发不同类型的错误
- **资源统计面板**: 显示资源使用情况
- **泄漏检查面板**: 显示资源泄漏状态
- **错误历史列表**: 显示所有错误记录

## 🎯 使用示例

### 1. 基本错误处理

```typescript
import { DrawBoard, DrawBoardErrorCode } from './libs/drawBoard';

const drawBoard = new DrawBoard(container);

// 订阅错误事件
const unsubscribe = drawBoard.onError(DrawBoardErrorCode.TOOL_LOADING_FAILED, (error) => {
  console.log('工具加载失败:', error.message);
  // 执行恢复逻辑
});

// 获取错误统计
const stats = drawBoard.getErrorStats();
console.log('错误统计:', stats);
```

### 2. 资源管理

```typescript
// 获取资源统计
const resourceStats = drawBoard.getResourceStats();
console.log('资源统计:', resourceStats);

// 检查资源泄漏
const leakInfo = drawBoard.checkResourceLeaks();
if (leakInfo.hasLeaks) {
  console.log('发现资源泄漏:', leakInfo.recommendations);
}

// 清理已销毁的资源
drawBoard.cleanupDestroyedResources();
```

### 3. 自定义恢复策略

```typescript
import { ErrorHandler, DrawBoardErrorCode } from './libs/drawBoard';

const errorHandler = ErrorHandler.getInstance();

errorHandler.registerRecoveryStrategy({
  code: DrawBoardErrorCode.CUSTOM_ERROR,
  priority: 1,
  recovery: async (error) => {
    // 自定义恢复逻辑
    console.log('执行自定义恢复策略');
    return true; // 恢复成功
  }
});
```

## 🔍 监控和调试

### 1. 错误监控

```typescript
// 获取错误历史
const errors = drawBoard.getErrorHistory();
errors.forEach(error => {
  console.log(`[${error.code}] ${error.message}`, {
    timestamp: new Date(error.timestamp),
    recoverable: error.recoverable,
    context: error.context
  });
});
```

### 2. 资源监控

```typescript
// 获取资源统计
const stats = drawBoard.getResourceStats();
console.log('资源使用情况:', {
  total: stats.total,
  active: stats.active,
  destroyed: stats.destroyed,
  memoryUsage: `${(stats.estimatedMemoryUsage / 1024).toFixed(1)}KB`
});
```

## 🚀 性能优化

### 1. 错误处理优化
- **异步处理**: 避免阻塞主线程
- **并发保护**: 防止错误处理死锁
- **历史限制**: 限制错误历史记录数量

### 2. 资源管理优化
- **依赖排序**: 按依赖关系顺序销毁
- **并行销毁**: 同类型资源并行销毁
- **内存估算**: 快速内存使用估算

## 📈 未来扩展

### 1. 错误处理扩展
- **错误分类**: 更细粒度的错误分类
- **自动恢复**: 更智能的自动恢复策略
- **错误报告**: 错误报告和分析功能

### 2. 资源管理扩展
- **资源池**: 资源池管理
- **内存优化**: 更精确的内存监控
- **性能分析**: 资源使用性能分析

## ✅ 总结

错误处理和资源管理系统的实现显著提升了DrawBoard的：

1. **稳定性**: 统一的错误处理机制
2. **可靠性**: 自动的资源生命周期管理
3. **可维护性**: 清晰的错误信息和资源状态
4. **可扩展性**: 支持自定义错误恢复策略
5. **可观测性**: 完整的错误和资源监控

这两个系统为DrawBoard提供了企业级的稳定性和可靠性保障，是系统架构的重要组成部分。 