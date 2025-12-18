import { DrawTool } from './DrawTool';
import type { ToolType } from './DrawTool';
import type { DrawAction } from './DrawTool';
import { logger } from '../infrastructure/logging/Logger';

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
  private static instance: ToolFactory | undefined;
  private tools: Map<ToolType, DrawTool> = new Map();
  private loadingPromises: Map<ToolType, Promise<DrawTool>> = new Map();
  private factories: Map<ToolType, () => DrawTool | Promise<DrawTool>> = new Map();
  private toolMetadata: Map<ToolType, ToolMetadata> = new Map();

  private constructor() {
    try {
      this.registerBuiltinTools();
    } catch (error) {
      logger.error('❌ ToolFactory 构造函数执行失败:', error);
      throw error;
    }
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
    logger.debug(`尝试创建工具: ${type}`);
    logger.debug(`当前已注册的工具类型: ${Array.from(this.factories.keys())}`);
    
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
      logger.error(`工具类型 ${type} 未找到，已注册的工具: ${Array.from(this.factories.keys())}`);
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
    logger.warn(`重量级工具 ${type} 加载失败，降级到基础工具`);
    
      const basicTools: Record<ToolType, () => DrawTool> = {
      pen: () => new BasicPenTool(),
      brush: () => new BasicBrushTool(),
      advancedPen: () => new BasicPenTool(), // 降级为基础画笔
      rect: () => new BasicRectTool(),
      circle: () => new BasicCircleTool(),
      line: () => new BasicLineTool(),
      polygon: () => new BasicPolygonTool(),
      text: () => new BasicTextTool(),
      image: () => new BasicImageTool(), // 降级为基础图片工具
      eraser: () => new BasicEraserTool(),
      select: () => new BasicSelectTool(),
      transform: () => new BasicTransformTool()
    };
    
    const basicToolFactory = basicTools[type];
    if (!basicToolFactory) {
      throw new Error(`不支持的工具类型: ${type}`);
    }
    
    return basicToolFactory();
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
    try {
      logger.debug('开始注册内置工具...');
      
      // 画笔工具 - 使用 SimplePenTool（更平滑的笔触）
      this.register('pen', async () => {
        logger.debug('注册 pen 工具工厂');
        try {
          const { SimplePenTool } = await import('./SimplePenTool');
          logger.debug('SimplePenTool 导入成功');
          const tool = new SimplePenTool();
          tool.setPreset('marker'); // 默认马克笔预设
          return tool;
        } catch (importError) {
          logger.error('导入 SimplePenTool 失败:', importError);
          throw importError;
        }
      }, { isHeavy: false, estimatedLoadTime: 50 });

      this.register('brush', async () => {
        logger.debug('注册 brush 工具工厂');
        try {
          const { SimplePenTool } = await import('./SimplePenTool');
          const brushTool = new SimplePenTool();
          brushTool.setPreset('brush'); // 毛笔预设
          return brushTool;
        } catch (importError) {
          logger.error('导入 SimplePenTool (brush) 失败:', importError);
          throw importError;
        }
      }, { isHeavy: false, estimatedLoadTime: 60 });

      // 高级运笔效果画笔 - 使用 PenToolRefactored（用于 StrokeDemo 展示）
      this.register('advancedPen', async () => {
        logger.debug('注册 advancedPen 工具工厂');
        try {
          const { PenToolRefactored } = await import('./PenToolRefactored');
          return new PenToolRefactored();
        } catch (importError) {
          logger.error('导入 PenToolRefactored 失败:', importError);
          throw importError;
        }
      }, { isHeavy: false, estimatedLoadTime: 60 });

      this.register('rect', async () => {
        logger.debug('注册 rect 工具工厂');
        try {
          const { RectTool } = await import('./RectTool');
          return new RectTool();
        } catch (importError) {
          logger.error('导入 RectTool 失败:', importError);
          throw importError;
        }
      }, { isHeavy: false, estimatedLoadTime: 30 });

      this.register('circle', async () => {
        logger.debug('注册 circle 工具工厂');
        try {
          const { CircleTool } = await import('./CircleTool');
          return new CircleTool();
        } catch (importError) {
          logger.error('导入 CircleTool 失败:', importError);
          throw importError;
        }
      }, { isHeavy: false, estimatedLoadTime: 30 });

      this.register('line', async () => {
        logger.debug('注册 line 工具工厂');
        try {
          const { LineTool } = await import('./LineTool');
          return new LineTool();
        } catch (importError) {
          logger.error('导入 LineTool 失败:', importError);
          throw importError;
        }
      }, { isHeavy: false, estimatedLoadTime: 30 });

      this.register('polygon', async () => {
        logger.debug('注册 polygon 工具工厂');
        try {
          const { PolygonTool } = await import('./PolygonTool');
          return new PolygonTool();
        } catch (importError) {
          logger.error('导入 PolygonTool 失败:', importError);
          throw importError;
        }
      }, { isHeavy: false, estimatedLoadTime: 40 });

      this.register('text', async () => {
        logger.debug('注册 text 工具工厂');
        try {
          const { TextTool } = await import('./TextTool');
          return new TextTool();
        } catch (importError) {
          logger.error('导入 TextTool 失败:', importError);
          throw importError;
        }
      }, { isHeavy: false, estimatedLoadTime: 60 });

      this.register('image', async () => {
        logger.debug('注册 image 工具工厂');
        try {
          const { ImageTool } = await import('./ImageTool');
          return new ImageTool();
        } catch (importError) {
          logger.error('导入 ImageTool 失败:', importError);
          throw importError;
        }
      }, { isHeavy: false, estimatedLoadTime: 40 });

      this.register('eraser', async () => {
        logger.debug('注册 eraser 工具工厂');
        try {
          const { EraserTool } = await import('./EraserTool');
          return new EraserTool();
        } catch (importError) {
          logger.error('导入 EraserTool 失败:', importError);
          throw importError;
        }
      }, { isHeavy: false, estimatedLoadTime: 40 });

      this.register('select', async () => {
        logger.debug('注册 select 工具工厂');
        try {
          const { SelectTool } = await import('./SelectTool');
          return new SelectTool();
        } catch (importError) {
          logger.error('导入 SelectTool 失败:', importError);
          throw importError;
        }
      }, { isHeavy: false, estimatedLoadTime: 50 });

      logger.info(`内置工具工厂注册完成，已注册 ${this.factories.size} 个工具`);
      logger.debug('已注册的工具类型:', Array.from(this.factories.keys()));
    } catch (error) {
      logger.error('注册内置工具时出错:', error);
      throw error;
    }
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
    // 重置单例实例，确保下次getInstance()会重新注册工具
    ToolFactory.instance = undefined;
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

class BasicBrushTool extends DrawTool {
  constructor() { super('基础毛笔', 'brush'); }
  draw(ctx: CanvasRenderingContext2D, action: DrawAction): void {
    // 基础毛笔绘制逻辑
    if (action.points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(action.points[0].x, action.points[0].y);
    for (let i = 1; i < action.points.length; i++) {
      ctx.lineTo(action.points[i].x, action.points[i].y);
    }
    ctx.stroke();
  }
  getActionType(): string { return 'brush'; }
}

class BasicRectTool extends DrawTool {
  constructor() { super('基础矩形', 'rect'); }
  draw(ctx: CanvasRenderingContext2D, action: DrawAction): void {
    // 统一使用 4 顶点格式
    if (action.points.length < 4) return;
    
    ctx.beginPath();
    ctx.moveTo(action.points[0].x, action.points[0].y);
    ctx.lineTo(action.points[1].x, action.points[1].y);
    ctx.lineTo(action.points[2].x, action.points[2].y);
    ctx.lineTo(action.points[3].x, action.points[3].y);
    ctx.closePath();
    ctx.stroke();
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
    const start = action.points[0];
    const end = action.points[action.points.length - 1];
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
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
    if (action.text && action.points.length > 0) {
      ctx.fillText(action.text, action.points[0].x, action.points[0].y);
    }
  }
  getActionType(): string { return 'text'; }
}

class BasicImageTool extends DrawTool {
  constructor() { super('基础图片', 'image'); }
  draw(ctx: CanvasRenderingContext2D, action: DrawAction): void {
    // 基础图片绘制逻辑（降级版本）
    const imageAction = action as any;
    if (imageAction.imageUrl && action.points.length > 0) {
      const point = action.points[0];
      const width = imageAction.imageWidth || 200;
      const height = imageAction.imageHeight || 200;
      
      // 如果有缓存的图片元素，直接绘制
      if (imageAction.imageElement) {
        ctx.drawImage(imageAction.imageElement, point.x, point.y, width, height);
      } else {
        // 绘制占位符
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(point.x, point.y, width, height);
        ctx.strokeStyle = '#cccccc';
        ctx.strokeRect(point.x, point.y, width, height);
      }
    }
  }
  getActionType(): string { return 'image'; }
}

class BasicEraserTool extends DrawTool {
  constructor() { super('基础橡皮擦', 'eraser'); }
  draw(ctx: CanvasRenderingContext2D, action: DrawAction): void {
    // 基础橡皮擦逻辑：绘制白色矩形覆盖
    const originalComposite = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'destination-out';
    
    if (action.points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(action.points[0].x, action.points[0].y);
    for (let i = 1; i < action.points.length; i++) {
      ctx.lineTo(action.points[i].x, action.points[i].y);
    }
    ctx.stroke();
    
    ctx.globalCompositeOperation = originalComposite;
  }
  getActionType(): string { return 'eraser'; }
}

class BasicSelectTool extends DrawTool {
  constructor() { super('基础选择', 'select'); }
  draw(ctx: CanvasRenderingContext2D, action: DrawAction): void {
    // 基础选择逻辑：绘制选择框
    if (action.points.length < 2) return;
    const start = action.points[0];
    const end = action.points[action.points.length - 1];
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
    ctx.setLineDash([]);
  }
  getActionType(): string { return 'select'; }
}

class BasicTransformTool extends DrawTool {
  constructor() { super('基础变换', 'transform'); }
  draw(ctx: CanvasRenderingContext2D, action: DrawAction): void {
    // 基础变换逻辑：绘制变换框
    if (action.points.length < 2) return;
    const start = action.points[0];
    const end = action.points[action.points.length - 1];
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
    ctx.setLineDash([]);
  }
  getActionType(): string { return 'transform'; }
}

/**
 * 全局工具工厂实例
 */
export const toolFactory = ToolFactory.getInstance(); 