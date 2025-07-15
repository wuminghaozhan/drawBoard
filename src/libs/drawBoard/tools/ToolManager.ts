import type { DrawTool } from './DrawTool';
import { logger } from '../utils/Logger';
import { PenTool } from './PenTool';
import { RectTool } from './RectTool';
import { CircleTool } from './CircleTool';
import { EraserTool } from './EraserTool';
import { TextTool } from './TextTool';
import { SelectTool } from './SelectTool';

export type ToolType = 'pen' | 'rect' | 'circle' | 'text' | 'eraser' | 'select';

type ToolFactory = () => DrawTool;

/**
 * 工具管理器 - 简化版本
 */
export class ToolManager {
  private tools: Map<ToolType, DrawTool> = new Map();
  private toolFactories: Map<ToolType, ToolFactory> = new Map();
  private currentTool: ToolType = 'pen';

  constructor() {
    this.registerToolFactories();
  }

  /**
   * 注册工具工厂
   */
  private registerToolFactories(): void {
    this.toolFactories.set('pen', () => new PenTool());
    this.toolFactories.set('rect', () => new RectTool());
    this.toolFactories.set('circle', () => new CircleTool());
    this.toolFactories.set('eraser', () => new EraserTool());
    this.toolFactories.set('text', () => new TextTool());
    this.toolFactories.set('select', () => new SelectTool());
  }

  /**
   * 获取当前工具实例
   */
  public getCurrentTool(): DrawTool | null {
    return this.getTool(this.currentTool);
  }

  /**
   * 获取指定类型的工具实例
   */
  public getTool(type: ToolType): DrawTool | null {
    let tool = this.tools.get(type);
    if (!tool) {
      tool = this.createTool(type);
    }
    
    return tool;
  }

  /**
   * 创建工具实例
   */
  private createTool(type: ToolType): DrawTool | null {
    try {
      const factory = this.toolFactories.get(type);
      if (!factory) {
        console.error('[TOOL DEBUG] 未找到工具工厂:', type);
        return null;
      }
      
      const tool = factory();
      
      if (tool) {
        this.tools.set(type, tool);
      } else {
        console.error('[TOOL DEBUG] 工具工厂返回null');
      }
      
      return tool;
    } catch (error) {
      console.error('[TOOL DEBUG] 创建工具失败:', error);
      return null;
    }
  }

  /**
   * 设置当前工具
   */
  public setCurrentTool(type: ToolType): void {
    this.currentTool = type;
  }

  /**
   * 获取当前工具类型
   */
  public getCurrentToolType(): ToolType {
    return this.currentTool;
  }

  /**
   * 获取工具名称列表
   */
  public getToolNames(): Array<{ type: ToolType; name: string }> {
    const names: Record<ToolType, string> = {
      pen: '画笔',
      rect: '矩形',
      circle: '圆形',
      text: '文字',
      eraser: '橡皮擦',
      select: '选择'
    };
    
    return Array.from(this.toolFactories.keys()).map(type => ({
      type,
      name: names[type] || type
    }));
  }
} 