import { DrawTool, type DrawAction } from './DrawTool';
import { TransformToolRefactored } from './TransformToolRefactored';
import type { ControlPoint } from './transform/TransformTypes';
import type { Point, CanvasEngine } from '../core/CanvasEngine';
import { logger } from '../utils/Logger';
import type { AnchorPoint, AnchorType, Bounds, ShapeAnchorHandler } from './anchor/AnchorTypes';
import { CircleAnchorHandler } from './anchor/CircleAnchorHandler';
import { RectAnchorHandler } from './anchor/RectAnchorHandler';
import { TextAnchorHandler } from './anchor/TextAnchorHandler';
import { LineAnchorHandler } from './anchor/LineAnchorHandler';
import { PenAnchorHandler } from './anchor/PenAnchorHandler';
import { PolygonAnchorHandler } from './anchor/PolygonAnchorHandler';
import { BoundsValidator, type Bounds as BoundsType } from '../utils/BoundsValidator';
import { SpatialIndex } from '../utils/SpatialIndex';
// 模块化拆分后的子模块
import { 
  HitTestManager, 
  BoxSelectionManager, 
  SelectionRenderer,
  AnchorCacheManager,
  DragStateManager,
  BoundsCacheManager
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
    
    // 应用配置（如果提供）
    if (config) {
      this.updateDragConfig(config);
    }
    
    // 初始化图形处理器
    this.shapeHandlers.set('circle', new CircleAnchorHandler());
    this.shapeHandlers.set('rect', new RectAnchorHandler());
    this.shapeHandlers.set('text', new TextAnchorHandler());
    this.shapeHandlers.set('line', new LineAnchorHandler());
    this.shapeHandlers.set('polygon', new PolygonAnchorHandler());
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
    
    logger.debug('SelectTool: 拖拽配置已更新', this.dragConfig);
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
    logger.debug('SelectTool.setCanvasEngine', {
      selectedLayerZIndex,
      previousSelectedLayerZIndex: this.selectedLayerZIndex,
      hasCanvasEngine: !!canvasEngine
    });
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
    logger.debug('SelectTool.getInteractionContext', {
      hasCanvasEngine: !!this.canvasEngine,
      selectedLayerZIndex: this.selectedLayerZIndex
    });
    
    if (this.canvasEngine && this.selectedLayerZIndex !== null && this.selectedLayerZIndex !== undefined) {
      try {
        const ctx = this.canvasEngine.getSelectionLayerForVirtualLayer(this.selectedLayerZIndex);
        logger.debug('SelectTool.getInteractionContext: 成功获取动态图层', {
          selectedLayerZIndex: this.selectedLayerZIndex,
          canvasWidth: ctx.canvas.width,
          canvasHeight: ctx.canvas.height
        });
        return ctx;
      } catch (error) {
        logger.error('获取动态图层失败，回退到interaction层:', error, {
          selectedLayerZIndex: this.selectedLayerZIndex
        });
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
      logger.info('SelectTool.setLayerActions: 清空选择（clearSelection=true）', {
        previousSelectedCount,
        previousSelectedIds
      });
      this.clearSelection();
    } else {
      // 清理不在当前图层中的选中actions
      const beforeFilterCount = this.selectedActions.length;
      
      // 过滤选中的actions，只保留在当前图层中的actions
      // 注意：如果选中的action不在新的actions中，但之前在allActions中存在，则保留选择
      // 这样可以避免在图层切换过程中丢失选择（特别是individual模式）
      // 改进：在individual模式下，如果action不在新的actions中，也从allActions中查找（包括历史记录）
      const filteredActions = this.selectedActions.filter(selectedAction => {
        // 首先检查新的actions中是否有这个action
        const foundInNewActions = actions.find(action => action.id === selectedAction.id);
        if (foundInNewActions) {
          return true;
        }
        
        // 如果没找到，检查之前的allActions中是否有这个action
        // 这样可以避免在图层切换过程中丢失选择
        const foundInPreviousActions = previousAllActions.find(action => action.id === selectedAction.id);
        if (foundInPreviousActions) {
          logger.debug('SelectTool.setLayerActions: 选中的action不在新的actions中，但之前在allActions中存在，保留选择', {
            actionId: selectedAction.id,
            actionType: selectedAction.type
          });
          return true;
        }
        
        // 如果还是没找到，但action有virtualLayerId，说明它属于某个图层，也应该保留
        // 这在individual模式下特别重要，因为每个action都有自己的图层
        // 注意：在individual模式下，即使action不在新的actions中，也应该保留（因为每个action都有自己的图层）
        if (selectedAction.virtualLayerId) {
          logger.debug('SelectTool.setLayerActions: 选中的action不在新的actions中，但有virtualLayerId，保留选择', {
            actionId: selectedAction.id,
            actionType: selectedAction.type,
            virtualLayerId: selectedAction.virtualLayerId
          });
          return true;
        }
        
        logger.debug('SelectTool.setLayerActions: 选中的action不在新的actions中，也不在allActions中，过滤掉', {
          actionId: selectedAction.id,
          actionType: selectedAction.type,
          hasVirtualLayerId: !!selectedAction.virtualLayerId
        });
        return false;
      });
      
      // 如果过滤后actions数量减少，但之前有选中的actions，记录警告
      if (filteredActions.length < beforeFilterCount && beforeFilterCount > 0) {
        const filteredOutIds = previousSelectedIds.filter(id => !filteredActions.some(a => a.id === id));
        logger.warn('SelectTool.setLayerActions: 部分选中的actions被过滤掉', {
          beforeFilterCount,
          afterFilterCount: filteredActions.length,
          filteredOutIds,
          allActionIds: actions.map(a => a.id),
          previousAllActionIds: previousAllActions.map(a => a.id)
        });
      }
      
      this.selectedActions = filteredActions;
      
      logger.info('SelectTool.setLayerActions: 过滤选中的actions', {
        beforeFilterCount,
        afterFilterCount: this.selectedActions.length,
        filteredOutIds: previousSelectedIds.filter(id => !this.selectedActions.some(a => a.id === id)),
        remainingIds: this.selectedActions.map(a => a.id),
        allActionIds: actions.map(a => a.id)
      });
      
      // 如果选中的actions发生变化，更新变换模式
      // 注意：在individual模式下，即使action不在新的actions中，也应该保留选择
      if (this.selectedActions.length === 1) {
        // 【修复】先清除缓存，再进入变换模式
        // 之前顺序是 enterTransformMode → clearAnchorCache，导致刚生成的锚点缓存被清除
        this.clearAnchorCache();
        this.clearBoundsCache();
        this.enterTransformMode(this.selectedActions[0]);
        logger.debug('SelectTool.setLayerActions: 进入变换模式', {
          actionId: this.selectedActions[0].id,
          actionType: this.selectedActions[0].type
        });
      } else if (this.selectedActions.length === 0) {
        this.exitTransformMode();
      } else if (this.selectedActions.length > 1) {
        // 多选时，清除变换模式
        this.exitTransformMode();
        // 清除锚点缓存
        this.clearAnchorCache();
        this.clearBoundsCache();
      }
    }
    
    // 清除缓存
    this.clearBoundsCache();
    
    // 清空空间索引缓存（图层切换时重建）
    this.clearSpatialIndex();
    
    logger.info(`SelectTool: 设置图层actions，共${actions.length}个，当前选中${this.selectedActions.length}个`, {
      clearedSelection: clearSelection,
      previousSelectedCount,
      currentSelectedCount: this.selectedActions.length
    });
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
   * 对于圆形、矩形、直线：只使用起点和终点计算（与实际绘制一致）
   * 对于其他图形：使用所有点计算
   */
  private getActionBoundingBox(action: DrawAction): { x: number; y: number; width: number; height: number } {
    if (action.points.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    // 检查缓存（使用 BoundsCacheManager）
    const cachedBounds = this.boundsCacheManager.getForAction(action);
    if (cachedBounds) {
      return cachedBounds;
    }

    let bounds: { x: number; y: number; width: number; height: number };

    // 【圆形】特殊处理：返回以圆心为中心的正方形边界框
    if (action.type === 'circle' && action.points.length >= 2) {
      const center = action.points[0];
      const edge = action.points[action.points.length - 1];
      const radius = Math.sqrt(
        Math.pow(edge.x - center.x, 2) + Math.pow(edge.y - center.y, 2)
      );
      
      const MIN_VISIBLE_RADIUS = this.anchorSize;
      const validRadius = Math.max(MIN_VISIBLE_RADIUS, radius);
      
      if (!isFinite(center.x) || !isFinite(center.y) || !isFinite(validRadius) || validRadius <= 0) {
        bounds = {
          x: (isFinite(center.x) ? center.x : 0) - 50,
          y: (isFinite(center.y) ? center.y : 0) - 50,
          width: 100,
          height: 100
        };
      } else {
        bounds = {
        x: center.x - validRadius,
        y: center.y - validRadius,
        width: validRadius * 2,
        height: validRadius * 2
      };
      }
    }
    // 【矩形】特殊处理：只使用起点和终点
    else if (action.type === 'rect' && action.points.length >= 2) {
      const start = action.points[0];
      const end = action.points[action.points.length - 1];
      
      if (!isFinite(start.x) || !isFinite(start.y) || !isFinite(end.x) || !isFinite(end.y)) {
        bounds = { x: 0, y: 0, width: 0, height: 0 };
      } else {
        const minX = Math.min(start.x, end.x);
        const minY = Math.min(start.y, end.y);
        const maxX = Math.max(start.x, end.x);
        const maxY = Math.max(start.y, end.y);
        
        bounds = {
          x: minX,
          y: minY,
          width: Math.max(maxX - minX, 1),
          height: Math.max(maxY - minY, 1)
        };
      }
    }
    // 【直线】特殊处理：只使用起点和终点
    else if (action.type === 'line' && action.points.length >= 2) {
      const start = action.points[0];
      const end = action.points[action.points.length - 1];
      
      if (!isFinite(start.x) || !isFinite(start.y) || !isFinite(end.x) || !isFinite(end.y)) {
        bounds = { x: 0, y: 0, width: 0, height: 0 };
      } else {
        const minX = Math.min(start.x, end.x);
        const minY = Math.min(start.y, end.y);
        const maxX = Math.max(start.x, end.x);
        const maxY = Math.max(start.y, end.y);
        
        bounds = {
          x: minX,
          y: minY,
          width: Math.max(maxX - minX, 1),
          height: Math.max(maxY - minY, 1)
        };
      }
    }
    // 【多边形】特殊处理：使用中心+半径计算实际顶点的边界框
    else if (action.type === 'polygon' && action.points.length >= 2) {
      const center = action.points[0];
      const edge = action.points[action.points.length - 1];
      const radius = Math.sqrt(
        Math.pow(edge.x - center.x, 2) + Math.pow(edge.y - center.y, 2)
      );
      
      if (!isFinite(center.x) || !isFinite(center.y) || !isFinite(radius) || radius <= 0) {
        bounds = { x: 0, y: 0, width: 0, height: 0 };
      } else {
        // 多边形的边界框是以中心为圆心、半径为radius的正方形
        // （因为正多边形的顶点都在这个圆上）
        bounds = {
          x: center.x - radius,
          y: center.y - radius,
          width: radius * 2,
          height: radius * 2
        };
      }
    }
    // 【其他图形】使用所有点计算边界框
    else {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let validPointCount = 0;

    for (const point of action.points) {
      if (!isFinite(point.x) || !isFinite(point.y)) {
          continue;
      }
      
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
      validPointCount++;
    }

    if (validPointCount === 0) {
        bounds = { x: 0, y: 0, width: 0, height: 0 };
      } else {
    const width = Math.max(0, maxX - minX);
    const height = Math.max(0, maxY - minY);

        bounds = {
      x: minX,
      y: minY,
          width: width === 0 && height === 0 ? 10 : width,
      height: width === 0 && height === 0 ? 10 : height
    };
      }
    }

    // 缓存结果（使用 BoundsCacheManager）
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
    logger.debug(`SelectTool: 选中单个action，ID: ${action.id}`);
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
    logger.debug('SelectTool: 清空选择');
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
    
    logger.debug(`SelectTool: 设置选中actions，共${actions.length}个`);
  }

  /**
   * 生成锚点（根据图形类型使用不同的处理器）
   * 改进：支持中心点和图形特定的锚点布局
   * 优化：添加缓存机制，减少重复计算
   */
  private generateResizeAnchorPoints(): void {
    logger.debug('SelectTool.generateResizeAnchorPoints: 开始生成锚点', {
      selectedActionsCount: this.selectedActions.length,
      selectedActionIds: this.selectedActions.map(a => a.id),
      isDraggingResizeAnchor: this.isDraggingResizeAnchor
    });
    
    // 如果正在拖拽，强制清除缓存，确保使用最新的 selectedActionForTransform
    if (this.isDraggingResizeAnchor) {
      this.clearAnchorCache();
    }
    
    // 检查缓存是否有效
    // 【修复】缓存键必须包含 action 的内容变化指示器（不仅仅是 ID）
    // 否则变形/位移后，ID 相同但 points 改变，会错误地使用旧缓存
    // 使用 action 的第一个和最后一个点的坐标作为内容指纹
    const currentActionIds = this.selectedActions.map(a => a.id).sort();
    const contentFingerprint = this.selectedActions.map(a => {
      if (a.points.length === 0) return `${a.id}:empty`;
      const first = a.points[0];
      const last = a.points[a.points.length - 1];
      // 使用四舍五入减少浮点精度问题
      return `${a.id}:${Math.round(first.x)},${Math.round(first.y)},${Math.round(last.x)},${Math.round(last.y)},${a.points.length}`;
    }).join('|');
    const cacheKey = `${currentActionIds.join(',')}_${contentFingerprint}`;
    
    // 拖拽时不使用缓存，确保实时更新
    if (!this.isDraggingResizeAnchor && 
        this.anchorCache && 
        this.anchorCache.actionIds.sort().join(',') === cacheKey &&
        Date.now() - this.anchorCache.timestamp < this.dragConfig.anchorCacheTTL) {
      // 使用缓存
      this.anchorPoints = this.anchorCache.anchors;
      this.centerAnchorPoint = this.anchorCache.centerAnchor;
      this.moveArea = this.anchorCache.moveArea;
      
      logger.debug('SelectTool.generateResizeAnchorPoints: 使用缓存锚点', {
        anchorPointsCount: this.anchorPoints.length,
        centerAnchorPoint: !!this.centerAnchorPoint
      });
      return;
    }

    // 获取当前时间（用于节流和缓存时间戳）
    const currentTime = Date.now();
    
    // 检查是否需要更新（节流）
    // 拖拽时不节流，确保实时更新
    // 注意：如果缓存键不匹配或缓存不存在，必须重新生成锚点，不能直接返回
    if (!this.isDraggingResizeAnchor) {
      if (currentTime - this.lastAnchorUpdateTime < this.anchorUpdateInterval) {
        // 如果缓存存在且缓存键匹配，使用缓存（避免频繁更新）
        if (this.anchorCache && this.anchorCache.actionIds.sort().join(',') === cacheKey) {
          this.anchorPoints = this.anchorCache.anchors;
          this.centerAnchorPoint = this.anchorCache.centerAnchor;
          this.moveArea = this.anchorCache.moveArea;
          
          logger.debug('SelectTool.generateResizeAnchorPoints: 使用节流缓存锚点', {
            anchorPointsCount: this.anchorPoints.length,
            centerAnchorPoint: !!this.centerAnchorPoint
          });
          return;
        }
        // 如果缓存键不匹配，说明选中的actions变了，必须重新生成，不能节流
        logger.debug('SelectTool.generateResizeAnchorPoints: 缓存键不匹配，跳过节流，重新生成锚点', {
          cacheKey,
          cachedKey: this.anchorCache?.actionIds.sort().join(',')
        });
      }
    }

    // 在拖拽过程中，使用 selectedActionForTransform 计算边界框
    const bounds = this.isDraggingResizeAnchor && this.selectedActionForTransform
      ? this.getActionBoundingBox(this.selectedActionForTransform)
      : this.getSelectedActionsBounds();
    if (!bounds) {
      logger.error('SelectTool.generateResizeAnchorPoints: 边界框为空，无法生成锚点', {
        selectedActionsCount: this.selectedActions.length,
        selectedActionIds: this.selectedActions.map(a => a.id),
        isDraggingResizeAnchor: this.isDraggingResizeAnchor,
        hasSelectedActionForTransform: !!this.selectedActionForTransform,
        selectedActions: this.selectedActions.map(a => ({
          id: a.id,
          type: a.type,
          pointsCount: a.points.length,
          points: a.points
        }))
      });
      this.clearAnchorCache();
      this.anchorPoints = [];
      this.centerAnchorPoint = null;
      this.moveArea = null;
      return;
    }

    logger.debug('SelectTool.generateResizeAnchorPoints: 计算边界框', bounds);

    // 多选场景：使用统一边界框，不显示中心点
    if (this.selectedActions.length > 1) {
      logger.debug('SelectTool.generateResizeAnchorPoints: 多选场景，生成多选锚点');
      this.generateMultiSelectionAnchors(bounds);
      logger.debug('SelectTool.generateResizeAnchorPoints: 多选锚点生成完成', {
        anchorPointsCount: this.anchorPoints.length
      });
      return;
    }

    // 单选场景：使用图形特定的处理器
    // 注意：如果正在拖拽，使用 selectedActionForTransform（最新的action），否则使用 selectedActions[0]
    const action = (this.isDraggingResizeAnchor && this.selectedActionForTransform) 
      ? this.selectedActionForTransform 
      : this.selectedActions[0];
    if (!action) {
      logger.warn('SelectTool.generateResizeAnchorPoints: 没有选中的action，清除锚点');
      this.anchorPoints = [];
      this.centerAnchorPoint = null;
      this.moveArea = null;
      return;
    }

    logger.debug('SelectTool.generateResizeAnchorPoints: 单选场景，使用图形处理器', {
      actionType: action.type,
      actionId: action.id
    });

    const handler = this.shapeHandlers.get(action.type);
    if (handler) {
      // 对于圆形，使用单个 action 的边界框（而不是统一边界框）
      // 这样可以确保边界框是以圆心为中心的正方形
      const actionBounds = action.type === 'circle' 
        ? this.getActionBoundingBox(action)
        : bounds;
      
      // 验证边界框有效性
      if (!actionBounds || actionBounds.width <= 0 || actionBounds.height <= 0) {
        logger.warn('SelectTool.generateResizeAnchorPoints: 边界框无效，使用默认边界框', {
          actionType: action.type,
          actionId: action.id,
          actionBounds,
          bounds,
          actionPointsCount: action.points.length,
          actionPoints: action.points
        });
        // 使用传入的bounds作为fallback
        const fallbackBounds = bounds || { x: 0, y: 0, width: 100, height: 100 };
        const anchors = handler.generateAnchors(action, fallbackBounds);
        this.anchorPoints = anchors.filter(anchor => !anchor.isCenter);
        this.centerAnchorPoint = anchors.find(anchor => anchor.isCenter) || null;
        
        logger.info('SelectTool.generateResizeAnchorPoints: 使用fallback边界框生成锚点', {
          fallbackBounds,
          totalAnchors: anchors.length,
          edgeAnchors: this.anchorPoints.length,
          centerAnchor: !!this.centerAnchorPoint
        });
      } else {
        // 使用图形特定的处理器生成锚点
        logger.debug('SelectTool.generateResizeAnchorPoints: 调用handler.generateAnchors', {
          actionType: action.type,
          actionId: action.id,
          actionBounds,
          actionPointsCount: action.points.length,
          handlerType: handler.constructor.name
        });
        
        const anchors = handler.generateAnchors(action, actionBounds);
        
        // 详细记录handler返回的锚点
        logger.info('SelectTool.generateResizeAnchorPoints: handler.generateAnchors返回原始锚点', {
          totalAnchors: anchors.length,
          anchors: anchors.map((a, i) => ({
            index: i,
            type: a.type,
            isCenter: a.isCenter,
            x: a.x,
            y: a.y
          }))
        });
        
        // 赋值锚点
        const edgeAnchors = anchors.filter(anchor => !anchor.isCenter);
        const centerAnchor = anchors.find(anchor => anchor.isCenter) || null;
        
        // 立即赋值并记录
        this.anchorPoints = edgeAnchors;
        this.centerAnchorPoint = centerAnchor;
        
        logger.info('SelectTool.generateResizeAnchorPoints: 锚点赋值完成', {
          totalAnchors: anchors.length,
          edgeAnchorsCount: edgeAnchors.length,
          centerAnchor: !!centerAnchor,
          thisAnchorPointsLength: this.anchorPoints.length,
          thisCenterAnchorPoint: !!this.centerAnchorPoint,
          edgeAnchors: edgeAnchors.map((a, i) => ({
            index: i,
            type: a.type,
            x: a.x,
            y: a.y
          }))
        });
      }
      
      // 在方法结束前再次验证锚点状态
      logger.info('SelectTool.generateResizeAnchorPoints: 图形处理器生成锚点完成（方法结束前验证）', {
        actionType: action.type,
        actionId: action.id,
        totalAnchors: this.anchorPoints.length + (this.centerAnchorPoint ? 1 : 0),
        edgeAnchors: this.anchorPoints.length,
        centerAnchor: !!this.centerAnchorPoint,
        actionBounds: action.type === 'circle' ? this.getActionBoundingBox(action) : bounds,
        handlerExists: !!handler,
        anchorPointsArray: this.anchorPoints.map((a, i) => ({
          index: i,
          type: a.type,
          x: a.x,
          y: a.y
        }))
      });
      
      // 如果锚点数量为0，记录详细日志用于调试并尝试修复
      if (this.anchorPoints.length === 0 && !this.centerAnchorPoint) {
        logger.error('SelectTool.generateResizeAnchorPoints: 锚点生成失败，返回空数组', {
          actionType: action.type,
          actionId: action.id,
          actionPointsCount: action.points.length,
          actionPoints: action.points,
          actionBounds: action.type === 'circle' ? this.getActionBoundingBox(action) : bounds,
          handlerType: handler.constructor.name,
          handlerExists: !!handler,
          shapeHandlersKeys: Array.from(this.shapeHandlers.keys())
        });
        
        // 尝试使用fallback边界框重新生成锚点
        const fallbackBounds = bounds || { x: 0, y: 0, width: 100, height: 100 };
        try {
          const fallbackAnchors = handler.generateAnchors(action, fallbackBounds);
          if (fallbackAnchors.length > 0) {
            logger.warn('SelectTool.generateResizeAnchorPoints: 使用fallback边界框成功生成锚点', {
              fallbackAnchorsCount: fallbackAnchors.length
            });
            this.anchorPoints = fallbackAnchors.filter(anchor => !anchor.isCenter);
            this.centerAnchorPoint = fallbackAnchors.find(anchor => anchor.isCenter) || null;
          }
        } catch (error) {
          logger.error('SelectTool.generateResizeAnchorPoints: fallback生成锚点也失败', error);
        }
      }
    } else {
      // 默认：生成8个标准锚点（无中心点）
      logger.warn(`❌ SelectTool: 未找到图形类型 "${action.type}" 的处理器，使用默认8个锚点`);
      logger.warn(`   已注册的处理器: ${Array.from(this.shapeHandlers.keys()).join(', ')}`);
      this.generateDefaultAnchors(bounds);
      this.centerAnchorPoint = null;
      logger.debug('SelectTool.generateResizeAnchorPoints: 默认锚点生成完成', {
        anchorPointsCount: this.anchorPoints.length
      });
    }

    // 生成移动区域（选区内部，排除锚点区域）
    // 改进：扩大移动区域，让用户更容易点击到移动区域
    const { x, y, width, height } = bounds;
    // 减小padding，扩大移动区域（只排除锚点本身，不包括容差区域）
    const moveAreaPadding = this.anchorSize / 2;
    this.moveArea = {
      x: x + moveAreaPadding,
      y: y + moveAreaPadding,
      width: Math.max(0, width - moveAreaPadding * 2),
      height: Math.max(0, height - moveAreaPadding * 2)
    };

    this.lastAnchorUpdateTime = currentTime;
    
    // 更新缓存
    // 注意：拖拽时不更新缓存，确保每次都重新计算
    // 拖拽结束后，selectedActions[0] 已更新，此时会基于新的 selectedActions 生成缓存
    if (!this.isDraggingResizeAnchor) {
      // 确保缓存中存储的是锚点数组的副本，而不是引用
      // 这样可以避免后续对 this.anchorPoints 的修改影响缓存
      this.anchorCache = {
        actionIds: [...currentActionIds], // 副本
        bounds: { ...bounds }, // 副本
        anchors: [...this.anchorPoints], // 副本，避免引用问题
        centerAnchor: this.centerAnchorPoint ? { ...this.centerAnchorPoint } : null, // 副本
        moveArea: this.moveArea ? { ...this.moveArea } : null, // 副本
        timestamp: currentTime
      };
      
      logger.debug('SelectTool.generateResizeAnchorPoints: 缓存已更新', {
        actionIds: this.anchorCache.actionIds,
        anchorsCount: this.anchorCache.anchors.length,
        centerAnchor: !!this.anchorCache.centerAnchor,
        thisAnchorPointsLength: this.anchorPoints.length
      });
    }
  }
  
  /**
   * 清除锚点缓存
   */
  private clearAnchorCache(): void {
    // 注意：清空缓存时，不要清空 anchorPoints，因为可能正在使用
    // 只有在真正需要清除时才清空 anchorPoints（比如选择被清空）
    // 这里只清空缓存，让下次调用 generateResizeAnchorPoints 时重新生成
    this.anchorCache = null;
    // 重置节流时间，确保下次调用时会重新生成
    this.lastAnchorUpdateTime = 0;
    logger.debug('SelectTool.clearAnchorCache: 已清除锚点缓存', {
      anchorPointsCount: this.anchorPoints.length,
      centerAnchorPoint: !!this.centerAnchorPoint
    });
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
    
    // 检查拖拽状态缓存（如果移动距离很小，使用上次结果）
    if (this.dragState && this.dragState.lastResult) {
      const distance = Math.sqrt(
        Math.pow(point.x - this.dragState.lastPoint.x, 2) +
        Math.pow(point.y - this.dragState.lastPoint.y, 2)
      );
      if (distance < 1) { // 小于1像素，使用缓存
        return this.dragState.lastResult;
      }
    }
    
    // 确保不是中心点拖拽（中心点拖拽应该走移动逻辑）
    if (this.isDraggingCenter) {
      logger.warn('SelectTool: 中心点拖拽不应该进入handleResizeAnchorDrag');
      return null;
    }

    // 多选场景：使用统一处理
    if (this.selectedActions.length > 1) {
      return this.handleMultiSelectionAnchorDrag(point);
    }

    // 单选场景：使用图形特定的处理器
    const action = this.selectedActions[0];
    if (!action) return null;

    const anchor = this.anchorPoints[this.draggedAnchorIndex];
    if (!anchor) return null;

    const handler = this.shapeHandlers.get(action.type);
    if (!handler) {
      // 没有处理器，使用默认处理
      return this.handleDefaultAnchorDrag(point);
    }

    // 在拖拽开始时保存原始边界框（只计算一次）
    if (!this.dragStartBounds) {
    const bounds = this.getSelectedActionsBounds();
    if (!bounds) return null;
      this.dragStartBounds = { ...bounds };
    }

    const bounds = this.dragStartBounds;
    if (!bounds) return null;
    
    // 检查点坐标有效性
    if (!isFinite(point.x) || !isFinite(point.y)) {
      return null;
    }
    
    // 使用鼠标的实际移动距离来计算边界框变化
    // 直接使用当前鼠标位置和起始位置计算
    const rawMouseDeltaX = point.x - this.dragStartPoint.x;
    const rawMouseDeltaY = point.y - this.dragStartPoint.y;
    
    // 检查delta是否有效
    if (!isFinite(rawMouseDeltaX) || !isFinite(rawMouseDeltaY)) {
      return null;
    }
    
    // 平滑处理：如果移动距离太小，忽略（避免微小抖动）
    const moveDistance = Math.sqrt(rawMouseDeltaX * rawMouseDeltaX + rawMouseDeltaY * rawMouseDeltaY);
    if (moveDistance < this.MIN_DRAG_DISTANCE) {
      return null; // 移动距离太小，忽略
    }

    // 对于圆形，直接使用原始点（不应用敏感度），让半径精确跟随鼠标
    // 对于其他图形，可以选择性应用敏感度
    const isCircle = action.type === 'circle';
    let targetPoint: Point;
    
    if (isCircle) {
      // 圆形：直接使用原始点，让半径精确跟随鼠标移动
      targetPoint = point;
    } else {
      // 其他图形：应用敏感度因子，减少拖拽敏感度（让变形更可控）
      const mouseDeltaX = rawMouseDeltaX * this.DRAG_SENSITIVITY;
      const mouseDeltaY = rawMouseDeltaY * this.DRAG_SENSITIVITY;
      targetPoint = {
        x: this.dragStartPoint.x + mouseDeltaX,
        y: this.dragStartPoint.y + mouseDeltaY,
        timestamp: point.timestamp
      };
    }

    // 使用图形特定的处理器处理锚点拖拽
    // 对于圆形，处理器会直接计算鼠标到圆心的距离，提供精确控制
    const canvasBounds = this.getCanvasBounds();
    const updatedAction = handler.handleAnchorDrag(
      this.dragStartAction || action,
      anchor.type,
      this.dragStartPoint,
      targetPoint, // 圆形使用原始点，其他图形使用调整后的点
      bounds,
      this.dragStartAction || undefined
    );

    if (!updatedAction) {
      return null;
    }

    // 限制点在画布范围内（如果处理器没有处理）
    if (canvasBounds) {
      const clampedAction = {
        ...updatedAction,
        points: updatedAction.points.map(p => {
          const clampedPoint = {
          ...p,
          x: Math.max(0, Math.min(canvasBounds.width, p.x)),
          y: Math.max(0, Math.min(canvasBounds.height, p.y))
          };
          return clampedPoint;
        })
      };
      
      // 更新selectedActionForTransform
      this.selectedActionForTransform = clampedAction;
      this.transformTool.setSelectedAction(clampedAction);
      
      return clampedAction;
    }

    // 更新selectedActionForTransform
    this.selectedActionForTransform = updatedAction;
    this.transformTool.setSelectedAction(updatedAction);
    
    // 更新拖拽状态缓存
    if (!this.dragState) {
      const bounds = this.getSelectedActionsBounds();
      if (bounds) {
        this.dragState = {
          startBounds: bounds,
          startAction: action,
          lastPoint: point,
          lastResult: null
        };
      }
    }
    if (this.dragState) {
      this.dragState.lastPoint = point;
      this.dragState.lastResult = updatedAction;
    }
    
    return updatedAction;
  }

  /**
   * 处理多选场景的锚点拖拽
   * 所有选中图形按统一边界框进行缩放
   */
  private handleMultiSelectionAnchorDrag(point: Point): DrawAction[] | null {
    if (!this.dragStartPoint || !this.dragStartBounds) return null;

    const anchor = this.anchorPoints[this.draggedAnchorIndex];
    if (!anchor) return null;

    // 计算鼠标移动距离
    const rawMouseDeltaX = point.x - this.dragStartPoint.x;
    const rawMouseDeltaY = point.y - this.dragStartPoint.y;

    // 检查delta是否有效
    if (!isFinite(rawMouseDeltaX) || !isFinite(rawMouseDeltaY)) {
      return null;
    }
    
    // 平滑处理：如果移动距离太小，忽略（避免微小抖动）
    const moveDistance = Math.sqrt(rawMouseDeltaX * rawMouseDeltaX + rawMouseDeltaY * rawMouseDeltaY);
    if (moveDistance < this.MIN_DRAG_DISTANCE) {
      return null; // 移动距离太小，忽略
    }
    
    // 应用敏感度因子，减少拖拽敏感度（让变形更可控）
    const mouseDeltaX = rawMouseDeltaX * this.DRAG_SENSITIVITY;
    const mouseDeltaY = rawMouseDeltaY * this.DRAG_SENSITIVITY;

    // 根据锚点类型计算新的边界框
    const newBounds = this.calculateNewBoundsForAnchor(
      this.dragStartBounds,
      anchor.type,
      mouseDeltaX,
      mouseDeltaY
    );

    if (!newBounds) {
      return null;
    }

    // 使用统一边界框进行缩放
    const result = this.applyBoundsTransform(newBounds, this.dragStartBounds);
    if (!result) {
      return null;
    }

    // 确保返回数组
    const updatedActions = Array.isArray(result) ? result : [result];
    
    // 更新拖拽状态缓存
    if (!this.dragState) {
      const bounds = this.getSelectedActionsBounds();
      if (bounds && updatedActions.length > 0) {
        this.dragState = {
          startBounds: bounds,
          startAction: updatedActions[0],
          lastPoint: point,
          lastResult: null
        };
      }
    }
    if (this.dragState) {
      this.dragState.lastPoint = point;
      this.dragState.lastResult = updatedActions;
    }

    return updatedActions;
  }

  /**
   * 处理默认锚点拖拽（用于没有处理器的图形类型）
   */
  private handleDefaultAnchorDrag(point: Point): DrawAction | null {
    if (!this.dragStartPoint || !this.dragStartBounds) return null;

    const action = this.selectedActions[0];
    if (!action) return null;

    const anchor = this.anchorPoints[this.draggedAnchorIndex];
    if (!anchor) return null;

    // 计算鼠标移动距离
    const rawMouseDeltaX = point.x - this.dragStartPoint.x;
    const rawMouseDeltaY = point.y - this.dragStartPoint.y;

    // 检查delta是否有效
    if (!isFinite(rawMouseDeltaX) || !isFinite(rawMouseDeltaY)) {
      return null;
    }
    
    // 平滑处理：如果移动距离太小，忽略（避免微小抖动）
    const moveDistance = Math.sqrt(rawMouseDeltaX * rawMouseDeltaX + rawMouseDeltaY * rawMouseDeltaY);
    if (moveDistance < this.MIN_DRAG_DISTANCE) {
      return null; // 移动距离太小，忽略
    }
    
    // 应用敏感度因子，减少拖拽敏感度（让变形更可控）
    const mouseDeltaX = rawMouseDeltaX * this.DRAG_SENSITIVITY;
    const mouseDeltaY = rawMouseDeltaY * this.DRAG_SENSITIVITY;

    // 根据锚点类型计算新的边界框
    const newBounds = this.calculateNewBoundsForAnchor(
      this.dragStartBounds,
      anchor.type,
      mouseDeltaX,
      mouseDeltaY
    );

    if (!newBounds) {
      return null;
    }

    // 使用通用缩放逻辑
    const result = this.applyBoundsTransform(newBounds, this.dragStartBounds);
    if (!result) {
      return null;
    }

    // 返回单个action
    return Array.isArray(result) ? result[0] : result;
  }

  /**
   * 根据锚点类型和鼠标移动计算新的边界框
   */
  private calculateNewBoundsForAnchor(
    bounds: { x: number; y: number; width: number; height: number },
    anchorType: AnchorType,
    deltaX: number,
    deltaY: number
  ): { x: number; y: number; width: number; height: number } | null {
    const newBounds = { ...bounds };

    switch (anchorType) {
      case 'top-left':
        newBounds.x = bounds.x + deltaX;
        newBounds.y = bounds.y + deltaY;
        newBounds.width = bounds.width - deltaX;
        newBounds.height = bounds.height - deltaY;
        break;
      case 'top-right':
        newBounds.y = bounds.y + deltaY;
        newBounds.width = bounds.width + deltaX;
        newBounds.height = bounds.height - deltaY;
        break;
      case 'bottom-right':
        newBounds.width = bounds.width + deltaX;
        newBounds.height = bounds.height + deltaY;
        break;
      case 'bottom-left':
        newBounds.x = bounds.x + deltaX;
        newBounds.width = bounds.width - deltaX;
        newBounds.height = bounds.height + deltaY;
        break;
      case 'top':
        newBounds.y = bounds.y + deltaY;
        newBounds.height = bounds.height - deltaY;
        break;
      case 'right':
        newBounds.width = bounds.width + deltaX;
        break;
      case 'bottom':
        newBounds.height = bounds.height + deltaY;
        break;
      case 'left':
        newBounds.x = bounds.x + deltaX;
        newBounds.width = bounds.width - deltaX;
        break;
      default:
        return null;
    }

    // 检查最小尺寸
    if (newBounds.width < 10 || newBounds.height < 10) {
      return null;
    }

    return newBounds;
  }

  /**
   * 应用边界框变换
   * 改进：限制缩放比例范围，防止元素变得过大或过小
   * 对于圆形，使用等比例缩放并保持圆心位置
   */
  private applyBoundsTransform(newBounds: { x: number; y: number; width: number; height: number }, 
                              oldBounds: { x: number; y: number; width: number; height: number }): DrawAction | DrawAction[] | null {
    // 检查边界框是否有效
    if (oldBounds.width <= 0 || oldBounds.height <= 0) {
      logger.warn('SelectTool: 原始边界框无效', oldBounds);
      return null;
    }
    
    if (newBounds.width <= 0 || newBounds.height <= 0) {
      logger.warn('SelectTool: 新边界框无效', newBounds);
      return null;
    }
    
    let scaleX = newBounds.width / oldBounds.width;
    let scaleY = newBounds.height / oldBounds.height;
    
    // 检查缩放比例是否有效
    if (!isFinite(scaleX) || !isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
      logger.warn('SelectTool: 无效的缩放比例', { scaleX, scaleY, newBounds, oldBounds });
      return null;
    }
    
    // 限制缩放比例范围（防止元素变得过大或过小）
    const MIN_SCALE = 0.1; // 最小缩放比例：10%
    const MAX_SCALE = 10;  // 最大缩放比例：1000%
    scaleX = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scaleX));
    scaleY = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scaleY));
    
    // 对于圆形，使用等比例缩放（使用较小的缩放比例，保持圆形）
    // 对于其他形状，使用边界框中心作为缩放中心
    const isCircle = this.selectedActions.length === 1 && 
                     this.selectedActions[0]?.type === 'circle';
    
    if (isCircle) {
      // 圆形：使用等比例缩放，缩放中心是圆的实际圆心
      const circleAction = this.selectedActions[0];
      const circleCenter = circleAction.points[0];
      const uniformScale = Math.min(scaleX, scaleY); // 使用较小的缩放比例，保持圆形
      
      // 注意：scaleCircleAction 不使用 centerX 和 centerY，圆心固定
      return this.scaleSelectedAction(uniformScale, uniformScale, circleCenter.x, circleCenter.y);
    } else {
      // 其他形状：使用边界框的中心点作为缩放中心
      const centerX = oldBounds.x + oldBounds.width / 2;
      const centerY = oldBounds.y + oldBounds.height / 2;

    if (this.selectedActions.length === 1) {
        return this.scaleSelectedAction(scaleX, scaleY, centerX, centerY);
    } else {
        return this.scaleSelectedActions(scaleX, scaleY, centerX, centerY);
      }
    }
  }

  public draw(ctx: CanvasRenderingContext2D, action: SelectAction): void {
    // 获取交互层上下文（动态图层或interaction层）
    // 优先使用传入的ctx（由drawSelectToolUI传入，已正确获取动态图层）
    // 如果传入的ctx无效，再尝试使用getInteractionContext()
    let interactionCtx: CanvasRenderingContext2D;
    if (ctx && ctx.canvas) {
      // 使用传入的ctx（通常来自drawSelectToolUI，已正确获取动态图层）
      interactionCtx = ctx;
      logger.debug('SelectTool.draw: 使用传入的ctx', {
        canvasWidth: ctx.canvas.width,
        canvasHeight: ctx.canvas.height,
        selectedActionsCount: this.selectedActions.length
      });
    } else {
      try {
        interactionCtx = this.getInteractionContext();
        logger.debug('SelectTool.draw: 使用getInteractionContext获取的ctx', {
          canvasWidth: interactionCtx.canvas.width,
          canvasHeight: interactionCtx.canvas.height,
          selectedActionsCount: this.selectedActions.length
        });
      } catch {
        // 如果无法获取交互层，使用传入的ctx（兼容性）
        interactionCtx = ctx;
        logger.warn('SelectTool.draw: 无法获取交互层，使用传入的ctx');
      }
    }

    // 如果有选中的actions，绘制边界框和锚点
    if (this.selectedActions.length > 0) {
      logger.info('SelectTool.draw: 开始绘制选中actions的锚点', {
        selectedActionsCount: this.selectedActions.length,
        selectedActionIds: this.selectedActions.map(a => a.id),
        anchorPointsCount: this.anchorPoints.length,
        isTransformMode: this.isTransformMode,
        interactionCtxCanvas: interactionCtx.canvas,
        interactionCtxWidth: interactionCtx.canvas.width,
        interactionCtxHeight: interactionCtx.canvas.height,
        canvasZIndex: getComputedStyle(interactionCtx.canvas).zIndex,
        canvasPointerEvents: getComputedStyle(interactionCtx.canvas).pointerEvents
      });
      
      // generateResizeAnchorPoints 内部已经处理了拖拽时的缓存清除
      // 注意：在draw()中调用时，必须确保锚点已生成，不能因为节流而跳过
      const anchorPointsBefore = this.anchorPoints.length;
      const centerAnchorBefore = !!this.centerAnchorPoint;
      const anchorPointsRefBefore = this.anchorPoints; // 保存引用用于比较
      
      logger.info('SelectTool.draw: 调用generateResizeAnchorPoints前', {
        anchorPointsCountBefore: anchorPointsBefore,
        centerAnchorBefore,
        selectedActionsCount: this.selectedActions.length,
        selectedActionIds: this.selectedActions.map(a => a.id),
        anchorPointsRef: anchorPointsRefBefore
      });
      
      this.generateResizeAnchorPoints();
      
      // 立即检查锚点状态
      const anchorPointsAfter = this.anchorPoints.length;
      const centerAnchorAfter = !!this.centerAnchorPoint;
      const anchorPointsRefAfter = this.anchorPoints; // 保存引用用于比较
      
      logger.info('SelectTool.draw: 生成锚点后（立即检查）', {
        anchorPointsCountBefore: anchorPointsBefore,
        anchorPointsCountAfter: anchorPointsAfter,
        centerAnchorBefore,
        centerAnchorAfter,
        selectedActionsCount: this.selectedActions.length,
        selectedActionIds: this.selectedActions.map(a => a.id),
        anchorPointsRefChanged: anchorPointsRefBefore !== anchorPointsRefAfter,
        anchorPointsArray: this.anchorPoints.map((a, i) => ({
          index: i,
          type: a.type,
          x: a.x,
          y: a.y
        }))
      });
      
      // 如果锚点数量为0，记录错误并尝试强制重新生成
      if (this.anchorPoints.length === 0 && !this.centerAnchorPoint && this.selectedActions.length > 0) {
        logger.error('SelectTool.draw: 锚点生成失败，尝试强制重新生成', {
          selectedActionsCount: this.selectedActions.length,
          selectedActionIds: this.selectedActions.map(a => a.id),
          hasAnchorCache: !!this.anchorCache,
          anchorCacheKey: this.anchorCache?.actionIds.sort().join(',')
        });
        // 强制清除缓存并重新生成
        this.clearAnchorCache();
        this.lastAnchorUpdateTime = 0; // 重置节流时间，强制重新生成
        this.generateResizeAnchorPoints();
        
        logger.info('SelectTool.draw: 强制重新生成锚点后', {
          anchorPointsCount: this.anchorPoints.length,
          centerAnchorPoint: !!this.centerAnchorPoint
        });
      }
      
      // 绘制边界框
      // 在拖拽过程中，使用 selectedActionForTransform 计算边界框
      const bounds = this.isDraggingResizeAnchor && this.selectedActionForTransform
        ? this.getActionBoundingBox(this.selectedActionForTransform)
        : this.getSelectedActionsBounds();
      if (bounds) {
        logger.info('SelectTool.draw: 绘制边界框', bounds);
        this.drawSelectionBounds(interactionCtx, bounds);
      } else {
        logger.warn('SelectTool.draw: 边界框为空，无法绘制');
      }
      
      // 绘制变形锚点（使用 SelectTool 的锚点系统，而不是 TransformTool 的控制点）
      // 注意：对于圆形，应该使用 SelectTool 的4个边界锚点 + 1个中心点，而不是 TransformTool 的8个控制点
      logger.info('SelectTool.draw: 绘制锚点', {
        anchorPointsCount: this.anchorPoints.length,
        centerAnchorPoint: !!this.centerAnchorPoint,
        anchorPoints: this.anchorPoints.map((a, i) => ({
          index: i,
          x: a.x,
          y: a.y,
          type: a.type
        }))
      });
      this.drawResizeAnchorPoints(interactionCtx);
      logger.info('SelectTool.draw: 锚点绘制完成');
    } else {
      logger.info('SelectTool.draw: 没有选中的actions，跳过绘制锚点', {
        selectedActionsCount: this.selectedActions.length
      });
    }
    
    // 如果处于变换模式且有选中的图形，也绘制 TransformTool 的控制点（用于其他功能）
    // 但 SelectTool 的锚点系统是主要的交互方式
    if (this.isTransformMode && this.selectedActionForTransform) {
      // 注意：TransformTool 的控制点可能会覆盖 SelectTool 的锚点
      // 对于圆形，应该禁用 TransformTool 的控制点，只使用 SelectTool 的锚点
      // 暂时注释掉，让 SelectTool 的锚点系统作为主要交互方式
      // this.transformTool.draw(interactionCtx);
    }

    // 否则绘制选择框
    if (action.points.length < 2) return;

    const originalContext = this.saveContext(interactionCtx);
    
    // 计算选择框区域
    const start = action.points[0];
    const end = action.points[action.points.length - 1];
    
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);

    // 只有当选择框有一定大小时才绘制
    if (width < 5 || height < 5) {
      this.restoreContext(interactionCtx, originalContext);
      return;
    }

    // 绘制选择框背景
    this.drawSelectionBackground(interactionCtx, left, top, width, height, action);
    
    // 绘制选择框边框
    this.drawSelectionBorder(interactionCtx, left, top, width, height, action);
    
    // 绘制选择框角标
    this.drawCornerIndicators(interactionCtx, left, top, width, height);
    
    this.restoreContext(interactionCtx, originalContext);
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
    logger.info('SelectTool.handleMouseDown 被调用', {
      point,
      allActionsCount: this.allActions.length,
      selectedActionsCount: this.selectedActions.length,
      isTransformMode: this.isTransformMode,
      selectedLayerZIndex: this.selectedLayerZIndex
    });
    
    // 如果有选中的actions，检查交互区域
    if (this.selectedActions.length > 0) {
      // 1. 优先检查是否点击了边锚点（变形锚点优先级最高）
      const anchorInfo = this.getAnchorPointAt(point);
      if (anchorInfo && !anchorInfo.isCenter) {
        // 边锚点：缩放/变形（明确区分：这是变形操作，不是移动操作）
          logger.debug('点击了变形锚点，开始缩放/变形', { 
            index: anchorInfo.index, 
            anchorType: anchorInfo.anchor.type 
          });
          this.isDraggingResizeAnchor = true;
        this.isDraggingMove = false; // 明确不是移动操作
        this.isDraggingCenter = false; // 明确不是中心点拖拽
          this.draggedAnchorIndex = anchorInfo.index;
          this.dragStartPoint = point;
          // 清除之前的拖拽边界框缓存和位置
          this.dragStartBounds = null;
          // 保存拖拽开始时的action（用于圆形等需要保持原始状态的图形）
          this.dragStartAction = this.selectedActions.length === 1 ? 
            { ...this.selectedActions[0] } : null;
          // 保存拖拽前的状态（用于取消）
          this.saveDragStartState();
          return 'resize';
        }
      
      // 2. 检查是否点击了中心点（移动操作）
      if (anchorInfo && anchorInfo.isCenter) {
        // 中心点：移动整个图形（明确区分：这是移动操作，不是变形操作）
        logger.debug('点击了中心点，开始移动', { anchorType: anchorInfo.anchor.type });
        this.isDraggingCenter = true;
        this.isDraggingMove = true; // 中心点拖拽是移动操作
        this.isDraggingResizeAnchor = false; // 明确不是变形操作
        this.dragStartPoint = point;
        // 保存拖拽开始时的action（用于圆形等需要保持原始状态的图形）
        this.dragStartAction = this.selectedActions.length === 1 ? 
          { ...this.selectedActions[0] } : null;
        // 保存拖拽前的状态（用于取消）
        this.saveDragStartState();
        return 'move';
      }
      
      // 3. 检查是否点击了移动区域（用于移动整个选区）
      // 改进：移动区域检测应该在锚点检测之后，但优先级高于其他操作
      if (this.isPointInMoveArea(point)) {
        logger.debug('点击了移动区域，开始移动选区');
        this.isDraggingMove = true;
        this.isDraggingCenter = false;
        this.isDraggingResizeAnchor = false;
        this.dragStartPoint = point;
        // 保存拖拽开始时的action
        this.dragStartAction = this.selectedActions.length === 1 ? 
          { ...this.selectedActions[0] } : null;
        // 保存拖拽前的状态（用于取消）
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
      const selectedActions = this.selectActionsInBox(this.currentSelectionBounds);
      this.isSelecting = false;
      this.selectionStartPoint = null;
      this.currentSelectionBounds = null;
      
      // 使用 setSelectedActions 确保缓存清除和锚点重新生成
      this.setSelectedActions(selectedActions);
      
      if (selectedActions.length === 1) {
        this.enterTransformMode(selectedActions[0]);
        return selectedActions[0];
      } else if (selectedActions.length > 1) {
        return selectedActions;
      }
      
      return null;
    }

    // 2. 处理变形锚点拖拽结束
    if (this.isDraggingResizeAnchor) {
      this.isDraggingResizeAnchor = false;
      this.draggedAnchorIndex = -1;
      this.dragStartPoint = null;
      this.clearDragState();
      
      // 清除拖拽时的原始边界框缓存和位置
      this.dragStartBounds = null;
      this.dragStartAction = null;
      // 清除拖拽状态
      this.dragStartState = null;
      
      // 更新selectedActions（同步变形后的action）
      if (this.selectedActions.length === 1 && this.selectedActionForTransform) {
        this.selectedActions[0] = this.selectedActionForTransform;
      }
      
      // 清除所有缓存，强制重新计算并更新
      // 注意：必须在更新 selectedActions 之后清除缓存，这样新的缓存会基于更新后的 selectedActions
      this.clearBoundsCache(); // 清除边界框缓存
      this.clearAnchorCache(); // 清除锚点缓存
      
      // 强制重新生成锚点和边界框，并更新缓存
      // 此时 isDraggingResizeAnchor 已为 false，所以会更新缓存
      this.generateResizeAnchorPoints(); // 重新生成锚点（会重新计算边界框并更新缓存）
      
      // 确保边界框缓存也被更新（通过调用 getSelectedActionsBounds）
      this.getSelectedActionsBounds(); // 这会更新边界框缓存
      
      if (this.selectedActions.length > 1) {
        return this.selectedActions;
      } else {
        return this.selectedActionForTransform;
      }
    }

    // 3. 处理移动结束（包括中心点拖拽）
    if (this.isDraggingMove) {
      this.isDraggingMove = false;
      this.isDraggingCenter = false;
      this.dragStartPoint = null;
      this.dragStartAction = null;
      this.clearDragState();
      
      // 更新selectedActions（同步移动后的action）
      if (this.selectedActions.length === 1 && this.selectedActionForTransform) {
        this.selectedActions[0] = this.selectedActionForTransform;
      }
      
      // 清除所有缓存，强制重新计算并更新
      // 注意：必须在更新 selectedActions 之后清除缓存，这样新的缓存会基于更新后的 selectedActions
      this.clearBoundsCache(); // 清除边界框缓存
      this.clearAnchorCache(); // 清除锚点缓存
      
      // 强制重新生成锚点和边界框，并更新缓存
      // 此时 isDraggingMove 已为 false，所以会更新缓存
      this.generateResizeAnchorPoints(); // 重新生成锚点（会重新计算边界框并更新缓存）
      
      // 确保边界框缓存也被更新（通过调用 getSelectedActionsBounds）
      this.getSelectedActionsBounds(); // 这会更新边界框缓存
      
      if (this.selectedActions.length > 1) {
        return this.selectedActions;
      } else {
        return this.selectedActionForTransform;
      }
    }

    // 4. 处理变换模式（TransformTool的控制点）
    if (!this.isTransformMode || !this.isDragging) {
      return null;
    }

    this.isDragging = false;
    this.dragStartPoint = null;
    this.currentHoverControlPoint = null;
    
    // 更新selectedActions（同步变换后的action）
    if (this.selectedActions.length === 1 && this.selectedActionForTransform) {
      this.selectedActions[0] = this.selectedActionForTransform;
    }
    
    // 清除所有缓存，强制重新计算并更新
    this.clearBoundsCache(); // 清除边界框缓存
    this.clearAnchorCache(); // 清除锚点缓存
    
    // 强制重新生成锚点和边界框，并更新缓存
    this.generateResizeAnchorPoints(); // 重新生成锚点（会重新计算边界框并更新缓存）
    this.getSelectedActionsBounds(); // 确保边界框缓存也被更新
    
    if (this.selectedActions.length > 1) {
      return this.selectedActions;
    } else {
      return this.selectedActionForTransform;
    }
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
   */
  public moveSelectedActions(deltaX: number, deltaY: number): DrawAction[] {
    // 检查delta有效性
    if (!isFinite(deltaX) || !isFinite(deltaY)) {
      logger.warn('SelectTool: 无效的移动偏移量', { deltaX, deltaY });
      return [];
    }
    
    const transformFn = (point: Point) => this.clampPointToCanvas(this.createMoveTransform(deltaX, deltaY)(point));
    const updatedActions = this.applyTransformToActions(this.selectedActions, transformFn);
    
    logger.debug(`SelectTool: 移动${updatedActions.length}个actions，偏移量: (${deltaX}, ${deltaY})`);
    return updatedActions;
  }

  /**
   * 缩放选中的action
   * 改进：针对不同形状类型使用不同的缩放逻辑
   */
  public scaleSelectedAction(scaleX: number, scaleY: number, centerX: number, centerY: number): DrawAction | null {
    if (!this.isTransformMode || !this.selectedActionForTransform) {
      return null;
    }

    // 检查参数有效性
    if (!isFinite(scaleX) || !isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
      logger.warn('SelectTool: 无效的缩放参数', { scaleX, scaleY, centerX, centerY });
      return null;
    }

    const action = this.selectedActionForTransform;
    let newPoints: Point[];

    // 根据action类型使用不同的缩放逻辑
    switch (action.type) {
      case 'circle': {
        // 圆形：保持等比例缩放（使用较小的缩放比例），圆心固定
        const uniformScale = Math.min(scaleX, scaleY);
        newPoints = this.scaleCircleAction(action, uniformScale);
        break;
      }
      
      case 'text':
        // 文字：等比例缩放位置，并调整字体大小
        newPoints = this.scaleTextAction(action, scaleX, scaleY, centerX, centerY);
        break;
      
      case 'rect':
        // 矩形：保持矩形形状，但允许非等比例缩放
        newPoints = this.scaleRectAction(action, scaleX, scaleY, centerX, centerY);
        break;
      
      case 'line':
        // 直线：保持直线形状
        newPoints = this.scaleLineAction(action, scaleX, scaleY, centerX, centerY);
        break;
      
      case 'polygon':
        // 多边形：保持多边形形状
        newPoints = this.scalePolygonAction(action, scaleX, scaleY, centerX, centerY);
        break;
      
      case 'pen':
      case 'brush':
      case 'eraser':
        // 路径：缩放所有点
        newPoints = this.scalePathAction(action, scaleX, scaleY, centerX, centerY);
        break;
      
      default:
        // 默认：缩放所有点
        newPoints = this.scaleGenericAction(action, scaleX, scaleY, centerX, centerY);
        break;
    }

    // 限制所有点在画布范围内
    const canvasBounds = this.getCanvasBounds();
    if (canvasBounds) {
      newPoints = newPoints.map(point => ({
      ...point,
        x: Math.max(0, Math.min(canvasBounds.width, point.x)),
        y: Math.max(0, Math.min(canvasBounds.height, point.y))
    }));
    }

    // 对于文字，需要同时调整字体大小
    let updatedAction: DrawAction;
    if (action.type === 'text') {
      const textAction = action as DrawAction & { fontSize?: number };
      const originalFontSize = textAction.fontSize || 16;
      // 使用等比例缩放字体大小
      const uniformScale = Math.min(scaleX, scaleY);
      const newFontSize = Math.max(8, Math.min(72, originalFontSize * uniformScale));
      
      updatedAction = {
        ...action,
        points: newPoints,
        fontSize: newFontSize
      } as DrawAction;
    } else {
      updatedAction = {
        ...action,
      points: newPoints
    };
    }

    this.selectedActionForTransform = updatedAction;
    this.transformTool.setSelectedAction(updatedAction);

    logger.debug('SelectTool: 缩放action完成', {
      actionType: action.type,
      scaleX,
      scaleY,
      pointsCount: newPoints.length,
      ...(action.type === 'text' ? { 
        originalFontSize: (action as DrawAction & { fontSize?: number }).fontSize,
        newFontSize: (updatedAction as DrawAction & { fontSize?: number }).fontSize 
      } : {})
    });

    return updatedAction;
  }

  /**
   * 公共缩放逻辑：基于缩放中心缩放所有点
   * 提取公共逻辑，减少代码重复
   */
  private scalePointsByCenter(
    points: Point[], 
    scaleX: number, 
    scaleY: number, 
    centerX: number, 
    centerY: number
  ): Point[] {
    return points.map(point => {
      const newX = centerX + (point.x - centerX) * scaleX;
      const newY = centerY + (point.y - centerY) * scaleY;
      
      if (!isFinite(newX) || !isFinite(newY)) {
        return point;
      }
      
      return {
        ...point,
        x: newX,
        y: newY
      };
    });
  }

  /**
   * 缩放圆形action（保持等比例）
   * 改进：圆心位置保持不变，只缩放半径
   * 注意：centerX 和 centerY 参数未使用，圆心始终保持在原始位置
   */
  private scaleCircleAction(action: DrawAction, scale: number): Point[] {
    if (action.points.length < 2) return action.points;
    
    const center = action.points[0];
    const edge = action.points[action.points.length - 1];
    
    // 计算原始半径
    const originalRadius = Math.sqrt(
      Math.pow(edge.x - center.x, 2) + Math.pow(edge.y - center.y, 2)
    );
    
    if (!isFinite(originalRadius) || originalRadius <= 0) {
      return action.points;
    }
    
    // 限制缩放比例，减少敏感度
    const clampedScale = Math.max(0.1, Math.min(10, scale));
    
    // 计算新半径
    const newRadius = originalRadius * clampedScale;
    
    // 圆心位置保持不变（使用原始圆心位置）
    // 计算边缘点相对于圆心的方向
    const angle = Math.atan2(edge.y - center.y, edge.x - center.x);
    
    // 新的边缘点：圆心 + 新半径 * 方向
    const newEdgeX = center.x + newRadius * Math.cos(angle);
    const newEdgeY = center.y + newRadius * Math.sin(angle);
    
    return [
      {
        ...center,
        // 圆心位置保持不变
        x: center.x,
        y: center.y
      },
      {
        ...edge,
        x: newEdgeX,
        y: newEdgeY
      }
    ];
  }

  /**
   * 缩放矩形action
   */
  private scaleRectAction(action: DrawAction, scaleX: number, scaleY: number, centerX: number, centerY: number): Point[] {
    if (action.points.length < 2) return action.points;
    return this.scalePointsByCenter(action.points, scaleX, scaleY, centerX, centerY);
  }

  /**
   * 缩放直线action
   */
  private scaleLineAction(action: DrawAction, scaleX: number, scaleY: number, centerX: number, centerY: number): Point[] {
    if (action.points.length < 2) return action.points;
    return this.scalePointsByCenter(action.points, scaleX, scaleY, centerX, centerY);
  }

  /**
   * 缩放多边形action
   */
  private scalePolygonAction(action: DrawAction, scaleX: number, scaleY: number, centerX: number, centerY: number): Point[] {
    return this.scalePointsByCenter(action.points, scaleX, scaleY, centerX, centerY);
  }

  /**
   * 缩放路径action（pen/brush/eraser）
   */
  private scalePathAction(action: DrawAction, scaleX: number, scaleY: number, centerX: number, centerY: number): Point[] {
    return this.scalePointsByCenter(action.points, scaleX, scaleY, centerX, centerY);
  }

  /**
   * 缩放文字action的位置点
   * 
   * 注意：此方法只缩放位置点，不调整字体大小。
   * 字体大小的调整在调用此方法后由 scaleSelectedAction 或 scaleSelectedActions 处理。
   * 
   * 对于锚点拖拽场景，应使用 TextAnchorHandler.handleAnchorDrag()，它会同时调整字体大小。
   * 
   * @param action - 要缩放的文字action
   * @param scaleX - X轴缩放比例
   * @param scaleY - Y轴缩放比例
   * @param centerX - 缩放中心X坐标
   * @param centerY - 缩放中心Y坐标
   * @returns 缩放后的位置点数组
   */
  private scaleTextAction(action: DrawAction, scaleX: number, scaleY: number, centerX: number, centerY: number): Point[] {
    // 文字位置缩放（使用等比例缩放，保持文字比例）
    const uniformScale = Math.min(scaleX, scaleY);
    return this.scalePointsByCenter(action.points, uniformScale, uniformScale, centerX, centerY);
  }

  /**
   * 缩放通用action
   */
  private scaleGenericAction(action: DrawAction, scaleX: number, scaleY: number, centerX: number, centerY: number): Point[] {
    return this.scalePointsByCenter(action.points, scaleX, scaleY, centerX, centerY);
  }

  /**
   * 缩放所有选中的actions
   * 改进：针对每个action使用对应的缩放逻辑
   */
  public scaleSelectedActions(scaleX: number, scaleY: number, centerX: number, centerY: number): DrawAction[] {
    // 检查参数有效性
    if (!isFinite(scaleX) || !isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
      logger.warn('SelectTool: 无效的缩放参数', { scaleX, scaleY, centerX, centerY });
      return [];
    }
    
    const updatedActions: DrawAction[] = [];
    const canvasBounds = this.getCanvasBounds();
    
    for (const action of this.selectedActions) {
      let newPoints: Point[];

      // 根据action类型使用不同的缩放逻辑
      switch (action.type) {
        case 'circle': {
          // 圆形：保持等比例缩放，圆心固定
          const uniformScale = Math.min(scaleX, scaleY);
          newPoints = this.scaleCircleAction(action, uniformScale);
          break;
        }
        
        case 'text':
          // 文字：等比例缩放位置，并调整字体大小
          newPoints = this.scaleTextAction(action, scaleX, scaleY, centerX, centerY);
          break;
        
        case 'rect':
          newPoints = this.scaleRectAction(action, scaleX, scaleY, centerX, centerY);
          break;
        
        case 'line':
          newPoints = this.scaleLineAction(action, scaleX, scaleY, centerX, centerY);
          break;
        
        case 'polygon':
          newPoints = this.scalePolygonAction(action, scaleX, scaleY, centerX, centerY);
          break;
        
        case 'pen':
        case 'brush':
        case 'eraser':
          newPoints = this.scalePathAction(action, scaleX, scaleY, centerX, centerY);
          break;
        
        default:
          newPoints = this.scaleGenericAction(action, scaleX, scaleY, centerX, centerY);
          break;
      }

      // 限制所有点在画布范围内
      if (canvasBounds) {
        newPoints = newPoints.map(point => ({
        ...point,
          x: Math.max(0, Math.min(canvasBounds.width, point.x)),
          y: Math.max(0, Math.min(canvasBounds.height, point.y))
      }));
      }

      // 对于文字，需要同时调整字体大小
      let updatedAction: DrawAction;
      if (action.type === 'text') {
        const textAction = action as DrawAction & { fontSize?: number };
        const originalFontSize = textAction.fontSize || 16;
        // 使用等比例缩放字体大小
        const uniformScale = Math.min(scaleX, scaleY);
        const newFontSize = Math.max(8, Math.min(72, originalFontSize * uniformScale));
        
        updatedAction = {
          ...action,
          points: newPoints,
          fontSize: newFontSize
        } as DrawAction;
      } else {
        updatedAction = {
        ...action,
        points: newPoints
      };
      }

      updatedActions.push(updatedAction);
    }
    
    this.selectedActions = updatedActions;
    
    // 如果只有一个选中的action，更新变换模式
    if (updatedActions.length === 1) {
      this.selectedActionForTransform = updatedActions[0];
      this.transformTool.setSelectedAction(updatedActions[0]);
    }
    
    logger.debug(`SelectTool: 缩放${updatedActions.length}个actions完成`, {
      scaleX,
      scaleY
    });
    
    return updatedActions;
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
    
    // 检查参数有效性
    if (!isFinite(angle) || !isFinite(centerX) || !isFinite(centerY)) {
      logger.warn('SelectTool: 无效的旋转参数', { angle, centerX, centerY });
      return null;
    }

    const radians = (angle * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    
    // 检查三角函数值是否有效
    if (!isFinite(cos) || !isFinite(sin)) {
      logger.warn('SelectTool: 无效的三角函数值', { radians, cos, sin });
      return null;
    }

    const newPoints = this.selectedActionForTransform.points.map(point => {
      const dx = point.x - centerX;
      const dy = point.y - centerY;
      
      const newX = centerX + dx * cos - dy * sin;
      const newY = centerY + dx * sin + dy * cos;
      
      // 检查计算结果
      if (!isFinite(newX) || !isFinite(newY)) {
        logger.warn('SelectTool: 旋转后的点坐标无效', { newX, newY, point, angle });
        return point; // 返回原始点
      }
      
      return {
        ...point,
        x: newX,
        y: newY
      };
    });

    const updatedAction = {
      ...this.selectedActionForTransform,
      points: newPoints
    };

    this.selectedActionForTransform = updatedAction;
    this.transformTool.setSelectedAction(updatedAction);

    return updatedAction;
  }

  /**
   * 旋转所有选中的actions
   */
  public rotateSelectedActions(angle: number, centerX: number, centerY: number): DrawAction[] {
    // 检查参数有效性
    if (!isFinite(angle) || !isFinite(centerX) || !isFinite(centerY)) {
      logger.warn('SelectTool: 无效的旋转参数', { angle, centerX, centerY });
      return [];
    }
    
    const radians = (angle * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    
    // 检查三角函数值是否有效
    if (!isFinite(cos) || !isFinite(sin)) {
      logger.warn('SelectTool: 无效的三角函数值', { radians, cos, sin });
      return [];
    }
    
    const updatedActions: DrawAction[] = [];
    
    for (const action of this.selectedActions) {
      const newPoints = action.points.map(point => {
        const dx = point.x - centerX;
        const dy = point.y - centerY;
        
        const newX = centerX + dx * cos - dy * sin;
        const newY = centerY + dx * sin + dy * cos;
        
        // 检查计算结果
        if (!isFinite(newX) || !isFinite(newY)) {
          logger.warn('SelectTool: 旋转后的点坐标无效', { newX, newY, point, angle });
          return point; // 返回原始点
        }
        
        return {
          ...point,
          x: newX,
          y: newY
        };
      });

      const updatedAction = {
        ...action,
        points: newPoints
      };

      updatedActions.push(updatedAction);
    }
    
    this.selectedActions = updatedActions;
    
    // 如果只有一个选中的action，更新变换模式
    if (updatedActions.length === 1) {
      this.selectedActionForTransform = updatedActions[0];
      this.transformTool.setSelectedAction(updatedActions[0]);
    }
    
    logger.debug(`SelectTool: 旋转${updatedActions.length}个actions，角度: ${angle}°`);
    return updatedActions;
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