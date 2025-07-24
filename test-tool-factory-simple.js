// 更简单的测试，检查 ToolFactory 实例化
console.log('开始简单测试...');

// 模拟基本的类结构
class DrawTool {
  constructor(name, type) {
    this.name = name;
    this.type = type;
  }
}

// 模拟 ToolFactory 的核心逻辑
class SimpleToolFactory {
  constructor() {
    this.factories = new Map();
    this.toolMetadata = new Map();
    this.tools = new Map();
    this.loadingPromises = new Map();
    
    console.log('ToolFactory 构造函数被调用');
    this.registerBuiltinTools();
  }
  
  register(type, factory, metadata = {}) {
    console.log(`注册工具: ${type}`);
    this.factories.set(type, factory);
    this.toolMetadata.set(type, {
      type,
      isHeavy: false,
      estimatedLoadTime: 100,
      ...metadata
    });
  }
  
  registerBuiltinTools() {
    console.log('开始注册内置工具...');
    
    // 简化的注册，不使用动态导入
    this.register('pen', () => {
      console.log('创建 pen 工具');
      return new DrawTool('PenTool', 'pen');
    });
    
    this.register('rect', () => {
      console.log('创建 rect 工具');
      return new DrawTool('RectTool', 'rect');
    });
    
    this.register('circle', () => {
      console.log('创建 circle 工具');
      return new DrawTool('CircleTool', 'circle');
    });
    
    console.log(`注册完成，已注册 ${this.factories.size} 个工具`);
    console.log('已注册的工具类型:', Array.from(this.factories.keys()));
  }
  
  async createTool(type) {
    console.log(`尝试创建工具: ${type}`);
    console.log(`当前已注册的工具类型: ${Array.from(this.factories.keys())}`);
    
    const factory = this.factories.get(type);
    if (!factory) {
      console.error(`工具类型 ${type} 未找到，已注册的工具: ${Array.from(this.factories.keys())}`);
      throw new Error(`未知的工具类型: ${type}`);
    }
    
    console.log(`找到工具工厂: ${type}`);
    const tool = await factory();
    console.log(`工具创建成功: ${type}`);
    return tool;
  }
}

// 测试
async function test() {
  try {
    console.log('创建 ToolFactory 实例...');
    const factory = new SimpleToolFactory();
    
    console.log('\n测试创建 pen 工具...');
    const penTool = await factory.createTool('pen');
    console.log('pen 工具创建成功:', penTool);
    
    console.log('\n测试创建 rect 工具...');
    const rectTool = await factory.createTool('rect');
    console.log('rect 工具创建成功:', rectTool);
    
    console.log('\n测试创建未知工具...');
    try {
      await factory.createTool('unknown');
    } catch (error) {
      console.log('预期的错误:', error.message);
    }
    
  } catch (error) {
    console.error('测试失败:', error);
  }
}

test(); 