import type { DrawTool } from './DrawTool';
import type { ToolType } from './ToolManager';
import { logger } from '../utils/Logger';

/**
 * 工具工厂 - 简化版本
 * 
 * 替代复杂的插件系统，使用简单的工厂模式管理工具创建
 * - 懒加载：工具只在首次使用时创建
 * - 缓存：创建后的工具实例会被缓存
 * - 简单：移除不必要的插件复杂性
 */
export class ToolFactory {
  private static instance: ToolFactory;
  private tools: Map<ToolType, DrawTool> = new Map();
  private factories: Map<ToolType, () => DrawTool | Promise<DrawTool>> = new Map();

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
   * 注册工具工厂函数
   */
  public register(type: ToolType, factory: () => DrawTool | Promise<DrawTool>): void {
    this.factories.set(type, factory);
    logger.debug(`注册工具工厂: ${type}`);
  }

  /**
   * 创建工具实例（支持懒加载和缓存）
   */
  public async createTool(type: ToolType): Promise<DrawTool> {
    // 检查缓存
    if (this.tools.has(type)) {
      logger.debug(`从缓存获取工具: ${type}`);
      return this.tools.get(type)!;
    }

    // 检查工厂
    const factory = this.factories.get(type);
    if (!factory) {
      throw new Error(`未知的工具类型: ${type}`);
    }

    try {
      logger.debug(`创建工具实例: ${type}`);
      const tool = await factory();
      
      // 缓存工具实例
      this.tools.set(type, tool);
      logger.debug(`工具创建成功并缓存: ${type}`);
      
      return tool;
    } catch (error) {
      logger.error(`创建工具失败: ${type}`, error);
      throw error;
    }
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
    logger.debug('工具缓存已清除');
  }

  /**
   * 获取工具使用统计
   */
  public getStats(): { 
    availableTools: number; 
    cachedTools: number; 
    toolTypes: ToolType[] 
  } {
    return {
      availableTools: this.factories.size,
      cachedTools: this.tools.size,
      toolTypes: this.getAvailableToolTypes()
    };
  }

  /**
   * 注册内置工具
   */
  private registerBuiltinTools(): void {
    // 使用ES6 import方式注册所有内置工具
    this.register('pen', async () => {
      const { PenToolRefactored } = await import('./PenToolRefactored');
      return new PenToolRefactored();
    });

    this.register('rect', async () => {
      const { RectTool } = await import('./RectTool');
      return new RectTool();
    });

    this.register('circle', async () => {
      const { CircleTool } = await import('./CircleTool');
      return new CircleTool();
    });

    this.register('line', async () => {
      const { LineTool } = await import('./LineTool');
      return new LineTool();
    });

    this.register('polygon', async () => {
      const { PolygonTool } = await import('./PolygonTool');
      return new PolygonTool();
    });

    this.register('text', async () => {
      const { TextTool } = await import('./TextTool');
      return new TextTool();
    });

    this.register('eraser', async () => {
      const { EraserTool } = await import('./EraserTool');
      return new EraserTool();
    });

    this.register('select', async () => {
      const { SelectTool } = await import('./SelectTool');
      return new SelectTool();
    });

    logger.info('内置工具工厂注册完成');
  }

  /**
   * 销毁工厂实例
   */
  public destroy(): void {
    this.tools.clear();
    this.factories.clear();
    logger.debug('工具工厂已销毁');
  }
}

/**
 * 全局工具工厂实例
 */
export const toolFactory = ToolFactory.getInstance(); 