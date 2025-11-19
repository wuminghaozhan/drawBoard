import type { DrawAction } from '../DrawTool';
import type { Point } from '../../core/CanvasEngine';
import type { Bounds } from '../anchor/AnchorTypes';
import { SpatialIndex } from '../../utils/SpatialIndex';
import { ConfigConstants } from '../../config/Constants';
import { logger } from '../../utils/Logger';
import { SafeExecutor } from '../../utils/SafeExecutor';

/**
 * 选择管理器
 * 负责选择逻辑的管理，包括点选和框选
 */
export class SelectionManager {
  private allActions: DrawAction[] = [];
  private selectedActions: DrawAction[] = [];
  private spatialIndex: SpatialIndex | null = null;
  private canvasWidth: number = 0;
  private canvasHeight: number = 0;
  
  // 空间索引阈值
  private readonly POINT_SELECT_THRESHOLD = ConfigConstants.SPATIAL_INDEX.POINT_SELECT_THRESHOLD;
  private readonly BOX_SELECT_THRESHOLD = ConfigConstants.SPATIAL_INDEX.BOX_SELECT_THRESHOLD;
  
  /**
   * 设置画布尺寸
   */
  public setCanvasSize(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;
    // 清空空间索引，需要重新构建
    this.clearSpatialIndex();
  }
  
  /**
   * 设置所有动作
   */
  public setAllActions(actions: DrawAction[]): void {
    this.allActions = actions;
    // 清空空间索引，需要重新构建
    this.clearSpatialIndex();
  }
  
  /**
   * 获取所有动作
   */
  public getAllActions(): DrawAction[] {
    return this.allActions;
  }
  
  /**
   * 获取选中的动作
   */
  public getSelectedActions(): DrawAction[] {
    return this.selectedActions;
  }
  
  /**
   * 设置选中的动作
   */
  public setSelectedActions(actions: DrawAction[]): void {
    this.selectedActions = actions;
  }
  
  /**
   * 点选动作
   * @param point 点击位置
   * @param tolerance 容差
   * @param isPointInAction 检查点是否在动作内的函数
   * @returns 选中的动作，如果没有则返回 null
   */
  public selectActionAtPoint(
    point: Point,
    tolerance: number,
    isPointInAction: (point: Point, action: DrawAction, tolerance: number) => boolean
  ): DrawAction | null {
    return SafeExecutor.execute(() => {
      // 如果动作数量超过阈值，使用空间索引
      if (this.allActions.length > this.POINT_SELECT_THRESHOLD) {
        return this.selectActionAtPointWithIndex(point, tolerance, isPointInAction);
      } else {
        return this.selectActionAtPointWithoutIndex(point, tolerance, isPointInAction);
      }
    }, null, '点选动作失败');
  }
  
  /**
   * 使用空间索引的点选
   */
  private selectActionAtPointWithIndex(
    point: Point,
    tolerance: number,
    isPointInAction: (point: Point, action: DrawAction, tolerance: number) => boolean
  ): DrawAction | null {
    // 构建空间索引（如果还没有）
    if (!this.spatialIndex) {
      this.buildSpatialIndex();
    }
    
    if (!this.spatialIndex) {
      // 如果构建失败，回退到不使用索引的方式
      return this.selectActionAtPointWithoutIndex(point, tolerance, isPointInAction);
    }
    
    // 查询候选动作
    const candidates = this.spatialIndex.queryPoint(point, tolerance);
    
    // 从后往前检查候选动作（后绘制的在上层）
    for (let i = candidates.length - 1; i >= 0; i--) {
      const action = candidates[i];
      if (isPointInAction(point, action, tolerance)) {
        return action;
      }
    }
    
    return null;
  }
  
  /**
   * 不使用空间索引的点选
   */
  private selectActionAtPointWithoutIndex(
    point: Point,
    tolerance: number,
    isPointInAction: (point: Point, action: DrawAction, tolerance: number) => boolean
  ): DrawAction | null {
    // 从后往前遍历（后绘制的在上层）
    const actionsSnapshot = [...this.allActions];
    for (let i = actionsSnapshot.length - 1; i >= 0; i--) {
      const action = actionsSnapshot[i];
      if (isPointInAction(point, action, tolerance)) {
        return action;
      }
    }
    
    return null;
  }
  
  /**
   * 框选动作
   * @param bounds 选择框边界
   * @param isActionInBounds 检查动作是否在边界内的函数
   * @returns 选中的动作数组
   */
  public selectActionsInBox(
    bounds: Bounds,
    isActionInBounds: (action: DrawAction, bounds: Bounds) => boolean
  ): DrawAction[] {
    return SafeExecutor.execute(() => {
      // 如果动作数量超过阈值，使用空间索引
      if (this.allActions.length > this.BOX_SELECT_THRESHOLD) {
        return this.selectActionsInBoxWithIndex(bounds, isActionInBounds);
      } else {
        return this.selectActionsInBoxWithoutIndex(bounds, isActionInBounds);
      }
    }, [], '框选动作失败');
  }
  
  /**
   * 使用空间索引的框选
   */
  private selectActionsInBoxWithIndex(
    bounds: Bounds,
    isActionInBounds: (action: DrawAction, bounds: Bounds) => boolean
  ): DrawAction[] {
    // 构建空间索引（如果还没有）
    if (!this.spatialIndex) {
      this.buildSpatialIndex();
    }
    
    if (!this.spatialIndex) {
      // 如果构建失败，回退到不使用索引的方式
      return this.selectActionsInBoxWithoutIndex(bounds, isActionInBounds);
    }
    
    // 查询候选动作
    const candidates = this.spatialIndex.queryBounds(bounds);
    
    // 检查候选动作是否在选择框内
    return candidates.filter(action => isActionInBounds(action, bounds));
  }
  
  /**
   * 不使用空间索引的框选
   */
  private selectActionsInBoxWithoutIndex(
    bounds: Bounds,
    isActionInBounds: (action: DrawAction, bounds: Bounds) => boolean
  ): DrawAction[] {
    return this.allActions.filter(action => isActionInBounds(action, bounds));
  }
  
  /**
   * 构建空间索引
   */
  private buildSpatialIndex(): void {
    if (this.canvasWidth === 0 || this.canvasHeight === 0) {
      logger.warn('SelectionManager: 画布尺寸为0，无法构建空间索引');
      return;
    }
    
    try {
      if (!this.spatialIndex) {
        this.spatialIndex = new SpatialIndex(this.canvasWidth, this.canvasHeight);
      }
      
      // 获取动作边界框的函数
      const getBounds = (action: DrawAction) => {
        if (action.points.length === 0) {
          return null;
        }
        const xs = action.points.map(p => p.x);
        const ys = action.points.map(p => p.y);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const maxX = Math.max(...xs);
        const maxY = Math.max(...ys);
        return {
          x: minX,
          y: minY,
          width: maxX - minX || 10,
          height: maxY - minY || 10
        };
      };
      
      this.spatialIndex.buildIndex(this.allActions, getBounds);
    } catch (error) {
      logger.error('SelectionManager: 构建空间索引失败', error);
      this.spatialIndex = null;
    }
  }
  
  /**
   * 清空空间索引
   */
  public clearSpatialIndex(): void {
    if (this.spatialIndex) {
      this.spatialIndex.clear();
      this.spatialIndex = null;
    }
  }
  
  /**
   * 清空选择
   */
  public clearSelection(): void {
    this.selectedActions = [];
  }
  
  /**
   * 添加选中动作
   */
  public addSelectedAction(action: DrawAction): void {
    if (!this.selectedActions.find(a => a.id === action.id)) {
      this.selectedActions.push(action);
    }
  }
  
  /**
   * 移除选中动作
   */
  public removeSelectedAction(actionId: string): void {
    this.selectedActions = this.selectedActions.filter(a => a.id !== actionId);
  }
  
  /**
   * 检查动作是否被选中
   */
  public isActionSelected(actionId: string): boolean {
    return this.selectedActions.some(a => a.id === actionId);
  }
}

