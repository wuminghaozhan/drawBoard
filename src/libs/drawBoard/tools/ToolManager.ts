import { ToolFactory } from './ToolFactory';
import { DrawTool } from './DrawTool';
import type { ToolType } from './DrawTool';
import { logger } from '../utils/Logger';

/**
 * 工具管理器 - 管理当前工具状态和工具切换
 * 
 * 功能特性：
 * - 工具状态管理
 * - 异步工具加载
 * - 工具缓存
 * - 加载状态跟踪
 * - 工具元数据管理
 */
export class ToolManager {
  private currentTool: ToolType = 'pen';
  private currentToolInstance: DrawTool | null = null;
  private toolFactory: ToolFactory;
  private loadingState: 'idle' | 'loading' | 'ready' | 'error' = 'idle';

  constructor() {
    this.toolFactory = ToolFactory.getInstance();
  }

  /**
   * 设置当前工具（异步版本，支持重量级工具）
   */
  public async setCurrentTool(toolType: ToolType): Promise<void> {
    if (this.currentTool === toolType && this.currentToolInstance) {
      logger.debug(`工具已是当前工具: ${toolType}`);
      return;
    }

    try {
      this.loadingState = 'loading';
      logger.debug(`切换工具: ${this.currentTool} -> ${toolType}`);
      
      const tool = await this.toolFactory.createTool(toolType);
      this.currentTool = toolType;
      this.currentToolInstance = tool;
      this.loadingState = 'ready';
      
      logger.info(`工具切换成功: ${toolType}`);
    } catch (error) {
      this.loadingState = 'error';
      logger.error(`切换工具失败: ${toolType}`, error);
      throw error;
    }
  }

  /**
   * 获取当前工具类型
   */
  public getCurrentTool(): ToolType {
    return this.currentTool;
  }

  /**
   * 获取当前工具类型（兼容旧API）
   */
  public getCurrentToolType(): ToolType {
    return this.getCurrentTool();
  }

  /**
   * 获取所有工具名称（修复返回类型）
   */
  public getToolNames(): Array<{ type: ToolType; name: string }> {
    const toolTypes = this.toolFactory.getAvailableToolTypes();
    return toolTypes.map(type => ({
      type,
      name: this.getToolDisplayName(type)
    }));
  }

  /**
   * 获取工具显示名称
   */
  private getToolDisplayName(type: ToolType): string {
    const nameMap: Record<ToolType, string> = {
      pen: '画笔',
      brush: '毛笔',
      rect: '矩形',
      circle: '圆形', 
      line: '直线',
      polygon: '多边形',
      text: '文字',
      eraser: '橡皮擦',
      select: '选择',
      transform: '变换'
    };
    return nameMap[type] || type;
  }

  /**
   * 获取工具实例（异步方法）
   */
  public async getTool(type?: ToolType): Promise<DrawTool | null> {
    const toolType = type || this.currentTool;
    
    // 如果是当前工具且已加载，直接返回
    if (toolType === this.currentTool && this.currentToolInstance) {
      return this.currentToolInstance;
    }
    
    // 否则尝试创建工具
    try {
      return await this.toolFactory.createTool(toolType);
    } catch (error) {
      logger.error(`获取工具失败: ${toolType}`, error);
      return null;
    }
  }

  /**
   * 获取当前工具实例
   */
  public getCurrentToolInstance(): DrawTool | null {
    return this.currentToolInstance;
  }

  /**
   * 获取加载状态
   */
  public getLoadingState(): 'idle' | 'loading' | 'ready' | 'error' {
    return this.loadingState;
  }

  /**
   * 检查工具类型是否有效
   */
  public isValidToolType(tool: string): tool is ToolType {
    const validTypes = this.toolFactory.getAvailableToolTypes();
    return validTypes.includes(tool as ToolType);
  }

  /**
   * 获取所有可用工具类型
   */
  public getAvailableToolTypes(): ToolType[] {
    return this.toolFactory.getAvailableToolTypes();
  }

  /**
   * 预加载工具（后台加载，不阻塞UI）
   */
  public async preloadTool(type: ToolType): Promise<void> {
    await this.toolFactory.preloadTool(type);
  }

  /**
   * 预加载多个工具
   */
  public async preloadTools(types: ToolType[]): Promise<void> {
    await this.toolFactory.preloadTools(types);
  }

  /**
   * 获取工具元数据
   */
  public getToolMetadata(type: ToolType) {
    return this.toolFactory.getToolMetadata(type);
  }

  /**
   * 获取工具管理器统计信息
   */
  public getStats(): {
    currentTool: ToolType;
    loadingState: string;
    availableTools: number;
    cachedTools: number;
    loadingTools: number;
    toolTypes: ToolType[];
    heavyTools: ToolType[];
  } {
    const factoryStats = this.toolFactory.getStats();
    return {
      currentTool: this.currentTool,
      loadingState: this.loadingState,
      ...factoryStats
    };
  }

  /**
   * 清除工具缓存
   */
  public clearCache(): void {
    this.toolFactory.clearCache();
    logger.debug('工具缓存已清除');
  }

  /**
   * 注册自定义工具（保持扩展性）
   */
  public registerTool(type: ToolType, factory: () => DrawTool | Promise<DrawTool>): void {
    this.toolFactory.register(type, factory);
    logger.info(`注册自定义工具: ${type}`);
  }

  /**
   * 注册重量级工具（未来扩展）
   */
  public registerHeavyTool(
    type: ToolType,
    factory: () => Promise<DrawTool>,
    metadata: Omit<import('./ToolFactory').ToolMetadata, 'type'>
  ): void {
    this.toolFactory.registerHeavyTool(type, factory, metadata);
    logger.info(`注册重量级工具: ${type}`, metadata);
  }

  /**
   * 销毁工具管理器
   */
  public destroy(): void {
    // 不销毁ToolFactory，因为它是全局单例
    // this.toolFactory.destroy(); // 注释掉这行
    this.currentToolInstance = null;
    this.loadingState = 'idle';
    logger.debug('工具管理器已销毁');
  }
} 