import type { DrawTool } from './DrawTool';
import { ToolFactory } from './ToolFactory';
import { logger } from '../utils/Logger';

// 保持向后兼容的工具类型定义
export type ToolType = 'pen' | 'rect' | 'circle' | 'line' | 'polygon' | 'text' | 'eraser' | 'select';

/**
 * 工具管理器 - 简化版本
 * 
 * 管理当前激活的工具，配合ToolFactory使用
 */
export class ToolManager {
  private currentTool: ToolType = 'pen';
  private currentToolInstance: DrawTool | null = null;
  private toolFactory: ToolFactory;

  constructor() {
    this.toolFactory = ToolFactory.getInstance();
  }

  /**
   * 设置当前工具（异步）
   */
  public async setCurrentTool(toolType: ToolType): Promise<void> {
    if (this.currentTool === toolType && this.currentToolInstance) {
      logger.debug(`工具已是当前工具: ${toolType}`);
      return;
    }

    try {
      logger.debug(`切换工具: ${this.currentTool} -> ${toolType}`);
      
      const tool = await this.toolFactory.createTool(toolType);
      this.currentTool = toolType;
      this.currentToolInstance = tool;
      
      logger.info(`工具切换成功: ${toolType}`);
    } catch (error) {
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
      rect: '矩形',
      circle: '圆形', 
      line: '直线',
      polygon: '多边形',
      text: '文字',
      eraser: '橡皮擦',
      select: '选择'
    };
    return nameMap[type] || type;
  }

  /**
   * 获取工具实例（同步方法，仅返回已缓存的工具）
   */
  public getTool(type?: ToolType): DrawTool | null {
    const toolType = type || this.currentTool;
    
    // 如果是当前工具且已加载，直接返回
    if (toolType === this.currentTool && this.currentToolInstance) {
      return this.currentToolInstance;
    }
    
    // 否则返回null，需要通过异步方法获取
    return null;
  }

  /**
   * 获取当前工具实例
   */
  public getCurrentToolInstance(): DrawTool | null {
    return this.currentToolInstance;
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
   * 获取工具管理器统计信息
   */
  public getStats(): {
    currentTool: ToolType;
    availableTools: number;
    cachedTools: number;
    toolTypes: ToolType[];
  } {
    const factoryStats = this.toolFactory.getStats();
    return {
      currentTool: this.currentTool,
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
  public registerTool(type: ToolType, factory: () => DrawTool): void {
    this.toolFactory.register(type, factory);
    logger.info(`注册自定义工具: ${type}`);
  }

  /**
   * 销毁工具管理器
   */
  public destroy(): void {
    this.toolFactory.destroy();
    logger.debug('工具管理器已销毁');
  }
} 