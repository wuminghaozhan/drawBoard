export interface Point {
  x: number;
  y: number;
  timestamp?: number; // 添加可选的时间戳字段
}

export interface DrawContext {
  strokeStyle: string;
  lineWidth: number;
  fillStyle: string;
}

export interface CanvasLayer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  visible: boolean;
}

export class CanvasEngine {
  protected container: HTMLDivElement;
  protected layers: Map<string, CanvasLayer> = new Map();
  protected context: DrawContext;
  protected width: number = 0;
  protected height: number = 0;

  constructor(container: HTMLCanvasElement | HTMLDivElement) {
    console.log('CanvasEngine constructor called with:', container);
    
    if (container instanceof HTMLDivElement) {
      this.container = container;
      // 幂等：清理已有canvas，确保只存在一组
      Array.from(this.container.querySelectorAll('canvas')).forEach(c => c.remove());
      
      // 确保容器有正确的样式
      this.container.style.position = 'relative';
    } else {
      // 创建容器
      this.container = document.createElement('div');
      this.container.style.position = 'relative';
      // 替换原始canvas
      container.parentNode?.replaceChild(this.container, container);
    }
    
    this.context = {
      strokeStyle: '#000000',
      lineWidth: 2,
      fillStyle: '#000000'
    };
    
    this.createLayers();
    
    setTimeout(() => {
      this.resize();
    }, 0);
  }

  private createLayers(): void {
    // 背景层 - 用于网格、背景色等
    this.createLayer('background', 0);
    // 绘制层 - 用于历史记录和最终绘制
    this.createLayer('draw', 1);
    // 交互层 - 用于实时预览、选择框等
    this.createLayer('interaction', 2);
  }

  private createLayer(name: string, zIndex: number): void {
    console.log('Creating layer:', name, 'with z-index:', zIndex);
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    
    if (!ctx) {
      console.error('Failed to get 2D context for layer:', name);
      return;
    }
    
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.bottom = '0';
    canvas.style.right = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = zIndex.toString();
    canvas.style.backgroundColor = 'transparent'; // 确保背景透明
    
    // 交互层需要接收事件
    if (name === 'interaction') {
      canvas.style.pointerEvents = 'auto';
      console.log('Interaction layer created with pointer-events: auto');
    }
    
    this.container.appendChild(canvas);
    console.log('Canvas appended to container for layer:', name);
    
    this.layers.set(name, {
      canvas,
      ctx,
      visible: true
    });
    
    console.log('Layer created successfully:', name);
  }

  protected setupContext(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = this.context.strokeStyle;
    ctx.lineWidth = this.context.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.fillStyle = this.context.fillStyle;
  }

  public setContext(context: Partial<DrawContext>): void {
    this.context = { ...this.context, ...context };
    // 更新所有层的上下文
    this.layers.forEach(layer => {
      this.setupContext(layer.ctx);
    });
  }

  public getContext(): DrawContext {
    return { ...this.context };
  }

  public clear(layerName?: string): void {
    if (layerName) {
      const layer = this.layers.get(layerName);
      if (layer) {
        layer.ctx.clearRect(0, 0, this.width, this.height);
      }
    } else {
      // 清除所有层
      this.layers.forEach(layer => {
        layer.ctx.clearRect(0, 0, this.width, this.height);
      });
    }
  }

  public resize(): void {
    const container = this.container;
    this.width = container.offsetWidth;
    this.height = container.offsetHeight;
    
    console.log('CanvasEngine resize:', this.width, 'x', this.height);
    
    this.layers.forEach(layer => {
      layer.canvas.width = this.width;
      layer.canvas.height = this.height;
      this.setupContext(layer.ctx);
    });
  }

  public getLayer(name: string): CanvasLayer | undefined {
    return this.layers.get(name);
  }

  public getDrawLayer(): CanvasRenderingContext2D {
    return this.layers.get('draw')!.ctx;
  }

  public getInteractionLayer(): CanvasRenderingContext2D {
    return this.layers.get('interaction')!.ctx;
  }

  public getBackgroundLayer(): CanvasRenderingContext2D {
    return this.layers.get('background')!.ctx;
  }

  public getCanvas(): HTMLCanvasElement {
    // 返回绘制层作为主canvas（兼容性）
    return this.layers.get('draw')!.canvas;
  }

  public getContext2D(): CanvasRenderingContext2D {
    // 返回绘制层上下文（兼容性）
    return this.layers.get('draw')!.ctx;
  }

  public setLayerVisible(name: string, visible: boolean): void {
    const layer = this.layers.get(name);
    if (layer) {
      layer.visible = visible;
      layer.canvas.style.display = visible ? 'block' : 'none';
    }
  }

  public drawGrid(gridSize: number = 20, color: string = '#f0f0f0'): void {
    const ctx = this.getBackgroundLayer();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    
    // 绘制垂直线
    for (let x = 0; x <= this.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
      ctx.stroke();
    }
    
    // 绘制水平线
    for (let y = 0; y <= this.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
      ctx.stroke();
    }
  }

  public destroy(): void {
    this.layers.clear();
    this.container.remove();
  }
} 