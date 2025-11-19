/**
 * Jest 测试环境配置
 */

// Mock window.performance.memory (如果不存在)
if (typeof window !== 'undefined' && window.performance && !(window.performance as any).memory) {
  (window.performance as any).memory = {
    usedJSHeapSize: 10000000,
    totalJSHeapSize: 20000000,
    jsHeapSizeLimit: 200000000,
  };
}

// Mock Canvas getContext (用于 jsdom)
if (typeof HTMLCanvasElement !== 'undefined') {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(contextType: string, ...args: any[]) {
    if (contextType === '2d') {
      // 创建一个模拟的 2D 上下文
      const canvas = this as HTMLCanvasElement;
      if (!canvas.width) canvas.width = 800;
      if (!canvas.height) canvas.height = 600;
      
      // 返回一个模拟的 2D 上下文对象
      return {
        canvas: canvas,
        fillStyle: '#000000',
        strokeStyle: '#000000',
        lineWidth: 2,
        lineCap: 'round',
        lineJoin: 'round',
        // 基本方法
        clearRect: jest.fn(),
        fillRect: jest.fn(),
        strokeRect: jest.fn(),
        beginPath: jest.fn(),
        closePath: jest.fn(),
        moveTo: jest.fn(),
        lineTo: jest.fn(),
        arc: jest.fn(),
        fill: jest.fn(),
        stroke: jest.fn(),
        save: jest.fn(),
        restore: jest.fn(),
        translate: jest.fn(),
        rotate: jest.fn(),
        scale: jest.fn(),
        setTransform: jest.fn(),
        getImageData: jest.fn().mockReturnValue({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
        putImageData: jest.fn(),
        drawImage: jest.fn(),
        createImageData: jest.fn().mockReturnValue({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
        // 其他常用方法
        rect: jest.fn(),
        quadraticCurveTo: jest.fn(),
        bezierCurveTo: jest.fn(),
        arcTo: jest.fn(),
        ellipse: jest.fn(),
        clip: jest.fn(),
        isPointInPath: jest.fn().mockReturnValue(false),
        measureText: jest.fn().mockReturnValue({ width: 0 }),
        fillText: jest.fn(),
        strokeText: jest.fn(),
      } as any;
    }
    return originalGetContext ? originalGetContext.call(this, contextType, ...args) : null;
  };
}

// 全局测试工具函数（如果需要）
// 注意：在 Jest 环境中，可以直接使用 document.createElement

