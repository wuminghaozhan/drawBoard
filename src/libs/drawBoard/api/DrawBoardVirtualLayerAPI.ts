import type { VirtualLayer, VirtualLayerMode, VirtualLayerConfig } from '../core/VirtualLayerManager';
import type { VirtualLayerManager } from '../core/VirtualLayerManager';
import type { DrawingHandler } from '../handlers/DrawingHandler';
import type { ToolManager } from '../tools/ToolManager';
import type { CanvasEngine } from '../core/CanvasEngine';
import { logger } from '../infrastructure/logging/Logger';
import type { VirtualLayerAPIConfig } from './APIConfig';

/**
 * DrawBoard 虚拟图层 API
 * 
 * 封装所有虚拟图层相关的操作，包括：
 * - 虚拟图层的 CRUD 操作
 * - 图层属性管理（可见性、透明度、锁定等）
 * - 图层顺序管理
 * - 图层配置管理
 * 
 * 通过组合模式，将虚拟图层相关的逻辑从 DrawBoard 主类中分离出来
 */
export class DrawBoardVirtualLayerAPI {
  private virtualLayerManager: VirtualLayerManager;
  private drawingHandler: DrawingHandler;
  private toolManager: ToolManager;
  private canvasEngine: CanvasEngine;
  private config: VirtualLayerAPIConfig;

  constructor(
    virtualLayerManager: VirtualLayerManager,
    drawingHandler: DrawingHandler,
    toolManager: ToolManager,
    canvasEngine: CanvasEngine,
    config: VirtualLayerAPIConfig
  ) {
    this.virtualLayerManager = virtualLayerManager;
    this.drawingHandler = drawingHandler;
    this.toolManager = toolManager;
    this.canvasEngine = canvasEngine;
    this.config = config;
  }

  /**
   * 创建虚拟图层
   */
  public createVirtualLayer(name?: string): VirtualLayer {
    return this.virtualLayerManager.createVirtualLayer(name);
  }

  /**
   * 删除虚拟图层
   */
  public deleteVirtualLayer(layerId: string): boolean {
    return this.virtualLayerManager.deleteVirtualLayer(layerId);
  }

  /**
   * 设置活动虚拟图层
   */
  public setActiveVirtualLayer(layerId: string): boolean {
    const success = this.virtualLayerManager.setActiveVirtualLayer(layerId);
    
    // 如果当前是选择工具，同步新图层的数据
    // 注意：在individual模式下，需要保留选择，所以传入preserveSelection=true
    if (success && this.toolManager.getCurrentTool() === 'select') {
      const mode = this.virtualLayerManager.getMode();
      const preserveSelection = mode === 'individual';
      this.config.syncLayerDataToSelectTool(preserveSelection);
    }
    
    return success;
  }

  /**
   * 获取活动虚拟图层
   */
  public getActiveVirtualLayer(): VirtualLayer | null {
    return this.virtualLayerManager.getActiveVirtualLayer();
  }

  /**
   * 获取指定虚拟图层
   */
  public getVirtualLayer(layerId: string): VirtualLayer | null {
    return this.virtualLayerManager.getVirtualLayer(layerId);
  }

  /**
   * 获取所有虚拟图层
   */
  public getAllVirtualLayers(): VirtualLayer[] {
    return this.virtualLayerManager.getAllVirtualLayers();
  }

  /**
   * 智能重绘图层（根据图层位置选择最优重绘策略）
   * @param layerId 变化的图层ID
   */
  private async redrawLayerAfterChange(layerId: string): Promise<void> {
    // 如果draw层未拆分，使用全量重绘
    if (!this.canvasEngine.isDrawLayerSplit() || !this.virtualLayerManager) {
      await this.drawingHandler.forceRedraw();
      return;
    }
    
    const changedLayer = this.virtualLayerManager.getVirtualLayer(layerId);
    const activeLayer = this.virtualLayerManager.getActiveVirtualLayer();
    
    // 无法确定图层位置，使用全量重绘
    if (!changedLayer || !activeLayer) {
      await this.drawingHandler.forceRedraw();
      return;
    }
    
    const selectedZIndex = activeLayer.zIndex;
    const changedZIndex = changedLayer.zIndex;
    
    try {
      if (changedZIndex === selectedZIndex) {
        // 变化的图层是选中图层，只重绘selected层
        await this.drawingHandler.forceRedraw();
      } else if (changedZIndex < selectedZIndex) {
        // 变化的图层在下层，只重绘bottom层
        await this.drawingHandler.redrawBottomLayers(selectedZIndex);
      } else {
        // 变化的图层在上层，只重绘top层
        await this.drawingHandler.redrawTopLayers(selectedZIndex);
      }
    } catch (error) {
      logger.error('重绘图层失败，降级为全量重绘', { layerId, error });
      await this.drawingHandler.forceRedraw();
    }
  }

  /**
   * 设置虚拟图层可见性
   */
  public async setVirtualLayerVisible(layerId: string, visible: boolean): Promise<boolean> {
    const success = this.virtualLayerManager.setVirtualLayerVisible(layerId, visible);
    
    if (!success) return false;
    
    // 如果当前是选择工具，同步图层数据
    if (this.toolManager.getCurrentTool() === 'select') {
      this.config.syncLayerDataToSelectTool();
    }
    
    // 智能重绘图层
    await this.redrawLayerAfterChange(layerId);
    
    return success;
  }

  /**
   * 设置虚拟图层透明度
   * @param layerId 图层ID
   * @param opacity 透明度 (0-1)
   */
  public async setVirtualLayerOpacity(layerId: string, opacity: number): Promise<boolean> {
    // 参数验证
    if (opacity < 0 || opacity > 1) {
      logger.warn('透明度值无效，应在 0-1 之间', { layerId, opacity });
      return false;
    }
    
    const success = this.virtualLayerManager.setVirtualLayerOpacity(layerId, opacity);
    
    if (!success) return false;
    
    // 智能重绘图层
    await this.redrawLayerAfterChange(layerId);
    
    return success;
  }

  /**
   * 设置虚拟图层锁定状态
   */
  public setVirtualLayerLocked(layerId: string, locked: boolean): boolean {
    return this.virtualLayerManager.setVirtualLayerLocked(layerId, locked);
  }

  /**
   * 重命名虚拟图层
   */
  public renameVirtualLayer(layerId: string, newName: string): boolean {
    return this.virtualLayerManager.renameVirtualLayer(layerId, newName);
  }

  /**
   * 获取虚拟图层统计信息
   */
  public getVirtualLayerStats() {
    return this.virtualLayerManager.getVirtualLayerStats();
  }

  /**
   * 获取当前虚拟图层模式
   */
  public getVirtualLayerMode(): VirtualLayerMode {
    return this.virtualLayerManager.getMode();
  }

  /**
   * 设置虚拟图层模式
   */
  public setVirtualLayerMode(mode: VirtualLayerMode): void {
    this.virtualLayerManager.setMode(mode);
  }

  /**
   * 获取虚拟图层配置
   */
  public getVirtualLayerConfig() {
    return this.virtualLayerManager.getConfig();
  }

  /**
   * 更新虚拟图层配置
   */
  public updateVirtualLayerConfig(config: Partial<VirtualLayerConfig>): void {
    this.virtualLayerManager.updateConfig(config);
  }

  // ============================================
  // 图层顺序管理
  // ============================================

  /**
   * 调整图层顺序（移动到指定位置）
   * @param layerId - 要移动的图层ID
   * @param newIndex - 新的位置索引（0为最底层）
   * @returns 是否成功
   */
  public reorderVirtualLayer(layerId: string, newIndex: number): boolean {
    const success = this.virtualLayerManager.reorderLayer(layerId, newIndex);
    if (success) {
      // 【修复】添加错误处理，防止未捕获的 Promise rejection
      this.drawingHandler.forceRedraw().catch(error => {
        logger.error('reorderVirtualLayer: 重绘失败', error);
      });
    }
    return success;
  }

  /**
   * 将图层移到最上层
   */
  public moveVirtualLayerToTop(layerId: string): boolean {
    const success = this.virtualLayerManager.moveLayerToTop(layerId);
    if (success) {
      this.drawingHandler.forceRedraw().catch(error => {
        logger.error('moveVirtualLayerToTop: 重绘失败', error);
      });
    }
    return success;
  }

  /**
   * 将图层移到最下层
   */
  public moveVirtualLayerToBottom(layerId: string): boolean {
    const success = this.virtualLayerManager.moveLayerToBottom(layerId);
    if (success) {
      this.drawingHandler.forceRedraw().catch(error => {
        logger.error('moveVirtualLayerToBottom: 重绘失败', error);
      });
    }
    return success;
  }

  /**
   * 将图层上移一层
   */
  public moveVirtualLayerUp(layerId: string): boolean {
    const success = this.virtualLayerManager.moveLayerUp(layerId);
    if (success) {
      this.drawingHandler.forceRedraw().catch(error => {
        logger.error('moveVirtualLayerUp: 重绘失败', error);
      });
    }
    return success;
  }

  /**
   * 将图层下移一层
   */
  public moveVirtualLayerDown(layerId: string): boolean {
    const success = this.virtualLayerManager.moveLayerDown(layerId);
    if (success) {
      this.drawingHandler.forceRedraw().catch(error => {
        logger.error('moveVirtualLayerDown: 重绘失败', error);
      });
    }
    return success;
  }
}

