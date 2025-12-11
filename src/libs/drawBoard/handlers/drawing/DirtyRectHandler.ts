/**
 * 脏矩形处理器
 * 
 * 负责管理脏矩形标记和局部重绘优化
 */

import { logger } from '../../infrastructure/logging/Logger';
import { DirtyRectManager, type DirtyRectConfig } from '../../infrastructure/performance/DirtyRectManager';
import type { DrawAction } from '../../tools/DrawTool';
import type { Bounds } from '../../utils/BoundsValidator';

/**
 * 脏矩形处理器配置
 */
export interface DirtyRectHandlerConfig extends Partial<DirtyRectConfig> {
  /** 是否启用脏矩形优化 */
  enabled: boolean;
}

/**
 * 重绘回调类型
 */
export type RedrawCallback = (
  ctx: CanvasRenderingContext2D, 
  clipRect: Bounds
) => Promise<void>;

/**
 * 脏矩形处理器
 */
export class DirtyRectHandler {
  private dirtyRectManager: DirtyRectManager | null = null;
  private lastActionBounds: Map<string, Bounds> = new Map();
  private config: DirtyRectHandlerConfig;

  constructor(
    canvasWidth: number,
    canvasHeight: number,
    config: Partial<DirtyRectHandlerConfig> = {}
  ) {
    this.config = {
      enabled: true,
      mergeThreshold: 30,
      maxDirtyRects: 40,
      padding: 4,
      fullRedrawThreshold: 0.4,
      ...config
    };

    if (this.config.enabled) {
      this.dirtyRectManager = new DirtyRectManager(
        canvasWidth,
        canvasHeight,
        this.config
      );
    }
  }

  /**
   * 检查是否启用
   */
  public isEnabled(): boolean {
    return this.config.enabled && this.dirtyRectManager !== null;
  }

  /**
   * 标记动作为脏
   */
  public markActionDirty(action: DrawAction): void {
    if (!this.dirtyRectManager) return;
    
    const bounds = this.calculateActionBounds(action);
    if (bounds) {
      const oldBounds = this.lastActionBounds.get(action.id);
      if (oldBounds) {
        this.dirtyRectManager.markDirtyFromMove(oldBounds, bounds);
      } else {
        this.dirtyRectManager.markDirty(bounds);
      }
      
      this.lastActionBounds.set(action.id, bounds);
    }
  }

  /**
   * 标记多个动作为脏
   */
  public markActionsDirty(actions: DrawAction[]): void {
    for (const action of actions) {
      this.markActionDirty(action);
    }
  }

  /**
   * 标记区域为脏
   */
  public markBoundsDirty(bounds: Bounds): void {
    if (!this.dirtyRectManager) return;
    this.dirtyRectManager.markDirty(bounds);
  }

  /**
   * 强制全量重绘
   */
  public markFullRedraw(): void {
    if (!this.dirtyRectManager) return;
    this.dirtyRectManager.markFullRedraw();
  }

  /**
   * 检查是否有脏区域
   */
  public hasDirtyRects(): boolean {
    return this.dirtyRectManager?.hasDirtyRects() ?? false;
  }

  /**
   * 检查是否需要全量重绘
   */
  public needsFullRedraw(): boolean {
    return this.dirtyRectManager?.needsFullRedraw() ?? true;
  }

  /**
   * 使用脏矩形进行局部重绘
   */
  public async redrawDirtyRects(
    ctx: CanvasRenderingContext2D,
    callback: RedrawCallback
  ): Promise<boolean> {
    if (!this.dirtyRectManager || !this.dirtyRectManager.hasDirtyRects()) {
      return false;
    }

    if (this.dirtyRectManager.needsFullRedraw()) {
      logger.debug('脏区域过大，使用全量重绘');
      this.dirtyRectManager.clear();
      return false;
    }

    try {
      await this.dirtyRectManager.clipAndRedraw(ctx, callback);
      
      const stats = this.dirtyRectManager.getStats();
      logger.debug('脏矩形局部重绘完成', {
        dirtyRectCount: stats.mergedRectCount,
        dirtyRatio: `${(stats.dirtyRatio * 100).toFixed(1)}%`
      });

      this.dirtyRectManager.clear();
      return true;
    } catch (error) {
      logger.error('脏矩形重绘失败', error);
      this.dirtyRectManager.clear();
      return false;
    }
  }

  /**
   * 清除脏矩形标记
   */
  public clear(): void {
    this.dirtyRectManager?.clear();
  }

  /**
   * 更新画布尺寸
   */
  public updateCanvasSize(width: number, height: number): void {
    this.dirtyRectManager?.updateCanvasSize(width, height);
  }

  /**
   * 获取统计信息
   */
  public getStats() {
    return this.dirtyRectManager?.getStats() ?? null;
  }

  /**
   * 计算动作边界
   */
  public calculateActionBounds(action: DrawAction): Bounds | null {
    if (!action.points || action.points.length === 0) {
      return null;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const point of action.points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }

    const lineWidth = action.context?.lineWidth ?? 2;
    const halfWidth = lineWidth / 2;

    return {
      x: minX - halfWidth,
      y: minY - halfWidth,
      width: maxX - minX + lineWidth,
      height: maxY - minY + lineWidth
    };
  }

  /**
   * 检查两个矩形是否相交
   */
  public rectsIntersect(a: Bounds, b: Bounds): boolean {
    return !(
      a.x + a.width < b.x ||
      b.x + b.width < a.x ||
      a.y + a.height < b.y ||
      b.y + b.height < a.y
    );
  }

  /**
   * 清除边界缓存
   */
  public clearBoundsCache(): void {
    this.lastActionBounds.clear();
  }

  // ============================================
  // 调试功能
  // ============================================

  /**
   * 启用/禁用调试模式
   */
  public setDebugEnabled(enabled: boolean): void {
    this.dirtyRectManager?.setDebugEnabled(enabled);
  }

  /**
   * 检查调试模式是否启用
   */
  public isDebugEnabled(): boolean {
    return this.dirtyRectManager?.isDebugEnabled() ?? false;
  }

  /**
   * 绘制调试覆盖层
   */
  public drawDebugOverlay(ctx: CanvasRenderingContext2D): void {
    this.dirtyRectManager?.drawDebugOverlay(ctx, {
      showOriginalRects: true,
      showMergedRects: true,
      showStats: true,
      showLabels: true
    });
  }

  /**
   * 获取调试控制器
   */
  public getDebugController() {
    return this.dirtyRectManager?.createDebugController() ?? null;
  }
}

