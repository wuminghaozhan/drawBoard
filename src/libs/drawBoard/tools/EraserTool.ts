import { DrawTool } from './DrawTool';
import type { DrawAction } from './DrawTool';
import type { Point } from '../core/CanvasEngine';
import { logger } from '../infrastructure/logging/Logger';
import { PathSplitter } from './eraser/PathSplitter';
import type { SplitResult } from './eraser/PathSplitter';

/**
 * 橡皮擦擦除模式
 * - composite: 复合模式，使用 destination-out 混合模式擦除
 * - split: 分割模式，将画笔路径分割成多个 action
 */
export type EraserMode = 'composite' | 'split';

/**
 * 橡皮擦作用域
 */
export type EraserScope = 'current-layer' | 'visible-layers' | 'all-layers';

/**
 * 橡皮擦分割结果事件
 */
export interface EraserSplitEvent {
  /** 原始被分割的 Action IDs */
  removedActionIds: string[];
  /** 新创建的分割后 Actions */
  newActions: DrawAction[];
}

/**
 * 橡皮擦 Action 扩展接口
 */
export interface EraserAction extends DrawAction {
  type: 'eraser';
  /** 擦除模式：composite = 复合模式（推荐），layer = 仅当前图层 */
  eraserMode?: EraserMode;
  /** 作用域：决定橡皮擦影响哪些图层 */
  eraserScope?: EraserScope;
  /** 目标图层 ID（仅在 eraserScope = 'current-layer' 时有效） */
  targetLayerId?: string;
}

/**
 * 橡皮擦工具配置
 */
export interface EraserToolConfig {
  /** 默认擦除模式：split = 分割模式（只对画笔有效），composite = 复合模式 */
  defaultMode: EraserMode;
  /** 默认作用域 */
  defaultScope: EraserScope;
  /** 是否显示预览圈 */
  showPreview: boolean;
  /** 预览圈颜色 */
  previewColor: string;
  /** 只对画笔工具起作用（分割模式时） */
  penOnly: boolean;
}

const DEFAULT_CONFIG: EraserToolConfig = {
  defaultMode: 'split',      // 默认使用分割模式
  defaultScope: 'current-layer',
  showPreview: true,
  previewColor: 'rgba(255, 0, 0, 0.3)',
  penOnly: true              // 只对画笔起作用
};

export class EraserTool extends DrawTool {
  private config: EraserToolConfig;
  private currentLayerId: string | null = null;
  private pathSplitter: PathSplitter;
  private splitEventHandlers: ((event: EraserSplitEvent) => void)[] = [];
  
  constructor(config: Partial<EraserToolConfig> = {}) {
    super('橡皮擦', 'eraser');
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.pathSplitter = new PathSplitter();
  }
  
  /**
   * 订阅分割事件
   */
  public onSplit(handler: (event: EraserSplitEvent) => void): () => void {
    this.splitEventHandlers.push(handler);
    return () => {
      const index = this.splitEventHandlers.indexOf(handler);
      if (index > -1) {
        this.splitEventHandlers.splice(index, 1);
      }
    };
  }
  
  /**
   * 触发分割事件
   */
  private emitSplitEvent(event: EraserSplitEvent): void {
    for (const handler of this.splitEventHandlers) {
      try {
        handler(event);
      } catch (error) {
        logger.error('分割事件处理失败', error);
      }
    }
  }
  
  /**
   * 处理擦除操作（分割模式）
   * 
   * @param eraserPoints 橡皮擦路径点
   * @param targetActions 目标图层中的所有 actions
   * @param eraserRadius 橡皮擦半径
   * @returns 分割结果
   */
  public processErase(
    eraserPoints: Point[],
    targetActions: DrawAction[],
    eraserRadius?: number
  ): EraserSplitEvent | null {
    if (this.config.defaultMode !== 'split') {
      logger.debug('非分割模式，跳过分割处理');
      return null;
    }
    
    if (eraserPoints.length < 2) {
      return null;
    }
    
    // 设置橡皮擦半径
    if (eraserRadius !== undefined) {
      this.pathSplitter.setEraserRadius(eraserRadius);
    }
    
    // 只处理画笔 actions
    const penActions = this.config.penOnly
      ? targetActions.filter(a => a.type === 'pen')
      : targetActions;
    
    if (penActions.length === 0) {
      logger.debug('没有可处理的画笔 action');
      return null;
    }
    
    // 批量处理
    const result = this.pathSplitter.splitMultiplePenActions(penActions, eraserPoints);
    
    const removedActionIds: string[] = [...result.removed];
    const newActions: DrawAction[] = [];
    
    // 收集分割结果
    for (const [originalId, splitActions] of result.splitResults) {
      removedActionIds.push(originalId);
      newActions.push(...splitActions);
    }
    
    if (removedActionIds.length === 0) {
      logger.debug('没有 action 被分割');
      return null;
    }
    
    const event: EraserSplitEvent = {
      removedActionIds,
      newActions
    };
    
    logger.info('橡皮擦分割完成', {
      removedCount: removedActionIds.length,
      newActionsCount: newActions.length
    });
    
    // 触发事件
    this.emitSplitEvent(event);
    
    return event;
  }

  /**
   * 设置当前作用图层
   */
  public setCurrentLayerId(layerId: string | null): void {
    this.currentLayerId = layerId;
    logger.debug('橡皮擦目标图层设置', { layerId });
  }

  /**
   * 获取当前作用图层
   */
  public getCurrentLayerId(): string | null {
    return this.currentLayerId;
  }

  /**
   * 更新配置
   */
  public updateConfig(config: Partial<EraserToolConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 创建橡皮擦 Action
   */
  public createEraserAction(baseAction: DrawAction): EraserAction {
    return {
      ...baseAction,
      type: 'eraser',
      eraserMode: this.config.defaultMode,
      eraserScope: this.config.defaultScope,
      targetLayerId: this.currentLayerId || baseAction.virtualLayerId || undefined
    };
  }

  public draw(ctx: CanvasRenderingContext2D, action: DrawAction): void {
    if (action.points.length < 2) return;

    const eraserAction = action as EraserAction;
    const originalContext = this.saveContext(ctx);
    
    // 设置复杂度评分和缓存支持
    if (!action.complexityScore) {
      action.complexityScore = this.calculateComplexity(action);
    }
    if (action.supportsCaching === undefined) {
      action.supportsCaching = false; // 橡皮擦不需要缓存
    }
    
    // 设置橡皮擦模式 - 使用 destination-out 实现擦除效果
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.lineWidth = action.context.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 绘制橡皮擦路径
    this.drawPath(ctx, action.points);

    this.restoreContext(ctx, originalContext);
    
    logger.debug('橡皮擦绘制', {
      actionId: action.id,
      pointsCount: action.points.length,
      lineWidth: action.context.lineWidth,
      eraserMode: eraserAction.eraserMode,
      targetLayerId: eraserAction.targetLayerId
    });
  }

  /**
   * 绘制橡皮擦预览（鼠标悬停时显示擦除范围）
   * 
   * @param ctx Canvas 上下文
   * @param x 鼠标 X 坐标
   * @param y 鼠标 Y 坐标
   * @param size 橡皮擦直径
   * @param isActive 是否正在擦除（影响预览样式）
   */
  public drawPreview(
    ctx: CanvasRenderingContext2D, 
    x: number, 
    y: number, 
    size: number,
    isActive: boolean = false
  ): void {
    if (!this.config.showPreview) return;
    
    const radius = size / 2;
    
    ctx.save();
    
    // 外圈
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = isActive ? 'rgba(255, 100, 100, 0.8)' : this.config.previewColor;
    ctx.lineWidth = isActive ? 3 : 2;
    ctx.setLineDash(isActive ? [] : [4, 4]);
    ctx.stroke();
    
    // 内部填充（半透明）
    if (isActive) {
      ctx.fillStyle = 'rgba(255, 100, 100, 0.15)';
      ctx.fill();
    }
    
    // 十字准心
    const crossSize = Math.min(6, radius * 0.4);
    ctx.beginPath();
    ctx.moveTo(x - crossSize, y);
    ctx.lineTo(x + crossSize, y);
    ctx.moveTo(x, y - crossSize);
    ctx.lineTo(x, y + crossSize);
    ctx.strokeStyle = isActive ? 'rgba(255, 100, 100, 0.9)' : 'rgba(255, 0, 0, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.stroke();
    
    ctx.restore();
  }
  
  /**
   * 获取预览配置
   */
  public getPreviewConfig(): {
    showPreview: boolean;
    previewColor: string;
  } {
    return {
      showPreview: this.config.showPreview,
      previewColor: this.config.previewColor
    };
  }
  
  /**
   * 设置预览显示
   */
  public setShowPreview(show: boolean): void {
    this.config.showPreview = show;
  }
  
  /**
   * 设置预览颜色
   */
  public setPreviewColor(color: string): void {
    this.config.previewColor = color;
  }

  private drawPath(ctx: CanvasRenderingContext2D, points: Point[]): void {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }

    ctx.stroke();
  }

  public getActionType(): string {
    return 'eraser';
  }

  /**
   * 检查是否为橡皮擦 Action
   */
  public static isEraserAction(action: DrawAction): action is EraserAction {
    return action.type === 'eraser';
  }

  /**
   * 检查橡皮擦是否应该作用于指定图层
   */
  public static shouldAffectLayer(
    eraserAction: EraserAction, 
    layerId: string,
    visibleLayerIds?: string[]
  ): boolean {
    const scope = eraserAction.eraserScope || 'current-layer';
    
    switch (scope) {
      case 'current-layer':
        return eraserAction.targetLayerId === layerId;
      case 'visible-layers':
        return visibleLayerIds?.includes(layerId) ?? true;
      case 'all-layers':
        return true;
      default:
        return eraserAction.targetLayerId === layerId;
    }
  }

  /**
   * 计算橡皮擦工具的复杂度评分
   */
  private calculateComplexity(action: DrawAction): number {
    // 基于点数和线宽计算复杂度
    const pointsComplexity = Math.min(action.points.length / 10, 5);
    const lineWidthComplexity = action.context.lineWidth * 0.3;
    return Math.round(pointsComplexity + lineWidthComplexity + 2);
  }
} 