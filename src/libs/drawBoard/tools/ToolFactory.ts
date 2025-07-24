import { DrawTool } from './DrawTool';
import type { DrawAction } from './DrawTool';
import type { ToolType } from './ToolManager';
import { logger } from '../utils/Logger';

/**
 * 工具元数据接口
 */
export interface ToolMetadata {
  /** 工具类型 */
  type: ToolType;
  /** 是否为重量级工具 */
  isHeavy: boolean;
  /** 预估加载时间（毫秒） */
  estimatedLoadTime: number;
  /** 依赖的外部资源 */
  dependencies?: string[];
  /** 是否需要网络连接 */
  requiresNetwork?: boolean;
  /** 是否需要GPU加速 */
  requiresGPU?: boolean;
}

/**
 * 工具工厂 - 异步版本（支持重量级工具扩展）
 * 
 * 设计考虑：
 * - 异步加载：支持大型资源、外部依赖、复杂初始化
 * - 智能缓存：避免重复加载，提升性能
 * - 扩展性：为未来重量级工具（AI、3D、协作等）预留接口
 * - 降级策略：加载失败时提供基础功能
 */
export class ToolFactory {
  private static instance: ToolFactory;
  private tools: Map<ToolType, DrawTool> = new Map();
  private loadingPromises: Map<ToolType, Promise<DrawTool>> = new Map();
  private factories: Map<ToolType, () => DrawTool | Promise<DrawTool>> = new Map();
  private toolMetadata: Map<ToolType, ToolMetadata> = new Map();

  private constructor() {
    this.registerBuiltinTools();
  }

  public static getInstance(): ToolFactory {
    if (!ToolFactory.instance) {
      ToolFactory.instance = new ToolFactory();
    }
    return ToolFactory.instance;
  }

  /**
   * 注册工具工厂函数（支持同步和异步）
   */
  public register(
    type: ToolType, 
    factory: () => DrawTool | Promise<DrawTool>,
    metadata?: Partial<ToolMetadata>
  ): void {
    this.factories.set(type, factory);
    
    // 设置默认元数据
    this.toolMetadata.set(type, {
      type,
      isHeavy: false,
      estimatedLoadTime: 100,
      ...metadata
    });
    
    logger.debug(`注册工具工厂: ${type}`, metadata);
  }

  /**
   * 创建工具实例（异步版本，支持重量级工具）
   */
  public async createTool(type: ToolType): Promise<DrawTool> {
    // 检查缓存
    if (this.tools.has(type)) {
      logger.debug(`从缓存获取工具: ${type}`);
      return this.tools.get(type)!;
    }

    // 检查是否正在加载
    if (this.loadingPromises.has(type)) {
      logger.debug(`工具正在加载中: ${type}`);
      return this.loadingPromises.get(type)!;
    }

    // 检查工厂
    const factory = this.factories.get(type);
    if (!factory) {
      throw new Error(`未知的工具类型: ${type}`);
    }

    // 获取工具元数据
    const metadata = this.toolMetadata.get(type);
    const isHeavy = metadata?.isHeavy || false;

    // 创建加载Promise
    const loadPromise = this.loadToolWithProgress(type, factory, isHeavy);
    this.loadingPromises.set(type, loadPromise);

    try {
      logger.debug(`开始创建工具实例: ${type}${isHeavy ? ' (重量级)' : ''}`);
      
      const tool = await loadPromise;
      
      // 缓存工具实例
      this.tools.set(type, tool);
      logger.info(`工具创建成功并缓存: ${type}`);
      
      return tool;
    } catch (error) {
      logger.error(`创建工具失败: ${type}`, error);
      
      // 如果是重量级工具，尝试降级
      if (isHeavy) {
        return this.fallbackToBasicTool(type);
      }
      
      throw error;
    } finally {
      // 清理加载Promise
      this.loadingPromises.delete(type);
    }
  }

  /**
   * 带进度提示的工具加载
   */
  private async loadToolWithProgress(
    type: ToolType, 
    factory: () => DrawTool | Promise<DrawTool>,
    isHeavy: boolean
  ): Promise<DrawTool> {
    const startTime = Date.now();
    
    // 重量级工具显示加载提示
    if (isHeavy) {
      this.showLoadingIndicator(type);
    }
    
    try {
      const tool = await factory();
      
      const loadTime = Date.now() - startTime;
      logger.debug(`工具加载完成: ${type}, 耗时: ${loadTime}ms`);
      
      return tool;
    } finally {
      if (isHeavy) {
        this.hideLoadingIndicator(type);
      }
    }
  }

  /**
   * 显示加载指示器
   */
  private showLoadingIndicator(type: ToolType): void {
    // 可以触发自定义事件，让UI显示加载状态
    const event = new CustomEvent('toolLoading', {
      detail: { type, loading: true }
    });
    window.dispatchEvent(event);
  }

  /**
   * 隐藏加载指示器
   */
  private hideLoadingIndicator(type: ToolType): void {
    const event = new CustomEvent('toolLoading', {
      detail: { type, loading: false }
    });
    window.dispatchEvent(event);
  }

  /**
   * 降级到基础工具
   */
  private async fallbackToBasicTool(type: ToolType): Promise<DrawTool> {
    logger.warn(`重量级工具 ${type} 加载失败，降级到基础版本`);
    
    // 根据工具类型提供基础实现
    const basicTools: Record<ToolType, () => DrawTool> = {
      pen: () => new BasicPenTool(),
      rect: () => new BasicRectTool(),
      circle: () => new BasicCircleTool(),
      line: () => new BasicLineTool(),
      polygon: () => new BasicPolygonTool(),
      text: () => new BasicTextTool(),
      eraser: () => new BasicEraserTool(),
      select: () => new BasicSelectTool()
    };
    
    const basicTool = basicTools[type]();
    this.tools.set(type, basicTool);
    
    return basicTool;
  }

  /**
   * 预加载工具（后台加载，不阻塞UI）
   */
  public preloadTool(type: ToolType): Promise<void> {
    return this.createTool(type).then(() => {
      logger.debug(`工具预加载完成: ${type}`);
    }).catch(error => {
      logger.warn(`工具预加载失败: ${type}`, error);
    });
  }

  /**
   * 预加载多个工具
   */
  public async preloadTools(types: ToolType[]): Promise<void> {
    const promises = types.map(type => this.preloadTool(type));
    await Promise.allSettled(promises);
  }

  /**
   * 获取工具元数据
   */
  public getToolMetadata(type: ToolType): ToolMetadata | undefined {
    return this.toolMetadata.get(type);
  }

  /**
   * 获取所有可用的工具类型
   */
  public getAvailableToolTypes(): ToolType[] {
    return Array.from(this.factories.keys());
  }

  /**
   * 清除工具缓存
   */
  public clearCache(): void {
    this.tools.clear();
    this.loadingPromises.clear();
    logger.debug('工具缓存已清除');
  }

  /**
   * 获取工具使用统计
   */
  public getStats(): { 
    availableTools: number; 
    cachedTools: number; 
    loadingTools: number;
    toolTypes: ToolType[];
    heavyTools: ToolType[];
  } {
    const heavyTools = Array.from(this.toolMetadata.entries())
      .filter(([, metadata]) => metadata.isHeavy)
      .map(([type]) => type);
    
    return {
      availableTools: this.factories.size,
      cachedTools: this.tools.size,
      loadingTools: this.loadingPromises.size,
      toolTypes: this.getAvailableToolTypes(),
      heavyTools
    };
  }

  /**
   * 注册内置工具（当前为轻量级，未来可扩展为重量级）
   */
  private registerBuiltinTools(): void {
    // 当前所有工具都是轻量级的
    this.register('pen', async () => {
      const { PenToolRefactored } = await import('./PenToolRefactored');
      return new PenToolRefactored();
    }, { isHeavy: false, estimatedLoadTime: 50 });

    this.register('rect', async () => {
      const { RectTool } = await import('./RectTool');
      return new RectTool();
    }, { isHeavy: false, estimatedLoadTime: 30 });

    this.register('circle', async () => {
      const { CircleTool } = await import('./CircleTool');
      return new CircleTool();
    }, { isHeavy: false, estimatedLoadTime: 30 });

    this.register('line', async () => {
      const { LineTool } = await import('./LineTool');
      return new LineTool();
    }, { isHeavy: false, estimatedLoadTime: 30 });

    this.register('polygon', async () => {
      const { PolygonTool } = await import('./PolygonTool');
      return new PolygonTool();
    }, { isHeavy: false, estimatedLoadTime: 40 });

    this.register('text', async () => {
      const { TextTool } = await import('./TextTool');
      return new TextTool();
    }, { isHeavy: false, estimatedLoadTime: 60 });

    this.register('eraser', async () => {
      const { EraserTool } = await import('./EraserTool');
      return new EraserTool();
    }, { isHeavy: false, estimatedLoadTime: 40 });

    this.register('select', async () => {
      const { SelectTool } = await import('./SelectTool');
      return new SelectTool();
    }, { isHeavy: false, estimatedLoadTime: 50 });

    logger.info('内置工具工厂注册完成');
  }

  /**
   * 注册重量级工具示例（未来扩展）
   */
  public registerHeavyTool(
    type: ToolType,
    factory: () => Promise<DrawTool>,
    metadata: Omit<ToolMetadata, 'type'>
  ): void {
    this.register(type, factory, { ...metadata, isHeavy: true });
    logger.info(`注册重量级工具: ${type}`, metadata);
  }

  /**
   * 销毁工厂实例
   */
  public destroy(): void {
    this.tools.clear();
    this.loadingPromises.clear();
    this.factories.clear();
    this.toolMetadata.clear();
    logger.debug('工具工厂已销毁');
  }
}

/**
 * 基础工具类（降级用）
 */
class BasicPenTool extends DrawTool {
  constructor() { super('基础画笔', 'pen'); }
  draw(ctx: CanvasRenderingContext2D, action: DrawAction): void {
    // 基础绘制逻辑
    if (action.points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(action.points[0].x, action.points[0].y);
    for (let i = 1; i < action.points.length; i++) {
      ctx.lineTo(action.points[i].x, action.points[i].y);
    }
    ctx.stroke();
  }
  getActionType(): string { return 'pen'; }
}

class BasicRectTool extends DrawTool {
  constructor() { super('基础矩形', 'rect'); }
  draw(ctx: CanvasRenderingContext2D, action: DrawAction): void {
    if (action.points.length < 2) return;
    const start = action.points[0];
    const end = action.points[action.points.length - 1];
    ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
  }
  getActionType(): string { return 'rect'; }
}

class BasicCircleTool extends DrawTool {
  constructor() { super('基础圆形', 'circle'); }
  draw(ctx: CanvasRenderingContext2D, action: DrawAction): void {
    if (action.points.length < 2) return;
    const start = action.points[0];
    const end = action.points[action.points.length - 1];
    const radius = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
    ctx.beginPath();
    ctx.arc(start.x, start.y, radius, 0, 2 * Math.PI);
    ctx.stroke();
  }
  getActionType(): string { return 'circle'; }
}

class BasicLineTool extends DrawTool {
  constructor() { super('基础直线', 'line'); }
  draw(ctx: CanvasRenderingContext2D, action: DrawAction): void {
    if (action.points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(action.points[0].x, action.points[0].y);
    ctx.lineTo(action.points[action.points.length - 1].x, action.points[action.points.length - 1].y);
    ctx.stroke();
  }
  getActionType(): string { return 'line'; }
}

class BasicPolygonTool extends DrawTool {
  constructor() { super('基础多边形', 'polygon'); }
  draw(ctx: CanvasRenderingContext2D, action: DrawAction): void {
    if (action.points.length < 3) return;
    ctx.beginPath();
    ctx.moveTo(action.points[0].x, action.points[0].y);
    for (let i = 1; i < action.points.length; i++) {
      ctx.lineTo(action.points[i].x, action.points[i].y);
    }
    ctx.closePath();
    ctx.stroke();
  }
  getActionType(): string { return 'polygon'; }
}

class BasicTextTool extends DrawTool {
  constructor() { super('基础文字', 'text'); }
  draw(ctx: CanvasRenderingContext2D, action: DrawAction): void {
    if (action.points.length < 1 || !action.text) return;
    ctx.fillText(action.text, action.points[0].x, action.points[0].y);
  }
  getActionType(): string { return 'text'; }
}

class BasicEraserTool extends DrawTool {
  constructor() { super('基础橡皮擦', 'eraser'); }
  draw(ctx: CanvasRenderingContext2D, action: DrawAction): void {
    if (action.points.length < 2) return;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(action.points[0].x, action.points[0].y);
    for (let i = 1; i < action.points.length; i++) {
      ctx.lineTo(action.points[i].x, action.points[i].y);
    }
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }
  getActionType(): string { return 'eraser'; }
}

class BasicSelectTool extends DrawTool {
  constructor() { super('基础选择', 'select'); }
  draw(ctx: CanvasRenderingContext2D, action: DrawAction): void {
    if (action.points.length < 2) return;
    const start = action.points[0];
    const end = action.points[action.points.length - 1];
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
    ctx.setLineDash([]);
  }
  getActionType(): string { return 'select'; }
}

/**
 * 全局工具工厂实例
 */
export const toolFactory = ToolFactory.getInstance(); 