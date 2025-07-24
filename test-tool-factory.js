// 简单的测试脚本来检查 ToolFactory 是否正常工作
console.log('开始测试 ToolFactory...');

// 模拟 ToolFactory 的基本逻辑
const factories = new Map();
const toolMetadata = new Map();

// 模拟注册工具
function register(type, factory, metadata = {}) {
  console.log(`注册工具: ${type}`);
  factories.set(type, factory);
  toolMetadata.set(type, {
    type,
    isHeavy: false,
    estimatedLoadTime: 100,
    ...metadata
  });
}

// 模拟创建工具
function createTool(type) {
  console.log(`尝试创建工具: ${type}`);
  console.log(`已注册的工具: ${Array.from(factories.keys())}`);
  
  const factory = factories.get(type);
  if (!factory) {
    throw new Error(`未知的工具类型: ${type}`);
  }
  
  console.log(`找到工具工厂: ${type}`);
  return factory();
}

// 测试注册
try {
  register('pen', () => ({ name: 'PenTool' }));
  register('rect', () => ({ name: 'RectTool' }));
  register('circle', () => ({ name: 'CircleTool' }));
  
  console.log('注册完成，已注册工具:', Array.from(factories.keys()));
  
  // 测试创建
  const penTool = createTool('pen');
  console.log('创建 pen 工具成功:', penTool);
  
  const rectTool = createTool('rect');
  console.log('创建 rect 工具成功:', rectTool);
  
  // 测试未知工具
  try {
    createTool('unknown');
  } catch (error) {
    console.log('预期的错误:', error.message);
  }
  
} catch (error) {
  console.error('测试失败:', error);
} 