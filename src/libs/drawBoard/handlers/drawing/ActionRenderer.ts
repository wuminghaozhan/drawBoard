/**
 * Action 渲染器
 * 
 * 负责绘制单个和批量 DrawAction 到 Canvas 上下文
 */

import { logger } from '../../infrastructure/logging/Logger';
import type { DrawAction } from '../../tools/DrawTool';
import type { ToolManager } from '../../tools/ToolManager';
import type { VirtualLayerManager, VirtualLayer } from '../../core/VirtualLayerManager';

import type { ToolType } from '../../tools/DrawTool';

/**
 * Action 渲染器配置
 */
export interface ActionRendererConfig {
  /** 是否启用错误恢复 */
  enableErrorRecovery: boolean;
  /** 默认恢复工具类型 */
  fallbackToolType: ToolType;
}

/**
 * Action 渲染器
 */
export class ActionRenderer {
  private toolManager: ToolManager;
  private virtualLayerManager?: VirtualLayerManager;
  private config: ActionRendererConfig;
  
  /** 已缓存的动作 ID 集合 */
  private cachedActionIds: Set<string> = new Set();

  constructor(
    toolManager: ToolManager,
    virtualLayerManager?: VirtualLayerManager,
    config: Partial<ActionRendererConfig> = {}
  ) {
    this.toolManager = toolManager;
    this.virtualLayerManager = virtualLayerManager;
    this.config = {
      enableErrorRecovery: true,
      fallbackToolType: 'pen' as ToolType,
      ...config
    };
  }

  /**
   * 设置虚拟图层管理器
   */
  public setVirtualLayerManager(manager: VirtualLayerManager): void {
    this.virtualLayerManager = manager;
  }

  /**
   * 绘制单个 Action
   */
  public async drawAction(ctx: CanvasRenderingContext2D, action: DrawAction): Promise<void> {
    try {
      const tool = await this.toolManager.getTool(action.type);
      if (!tool) {
        logger.error(`无法获取工具实例: ${action.type}`);
        return;
      }
      
      if (tool.draw) {
        tool.draw(ctx, action);
      } else {
        logger.warn(`工具 ${action.type} 缺少 draw 方法`);
      }
    } catch (error) {
      logger.error(`绘制动作失败，工具类型: ${action.type}`, error);
      
      if (this.config.enableErrorRecovery) {
        await this.fallbackDrawAction(ctx, action);
      }
    }
  }

  /**
   * 错误恢复：使用默认工具绘制
   */
  private async fallbackDrawAction(ctx: CanvasRenderingContext2D, action: DrawAction): Promise<void> {
    try {
      logger.info(`尝试使用默认工具恢复绘制: ${action.type}`);
      
      const fallbackTool = await this.toolManager.getTool(this.config.fallbackToolType);
      if (fallbackTool && fallbackTool.draw) {
        fallbackTool.draw(ctx, action);
        logger.info('错误恢复绘制成功');
      }
    } catch (error) {
      logger.error('错误恢复绘制失败', error);
    }
  }

  /**
   * 批量绘制 Actions
   */
  public async drawActions(ctx: CanvasRenderingContext2D, actions: DrawAction[]): Promise<void> {
    for (const action of actions) {
      await this.drawAction(ctx, action);
    }
  }

  /**
   * 按虚拟图层分组绘制 Actions
   */
  public async drawActionsByVirtualLayers(
    ctx: CanvasRenderingContext2D,
    actions: DrawAction[]
  ): Promise<void> {
    if (!this.virtualLayerManager) {
      // 没有虚拟图层管理器，直接按顺序绘制
      await this.drawActions(ctx, actions);
      return;
    }

    const allLayers = this.virtualLayerManager.getAllVirtualLayers();
    
    // 按图层 zIndex 排序
    const sortedLayers = [...allLayers].sort((a, b) => a.zIndex - b.zIndex);
    
    for (const layer of sortedLayers) {
      if (!layer.visible) continue;
      
      // 获取属于该图层的动作
      const layerActions = actions.filter(action => 
        action.virtualLayerId === layer.id
      );
      
      if (layerActions.length === 0) continue;
      
      // 设置图层透明度
      const originalAlpha = ctx.globalAlpha;
      ctx.globalAlpha = layer.opacity;
      
      // 绘制该图层的所有动作
      for (const action of layerActions) {
        await this.drawAction(ctx, action);
      }
      
      // 恢复透明度
      ctx.globalAlpha = originalAlpha;
    }
    
    // 绘制没有指定图层的动作（兼容旧数据）
    const orphanActions = actions.filter(action => !action.virtualLayerId);
    if (orphanActions.length > 0) {
      for (const action of orphanActions) {
        await this.drawAction(ctx, action);
      }
    }
  }

  /**
   * 更新已缓存的动作 ID
   */
  public updateCachedActions(actions: DrawAction[]): void {
    this.cachedActionIds.clear();
    for (const action of actions) {
      this.cachedActionIds.add(action.id);
    }
  }

  /**
   * 检查动作是否已缓存
   */
  public isActionCached(actionId: string): boolean {
    return this.cachedActionIds.has(actionId);
  }

  /**
   * 获取缓存的动作数量
   */
  public getCachedCount(): number {
    return this.cachedActionIds.size;
  }

  /**
   * 清除缓存
   */
  public clearCache(): void {
    this.cachedActionIds.clear();
  }

  /**
   * 更新配置
   */
  public updateConfig(config: Partial<ActionRendererConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

