import { DrawTool, type DrawAction } from './DrawTool';
import { TransformToolRefactored } from './TransformToolRefactored';
import type { ControlPoint } from './transform/TransformTypes';
import type { Point, CanvasEngine } from '../core/CanvasEngine';
import { logger } from '../infrastructure/logging/Logger';
import type { AnchorPoint, AnchorType, Bounds, ShapeAnchorHandler } from './anchor/AnchorTypes';
import { CircleAnchorHandler } from './anchor/CircleAnchorHandler';
import { RectAnchorHandler } from './anchor/RectAnchorHandler';
import { TextAnchorHandler } from './anchor/TextAnchorHandler';
import { LineAnchorHandler } from './anchor/LineAnchorHandler';
import { PenAnchorHandler } from './anchor/PenAnchorHandler';
import { PolygonAnchorHandler } from './anchor/PolygonAnchorHandler';
import { BoundsValidator, type Bounds as BoundsType } from '../utils/BoundsValidator';
import { SpatialIndex } from '../infrastructure/performance/SpatialIndex';
// 模块化拆分后的子模块
import { 
  HitTestManager, 
  BoxSelectionManager, 
  SelectionRenderer,
  AnchorCacheManager,
  DragStateManager,
  BoundsCacheManager,
  TransformOperations,
  AnchorGenerator,
  BoundsCalculator,
  AnchorDragHandler
} from './select';

/**
 * 选择动作接口
 * 继承自DrawAction，添加选择相关的属性
 */
export interface SelectAction extends DrawAction {
  /** 选中的动作ID列表 */
  selectedActionIds?: string[];
  /** 选中的动作列表 */
  selectedActions?: DrawAction[];
  /** 选择框的边界 */
  selectionBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** 选择模式 */
  selectionMode?: 'single' | 'multiple' | 'box';
}

// 现代化选择框样式配置
interface SelectionBoxStyle {
  strokeColor: string;
  strokeWidth: number;
  strokeDashArray: number[];
  fillColor: string;
  fillOpacity: number;
  cornerRadius: number;
  animationSpeed: number;
}

const modernSelectionStyle: SelectionBoxStyle = {
  strokeColor: '#007AFF',
  strokeWidth: 2,
  strokeDashArray: [8, 4],
  fillColor: '#007AFF',
  fillOpacity: 0.08,
  cornerRadius: 4,
  animationSpeed: 500
};

export class SelectTool extends DrawTool {
  private animationOffset: number = 0;
  private lastAnimationTime: number = 0;
  
  // 变换功能
  private transformTool: TransformToolRefactored;
  private isTransformMode: boolean = false;
  private selectedActionForTransform: DrawAction | null = null;
  private isDragging: boolean = false;
  private currentHoverControlPoint: ControlPoint | null = null;
  private dragStartPoint: Point | null = null;

  // 选择功能增强
  private allActions: DrawAction[] = []; // 当前图层的所有actions
  private selectedActions: DrawAction[] = []; // 当前选中的actions
  private isSelecting: boolean = false; // 是否正在选择
  private selectionStartPoint: Point | null = null; // 选择开始点
  private currentSelectionBounds: { x: number; y: number; width: number; height: number } | null = null;

  // 锚点系统：区分变形锚点和移动区域
  // 锚点数组：包含边锚点和中心点
  private anchorPoints: AnchorPoint[] = [];
  // 中心点锚点（单独存储，便于快速访问）
  private centerAnchorPoint: AnchorPoint | null = null;
  // 移动区域：选区内部区域，用于移动整个选区
  private moveArea: { x: number; y: number; width: number; height: number } | null = null;
  
  // 拖拽状态
  private isDraggingResizeAnchor: boolean = false; // 是否正在拖拽变形锚点
  private draggedAnchorIndex: number = -1; // 正在拖拽的锚点索引
  private isDraggingMove: boolean = false; // 是否正在移动选区
  private isDraggingCenter: boolean = false; // 是否正在拖拽中心点
  
  // 图形处理器映射
  private shapeHandlers: Map<string, ShapeAnchorHandler> = new Map();
  
  private anchorSize: number = 8; // 锚点大小
  private anchorTolerance: number = 6; // 锚点点击容差

  // 拖拽敏感度配置（可配置）
  private dragConfig: {
    sensitivity: number;              // 拖拽敏感度（0-1，默认0.7）
    minDragDistance: number;          // 最小拖拽距离（像素，默认3）
    anchorCacheTTL: number;           // 锚点缓存TTL（毫秒，默认100）
    enableCirclePrecisionMode: boolean; // 圆形精确模式（默认true，圆形不应用敏感度）
  } = {
    sensitivity: 0.7,
    minDragDistance: 3,
    anchorCacheTTL: 100,
    enableCirclePrecisionMode: true
  };

  // 向后兼容：保留原有的常量（使用配置值）
  private get MIN_DRAG_DISTANCE(): number {
    return this.dragConfig.minDragDistance;
  }

  private get DRAG_SENSITIVITY(): number {
    return this.dragConfig.sensitivity;
  }

  // 性能优化：锚点更新节流
  private lastAnchorUpdateTime: number = 0;
  private get anchorUpdateInterval(): number {
    return this.dragConfig.anchorCacheTTL;
  }
  
  // 锚点缓存（优化：减少重复计算）
  private anchorCache: {
    actionIds: string[];
    bounds: { x: number; y: number; width: number; height: number } | null;
    anchors: AnchorPoint[];
    centerAnchor: AnchorPoint | null;
    moveArea: { x: number; y: number; width: number; height: number } | null;
    timestamp: number;
  } | null = null;
  
  // 边界框缓存（优化：基于action IDs和修改时间）
  private boundsCacheKey: string | null = null;
  private cachedBounds: { x: number; y: number; width: number; height: number } | null = null;
  
  // 拖拽状态缓存（优化：减少重复计算）
  private dragState: {
    startBounds: { x: number; y: number; width: number; height: number };
    startAction: DrawAction;
    lastPoint: Point;
    lastResult: DrawAction | DrawAction[] | null;
  } | null = null;

  // 拖拽取消机制：保存拖拽前的状态
  private dragStartState: {
    actions: DrawAction[];
    bounds: { x: number; y: number; width: number; height: number } | null;
  } | null = null;

  // 动态图层支持
  private canvasEngine?: CanvasEngine;
  private selectedLayerZIndex?: number | null;

  // 空间索引优化（性能优化）
  private spatialIndex: SpatialIndex | null = null;
  private readonly SPATIAL_INDEX_THRESHOLD = 1000; // 超过1000个actions时使用空间索引
  private readonly BOX_SELECT_SPATIAL_INDEX_THRESHOLD = 500; // 框选时超过500个actions使用空间索引

  // 模块化子组件
  private hitTestManager: HitTestManager;
  private boxSelectionManager: BoxSelectionManager;
  private anchorCacheManager: AnchorCacheManager;
  private dragStateManager: DragStateManager;
  private boundsCacheManager: BoundsCacheManager;
  private selectionRenderer: SelectionRenderer;
  private boundsCalculator: BoundsCalculator;
  private anchorDragHandler: AnchorDragHandler;

  constructor(config?: Partial<{
    sensitivity: number;
    minDragDistance: number;
    anchorCacheTTL: number;
    enableCirclePrecisionMode: boolean;
  }>) {
    super('选择', 'select');
    this.transformTool = new TransformToolRefactored();
    
    // 初始化模块化子组件
    this.hitTestManager = new HitTestManager();
    this.boxSelectionManager = new BoxSelectionManager(this.hitTestManager);
    this.selectionRenderer = new SelectionRenderer(this.anchorSize);
    
    // 初始化缓存和状态管理器
    this.anchorCacheManager = new AnchorCacheManager({
      cacheTTL: this.dragConfig.anchorCacheTTL
    });
    this.dragStateManager = new DragStateManager({
      minDragDistance: this.dragConfig.minDragDistance,
      sensitivity: this.dragConfig.sensitivity,
      enableCirclePrecisionMode: this.dragConfig.enableCirclePrecisionMode
    });
    this.boundsCacheManager = new BoundsCacheManager();
    this.boundsCalculator = new BoundsCalculator({ anchorSize: this.anchorSize });
    
    // 初始化图形处理器
    this.shapeHandlers.set('circle', new CircleAnchorHandler());
    this.shapeHandlers.set('rect', new RectAnchorHandler());
    this.shapeHandlers.set('text', new TextAnchorHandler());
    this.shapeHandlers.set('line', new LineAnchorHandler());
    this.shapeHandlers.set('polygon', new PolygonAnchorHandler());
    
    // 初始化锚点拖拽处理器（传入 shapeHandlers）
    this.anchorDragHandler = new AnchorDragHandler(
      { minDragDistance: this.MIN_DRAG_DISTANCE, dragSensitivity: this.DRAG_SENSITIVITY },
      this.shapeHandlers
    );
    
    // 应用配置（如果提供）
    if (config) {
      this.updateDragConfig(config);
    }
    // 路径类型（pen/brush/eraser）使用相同的锚点处理器
    this.shapeHandlers.set('pen', new PenAnchorHandler());
    this.shapeHandlers.set('brush', new PenAnchorHandler());
    this.shapeHandlers.set('eraser', new PenAnchorHandler());
  }

  /**
   * 更新拖拽配置
   */
  public updateDragConfig(config: Partial<{
    sensitivity: number;
    minDragDistance: number;
    anchorCacheTTL: number;
    enableCirclePrecisionMode: boolean;
  }>): void {
    this.dragConfig = { ...this.dragConfig, ...config };
    
    // 同步更新子模块配置
    this.anchorCacheManager.updateConfig({
      cacheTTL: this.dragConfig.anchorCacheTTL
    });
    this.dragStateManager.updateConfig({
      minDragDistance: this.dragConfig.minDragDistance,
      sensitivity: this.dragConfig.sensitivity,
      enableCirclePrecisionMode: this.dragConfig.enableCirclePrecisionMode
    });
    
  }

  /**
   * 获取拖拽配置
   */
  public getDragConfig(): {
    sensitivity: number;
    minDragDistance: number;
    anchorCacheTTL: number;
    enableCirclePrecisionMode: boolean;
  } {
    return { ...this.dragConfig };
  }

  /**
   * 设置CanvasEngine和选中图层zIndex（用于动态图层）
   */
  public setCanvasEngine(canvasEngine: CanvasEngine, selectedLayerZIndex?: number | null): void {
    this.canvasEngine = canvasEngine;
    this.selectedLayerZIndex = selectedLayerZIndex;
    // 同时传递给TransformTool
    if (this.transformTool && 'setCanvasEngine' in this.transformTool) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.transformTool as any).setCanvasEngine(canvasEngine, selectedLayerZIndex);
    }
  }

  /**
   * 获取用于绘制交互元素的Canvas上下文
   * 如果选中图层存在，使用动态图层；否则使用interaction层
   */
  private getInteractionContext(): CanvasRenderingContext2D {
    if (this.canvasEngine && this.selectedLayerZIndex !== null && this.selectedLayerZIndex !== undefined) {
      try {
        return this.canvasEngine.getSelectionLayerForVirtualLayer(this.selectedLayerZIndex);
      } catch {
        return this.canvasEngine.getInteractionLayer();
      }
    }
    
    // 如果没有CanvasEngine，返回传入的ctx（兼容性）
    if (this.canvasEngine) {
      logger.debug('SelectTool.getInteractionContext: 使用interaction层（selectedLayerZIndex未设置）');
      return this.canvasEngine.getInteractionLayer();
    }
    
    throw new Error('CanvasEngine未设置');
  }

  /**
   * 设置当前图层的所有actions
   * @param actions 当前图层的所有actions
   * @param clearSelection 是否清空选择（图层切换时使用）
   */
  public setLayerActions(actions: DrawAction[], clearSelection: boolean = false): void {
    const previousSelectedCount = this.selectedActions.length;
    const previousSelectedIds = this.selectedActions.map(a => a.id);
    
    // 【修复】必须在赋值新 actions 之前保存旧的 allActions
    // 之前的 bug：先赋值 this.allActions = actions，再取 previousAllActions = this.allActions
    // 导致 previousAllActions 实际上指向新的 actions，而不是旧值
    const previousAllActions = [...this.allActions];
    
    this.allActions = actions;
    
    if (clearSelection) {
      // 图层切换时，完全清空选择
      this.clearSelection();
    } else {
      // 清理不在当前图层中的选中actions
      const beforeFilterCount = this.selectedActions.length;
      
      // 【性能优化】使用 Set 优化查找，从 O(n*m) 降低到 O(n+m)
      const newActionIdSet = new Set(actions.map(a => a.id));
      const prevActionIdSet = new Set(previousAllActions.map(a => a.id));
      
      // 过滤选中的actions，只保留有效的actions
      const filteredActions = this.selectedActions.filter(selectedAction => {
        // 首先检查新的actions中是否有这个action（O(1) 查找）
        if (newActionIdSet.has(selectedAction.id)) {
          return true;
        }
        
        // 如果没找到，检查之前的allActions中是否有这个action（O(1) 查找）
        // 【注意】这是为了处理 individual 模式下图层切换的过渡期
        // 在 individual 模式下，每个 action 有自己的图层，setLayerActions 可能传入所有 actions
        if (prevActionIdSet.has(selectedAction.id)) {
          return true;
        }
        
        // 【安全检查】只有在 individual 模式下且有 virtualLayerId 时才保留
        // 避免保留已被完全删除的"幽灵" action
        if (selectedAction.virtualLayerId) {
          // 额外验证：确保这不是一个被删除的 action
          // 如果 action 既不在 newActions 也不在 previousAllActions 中，很可能是被删除了
          logger.warn('SelectTool.setLayerActions: action有virtualLayerId但不在任何actions列表中，可能是幽灵选择', {
            actionId: selectedAction.id,
            virtualLayerId: selectedAction.virtualLayerId
          });
          // 保守起见仍然保留，但记录警告便于排查
          return true;
        }
        
        return false;
      });
      
      this.selectedActions = filteredActions;
      
      // 如果选中的 actions 发生变化，更新变换模式
      if (this.selectedActions.length === 1) {
        this.clearAnchorCache();
        this.enterTransformMode(this.selectedActions[0]);
      } else if (this.selectedActions.length === 0) {
        this.exitTransformMode();
        this.clearAnchorCache();
      } else {
        this.exitTransformMode();
        this.clearAnchorCache();
      }
    }
    
    this.clearBoundsCache();
    this.clearSpatialIndex();
  }

  /**
   * 清空空间索引缓存
   */
  public clearSpatialIndex(): void {
    if (this.spatialIndex) {
      this.spatialIndex.clear();
    }
    this.spatialIndex = null;
  }

  /**
   * 保存拖拽前的状态（用于取消拖拽）
   */
  private saveDragStartState(): void {
    if (this.selectedActions.length > 0) {
      this.dragStartState = {
        actions: this.selectedActions.map(action => ({ ...action })),
        bounds: this.getSelectedActionsBounds()
      };
    }
  }

  /**
   * 取消拖拽操作（恢复原始状态）
   * 在ESC键按下时调用
   * @returns 是否成功取消了拖拽
   */
  public cancelDrag(): boolean {
    if (!this.dragStartState) return false;
    
    // 检查是否正在拖拽
    if (this.isDraggingResizeAnchor || this.isDraggingMove || this.isDraggingCenter) {
      // 恢复原始状态
      this.selectedActions = this.dragStartState.actions.map(action => ({ ...action }));
      
      // 更新锚点
      this.updateAnchorPoints();
      
      // 更新变换模式
      if (this.selectedActions.length === 1) {
        this.enterTransformMode(this.selectedActions[0]);
      } else {
        this.exitTransformMode();
      }
      
      // 清除拖拽状态
      this.isDraggingResizeAnchor = false;
      this.isDraggingMove = false;
      this.isDraggingCenter = false;
      this.draggedAnchorIndex = -1;
      this.dragStartPoint = null;
      this.dragStartBounds = null;
      this.dragStartAction = null;
      this.dragStartState = null;
      
      logger.debug('SelectTool: 拖拽已取消，恢复原始状态');
      return true;
    }
    
    return false;
  }

  /**
   * 点击选择单个action
   */
  public selectActionAtPoint(point: Point, tolerance: number = 8): DrawAction | null {
    try {
      // 参数验证
      if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') {
        logger.warn('SelectTool: 无效的点坐标');
        return null;
      }

      if (tolerance < 0 || tolerance > 50) {
        tolerance = 8; // 使用默认值（提高容差，更容易选择）
        logger.warn('SelectTool: 容差值超出范围，使用默认值');
      }

      // 检查allActions是否为空
      if (this.allActions.length === 0) {
        logger.debug('SelectTool: allActions为空，无法选择');
        return null;
      }

      // 性能优化：如果actions数量超过阈值，使用空间索引
      if (this.allActions.length > this.SPATIAL_INDEX_THRESHOLD) {
        // 初始化空间索引（如果还没有）
        if (!this.spatialIndex) {
          const canvasBounds = this.getCanvasBounds();
          if (canvasBounds) {
            this.spatialIndex = new SpatialIndex(canvasBounds.width, canvasBounds.height);
            this.spatialIndex.buildIndex(this.allActions, (action) => {
              return this.getActionBoundingBox(action);
            });
          }
        }

        if (this.spatialIndex) {
          // 使用空间索引查询候选actions
          const candidates = this.spatialIndex.queryPoint(point, tolerance);
          
          // 从后往前检查候选actions（后绘制的在上层）
          for (let i = candidates.length - 1; i >= 0; i--) {
            const action = candidates[i];
            if (!action) continue;
            
            if (this.isPointInAction(point, action, tolerance)) {
              this.selectSingleAction(action);
              logger.debug(`SelectTool: 选中action（使用空间索引），ID: ${action.id}, 类型: ${action.type}`);
              return action;
            }
          }
        }
      } else {
        // 使用原有的遍历方式（actions数量较少时）
        // 从后往前检查（后绘制的在上层）
        // 创建快照，避免在迭代过程中数组被修改
        const actionsSnapshot = [...this.allActions];
        for (let i = actionsSnapshot.length - 1; i >= 0; i--) {
          const action = actionsSnapshot[i];
          if (!action) {
            logger.warn('SelectTool: 发现空的action', { index: i });
            continue;
          }
          
          if (this.isPointInAction(point, action, tolerance)) {
            this.selectSingleAction(action);
            logger.debug(`SelectTool: 选中action，ID: ${action.id}, 类型: ${action.type}`);
            return action;
          }
        }
      }
      
      // 如果没有选中任何action，清空选择
      this.clearSelection();
      return null;
    } catch (error) {
      logger.error('SelectTool: 选择action时发生错误', error);
      return null;
    }
  }

  /**
   * 检查点是否在action内
   * 委托给 HitTestManager 处理
   */
  private isPointInAction(point: Point, action: DrawAction, tolerance: number): boolean {
    return this.hitTestManager.isPointInAction(point, action, tolerance);
  }

  // 以下 hit test 方法已移至 HitTestManager 模块
  // isPointInTextAction, isPointInRectAction, isPointInCircleAction,
  // isPointInPolygonAction, isPointInPathAction, isPointInLineAction,
  // distanceToLineSegment, isPointInBoundingBox

  /**
   * 获取action的边界框
   * 委托给 BoundsCalculator 处理，使用 BoundsCacheManager 缓存
   */
  private getActionBoundingBox(action: DrawAction): { x: number; y: number; width: number; height: number } {
    // 检查缓存
    const cachedBounds = this.boundsCacheManager.getForAction(action);
    if (cachedBounds) {
      return cachedBounds;
    }

    // 使用 BoundsCalculator 计算
    const bounds = this.boundsCalculator.calculate(action);

    // 缓存结果
    this.boundsCacheManager.setForAction(action, bounds);
    return bounds;
  }

  /**
   * 清除边界框缓存
   * 委托给 BoundsCacheManager
   */
  private clearBoundsCache(): void {
    this.boundsCacheManager.clear();
  }

  /**
   * 清除特定action的边界框缓存
   * 委托给 BoundsCacheManager
   */
  private clearActionBoundsCache(actionId: string): void {
    this.boundsCacheManager.deleteForAction(actionId);
  }

  /**
   * 选择单个action
   */
  private selectSingleAction(action: DrawAction): void {
    // 使用 setSelectedActions 确保缓存清除和锚点重新生成
    this.setSelectedActions([action]);
    this.enterTransformMode(action);
  }

  /**
   * 框选多个actions
   * 委托给 BoxSelectionManager 处理，同时支持空间索引优化
   */
  public selectActionsInBox(bounds: { x: number; y: number; width: number; height: number }): DrawAction[] {
    // 检查选择框是否有效
    if (!isFinite(bounds.x) || !isFinite(bounds.y) || 
        !isFinite(bounds.width) || !isFinite(bounds.height)) {
      logger.warn('SelectTool: 无效的选择框', bounds);
      return [];
    }
    
    // 检查选择框最小尺寸
    if (bounds.width < 5 || bounds.height < 5) {
      logger.debug('SelectTool: 选择框太小，忽略框选', bounds);
      this.selectedActions = [];
      return [];
    }
    
    if (this.allActions.length === 0) {
      logger.debug('SelectTool: allActions为空，无法框选');
      this.selectedActions = [];
      return [];
    }
    
    let selected: DrawAction[] = [];
    
    // 性能优化：使用空间索引
    if (this.allActions.length > this.BOX_SELECT_SPATIAL_INDEX_THRESHOLD) {
      if (!this.spatialIndex) {
        const canvasBounds = this.getCanvasBounds();
        if (canvasBounds) {
          this.spatialIndex = new SpatialIndex(canvasBounds.width, canvasBounds.height);
          this.spatialIndex.buildIndex(this.allActions, (action) => {
            return this.getActionBoundingBox(action);
          });
        }
      }

      if (this.spatialIndex) {
        const candidates = this.spatialIndex.queryBounds(bounds);
        selected = this.boxSelectionManager.selectActionsInBox(bounds, candidates);
      } else {
        selected = this.boxSelectionManager.selectActionsInBox(bounds, this.allActions);
      }
    } else {
      selected = this.boxSelectionManager.selectActionsInBox(bounds, this.allActions);
    }
    
    this.selectedActions = selected;
    logger.debug(`SelectTool: 框选到${selected.length}个actions`, {
      bounds,
      totalActions: this.allActions.length
    });
    return selected;
  }

  // 以下框选检测方法已移至 BoxSelectionManager 模块
  // isActionInBox, isRectInBox, isCircleInBox, isPolygonInBox,
  // isPathInBox, isLineSegmentIntersectBox, doLineSegmentsIntersect, isBoundingBoxIntersect

  /**
   * 清空选择
   */
  public clearSelection(): void {
    this.selectedActions = [];
    this.anchorPoints = [];
    this.centerAnchorPoint = null;
    this.moveArea = null;
    this.isDraggingResizeAnchor = false;
    this.draggedAnchorIndex = -1;
    this.isDraggingMove = false;
    this.isDraggingCenter = false;
    this.clearBoundsCache(); // 清除边界框缓存
    this.exitTransformMode();
  }

  /**
   * 获取当前选中的actions
   */
  public getSelectedActions(): DrawAction[] {
    return [...this.selectedActions];
  }

  /**
   * 设置选中的actions
   */
  public setSelectedActions(actions: DrawAction[]): void {
    this.selectedActions = [...actions];
    
    // 更新变换模式
    if (this.selectedActions.length === 1) {
      this.enterTransformMode(this.selectedActions[0]);
    } else if (this.selectedActions.length > 1) {
      // 多选时不进入变换模式
      this.exitTransformMode();
    } else {
      this.exitTransformMode();
    }
    
    // 清除缓存（包括边界框缓存和锚点缓存）
    this.clearBoundsCache();
    this.clearAnchorCache(); // 确保清除锚点缓存，避免使用旧的8个锚点缓存
    
    // 重新生成锚点和边界框，并更新缓存
    if (this.selectedActions.length > 0) {
      this.generateResizeAnchorPoints(); // 这会重新生成锚点并更新锚点缓存
      this.getSelectedActionsBounds(); // 确保边界框缓存也被更新
    }
    
  }

  /**
   * 生成锚点（根据图形类型使用不同的处理器）
   */
  private generateResizeAnchorPoints(): void {
    if (this.isDraggingResizeAnchor) {
      this.clearAnchorCache();
    }
    
    const cacheKey = this.getAnchorCacheKey();
    const currentTime = Date.now();
    
    // 尝试使用缓存
    if (this.tryUseAnchorCache(cacheKey, currentTime)) {
      return;
    }

    // 计算边界框
    const bounds = this.isDraggingResizeAnchor && this.selectedActionForTransform
      ? this.getActionBoundingBox(this.selectedActionForTransform)
      : this.getSelectedActionsBounds();
      
    if (!bounds) {
      this.clearAnchorPointsState();
      return;
    }

    // 多选场景
    if (this.selectedActions.length > 1) {
      this.generateMultiSelectionAnchors(bounds);
      return;
    }

    // 单选场景
    this.generateSingleSelectionAnchors(bounds, currentTime, cacheKey);
  }

  /**
   * 生成锚点缓存 key
   */
  private getAnchorCacheKey(): string {
    const actionIds = this.selectedActions.map(a => a.id).sort();
    const fingerprint = this.selectedActions.map(a => {
      if (a.points.length === 0) return `${a.id}:empty`;
      const first = a.points[0];
      const last = a.points[a.points.length - 1];
      return `${a.id}:${Math.round(first.x)},${Math.round(first.y)},${Math.round(last.x)},${Math.round(last.y)},${a.points.length}`;
    }).join('|');
    return `${actionIds.join(',')}_${fingerprint}`;
  }

  /**
   * 尝试使用缓存
   */
  private tryUseAnchorCache(cacheKey: string, currentTime: number): boolean {
    if (this.isDraggingResizeAnchor) return false;
    
    const isValidCache = this.anchorCache && 
        this.anchorCache.actionIds.sort().join(',') === cacheKey &&
      currentTime - this.anchorCache.timestamp < this.dragConfig.anchorCacheTTL;
    
    const isThrottled = currentTime - this.lastAnchorUpdateTime < this.anchorUpdateInterval;
    
    if ((isValidCache || isThrottled) && this.anchorCache) {
          this.anchorPoints = this.anchorCache.anchors;
          this.centerAnchorPoint = this.anchorCache.centerAnchor;
          this.moveArea = this.anchorCache.moveArea;
      return true;
    }
    return false;
  }

  /**
   * 清除锚点状态
   */
  private clearAnchorPointsState(): void {
      this.clearAnchorCache();
      this.anchorPoints = [];
      this.centerAnchorPoint = null;
      this.moveArea = null;
  }

  /**
   * 生成单选场景的锚点
   */
  private generateSingleSelectionAnchors(
    bounds: { x: number; y: number; width: number; height: number },
    currentTime: number,
    cacheKey: string
  ): void {
    const action = (this.isDraggingResizeAnchor && this.selectedActionForTransform) 
      ? this.selectedActionForTransform 
      : this.selectedActions[0];
      
    if (!action) {
      this.clearAnchorPointsState();
      return;
    }

    const handler = this.shapeHandlers.get(action.type);
    if (handler) {
      const actionBounds = action.type === 'circle' 
        ? this.getActionBoundingBox(action)
        : bounds;
      this.generateAnchorsWithHandler(handler, action, actionBounds || bounds);
      } else {
      this.generateDefaultAnchors(bounds);
      this.centerAnchorPoint = null;
    }

    this.updateMoveArea(bounds);
    this.lastAnchorUpdateTime = currentTime;
    this.updateAnchorCache(cacheKey, bounds, currentTime);
  }

  /**
   * 使用 handler 生成锚点
   */
  private generateAnchorsWithHandler(
    handler: ShapeAnchorHandler,
    action: DrawAction,
    bounds: { x: number; y: number; width: number; height: number }
  ): void {
    const effectiveBounds = (!bounds || bounds.width <= 0 || bounds.height <= 0)
      ? { x: 0, y: 0, width: 100, height: 100 }
      : bounds;
      
    const anchors = handler.generateAnchors(action, effectiveBounds);
    this.anchorPoints = anchors.filter(anchor => !anchor.isCenter);
    this.centerAnchorPoint = anchors.find(anchor => anchor.isCenter) || null;
  }

  /**
   * 更新移动区域
   */
  private updateMoveArea(bounds: { x: number; y: number; width: number; height: number }): void {
    const padding = this.anchorSize / 2;
    this.moveArea = {
      x: bounds.x + padding,
      y: bounds.y + padding,
      width: Math.max(0, bounds.width - padding * 2),
      height: Math.max(0, bounds.height - padding * 2)
    };
  }

  /**
   * 更新锚点缓存
   */
  private updateAnchorCache(
    cacheKey: string,
    bounds: { x: number; y: number; width: number; height: number },
    timestamp: number
  ): void {
    if (this.isDraggingResizeAnchor) return;
    
      this.anchorCache = {
      actionIds: cacheKey.split('_')[0].split(','),
      bounds: { ...bounds },
      anchors: [...this.anchorPoints],
      centerAnchor: this.centerAnchorPoint ? { ...this.centerAnchorPoint } : null,
      moveArea: this.moveArea ? { ...this.moveArea } : null,
      timestamp
    };
  }
  
  /**
   * 清除锚点缓存
   */
  private clearAnchorCache(): void {
    this.anchorCache = null;
    this.lastAnchorUpdateTime = 0;
  }
  
  /**
   * 清除拖拽状态缓存
   */
  private clearDragState(): void {
    this.dragState = null;
  }

  /**
   * 生成多选场景的锚点（统一边界框，无中心点）
   */
  private generateMultiSelectionAnchors(bounds: Bounds): void {
    const { x, y, width, height } = bounds;
    const halfSize = this.anchorSize / 2;

    // 生成8个标准锚点（无中心点）
    this.anchorPoints = [
      // 四个角点
      { x: x - halfSize, y: y - halfSize, type: 'top-left', cursor: 'nw-resize', shapeType: 'multi' },
      { x: x + width - halfSize, y: y - halfSize, type: 'top-right', cursor: 'ne-resize', shapeType: 'multi' },
      { x: x + width - halfSize, y: y + height - halfSize, type: 'bottom-right', cursor: 'se-resize', shapeType: 'multi' },
      { x: x - halfSize, y: y + height - halfSize, type: 'bottom-left', cursor: 'sw-resize', shapeType: 'multi' },
      
      // 四个边中点
      { x: x + width / 2 - halfSize, y: y - halfSize, type: 'top', cursor: 'n-resize', shapeType: 'multi' },
      { x: x + width - halfSize, y: y + height / 2 - halfSize, type: 'right', cursor: 'e-resize', shapeType: 'multi' },
      { x: x + width / 2 - halfSize, y: y + height - halfSize, type: 'bottom', cursor: 's-resize', shapeType: 'multi' },
      { x: x - halfSize, y: y + height / 2 - halfSize, type: 'left', cursor: 'w-resize', shapeType: 'multi' }
    ];
    
    this.centerAnchorPoint = null; // 多选时不显示中心点
  }

  /**
   * 生成默认锚点（用于未实现处理器的图形类型）
   */
  private generateDefaultAnchors(bounds: Bounds): void {
    const { x, y, width, height } = bounds;
    const halfSize = this.anchorSize / 2;

    this.anchorPoints = [
      // 四个角点
      { x: x - halfSize, y: y - halfSize, type: 'top-left', cursor: 'nw-resize', shapeType: 'default' },
      { x: x + width - halfSize, y: y - halfSize, type: 'top-right', cursor: 'ne-resize', shapeType: 'default' },
      { x: x + width - halfSize, y: y + height - halfSize, type: 'bottom-right', cursor: 'se-resize', shapeType: 'default' },
      { x: x - halfSize, y: y + height - halfSize, type: 'bottom-left', cursor: 'sw-resize', shapeType: 'default' },
      
      // 四个边中点
      { x: x + width / 2 - halfSize, y: y - halfSize, type: 'top', cursor: 'n-resize', shapeType: 'default' },
      { x: x + width - halfSize, y: y + height / 2 - halfSize, type: 'right', cursor: 'e-resize', shapeType: 'default' },
      { x: x + width / 2 - halfSize, y: y + height - halfSize, type: 'bottom', cursor: 's-resize', shapeType: 'default' },
      { x: x - halfSize, y: y + height / 2 - halfSize, type: 'left', cursor: 'w-resize', shapeType: 'default' }
    ];
  }

  /**
   * 绘制选择边界框
   * 委托给 SelectionRenderer
   */
  private drawSelectionBounds(ctx: CanvasRenderingContext2D, bounds: { x: number; y: number; width: number; height: number }): void {
    this.selectionRenderer.drawSelectionBounds(ctx, bounds);
  }

  /**
   * 绘制锚点（包括边锚点和中心点）
   * 委托给 SelectionRenderer
   */
  private drawResizeAnchorPoints(ctx: CanvasRenderingContext2D): void {
    this.selectionRenderer.drawResizeAnchorPoints(
      ctx,
      this.anchorPoints,
      this.centerAnchorPoint,
      this.selectedActions.length,
      this.hoverAnchorInfo,
      this.draggedAnchorIndex,
      this.isDraggingCenter
    );
  }

  /**
   * 获取指定点位置的锚点（改进：使用距离计算，提高准确性）
   * 返回：{ index: number, anchor: AnchorPoint, isCenter: boolean } | null
   */
  private getAnchorPointAt(point: Point): { index: number; anchor: AnchorPoint; isCenter: boolean } | null {
    // 先检查中心点（优先级最高）
    if (this.centerAnchorPoint && this.selectedActions.length === 1) {
      const centerX = this.centerAnchorPoint.x + this.anchorSize / 2;
      const centerY = this.centerAnchorPoint.y + this.anchorSize / 2;
      const distance = Math.sqrt(
        Math.pow(point.x - centerX, 2) + Math.pow(point.y - centerY, 2)
      );
      
      if (distance <= this.anchorSize / 2 + this.anchorTolerance) {
        return {
          index: -1, // 中心点使用特殊索引
          anchor: this.centerAnchorPoint,
          isCenter: true
        };
      }
    }
    
    // 检查边锚点（改进：使用距离计算而不是矩形区域，提高准确性）
    let closestAnchor: { index: number; anchor: AnchorPoint; distance: number } | null = null;
    const maxDistance = this.anchorSize / 2 + this.anchorTolerance;
    
    for (let i = 0; i < this.anchorPoints.length; i++) {
      const anchor = this.anchorPoints[i];
      const anchorCenterX = anchor.x + this.anchorSize / 2;
      const anchorCenterY = anchor.y + this.anchorSize / 2;
      const distance = Math.sqrt(
        Math.pow(point.x - anchorCenterX, 2) + Math.pow(point.y - anchorCenterY, 2)
      );
      
      if (distance <= maxDistance) {
        // 找到更近的锚点
        if (!closestAnchor || distance < closestAnchor.distance) {
          closestAnchor = {
          index: i,
          anchor,
            distance
          };
        }
      }
    }
    
    if (closestAnchor) {
      return {
        index: closestAnchor.index,
        anchor: closestAnchor.anchor,
        isCenter: false
      };
    }
    
    return null;
  }

  /**
   * 检查点是否在移动区域内（用于移动整个选区）
   * 改进：扩大检测范围，排除锚点区域，提高可点击性
   */
  private isPointInMoveArea(point: Point): boolean {
    if (!this.moveArea) return false;
    
    // 检查点是否在移动区域内
    const inBounds = point.x >= this.moveArea.x &&
                     point.x <= this.moveArea.x + this.moveArea.width &&
                     point.y >= this.moveArea.y &&
                     point.y <= this.moveArea.y + this.moveArea.height;
    
    if (inBounds) {
      // 如果在移动区域内，还需要确保不在锚点附近
      // 检查是否在任意锚点的容差范围内
      const anchorInfo = this.getAnchorPointAt(point);
      // 如果检测到锚点，说明点击的是锚点，不是移动区域
      return !anchorInfo;
    }
    
    return false;
  }

  // 拖拽时的原始边界框（避免在拖拽过程中重新计算）
  private dragStartBounds: { x: number; y: number; width: number; height: number } | null = null;
  // 拖拽开始时的action（用于圆形等需要保持原始状态的图形）
  private dragStartAction: DrawAction | null = null;

  /**
   * 获取画布边界
   */
  private getCanvasBounds(): { width: number; height: number } | null {
    if (!this.canvasEngine) {
      return null;
    }
    
    try {
      const canvas = this.canvasEngine.getCanvas();
      return {
        width: canvas.width,
        height: canvas.height
      };
    } catch (error) {
      logger.warn('SelectTool: 无法获取画布尺寸', error);
      return null;
    }
  }

  /**
   * 处理锚点拖拽（用于缩放/变形）
   * 改进：使用图形特定的处理器，明确区分变形操作和移动操作
   * 注意：中心点拖拽应该走移动逻辑，不应该进入此函数
   * 优化：添加拖拽状态缓存，减少重复计算
   */
  private handleResizeAnchorDrag(point: Point): DrawAction | DrawAction[] | null {
    if (this.draggedAnchorIndex === -1 || !this.dragStartPoint) return null;
    if (this.isDraggingCenter) return null;

    const anchor = this.anchorPoints[this.draggedAnchorIndex];
    if (!anchor) return null;

    // 确保拖拽处理器已开始
    if (!this.anchorDragHandler.isDragging()) {
    const bounds = this.getSelectedActionsBounds();
    if (!bounds) return null;
      this.anchorDragHandler.startDrag(
      this.dragStartPoint,
      bounds,
        this.selectedActions.length === 1 ? this.dragStartAction : null
      );
    }

    const canvasBounds = this.getCanvasBounds() || undefined;

    // 多选场景
    if (this.selectedActions.length > 1) {
      const result = this.anchorDragHandler.handleMultiSelectionDrag(
        this.selectedActions,
        anchor,
        point,
        canvasBounds
      );
      if (result.success && result.actions) {
        return result.actions;
      }
      return null;
    }

    // 单选场景
    const action = this.selectedActions[0];
    if (!action) return null;

    const result = this.anchorDragHandler.handleSingleSelectionDrag(
      action,
      anchor,
      point,
      canvasBounds
    );

    if (result.success && result.action) {
      this.selectedActionForTransform = result.action;
      this.transformTool.setSelectedAction(result.action);
      return result.action;
    }

      return null;
    }



  public draw(ctx: CanvasRenderingContext2D, action: SelectAction): void {
    // 获取交互层上下文
    const interactionCtx = this.resolveInteractionContext(ctx);

    // 绘制选中 actions 的边界框和锚点
    if (this.selectedActions.length > 0) {
      this.drawSelectedActionsUI(interactionCtx);
    }

    // 绘制选择框（框选过程中）
    this.drawSelectionBox(interactionCtx, action);
  }

  /**
   * 解析交互层上下文
   */
  private resolveInteractionContext(ctx: CanvasRenderingContext2D): CanvasRenderingContext2D {
    if (ctx && ctx.canvas) {
      return ctx;
    }
    try {
      return this.getInteractionContext();
      } catch {
      logger.warn('SelectTool: 无法获取交互层，使用传入的ctx');
      return ctx;
    }
  }

  /**
   * 绘制选中 actions 的 UI（边界框和锚点）
   */
  private drawSelectedActionsUI(ctx: CanvasRenderingContext2D): void {
    // 生成锚点
      this.generateResizeAnchorPoints();
      
    // 如果锚点生成失败，强制重新生成
      if (this.anchorPoints.length === 0 && !this.centerAnchorPoint && this.selectedActions.length > 0) {
      logger.warn('SelectTool: 锚点生成失败，强制重新生成');
        this.clearAnchorCache();
      this.lastAnchorUpdateTime = 0;
        this.generateResizeAnchorPoints();
      }
      
      // 绘制边界框
      const bounds = this.isDraggingResizeAnchor && this.selectedActionForTransform
        ? this.getActionBoundingBox(this.selectedActionForTransform)
        : this.getSelectedActionsBounds();
    
      if (bounds) {
      this.drawSelectionBounds(ctx, bounds);
    }
    
    // 绘制锚点
    this.drawResizeAnchorPoints(ctx);
  }

  /**
   * 绘制选择框（框选过程中）
   */
  private drawSelectionBox(ctx: CanvasRenderingContext2D, action: SelectAction): void {
    if (action.points.length < 2) return;

    const start = action.points[0];
    const end = action.points[action.points.length - 1];
    
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);

    // 只有当选择框有一定大小时才绘制
    if (width < 5 || height < 5) return;

    const originalContext = this.saveContext(ctx);
    
    this.drawSelectionBackground(ctx, left, top, width, height, action);
    this.drawSelectionBorder(ctx, left, top, width, height, action);
    this.drawCornerIndicators(ctx, left, top, width, height);
    
    this.restoreContext(ctx, originalContext);
  }

  private drawSelectionBackground(
    ctx: CanvasRenderingContext2D, 
    left: number, 
    top: number, 
    width: number, 
    height: number,
    action: SelectAction
  ): void {
    // 如果有选中内容，使用高亮背景
    if (action.selectedActions && action.selectedActions.length > 0) {
      ctx.fillStyle = `rgba(0, 122, 255, ${modernSelectionStyle.fillOpacity * 1.5})`;
    } else {
      ctx.fillStyle = `rgba(0, 122, 255, ${modernSelectionStyle.fillOpacity})`;
    }
    
    // 绘制圆角矩形背景
    this.drawRoundedRect(ctx, left, top, width, height, modernSelectionStyle.cornerRadius, true);
  }

  private drawSelectionBorder(
    ctx: CanvasRenderingContext2D, 
    left: number, 
    top: number, 
    width: number, 
    height: number,
    action: SelectAction
  ): void {
    // 设置边框样式
    ctx.strokeStyle = modernSelectionStyle.strokeColor;
    ctx.lineWidth = modernSelectionStyle.strokeWidth;
    
    // 动画虚线效果
    const currentTime = Date.now();
    if (currentTime - this.lastAnimationTime > 50) { // 50ms更新间隔
      this.animationOffset += 1;
      this.lastAnimationTime = currentTime;
    }
    
    const dashArray = [...modernSelectionStyle.strokeDashArray];
    ctx.setLineDash(dashArray);
    ctx.lineDashOffset = -this.animationOffset;

    // 绘制圆角矩形边框
    this.drawRoundedRect(ctx, left, top, width, height, modernSelectionStyle.cornerRadius, false);
    
    // 如果有选中内容，绘制额外的强调边框
    if (action.selectedActions && action.selectedActions.length > 0) {
      ctx.strokeStyle = '#FF6B35'; // 橙色强调色
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 2]);
      ctx.lineDashOffset = this.animationOffset; // 反向动画
      this.drawRoundedRect(ctx, left - 1, top - 1, width + 2, height + 2, modernSelectionStyle.cornerRadius + 1, false);
    }
    
    // 重置虚线
    ctx.setLineDash([]);
  }

  private drawCornerIndicators(
    ctx: CanvasRenderingContext2D, 
    left: number, 
    top: number, 
    width: number, 
    height: number
  ): void {
    const cornerLength = 16;
    
    ctx.strokeStyle = modernSelectionStyle.strokeColor;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    
    // 四个角的指示器
    const corners = [
      { x: left, y: top }, // 左上
      { x: left + width, y: top }, // 右上
      { x: left + width, y: top + height }, // 右下
      { x: left, y: top + height }, // 左下
    ];
    
    corners.forEach((corner, index) => {
      ctx.beginPath();
      
      switch (index) {
        case 0: // 左上角
          ctx.moveTo(corner.x, corner.y + cornerLength);
          ctx.lineTo(corner.x, corner.y);
          ctx.lineTo(corner.x + cornerLength, corner.y);
          break;
        case 1: // 右上角
          ctx.moveTo(corner.x - cornerLength, corner.y);
          ctx.lineTo(corner.x, corner.y);
          ctx.lineTo(corner.x, corner.y + cornerLength);
          break;
        case 2: // 右下角
          ctx.moveTo(corner.x, corner.y - cornerLength);
          ctx.lineTo(corner.x, corner.y);
          ctx.lineTo(corner.x - cornerLength, corner.y);
          break;
        case 3: // 左下角
          ctx.moveTo(corner.x + cornerLength, corner.y);
          ctx.lineTo(corner.x, corner.y);
          ctx.lineTo(corner.x, corner.y - cornerLength);
          break;
      }
      
      ctx.stroke();
    });
  }

  private drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    fill: boolean = false
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    
    if (fill) {
      ctx.fill();
    } else {
      ctx.stroke();
    }
  }

  // ============================================
  // 变换功能接口
  // ============================================

  /**
   * 切换到变换模式
   */
  public enterTransformMode(selectedAction: DrawAction): void {
    this.isTransformMode = true;
    this.selectedActionForTransform = selectedAction;
    this.transformTool.setSelectedAction(selectedAction);
    
    // 确保锚点已生成（如果 selectedActions 已设置）
    if (this.selectedActions.length > 0) {
      this.generateResizeAnchorPoints();
    }
  }

  /**
   * 退出变换模式
   */
  public exitTransformMode(): void {
    this.isTransformMode = false;
    this.selectedActionForTransform = null;
    this.isDragging = false;
    this.dragStartPoint = null;
    this.currentHoverControlPoint = null;
  }

  /**
   * 处理鼠标按下事件
   * 改进：清晰区分移动和变形操作
   */
  public handleMouseDown(point: Point): 'select' | 'transform' | 'move' | 'box-select' | 'resize' | null {
    // 🔧 强制重置所有状态，防止之前操作的状态残留
    // 这确保每次新的点击都从干净状态开始
    
    // 重置拖拽状态
    this.isDragging = false;
    this.isDraggingResizeAnchor = false;
    this.isDraggingMove = false;
    this.isDraggingCenter = false;
    this.dragStartPoint = null;
    
    // 🔧 重置框选状态（防止偶现多选问题）
    this.isSelecting = false;
    this.selectionStartPoint = null;
    this.currentSelectionBounds = null;
    
    // 如果有选中的actions，检查交互区域
    if (this.selectedActions.length > 0) {
      // 1. 优先检查是否点击了边锚点（变形锚点优先级最高）
      const anchorInfo = this.getAnchorPointAt(point);
      if (anchorInfo && !anchorInfo.isCenter) {
        // 边锚点：缩放/变形
        this.isDraggingResizeAnchor = true;
        this.draggedAnchorIndex = anchorInfo.index;
        this.dragStartPoint = point;
        this.dragStartBounds = null;
        this.dragStartAction = this.selectedActions.length === 1 ? 
          { ...this.selectedActions[0] } : null;
        this.saveDragStartState();
        return 'resize';
      }
      
      // 2. 检查是否点击了中心点（移动操作）
      if (anchorInfo && anchorInfo.isCenter) {
        // 中心点：移动整个图形
        logger.debug('点击了中心点，开始移动', { anchorType: anchorInfo.anchor.type });
        this.isDraggingCenter = true;
        this.isDraggingMove = true;
        this.dragStartPoint = point;
        this.dragStartAction = this.selectedActions.length === 1 ? 
          { ...this.selectedActions[0] } : null;
        this.saveDragStartState();
        return 'move';
      }
      
      // 3. 检查是否点击了移动区域（用于移动整个选区）
      if (this.isPointInMoveArea(point)) {
        logger.debug('点击了移动区域，开始移动选区');
        this.isDraggingMove = true;
        this.dragStartPoint = point;
        this.dragStartAction = this.selectedActions.length === 1 ? 
          { ...this.selectedActions[0] } : null;
        this.saveDragStartState();
        return 'move';
      }
    }

    // 3. 如果处于变换模式，检查是否点击了控制点
    if (this.isTransformMode && this.selectedActionForTransform) {
      // 检查是否点击了控制点
      const controlPoint = this.transformTool.getControlPointAt(point);
      if (controlPoint) {
        this.currentHoverControlPoint = controlPoint;
        this.isDragging = true;
        this.dragStartPoint = point;
        return 'transform';
      }

      // 如果点击了选区外，取消选择
      if (!this.isPointInSelectionArea(point)) {
        this.clearSelection();
        // 检查是否点击了其他action
        const clickedAction = this.selectActionAtPoint(point);
        if (clickedAction) {
          return 'transform';
        }
        
        // 开始新的框选
        this.isSelecting = true;
        this.selectionStartPoint = point;
        return 'box-select';
      }

      return 'select';
    }

    // 4. 普通选择模式：检查是否点击了action
    logger.debug('普通选择模式，检查是否点击了action');
    const clickedAction = this.selectActionAtPoint(point);
    if (clickedAction) {
      logger.debug('点击了action，进入变换模式', { actionId: clickedAction.id, actionType: clickedAction.type });
      return 'transform';
    }
    
    // 5. 如果点击了选区外，清空选择
    if (this.selectedActions.length > 0 && !this.isPointInSelectionArea(point)) {
      logger.debug('点击了选区外，清空选择');
      this.clearSelection();
    }
    
    // 6. 开始框选
    logger.debug('开始框选', { point });
    this.isSelecting = true;
    this.selectionStartPoint = point;
    return 'box-select';
  }

  /**
   * 检查点是否在选择区域内
   */
  private isPointInSelectionArea(point: Point): boolean {
    // 检查是否在选中actions的边界框内
    const bounds = this.getSelectedActionsBounds();
    if (bounds) {
      return point.x >= bounds.x - 10 &&
             point.x <= bounds.x + bounds.width + 10 &&
             point.y >= bounds.y - 10 &&
             point.y <= bounds.y + bounds.height + 10;
    }

    // 检查是否在控制点附近
    if (this.transformTool) {
      const controlPoint = this.transformTool.getControlPointAt(point);
      if (controlPoint) {
        return true;
      }
    }

    return false;
  }

  /**
   * 处理鼠标移动事件
   * 改进：清晰区分移动和变形操作
   */
  public handleMouseMove(point: Point): DrawAction | DrawAction[] | null {
    // 1. 处理变形锚点拖拽（缩放/变形）
    if (this.isDraggingResizeAnchor) {
      return this.handleResizeAnchorDrag(point);
    }

    // 2. 处理移动选区（包括中心点拖拽）
    if (this.isDraggingMove && this.dragStartPoint) {
      const deltaX = point.x - this.dragStartPoint.x;
      const deltaY = point.y - this.dragStartPoint.y;
      
      // 检查移动距离是否足够（避免微小抖动）
      const moveDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      if (moveDistance < this.MIN_DRAG_DISTANCE) {
        return null; // 移动距离太小，忽略
      }
      
      // 中心点拖拽：使用图形特定的处理器
      if (this.isDraggingCenter && this.selectedActions.length === 1) {
        const action = this.selectedActions[0];
        const handler = this.shapeHandlers.get(action.type);
        if (handler) {
          const canvasBounds = this.getCanvasBounds();
          const updatedAction = handler.handleMove(action, deltaX, deltaY, canvasBounds || undefined);
          if (updatedAction) {
            // 更新selectedActionForTransform
            this.selectedActionForTransform = updatedAction;
            this.transformTool.setSelectedAction(updatedAction);
            return updatedAction;
          }
        }
      }
      
      // 普通移动：使用通用移动逻辑
      if (this.selectedActions.length > 1) {
        return this.moveSelectedActions(deltaX, deltaY);
      } else {
        return this.moveSelectedAction(deltaX, deltaY);
      }
    }

    // 3. 处理框选
    if (this.isSelecting && this.selectionStartPoint) {
      const bounds = {
        x: Math.min(this.selectionStartPoint.x, point.x),
        y: Math.min(this.selectionStartPoint.y, point.y),
        width: Math.abs(point.x - this.selectionStartPoint.x),
        height: Math.abs(point.y - this.selectionStartPoint.y)
      };
      
      this.currentSelectionBounds = bounds;
      return null; // 框选不需要返回action
    }

    // 4. 处理变换模式（TransformTool的控制点）
    if (!this.isTransformMode || !this.selectedActionForTransform) {
      return null;
    }

    // 处理控制点拖拽
    if (this.isDragging && this.currentHoverControlPoint && this.dragStartPoint) {
      return this.handleControlPointDrag(point);
    }

    return null;
  }
  
  // 当前悬停的锚点信息（用于光标更新）
  private hoverAnchorInfo: { index: number; anchor: AnchorPoint; isCenter: boolean } | null = null;

  /**
   * 更新悬停锚点（在鼠标移动时调用）
   * 返回：是否hover状态发生变化（用于触发重绘）
   */
  public updateHoverAnchor(point: Point): boolean {
    if (this.isDraggingResizeAnchor || this.isDraggingCenter) {
      // 正在拖拽时，不更新悬停状态
      return false;
    }
    
    const newHoverInfo = this.getAnchorPointAt(point);
    const oldHoverInfo = this.hoverAnchorInfo;
    
    // 检查hover状态是否发生变化
    const hoverChanged = (
      (oldHoverInfo === null && newHoverInfo !== null) ||
      (oldHoverInfo !== null && newHoverInfo === null) ||
      (oldHoverInfo !== null && newHoverInfo !== null && (
        oldHoverInfo.index !== newHoverInfo.index ||
        oldHoverInfo.isCenter !== newHoverInfo.isCenter
      ))
    );
    
    // 调试信息：输出hover状态变化
    if (hoverChanged && this.anchorPoints.length > 0 && this.anchorPoints[0]?.shapeType === 'circle') {
      logger.debug(`Hover状态变化: ${oldHoverInfo ? `索引${oldHoverInfo.index}` : 'null'} -> ${newHoverInfo ? `索引${newHoverInfo.index}` : 'null'}`);
    }
    
    this.hoverAnchorInfo = newHoverInfo;
    
    return hoverChanged;
  }
  
  /**
   * 检查鼠标是否悬停在锚点上（用于更新光标）
   */
  public getHoverAnchorCursor(point: Point): string | null {
    const anchorInfo = this.getAnchorPointAt(point);
    if (anchorInfo && !this.isDraggingResizeAnchor && !this.isDraggingCenter) {
      return anchorInfo.anchor.cursor || null;
    }
    return null;
  }

  /**
   * 处理控制点拖拽
   */
  private handleControlPointDrag(point: Point): DrawAction | null {
    if (!this.currentHoverControlPoint || !this.dragStartPoint || !this.selectedActionForTransform) {
      return null;
    }

    // 检查点坐标有效性
    if (!isFinite(point.x) || !isFinite(point.y)) {
      logger.warn('SelectTool: 无效的控制点拖拽坐标', { point });
      return null;
    }

    const controlPoint = this.currentHoverControlPoint;
    const bounds = this.getActionBoundingBox(this.selectedActionForTransform);
    
    // 检查边界框有效性
    if (bounds.width <= 0 || bounds.height <= 0) {
      logger.warn('SelectTool: 边界框尺寸为0，无法缩放', { bounds });
      return null;
    }
    
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    
    // 检查中心点有效性
    if (!isFinite(centerX) || !isFinite(centerY)) {
      logger.warn('SelectTool: 无效的中心点', { centerX, centerY, bounds });
      return null;
    }

    // 根据控制点类型执行不同的变换
    if (controlPoint.type.includes('CORNER') || controlPoint.type.includes('EDGE')) {
      const halfWidth = bounds.width / 2;
      const halfHeight = bounds.height / 2;
      
      if (halfWidth === 0 || halfHeight === 0) {
        logger.warn('SelectTool: 边界框尺寸为0，无法缩放');
        return null;
      }
      
      let scaleX = Math.abs(point.x - centerX) / halfWidth;
      let scaleY = Math.abs(point.y - centerY) / halfHeight;
      
      // 限制缩放比例范围，防止过大或过小
      const MIN_SCALE = 0.01;
      const MAX_SCALE = 100;
      scaleX = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scaleX));
      scaleY = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scaleY));
      
      return this.scaleSelectedAction(scaleX, scaleY, centerX, centerY);
    } else if (controlPoint.type === 'MOVE') {
      const deltaX = point.x - this.dragStartPoint!.x;
      const deltaY = point.y - this.dragStartPoint!.y;
      return this.moveSelectedAction(deltaX, deltaY);
    }

    return null;
  }

  /**
   * 处理鼠标抬起事件
   */
  public handleMouseUp(): DrawAction | DrawAction[] | null {
    // 1. 处理框选结束
    if (this.isSelecting && this.currentSelectionBounds) {
      return this.finishBoxSelection();
    }

    // 2. 处理变形锚点拖拽结束
    if (this.isDraggingResizeAnchor) {
      return this.finishResizeAnchorDrag();
    }

    // 3. 处理移动结束（包括中心点拖拽）
    if (this.isDraggingMove) {
      return this.finishMoveDrag();
    }

    // 4. 处理变换模式（TransformTool的控制点）
    if (this.isTransformMode && this.isDragging) {
      return this.finishControlPointDrag();
    }

    return null;
  }

  /**
   * 完成框选操作
   */
  private finishBoxSelection(): DrawAction | DrawAction[] | null {
    const selectedActions = this.selectActionsInBox(this.currentSelectionBounds!);
      this.isSelecting = false;
      this.selectionStartPoint = null;
      this.currentSelectionBounds = null;
      
      this.setSelectedActions(selectedActions);
      
      if (selectedActions.length === 1) {
        this.enterTransformMode(selectedActions[0]);
        return selectedActions[0];
      } else if (selectedActions.length > 1) {
        return selectedActions;
      }
      
      return null;
    }

  /**
   * 完成锚点拖拽操作
   */
  private finishResizeAnchorDrag(): DrawAction | DrawAction[] | null {
      this.isDraggingResizeAnchor = false;
      this.draggedAnchorIndex = -1;
      this.dragStartPoint = null;
      this.dragStartBounds = null;
      this.dragStartAction = null;
      this.dragStartState = null;
    this.clearDragState();
    this.anchorDragHandler.endDrag();
    
    return this.syncAndRefreshAfterDrag();
  }

  /**
   * 完成移动拖拽操作
   */
  private finishMoveDrag(): DrawAction | DrawAction[] | null {
      this.isDraggingMove = false;
      this.isDraggingCenter = false;
      this.dragStartPoint = null;
      this.dragStartAction = null;
      this.clearDragState();
      
    return this.syncAndRefreshAfterDrag();
  }

  /**
   * 完成控制点拖拽操作
   */
  private finishControlPointDrag(): DrawAction | DrawAction[] | null {
    this.isDragging = false;
    this.dragStartPoint = null;
    this.currentHoverControlPoint = null;
    
    return this.syncAndRefreshAfterDrag();
  }

  /**
   * 拖拽结束后同步状态并刷新缓存
   */
  private syncAndRefreshAfterDrag(): DrawAction | DrawAction[] | null {
    // 同步变形后的 action
    if (this.selectedActions.length === 1 && this.selectedActionForTransform) {
      this.selectedActions[0] = this.selectedActionForTransform;
    }
    
    // 清除并重新生成缓存
    this.clearBoundsCache();
    this.clearAnchorCache();
    this.generateResizeAnchorPoints();
    this.getSelectedActionsBounds();
    
    return this.selectedActions.length > 1 
      ? this.selectedActions 
      : this.selectedActionForTransform;
  }

  /**
   * 获取当前鼠标样式
   */
  public getCurrentCursor(): string {
    // 如果正在拖拽变形锚点，返回对应的鼠标样式
    if (this.isDraggingResizeAnchor && this.draggedAnchorIndex !== -1) {
      const anchor = this.anchorPoints[this.draggedAnchorIndex];
      if (anchor) {
        return anchor.cursor || 'default';
      }
    }
    
    // 如果正在拖拽中心点，返回move光标
    if (this.isDraggingCenter) {
      return 'move';
    }
    
    // 如果鼠标悬停在锚点上（但未拖拽），返回对应的鼠标样式
    if (this.hoverAnchorInfo && !this.isDraggingResizeAnchor && !this.isDraggingCenter) {
      return this.hoverAnchorInfo.anchor.cursor || 'default';
    }
    
    // 如果正在移动选区，返回移动光标
    if (this.isDraggingMove) {
      return 'move';
    }

    if (!this.isTransformMode) {
      return 'default';
    }

    if (this.isDragging) {
      return 'grabbing';
    }

    if (this.currentHoverControlPoint) {
      return this.currentHoverControlPoint.cursor;
    }

    if (this.selectedActionForTransform && this.transformTool.isPointInSelectedShape({ x: 0, y: 0 })) {
      return 'grab';
    }

    return 'default';
  }

  /**
   * 检查是否处于变换模式
   */
  public isInTransformMode(): boolean {
    return this.isTransformMode;
  }

  /**
   * 获取选中的变换动作
   */
  public getSelectedTransformAction(): DrawAction | null {
    return this.selectedActionForTransform;
  }

  /**
   * 限制点在画布范围内
   * 使用统一的边界验证器
   */
  private clampPointToCanvas(point: Point): Point {
    const canvasBounds = this.getCanvasBounds();
    if (!canvasBounds) {
      return point; // 如果无法获取画布尺寸，返回原值
    }
    
    const canvasBoundsType: BoundsType = {
      x: 0,
      y: 0,
      width: canvasBounds.width,
      height: canvasBounds.height
    };
    
    // 使用统一的边界验证器
    return BoundsValidator.clampPointToCanvas(point, canvasBoundsType);
  }

  /**
   * 使用键盘移动选中的图形
   */
  public moveSelectedAction(deltaX: number, deltaY: number): DrawAction | null {
    if (!this.isTransformMode || !this.selectedActionForTransform) {
      return null;
    }

    // 检查delta有效性
    if (!isFinite(deltaX) || !isFinite(deltaY)) {
      logger.warn('SelectTool: 无效的移动偏移量', { deltaX, deltaY });
      return null;
    }

    const transformFn = (point: Point) => this.clampPointToCanvas(this.createMoveTransform(deltaX, deltaY)(point));
    const updatedAction = this.applyTransformToAction(this.selectedActionForTransform, transformFn);
    
    this.selectedActionForTransform = updatedAction;
    this.transformTool.setSelectedAction(updatedAction);

    return updatedAction;
  }

  /**
   * 移动所有选中的actions
   * 使用 TransformOperations 模块
   */
  public moveSelectedActions(deltaX: number, deltaY: number): DrawAction[] {
    const canvasBounds = this.getCanvasBounds() || undefined;
    
    const result = TransformOperations.moveActions(
      this.selectedActions,
      deltaX,
      deltaY,
      canvasBounds
    );

    if (!result.success) {
      logger.warn('SelectTool: 移动失败', { errors: result.errors });
    }

    this.selectedActions = result.actions;
    
    logger.debug(`SelectTool: 移动${result.actions.length}个actions，偏移量: (${deltaX}, ${deltaY})`);
    return result.actions;
  }

  /**
   * 缩放选中的action
   * 使用 TransformOperations 模块
   */
  public scaleSelectedAction(scaleX: number, scaleY: number, centerX: number, centerY: number): DrawAction | null {
    if (!this.isTransformMode || !this.selectedActionForTransform) {
      return null;
    }

    const canvasBounds = this.getCanvasBounds() || undefined;
    
    const result = TransformOperations.scaleAction(
      this.selectedActionForTransform,
      scaleX,
      scaleY,
      centerX,
      centerY,
      canvasBounds
    );

    if (!result.success || !result.action) {
      logger.warn('SelectTool: 缩放失败', { error: result.error });
      return null;
    }

    this.selectedActionForTransform = result.action;
    this.transformTool.setSelectedAction(result.action);

    logger.debug('SelectTool: 缩放action完成', {
      actionType: result.action.type,
      scaleX,
      scaleY
    });

    return result.action;
  }

  /**
   * 缩放所有选中的actions
   * 使用 TransformOperations 模块
   */
  public scaleSelectedActions(scaleX: number, scaleY: number, centerX: number, centerY: number): DrawAction[] {
    const canvasBounds = this.getCanvasBounds() || undefined;
    
    const result = TransformOperations.scaleActions(
      this.selectedActions,
      scaleX,
      scaleY,
      centerX,
      centerY,
      canvasBounds
    );

    if (!result.success) {
      logger.warn('SelectTool: 缩放失败', { errors: result.errors });
    }

    this.selectedActions = result.actions;
    
    // 如果只有一个选中的action，更新变换模式
    if (result.actions.length === 1) {
      this.selectedActionForTransform = result.actions[0];
      this.transformTool.setSelectedAction(result.actions[0]);
    }
    
    logger.debug(`SelectTool: 缩放${result.actions.length}个actions完成`, {
      scaleX,
      scaleY
    });
    
    return result.actions;
  }

  /**
   * 获取当前选择框的边界（用于框选过程中）
   */
  public getCurrentSelectionBounds(): { x: number; y: number; width: number; height: number } | null {
    return this.currentSelectionBounds;
  }

  /**
   * 获取所有选中actions的边界框
   * 优化：添加缓存机制，减少重复计算
   * 注意：拖拽时使用 selectedActionForTransform 而不是 selectedActions
   */
  public getSelectedActionsBounds(): { x: number; y: number; width: number; height: number } | null {
    if (this.selectedActions.length === 0) {
      this.cachedBounds = null;
      this.boundsCacheKey = null;
      return null;
    }
    
    // 如果正在拖拽，使用 selectedActionForTransform 而不是 selectedActions
    // 这样可以获取最新的边界框
    const actionsToUse = (this.isDraggingResizeAnchor && this.selectedActionForTransform && this.selectedActions.length === 1)
      ? [this.selectedActionForTransform]
      : this.selectedActions;
    
    // 【修复】生成缓存key（基于action IDs和内容指纹，确保内容变化时缓存失效）
    // 注意：如果正在拖拽，不使用缓存，确保实时更新
    // 之前只用 actionIds，导致变形/位移后缓存未失效
    const actionIds = actionsToUse.map(a => a.id).sort();
    const contentFingerprint = actionsToUse.map(a => {
      if (a.points.length === 0) return `${a.id}:empty`;
      const first = a.points[0];
      const last = a.points[a.points.length - 1];
      // 使用四舍五入减少浮点精度问题
      return `${a.id}:${Math.round(first.x)},${Math.round(first.y)},${Math.round(last.x)},${Math.round(last.y)},${a.points.length}`;
    }).join('|');
    const cacheKey = `${actionIds.join(',')}_${contentFingerprint}`;
    
    // 检查缓存（拖拽时不使用缓存）
    if (!this.isDraggingResizeAnchor && 
        this.boundsCacheKey === cacheKey && 
        this.cachedBounds) {
      return this.cachedBounds;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const action of actionsToUse) {
      const bounds = this.getActionBoundingBox(action);
      
      // 检查边界框是否有效
      if (!bounds || !isFinite(bounds.x) || !isFinite(bounds.y) || 
          !isFinite(bounds.width) || !isFinite(bounds.height) ||
          bounds.width <= 0 || bounds.height <= 0) {
        logger.warn('SelectTool.getSelectedActionsBounds: 发现无效的边界框', { 
          bounds, 
          actionId: action.id,
          actionType: action.type,
          pointsCount: action.points.length,
          points: action.points
        });
        continue; // 跳过无效的边界框
      }
      
      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
      maxX = Math.max(maxX, bounds.x + bounds.width);
      maxY = Math.max(maxY, bounds.y + bounds.height);
    }

    // 检查是否有有效边界
    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      logger.warn('SelectTool: 无法计算有效的选中边界框');
      return null;
    }

    const width = Math.max(0, maxX - minX);
    const height = Math.max(0, maxY - minY);

    const bounds = {
      x: minX,
      y: minY,
      width: width === 0 && height === 0 ? 10 : width, // 单点情况返回10x10
      height: width === 0 && height === 0 ? 10 : height
    };
    
    // 更新缓存（拖拽时不更新缓存，确保每次都重新计算）
    if (!this.isDraggingResizeAnchor) {
      this.boundsCacheKey = cacheKey;
      this.cachedBounds = bounds;
    }
    
    return bounds;
  }

  /**
   * 旋转选中的action
   */
  public rotateSelectedAction(angle: number, centerX: number, centerY: number): DrawAction | null {
    if (!this.isTransformMode || !this.selectedActionForTransform) {
      return null;
    }

    const radians = (angle * Math.PI) / 180;
    const canvasBounds = this.getCanvasBounds() || undefined;
    
    const result = TransformOperations.rotateAction(
      this.selectedActionForTransform,
      radians,
      centerX,
      centerY,
      canvasBounds
    );

    if (!result.success || !result.action) {
      logger.warn('SelectTool: 旋转失败', { error: result.error });
      return null;
    }

    this.selectedActionForTransform = result.action;
    this.transformTool.setSelectedAction(result.action);

    return result.action;
  }

  /**
   * 旋转所有选中的actions
   */
  public rotateSelectedActions(angle: number, centerX: number, centerY: number): DrawAction[] {
    // 转换为弧度
    const radians = (angle * Math.PI) / 180;
    const canvasBounds = this.getCanvasBounds() || undefined;
    
    const result = TransformOperations.rotateActions(
      this.selectedActions,
      radians,
      centerX,
      centerY,
      canvasBounds
    );

    if (!result.success) {
      logger.warn('SelectTool: 旋转失败', { errors: result.errors });
    }

    this.selectedActions = result.actions;
    
    // 如果只有一个选中的action，更新变换模式
    if (result.actions.length === 1) {
      this.selectedActionForTransform = result.actions[0];
      this.transformTool.setSelectedAction(result.actions[0]);
    }
    
    logger.debug(`SelectTool: 旋转${result.actions.length}个actions，角度: ${angle}°`);
    return result.actions;
  }

  /**
   * 获取控制点信息（用于调试或外部访问）
   */
  public getControlPoints(): ControlPoint[] {
    return this.transformTool.getControlPoints();
  }

  public getActionType(): string {
    return 'select';
  }

  // 重置动画状态
  public resetAnimation(): void {
    this.animationOffset = 0;
    this.lastAnimationTime = 0;
  }

  /**
   * 清理资源
   */
  public dispose(): void {
    this.exitTransformMode();
  }

  /**
   * 获取选择工具状态信息
   */
  public getSelectionInfo(): {
    selectedCount: number;
    bounds: { x: number; y: number; width: number; height: number } | null;
    isSelecting: boolean;
    isTransformMode: boolean;
  } {
    return {
      selectedCount: this.selectedActions.length,
      bounds: this.getSelectedActionsBounds(),
      isSelecting: this.isSelecting,
      isTransformMode: this.isTransformMode
    };
  }

  /**
   * 获取选择工具状态信息（用于调试）
   */
  public getDebugInfo(): {
    allActionsCount: number;
    selectedActionsCount: number;
    isTransformMode: boolean;
    isSelecting: boolean;
    isDraggingAnchor: boolean;
    isDraggingMove: boolean;
    anchorPointsCount: number;
    boundsCacheSize: number;
  } {
    return {
      allActionsCount: this.allActions.length,
      selectedActionsCount: this.selectedActions.length,
      isTransformMode: this.isTransformMode,
      isSelecting: this.isSelecting,
      isDraggingAnchor: this.isDraggingResizeAnchor,
      isDraggingMove: this.isDraggingMove,
      anchorPointsCount: this.anchorPoints.length + (this.centerAnchorPoint ? 1 : 0),
      boundsCacheSize: this.boundsCacheManager.size()
    };
  }

  /**
   * 强制更新选择工具状态
   */
  public forceUpdate(): void {
    // 重新生成锚点
    if (this.selectedActions.length > 0) {
      this.generateResizeAnchorPoints();
    }
    
    // 清除缓存
    this.clearBoundsCache();
    
    logger.debug('SelectTool: 强制更新状态', this.getDebugInfo());
  }

  /**
   * 键盘快捷键支持
   */
  public handleKeyboardEvent(event: KeyboardEvent): boolean {
    if (!this.isTransformMode || this.selectedActions.length === 0) {
      return false;
    }

    const step = 1; // 移动步长
    let handled = false;

    switch (event.key) {
      case 'ArrowLeft':
        this.moveSelectedActions(-step, 0);
        handled = true;
        break;
      case 'ArrowRight':
        this.moveSelectedActions(step, 0);
        handled = true;
        break;
      case 'ArrowUp':
        this.moveSelectedActions(0, -step);
        handled = true;
        break;
      case 'ArrowDown':
        this.moveSelectedActions(0, step);
        handled = true;
        break;
      case 'Delete':
      case 'Backspace':
        // 删除选中的actions，而不是只清除选择
        this.deleteSelectedActions();
        handled = true;
        break;
      case 'Escape':
        this.exitTransformMode();
        handled = true;
        break;
    }

    if (handled) {
      event.preventDefault();
    }

    return handled;
  }

  /**
   * 删除选中的actions
   * 返回被删除的action IDs，供外部（如DrawBoard）使用
   * 
   * 注意：此方法只清除选择状态，不实际删除actions
   * 实际的删除操作应该由DrawBoard.deleteSelection()完成，它会：
   * 1. 调用此方法获取要删除的action IDs
   * 2. 从HistoryManager中删除这些actions
   * 3. 触发重绘
   */
  public deleteSelectedActions(): string[] {
    if (this.selectedActions.length === 0) {
      return [];
    }

    const deletedActionIds = this.selectedActions.map(action => action.id);
    
    // 清除选择状态
    this.clearSelection();
    
    logger.debug(`SelectTool: 准备删除选中的actions，共${deletedActionIds.length}个`, {
      actionIds: deletedActionIds
    });
    
    // 返回被删除的action IDs，供外部（如DrawBoard）从HistoryManager中删除
    return deletedActionIds;
  }

  /**
   * 复制选中的actions
   */
  public copySelectedActions(): DrawAction[] {
    return this.selectedActions.map(action => ({
      ...action,
      id: `${action.id}_copy_${Date.now()}`,
      points: action.points.map(point => ({ ...point }))
    }));
  }

  /**
   * 粘贴actions（偏移一定距离）
   */
  public pasteActions(actions: DrawAction[], offsetX: number = 10, offsetY: number = 10): DrawAction[] {
    const pastedActions = actions.map(action => ({
      ...action,
      id: `${action.id}_paste_${Date.now()}`,
      points: action.points.map(point => ({
        ...point,
        x: point.x + offsetX,
        y: point.y + offsetY
      }))
    }));

    this.selectedActions = pastedActions;
    if (pastedActions.length === 1) {
      this.enterTransformMode(pastedActions[0]);
    }

    return pastedActions;
  }

  /**
   * 对齐选中的actions
   */
  public alignSelectedActions(alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): void {
    if (this.selectedActions.length < 2) return;

    const bounds = this.getSelectedActionsBounds();
    if (!bounds) return;

    const updatedActions: DrawAction[] = [];

    for (const action of this.selectedActions) {
      const actionBounds = this.getActionBoundingBox(action);
      let deltaX = 0;
      let deltaY = 0;

      switch (alignment) {
        case 'left':
          deltaX = bounds.x - actionBounds.x;
          break;
        case 'center':
          deltaX = (bounds.x + bounds.width / 2) - (actionBounds.x + actionBounds.width / 2);
          break;
        case 'right':
          deltaX = (bounds.x + bounds.width) - (actionBounds.x + actionBounds.width);
          break;
        case 'top':
          deltaY = bounds.y - actionBounds.y;
          break;
        case 'middle':
          deltaY = (bounds.y + bounds.height / 2) - (actionBounds.y + actionBounds.height / 2);
          break;
        case 'bottom':
          deltaY = (bounds.y + bounds.height) - (actionBounds.y + actionBounds.height);
          break;
      }

      const newPoints = action.points.map(point => ({
        ...point,
        x: point.x + deltaX,
        y: point.y + deltaY
      }));

      updatedActions.push({
        ...action,
        points: newPoints
      });
    }

    this.selectedActions = updatedActions;
    logger.debug(`SelectTool: 对齐${updatedActions.length}个actions，对齐方式: ${alignment}`);
  }

  /**
   * 重置选择工具状态
   */
  public reset(): void {
    this.clearSelection();
    this.isSelecting = false;
    this.selectionStartPoint = null;
    this.currentSelectionBounds = null;
    this.resetAnimation();
    logger.debug('SelectTool: 重置状态');
  }

  /**
   * 获取锚点信息
   */
  public getAnchorPoints(): Array<{ x: number; y: number; type: string; cursor: string }> {
    // 返回所有锚点（包括中心点）
    const allAnchors = [...this.anchorPoints];
    if (this.centerAnchorPoint) {
      allAnchors.push(this.centerAnchorPoint);
    }
    return allAnchors.map(anchor => ({
      x: anchor.x,
      y: anchor.y,
      type: anchor.type,
      cursor: anchor.cursor
    }));
  }

  /**
   * 检查是否正在拖拽变形锚点
   */
  public isDraggingAnchorPoint(): boolean {
    return this.isDraggingResizeAnchor;
  }

  /**
   * 设置锚点大小
   */
  public setAnchorSize(size: number): void {
    this.anchorSize = Math.max(4, Math.min(20, size));
    if (this.selectedActions.length > 0) {
      this.generateResizeAnchorPoints();
    }
  }

  /**
   * 设置锚点容差
   */
  public setAnchorTolerance(tolerance: number): void {
    this.anchorTolerance = Math.max(2, Math.min(15, tolerance));
  }

  /**
   * 强制更新锚点位置
   */
  public updateAnchorPoints(): void {
    if (this.selectedActions.length > 0) {
      this.generateResizeAnchorPoints();
    }
  }

  /**
   * 应用变换到单个action
   */
  private applyTransformToAction(action: DrawAction, transformFn: (point: Point) => Point): DrawAction {
    const newPoints = action.points.map(transformFn);
    const updatedAction = {
      ...action,
      points: newPoints
    };

    // 清除缓存
    this.clearActionBoundsCache(action.id);
    return updatedAction;
  }

  /**
   * 应用变换到多个actions
   */
  private applyTransformToActions(actions: DrawAction[], transformFn: (point: Point) => Point): DrawAction[] {
    const updatedActions = actions.map(action => this.applyTransformToAction(action, transformFn));
    
    // 更新选中actions
    this.selectedActions = updatedActions;
    
    // 如果只有一个选中的action，更新变换模式
    if (updatedActions.length === 1) {
      this.selectedActionForTransform = updatedActions[0];
      this.transformTool.setSelectedAction(updatedActions[0]);
    }
    
    return updatedActions;
  }

  /**
   * 移动变换函数
   */
  private createMoveTransform(deltaX: number, deltaY: number): (point: Point) => Point {
    return (point: Point) => ({
      ...point,
      x: point.x + deltaX,
      y: point.y + deltaY
    });
  }

} 