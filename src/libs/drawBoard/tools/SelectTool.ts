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
import { ImageAnchorHandler } from './anchor/ImageAnchorHandler';
import { BoundsValidator, type Bounds as BoundsType } from '../utils/BoundsValidator';
import { ActionValidator } from '../utils/ActionValidator';
import { SpatialIndex } from '../infrastructure/performance/SpatialIndex';
import type { VirtualLayerMode } from '../core/VirtualLayerManager';
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
  AnchorDragHandler,
  SelectionToolbar,
  type SelectionToolbarCallbacks
} from './select';

// 使用 ActionValidator 的深拷贝方法
const deepCloneAction = ActionValidator.deepClone.bind(ActionValidator);

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
  // 锚点数组：边锚点（缩放/变形）
  private anchorPoints: AnchorPoint[] = [];
  // 移动区域：整个选区框内都是可拖拽区域
  private moveArea: { x: number; y: number; width: number; height: number } | null = null;
  
  // 拖拽状态
  private isDraggingResizeAnchor: boolean = false; // 是否正在拖拽变形锚点
  private draggedAnchorIndex: number = -1; // 正在拖拽的锚点索引
  private isDraggingMove: boolean = false; // 是否正在移动选区
  
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
  
  // 虚拟图层模式（用于决定选择行为）
  private virtualLayerMode: VirtualLayerMode = 'individual';
  
  // 选择限制事件回调（用于通知 UI 层：individual 模式多选时无锚点）
  private onSelectionLimited?: (info: {
    reason: 'individual-mode-no-transform';
    message: string;
    selectedCount: number;
  }) => void;

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
  
  // 选区浮动工具栏
  private selectionToolbar: SelectionToolbar | null = null;
  private showAnchorsAndRotation: boolean = true; // 是否显示锚点和旋转功能
  private toolbarCallbacks: SelectionToolbarCallbacks | null = null;
  
  // 样式更新回调（用于立即同步到数据源）
  private onStyleUpdatedCallback: ((actions: DrawAction[]) => void) | null = null;
  
  // 📝 锁定状态查询回调（通过虚拟图层查询，避免 SelectTool 直接依赖 VirtualLayerManager）
  private lockQueryCallback: ((action: DrawAction) => boolean) | null = null;

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
    this.shapeHandlers.set('image', new ImageAnchorHandler());
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
    
    // 初始化选区浮动工具栏
    this.initSelectionToolbar();
  }
  
  /**
   * 初始化选区浮动工具栏
   */
  private initSelectionToolbar(): void {
    if (!this.canvasEngine) return;
    
    // 获取 canvas 容器
    const container = this.canvasEngine.getContainer();
    if (!container) return;
    
    // 如果已存在，先销毁
    if (this.selectionToolbar) {
      this.selectionToolbar.destroy();
    }
    
    // 创建工具栏回调
    const callbacks: SelectionToolbarCallbacks = {
      onToggleAnchors: (visible) => {
        this.showAnchorsAndRotation = visible;
        this.toolbarCallbacks?.onToggleAnchors?.(visible);
        // 触发重绘
        this.updateAnchorPoints();
      },
      // 📝 锁定状态查询回调（通过虚拟图层查询）
      onQueryLockState: (action: DrawAction) => {
        return this.isActionLocked(action);
      },
      onStrokeColorChange: (color) => {
        this.updateSelectedActionsStyle({ strokeStyle: color });
        this.toolbarCallbacks?.onStrokeColorChange?.(color);
      },
      onFillColorChange: (color) => {
        this.updateSelectedActionsStyle({ fillStyle: color });
        this.toolbarCallbacks?.onFillColorChange?.(color);
      },
      onLineWidthChange: (width) => {
        this.updateSelectedActionsStyle({ lineWidth: width });
        this.toolbarCallbacks?.onLineWidthChange?.(width);
      },
      // 文本样式回调 - 立即更新并同步
      onTextColorChange: (color) => {
        this.updateSelectedTextStyle({ color });
        this.toolbarCallbacks?.onTextColorChange?.(color);
      },
      onFontSizeChange: (size) => {
        this.updateSelectedTextStyle({ fontSize: size });
        this.toolbarCallbacks?.onFontSizeChange?.(size);
      },
      onFontWeightChange: (weight) => {
        this.updateSelectedTextStyle({ fontWeight: weight });
        this.toolbarCallbacks?.onFontWeightChange?.(weight);
      },
      onToggleLock: (locked) => {
        this.toggleSelectedActionsLock(locked);
        this.toolbarCallbacks?.onToggleLock?.(locked);
      },
      onMoveToTop: () => {
        this.toolbarCallbacks?.onMoveToTop?.();
      },
      onMoveToBottom: () => {
        this.toolbarCallbacks?.onMoveToBottom?.();
      },
      onDuplicate: () => {
        this.toolbarCallbacks?.onDuplicate?.();
      },
      onDelete: () => {
        this.toolbarCallbacks?.onDelete?.();
      }
    };
    
    this.selectionToolbar = new SelectionToolbar(container, callbacks);
    // 📝 设置虚拟图层模式（用于控制锁定按钮的显示）
    if (this.selectionToolbar.setVirtualLayerMode) {
      this.selectionToolbar.setVirtualLayerMode(this.virtualLayerMode);
    }
    logger.debug('SelectTool: 选区浮动工具栏已初始化');
  }
  
  /**
   * 设置工具栏外部回调
   */
  public setToolbarCallbacks(callbacks: SelectionToolbarCallbacks): void {
    this.toolbarCallbacks = callbacks;
  }
  
  /**
   * 设置样式更新回调
   * 当选中图形的样式被修改时立即调用，用于同步到数据源
   */
  public setOnStyleUpdated(callback: (actions: DrawAction[]) => void): void {
    this.onStyleUpdatedCallback = callback;
  }
  
  /**
   * 更新选中图形的样式
   * 更新后立即调用 onStyleUpdatedCallback 同步到数据源
   */
  private updateSelectedActionsStyle(style: { strokeStyle?: string; fillStyle?: string; lineWidth?: number }): void {
    if (this.selectedActions.length === 0) return;
    
    this.selectedActions.forEach(action => {
      if (!action.context) {
        action.context = {};
      }
      if (style.strokeStyle !== undefined) {
        action.context.strokeStyle = style.strokeStyle;
      }
      if (style.fillStyle !== undefined) {
        action.context.fillStyle = style.fillStyle;
      }
      if (style.lineWidth !== undefined) {
        action.context.lineWidth = style.lineWidth;
      }
    });
    
    logger.debug('SelectTool: 更新选中图形样式', { style, count: this.selectedActions.length });
    
    // 立即通知外部同步到数据源，确保在失焦前数据已持久化
    if (this.onStyleUpdatedCallback) {
      this.onStyleUpdatedCallback([...this.selectedActions]);
    }
  }
  
  /**
   * 更新选中文本的样式（颜色、字体大小、字体粗细）
   * 更新后立即调用 onStyleUpdatedCallback 同步到数据源
   */
  private updateSelectedTextStyle(style: { color?: string; fontSize?: number; fontWeight?: string }): void {
    if (this.selectedActions.length === 0) return;
    
    this.selectedActions.forEach(action => {
      if (action.type !== 'text') return;
      
      const textAction = action as DrawAction & {
        fontSize?: number;
        fontWeight?: string;
        text?: string;
        width?: number;
        height?: number;
      };
      
      // 更新文本颜色（使用 fillStyle）
      if (style.color !== undefined) {
        if (!action.context) {
          action.context = {};
        }
        action.context.fillStyle = style.color;
        action.context.strokeStyle = style.color;
      }
      
      // 更新字体大小
      if (style.fontSize !== undefined) {
        textAction.fontSize = style.fontSize;
      }
      
      // 更新字体粗细
      if (style.fontWeight !== undefined) {
        textAction.fontWeight = style.fontWeight;
      }
      
      // 📝 重新计算文本边界
      // 如果文本有 width（多行模式），保持 width，只重新计算 height
      // 如果文本没有 width（单行模式），重新计算 width 和 height
      if (style.fontSize !== undefined || style.fontWeight !== undefined) {
        const text = textAction.text || '';
        const fontSize = textAction.fontSize || 16;
        const lineHeight = fontSize * 1.2;
        
        if (textAction.width && textAction.width > 0) {
          // 📝 多行模式：保持 width，重新计算 height
          // 估算多行文本高度
          const avgCharWidth = fontSize * 0.8;
          const charsPerLine = Math.max(1, Math.floor(textAction.width / avgCharWidth));
          const paragraphs = text.split('\n');
          let totalLines = 0;
          
          for (const paragraph of paragraphs) {
            if (paragraph.length === 0) {
              totalLines += 1;
            } else {
              const paragraphLines = Math.ceil(paragraph.length / charsPerLine);
              totalLines += Math.max(1, paragraphLines);
            }
          }
          
          textAction.height = Math.max(lineHeight, totalLines * lineHeight);
        } else {
          // 📝 单行模式：重新计算 width 和 height
          let estimatedWidth = 0;
          for (const char of text) {
            if (/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(char)) {
              estimatedWidth += fontSize;
            } else {
              estimatedWidth += fontSize * 0.6;
            }
          }
          textAction.width = Math.max(estimatedWidth, fontSize);
          textAction.height = lineHeight;
        }
      }
    });
    
    logger.debug('SelectTool: 更新选中文本样式', { style, count: this.selectedActions.length });
    
    // 立即通知外部同步到数据源
    if (this.onStyleUpdatedCallback) {
      this.onStyleUpdatedCallback([...this.selectedActions]);
    }
  }
  
  /**
   * 切换选中图形的锁定状态（仅更新本地状态）
   * 注意：实际的持久化由 DrawBoardSelectionAPI.toggleSelectionLock 完成
   */
  private toggleSelectedActionsLock(locked: boolean): void {
    // 📝 锁定状态归属于虚拟图层，不需要在 action 中设置
    // 锁定状态的设置由 DrawBoardSelectionAPI.toggleSelectionLock() 统一处理
    logger.debug('SelectTool: 锁定状态切换（由虚拟图层管理）', { locked, count: this.selectedActions.length });
  }
  
  /**
   * 设置锁定状态查询回调
   * 📝 锁定状态归属于虚拟图层，通过回调查询避免直接依赖 VirtualLayerManager
   * @param callback 查询回调函数
   */
  public setLockQueryCallback(callback: ((action: DrawAction) => boolean) | null): void {
    this.lockQueryCallback = callback;
  }

  /**
   * 检查选中的 actions 是否被锁定
   * 📝 通过虚拟图层查询锁定状态
   * @returns 如果任意一个选中的 action 被锁定，返回 true
   */
  public isSelectionLocked(): boolean {
    if (!this.lockQueryCallback) {
      return false; // 没有查询回调，默认不锁定
    }
    return this.selectedActions.some(action => this.isActionLocked(action));
  }
  
  /**
   * 检查单个 action 是否被锁定
   * 📝 锁定状态归属于虚拟图层，通过回调查询
   * @param action 要检查的 action
   * @returns 如果 action 所属的虚拟图层被锁定，返回 true
   */
  private isActionLocked(action: DrawAction): boolean {
    if (!this.lockQueryCallback) {
      return false; // 没有查询回调，默认不锁定
    }
    return this.lockQueryCallback(action);
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
      
      // 📝 过滤选中的actions，并使用新的actions数据替换旧的选中actions
      // 这样可以确保拖拽后的更新不会被历史记录中的旧数据覆盖
      const filteredActions = this.selectedActions.map(selectedAction => {
        // 首先检查新的actions中是否有这个action（O(1) 查找）
        if (newActionIdSet.has(selectedAction.id)) {
          // 📝 使用新的action数据替换旧的选中action，确保数据是最新的
          const newAction = actions.find(a => a.id === selectedAction.id);
          if (newAction) {
            // 📝 调试日志：检查文本宽度是否正确同步
            if (newAction.type === 'text') {
              const oldTextAction = selectedAction as DrawAction & { width?: number; height?: number };
              const newTextAction = newAction as DrawAction & { width?: number; height?: number };
              logger.info('setLayerActions: 同步文本action', {
                actionId: newAction.id,
                oldWidth: oldTextAction.width,
                newWidth: newTextAction.width,
                oldHeight: oldTextAction.height,
                newHeight: newTextAction.height,
                oldPoints: selectedAction.points[0],
                newPoints: newAction.points[0]
              });
            }
            // 📝 深拷贝确保数据完整性
            // 📝 注意：锁定状态归属于虚拟图层，不需要在这里同步
            return JSON.parse(JSON.stringify(newAction));
          }
          return selectedAction;
        }
        
        // 如果没找到，检查之前的allActions中是否有这个action（O(1) 查找）
        // 【注意】这是为了处理 individual 模式下图层切换的过渡期
        // 在 individual 模式下，每个 action 有自己的图层，setLayerActions 可能传入所有 actions
        if (prevActionIdSet.has(selectedAction.id)) {
          return selectedAction;
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
          return selectedAction;
        }
        
        return null;
      }).filter((action): action is DrawAction => action !== null);
      
      this.selectedActions = filteredActions;
      
      // 📝 如果选中的 actions 发生变化，更新变换模式
      // 📝 重要：同步 selectedActionForTransform，确保数据一致性
      if (this.selectedActions.length === 1) {
        // 📝 对于文本类型，如果 width 存在但 height 不存在或不正确，重新计算高度
        // 📝 这是因为文本创建时可能只设置了单行高度，但实际文本可能有折行
        if (this.selectedActions[0].type === 'text') {
          const textAction = this.selectedActions[0] as DrawAction & { width?: number; height?: number };
          if (textAction.width && textAction.width > 0) {
            // 清除缓存，确保重新计算
            this.boundsCacheManager.deleteForAction(textAction.id);
            // 重新计算边界框
            const bounds = this.boundsCalculator.calculate(textAction);
            // 📝 保存旧高度用于日志
            const oldHeight = textAction.height;
            // 📝 如果计算出的高度与当前高度不一致，更新高度
            if (textAction.height === undefined || Math.abs(textAction.height - bounds.height) > 0.01) {
              textAction.height = bounds.height;
              logger.debug('setLayerActions: 文本高度已重新计算', {
                actionId: textAction.id,
                width: textAction.width,
                oldHeight,
                newHeight: bounds.height
              });
            }
          }
        }
        
        // 📝 深拷贝确保数据完整性
        this.selectedActionForTransform = JSON.parse(JSON.stringify(this.selectedActions[0]));
        this.enterTransformMode(this.selectedActions[0]);
      } else {
        this.selectedActionForTransform = null;
        this.exitTransformMode();
      }
      
      // 📝 调试日志：检查文本宽度是否正确同步
      if (this.selectedActions.length === 1 && this.selectedActions[0].type === 'text') {
        const textAction = this.selectedActions[0] as DrawAction & { width?: number; height?: number };
        logger.debug('setLayerActions: 文本action同步完成', {
          actionId: this.selectedActions[0].id,
          width: textAction.width,
          height: textAction.height,
          hasSelectedActionForTransform: !!this.selectedActionForTransform
        });
      }
      
      this.clearAnchorCache(); // 统一清除锚点缓存
      
      // 🔧 如果有选中的 actions，立即重新生成锚点和边界框
      // 🖼️ 这对于旋转后的图片特别重要，因为旋转后边界框会变化
      if (this.selectedActions.length > 0) {
        this.generateResizeAnchorPoints(); // 重新生成锚点并更新锚点缓存
        this.getSelectedActionsBounds(); // 确保边界框缓存也被更新
      }
    }
    
    this.clearBoundsCache();
    this.clearSpatialIndex();
  }

  /**
   * 设置虚拟图层模式
   * individual 模式下只允许单选（因为每个 action 是独立图层，不支持跨图层多选）
   * grouped 模式下允许多选
   */
  public setVirtualLayerMode(mode: VirtualLayerMode): void {
    this.virtualLayerMode = mode;
    logger.debug('SelectTool.setVirtualLayerMode', { mode });
    
    // 📝 同步更新工具栏的虚拟图层模式（用于控制锁定按钮的显示）
    if (this.selectionToolbar && this.selectionToolbar.setVirtualLayerMode) {
      this.selectionToolbar.setVirtualLayerMode(mode);
    }
  }

  /**
   * 获取当前虚拟图层模式
   */
  public getVirtualLayerMode(): VirtualLayerMode {
    return this.virtualLayerMode;
  }

  /**
   * 设置选择限制事件回调
   * 当 individual 模式下多选禁用锚点功能时触发
   */
  public setOnSelectionLimited(callback: (info: {
    reason: 'individual-mode-no-transform';
    message: string;
    selectedCount: number;
  }) => void): void {
    this.onSelectionLimited = callback;
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
    if (this.isDraggingResizeAnchor || this.isDraggingMove) {
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
   * 📝 文本类型需要特殊处理：width 和 height 变化时需要清除缓存
   */
  private getActionBoundingBox(action: DrawAction): { x: number; y: number; width: number; height: number } {
    // 📝 文本类型：检查 width 和 height 是否变化，如果变化则清除缓存
    if (action.type === 'text') {
      const textAction = action as DrawAction & { width?: number; height?: number };
      const cachedBounds = this.boundsCacheManager.getForAction(action);
      
      // 📝 如果缓存存在，检查 width 和 height 是否匹配
      if (cachedBounds) {
        const cachedWidth = cachedBounds.width;
        const cachedHeight = cachedBounds.height;
        const currentWidth = textAction.width;
        const currentHeight = textAction.height;
        
        // 📝 如果 width 或 height 不匹配，清除缓存
        if ((currentWidth !== undefined && Math.abs(cachedWidth - currentWidth) > 0.01) ||
            (currentHeight !== undefined && Math.abs(cachedHeight - currentHeight) > 0.01)) {
          this.boundsCacheManager.deleteForAction(action.id);
          logger.debug('getActionBoundingBox: 文本width/height变化，清除缓存', {
            actionId: action.id,
            cachedWidth,
            currentWidth,
            cachedHeight,
            currentHeight
          });
        } else {
          // 📝 缓存仍然有效
          return cachedBounds;
        }
      }
    } else {
      // 📝 非文本类型：正常使用缓存
      const cachedBounds = this.boundsCacheManager.getForAction(action);
      if (cachedBounds) {
        return cachedBounds;
      }
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
    this.moveArea = null;
    this.isDraggingResizeAnchor = false;
    this.draggedAnchorIndex = -1;
    this.isDraggingMove = false;
    this.clearBoundsCache(); // 清除边界框缓存
    this.exitTransformMode();
    
    // 隐藏浮动工具栏
    this.hideSelectionToolbar();
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
    // 📝 深拷贝 actions，确保数据完整性
    // 📝 注意：锁定状态归属于虚拟图层，通过回调查询，不需要在这里同步
    this.selectedActions = actions.map(action => {
      // 📝 从 allActions 中查找对应的 action，确保包含最新的数据
      const actionFromHistory = this.allActions.find(a => a.id === action.id);
      if (actionFromHistory) {
        // 📝 使用历史记录中的 action，但保留传入 action 的其他属性
        const syncedAction = JSON.parse(JSON.stringify(actionFromHistory));
        // 📝 保留传入 action 的其他属性（如 points 等）
        return {
          ...syncedAction,
          // 📝 如果传入的 action 有更新的属性（如拖拽后的 points），使用传入的值
          points: action.points,
          // 📝 保留其他可能更新的属性
          ...(action.type === 'text' && {
            width: (action as DrawAction & { width?: number }).width,
            height: (action as DrawAction & { height?: number }).height,
            fontSize: (action as DrawAction & { fontSize?: number }).fontSize
          }),
          // 🖼️ 图片类型：保留 rotation 和尺寸属性
          ...(action.type === 'image' && {
            rotation: (action as import('../types/ImageTypes').ImageAction).rotation,
            imageWidth: (action as import('../types/ImageTypes').ImageAction).imageWidth,
            imageHeight: (action as import('../types/ImageTypes').ImageAction).imageHeight
          })
        };
      }
      // 📝 如果历史记录中找不到，使用传入的 action（深拷贝）
      return JSON.parse(JSON.stringify(action));
    });
    
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
   * 🔒 锁定的图形不生成锚点
   */
  private generateResizeAnchorPoints(): void {
    // 🔒 锁定状态下不生成锚点
    if (this.isSelectionLocked()) {
      this.clearAnchorPointsState();
      return;
    }
    
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
   * 使用所有点坐标的累加值，确保任意点变化时缓存失效
   */
  private getAnchorCacheKey(): string {
    const actionIds = this.selectedActions.map(a => a.id).sort();
    const fingerprint = this.selectedActions.map(a => {
      if (a.points.length === 0) return `${a.id}:empty`;
      // 计算所有点坐标的累加值
      let sumX = 0, sumY = 0;
      for (const p of a.points) {
        sumX += p.x;
        sumY += p.y;
      }
      return `${a.id}:${Math.round(sumX)},${Math.round(sumY)},${a.points.length}`;
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
    }

    this.updateMoveArea(bounds);
    this.lastAnchorUpdateTime = currentTime;
    this.updateAnchorCache(cacheKey, bounds, currentTime);
  }

  /**
   * 使用 handler 生成锚点
   * 自动添加旋转锚点（如果显示锚点功能开启）
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
    // 🔧 单选时不需要中心锚点，整个选区框都是可拖拽区域
    this.anchorPoints = anchors.filter(anchor => !anchor.isCenter);
    
    // 🔄 添加旋转锚点（位于顶部中心上方）
    // ⚪ 圆形不需要旋转锚点，因为旋转对圆形没有意义
    // 📝 文本不需要旋转锚点，文本旋转无实际意义
    if (action.type !== 'circle' && action.type !== 'text') {
      const halfSize = this.anchorSize / 2;
      const rotateAnchorOffset = 25;
      this.anchorPoints.push({
        x: effectiveBounds.x + effectiveBounds.width / 2 - halfSize,
        y: effectiveBounds.y - rotateAnchorOffset - halfSize,
        type: 'rotate' as const,
        cursor: 'grab',
        shapeType: action.type
      });
    }
  }

  /**
   * 更新移动区域
   * 🔧 整个选区框都是可拖拽区域，不再缩小
   */
  private updateMoveArea(bounds: { x: number; y: number; width: number; height: number }): void {
    // 移动区域等于整个选区框
    this.moveArea = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
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
      centerAnchor: null, // 不再使用中心点
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
   * 包含：8个缩放锚点 + 1个旋转锚点（grouped 模式）
   */
  private generateMultiSelectionAnchors(bounds: Bounds): void {
    // 🔒 individual 模式多选时禁用锚点（不能缩放、变形）
    if (this.virtualLayerMode === 'individual') {
      this.anchorPoints = [];
      this.moveArea = { 
        x: bounds.x, 
        y: bounds.y, 
        width: bounds.width, 
        height: bounds.height 
      };
      logger.debug('SelectTool.generateMultiSelectionAnchors: individual 模式多选，禁用锚点');
      return;
    }
    
    // grouped 模式：生成标准锚点
    const { x, y, width, height } = bounds;
    const halfSize = this.anchorSize / 2;
    
    // 旋转锚点配置
    const rotateAnchorOffset = 25;

    // 生成8个标准锚点 + 1个旋转锚点
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
      { x: x - halfSize, y: y + height / 2 - halfSize, type: 'left', cursor: 'w-resize', shapeType: 'multi' },
      
      // 🔄 旋转锚点（位于顶部中心上方）
      { 
        x: x + width / 2 - halfSize, 
        y: y - rotateAnchorOffset - halfSize, 
        type: 'rotate', 
        cursor: 'grab', 
        shapeType: 'multi' 
      }
    ];
  }

  /**
   * 生成默认锚点（用于未实现处理器的图形类型）
   * 包含：8个缩放锚点 + 1个旋转锚点
   */
  private generateDefaultAnchors(bounds: Bounds): void {
    const { x, y, width, height } = bounds;
    const halfSize = this.anchorSize / 2;
    
    // 旋转锚点配置
    const rotateAnchorOffset = 25; // 距离顶部边界 25px

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
      { x: x - halfSize, y: y + height / 2 - halfSize, type: 'left', cursor: 'w-resize', shapeType: 'default' },
      
      // 🔄 旋转锚点（位于顶部中心上方）
      { 
        x: x + width / 2 - halfSize, 
        y: y - rotateAnchorOffset - halfSize, 
        type: 'rotate', 
        cursor: 'grab', 
        shapeType: 'default' 
      }
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
   * 绘制锚点（边锚点 + 旋转锚点，不含中心点）
   * 🔧 单选时整个选区框都是可拖拽区域，不再需要中心点
   * 委托给 SelectionRenderer
   */
  private drawResizeAnchorPoints(ctx: CanvasRenderingContext2D, bounds?: Bounds | null): void {
    this.selectionRenderer.drawResizeAnchorPoints(
      ctx,
      this.anchorPoints,
      null, // 🔧 不再绘制中心点
      this.selectedActions.length,
      this.hoverAnchorInfo,
      this.draggedAnchorIndex,
      false, // 🔧 不再有中心点拖拽状态
      bounds // 传递边界框用于绘制旋转锚点连接线
    );
  }

  /**
   * 获取指定点位置的锚点（改进：使用距离计算，提高准确性）
   * 🔧 不再检测中心点，整个选区框都是可拖拽区域
   * 🔄 旋转锚点使用更大的容差，因为它在视觉上更大
   * 返回：{ index: number, anchor: AnchorPoint, isCenter: boolean } | null
   */
  private getAnchorPointAt(point: Point): { index: number; anchor: AnchorPoint; isCenter: boolean } | null {
    // 检查边锚点（改进：使用距离计算而不是矩形区域，提高准确性）
    let closestAnchor: { index: number; anchor: AnchorPoint; distance: number } | null = null;
    const baseMaxDistance = this.anchorSize / 2 + this.anchorTolerance;
    
    for (let i = 0; i < this.anchorPoints.length; i++) {
      const anchor = this.anchorPoints[i];
      const anchorCenterX = anchor.x + this.anchorSize / 2;
      const anchorCenterY = anchor.y + this.anchorSize / 2;
      const distance = Math.sqrt(
        Math.pow(point.x - anchorCenterX, 2) + Math.pow(point.y - anchorCenterY, 2)
      );
      
      // 🔄 旋转锚点使用更大的容差（因为视觉上更大）
      const maxDistance = anchor.type === 'rotate' 
        ? baseMaxDistance + 6  // 旋转锚点额外增加 6px 容差
        : baseMaxDistance;
      
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

    const anchor = this.anchorPoints[this.draggedAnchorIndex];
    if (!anchor) return null;
    
    // 确保拖拽处理器已开始
    if (!this.anchorDragHandler.isDragging()) {
      const bounds = this.getSelectedActionsBounds();
      if (!bounds) return null;
      
      // 保存原始 actions 用于旋转等变换操作
      const startActions = this.selectedActions.length > 1 
        ? this.selectedActions.map(deepCloneAction)
        : null;
      
      this.anchorDragHandler.startDrag(
        this.dragStartPoint,
        bounds,
        this.selectedActions.length === 1 ? this.dragStartAction : null,
        startActions
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
        // 🔧 实时更新 selectedActions，确保锚点位置正确
        this.selectedActions = result.actions;
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
      // 📝 锁定状态归属于虚拟图层，不需要在这里保留
      this.selectedActionForTransform = result.action;
      this.transformTool.setSelectedAction(result.action);
      
      // 🔧 实时更新 selectedActions，确保锚点位置正确
      this.selectedActions = [result.action];
      
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
   * 🔧 拖拽过程中隐藏锚点，仅显示选区边界框
   */
  private drawSelectedActionsUI(ctx: CanvasRenderingContext2D): void {
    // 🔧 判断是否正在拖拽（移动或变形）
    const isDragging = this.isDraggingMove || this.isDraggingResizeAnchor;
    
    // 只有在非拖拽状态下才生成和绘制锚点
    if (!isDragging && this.showAnchorsAndRotation) {
      // 生成锚点
      this.generateResizeAnchorPoints();
      
      // 🔒 individual 模式多选时不需要锚点，跳过警告检查
      const isIndividualMultiSelect = this.virtualLayerMode === 'individual' && this.selectedActions.length > 1;
      // 🔒 锁定状态下不生成锚点，跳过警告检查
      const isLocked = this.isSelectionLocked();
      
      // 如果锚点生成失败（非 individual 多选且非锁定情况），强制重新生成
      if (!isIndividualMultiSelect && 
          !isLocked &&
          this.anchorPoints.length === 0 && 
          this.selectedActions.length > 0) {
        logger.warn('SelectTool: 锚点生成失败，强制重新生成');
        this.clearAnchorCache();
        this.lastAnchorUpdateTime = 0;
        this.generateResizeAnchorPoints();
      }
    }
    
    // 🔧 选区边界框始终渲染，跟随变形实时变更
    // 🔧 拖拽过程中清除缓存，使用最新的 selectedActions 计算边界框
    if (isDragging) {
      this.clearBoundsCache();
    }
    
    // 使用 selectedActions 计算边界框（拖拽过程中 selectedActions 已实时更新）
    const bounds = this.getSelectedActionsBounds();
    
    if (bounds) {
      this.drawSelectionBounds(ctx, bounds);
      
      // 🔧 管理浮动工具栏显示/隐藏
      this.updateSelectionToolbar(bounds, isDragging);
    } else {
      // 没有选区时隐藏工具栏
      this.hideSelectionToolbar();
    }
    
    // 🔧 仅在非拖拽状态下绘制锚点（且锚点显示开启）
    if (!isDragging && this.showAnchorsAndRotation) {
      // 绘制锚点（individual 多选时 anchorPoints 为空，不会绘制）
      // 传入 bounds 用于绘制旋转锚点的连接线
      this.drawResizeAnchorPoints(ctx, bounds);
    }
  }
  
  /**
   * 更新选区浮动工具栏
   */
  private updateSelectionToolbar(
    bounds: { x: number; y: number; width: number; height: number },
    isDragging: boolean
  ): void {
    if (!this.selectionToolbar) return;
    
    if (isDragging) {
      // 拖拽时隐藏工具栏
      this.selectionToolbar.hide();
    } else if (this.selectedActions.length > 0) {
      // 非拖拽且有选中时显示工具栏
      if (!this.selectionToolbar.getIsVisible()) {
        this.selectionToolbar.show(bounds);
        this.selectionToolbar.updateState(this.selectedActions);
      } else {
        this.selectionToolbar.updatePosition(bounds);
      }
    } else {
      this.selectionToolbar.hide();
    }
  }
  
  /**
   * 隐藏选区浮动工具栏
   */
  private hideSelectionToolbar(): void {
    if (this.selectionToolbar && this.selectionToolbar.getIsVisible()) {
      this.selectionToolbar.hide();
    }
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
    this.dragStartPoint = null;
    
    // 🔧 重置框选状态（防止偶现多选问题）
    this.isSelecting = false;
    this.selectionStartPoint = null;
    this.currentSelectionBounds = null;
    
    // 如果有选中的actions，检查交互区域
    if (this.selectedActions.length > 0) {
      // 🔒 锁定检查：锁定的图形不允许变形和移动
      const isLocked = this.isSelectionLocked();
      
      // 1. 优先检查是否点击了边锚点（变形锚点优先级最高）
      // 🔒 锁定状态下不响应锚点操作
      if (!isLocked) {
        const anchorInfo = this.getAnchorPointAt(point);
        if (anchorInfo && !anchorInfo.isCenter) {
          // 边锚点：缩放/变形/旋转
          this.isDraggingResizeAnchor = true;
          this.draggedAnchorIndex = anchorInfo.index;
          this.dragStartPoint = point;
          this.dragStartBounds = null;
          // 🔧 深拷贝 action，确保旋转时使用原始数据
          this.dragStartAction = this.selectedActions.length === 1 
            ? deepCloneAction(this.selectedActions[0]) 
            : null;
          this.saveDragStartState();
          return 'resize';
        }
      }
      
      // 2. 检查是否点击了移动区域（整个选区框都是可拖拽区域）
      // 🔒 锁定状态下不允许移动
      if (this.isPointInMoveArea(point)) {
        if (isLocked) {
          logger.debug('图形已锁定，无法移动');
          return 'select'; // 锁定时仅保持选中状态
        }
        logger.debug('点击了移动区域，开始移动选区');
        this.isDraggingMove = true;
        this.dragStartPoint = point;
        // 🔧 深拷贝 action
        this.dragStartAction = this.selectedActions.length === 1 
          ? deepCloneAction(this.selectedActions[0]) 
          : null;
        this.saveDragStartState();
        return 'move';
      }
      
      // 🔒 individual 模式多选时：点击选中的 action 也应该启动移动
      // 防止多选变单选的问题
      if (this.virtualLayerMode === 'individual' && this.selectedActions.length > 1) {
        // 检查是否点击了任何一个已选中的 action
        const clickedSelectedAction = this.selectedActions.find(action => 
          this.isPointInAction(point, action, 8)
        );
        if (clickedSelectedAction) {
          // 🔒 锁定状态下不允许移动
          if (isLocked) {
            logger.debug('图形已锁定，无法移动');
            return 'select';
          }
          logger.debug('individual 模式多选：点击了已选中的 action，启动移动', {
            actionId: clickedSelectedAction.id
          });
          this.isDraggingMove = true;
          this.dragStartPoint = point;
          this.saveDragStartState();
          return 'move';
        }
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
        // 🔧 一次点击拖拽：选中并立即启动移动
        const clickedAction = this.selectActionAtPoint(point);
        if (clickedAction) {
          // 🔒 检查新选中的 action 是否锁定
          if (this.isActionLocked(clickedAction)) {
            logger.debug('新选中的图形已锁定，无法移动');
            return 'select';
          }
          this.isDraggingMove = true;
          this.dragStartPoint = point;
          this.dragStartAction = { ...clickedAction };
          this.saveDragStartState();
          return 'move';
        }
        
        // 开始新的框选
        this.isSelecting = true;
        this.selectionStartPoint = point;
        return 'box-select';
      }

      return 'select';
    }

    // 4. 普通选择模式：检查是否点击了action
    // 🔧 一次点击拖拽：选中并立即启动移动
    logger.debug('普通选择模式，检查是否点击了action');
    const clickedAction = this.selectActionAtPoint(point);
    if (clickedAction) {
      logger.debug('点击了action，选中并启动移动', { actionId: clickedAction.id, actionType: clickedAction.type });
      // 🔒 检查新选中的 action 是否锁定
      if (this.isActionLocked(clickedAction)) {
        logger.debug('新选中的图形已锁定，无法移动');
        return 'select';
      }
      // 🔧 立即启动拖拽移动，实现一次点击拖拽
      this.isDraggingMove = true;
      this.dragStartPoint = point;
      this.dragStartAction = { ...clickedAction };
      this.saveDragStartState();
      return 'move';
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
    // 🔒 锁定检查：如果图形被锁定，停止所有拖拽操作
    if (this.selectedActions.length > 0 && this.isSelectionLocked()) {
      // 如果正在拖拽，立即停止
      if (this.isDraggingResizeAnchor || this.isDraggingMove || this.isDragging) {
        logger.debug('图形已锁定，停止拖拽操作');
        this.isDraggingResizeAnchor = false;
        this.isDraggingMove = false;
        this.isDragging = false;
        this.dragStartPoint = null;
        return null;
      }
      // 如果未拖拽，直接返回 null
      return null;
    }
    
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
      
      // 移动选中的图形（整个选区框都是可拖拽区域，不再区分中心点）
      let result: DrawAction | DrawAction[] | null = null;
      if (this.selectedActions.length > 1) {
        result = this.moveSelectedActions(deltaX, deltaY);
      } else {
        result = this.moveSelectedAction(deltaX, deltaY);
      }
      
      // 🔧 关键修复：更新 dragStartPoint 为当前点，避免 delta 累积
      if (result) {
        this.dragStartPoint = point;
      }
      return result;
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
    if (this.isDraggingResizeAnchor) {
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
    if (anchorInfo && !this.isDraggingResizeAnchor) {
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
   * 
   * 【重要】individual 模式下的多选行为：
   * - 允许多选
   * - 但多选时禁用锚点功能（不能缩放、变形）
   * - 保留删除功能
   */
  private finishBoxSelection(): DrawAction | DrawAction[] | null {
    const selectedActions = this.selectActionsInBox(this.currentSelectionBounds!);
    this.isSelecting = false;
    this.selectionStartPoint = null;
    this.currentSelectionBounds = null;
    
    this.setSelectedActions(selectedActions);
    
    if (selectedActions.length === 1) {
      // 单选：启用变形模式（有锚点）
      this.enterTransformMode(selectedActions[0]);
      return selectedActions[0];
    } else if (selectedActions.length > 1) {
      // 🔒 多选：individual 模式下禁用锚点/变形，只保留删除功能
      if (this.virtualLayerMode === 'individual') {
        logger.info('SelectTool.finishBoxSelection: individual 模式多选，禁用锚点功能', {
          selectedCount: selectedActions.length
        });
        // 不进入变形模式，清除锚点
        this.exitTransformMode();
        this.clearAnchorPointsState();
        
        // 🔔 通知 UI 层：多选时无法使用变形功能
        if (this.onSelectionLimited) {
          this.onSelectionLimited({
            reason: 'individual-mode-no-transform',
            message: `独立图层模式下多选时不支持缩放/变形操作，可删除`,
            selectedCount: selectedActions.length
          });
        }
      }
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
    // 📝 同步变形后的 action
    // 📝 注意：锁定状态归属于虚拟图层，不需要在这里保留
    if (this.selectedActions.length === 1 && this.selectedActionForTransform) {
      // 📝 深拷贝确保数据完整性，避免引用问题
      // 📝 重要：必须完整复制所有属性，包括 width 和 height
      this.selectedActions[0] = JSON.parse(JSON.stringify(this.selectedActionForTransform));
      
      // 📝 对于文本类型，如果 height 是 undefined，需要重新计算并保存
      // 📝 这是因为文本宽度变化时，height 被清除，需要根据新的 width 重新计算
      if (this.selectedActionForTransform.type === 'text') {
        const textAction = this.selectedActionForTransform as DrawAction & { width?: number; height?: number };
        const syncedAction = this.selectedActions[0] as DrawAction & { width?: number; height?: number };
        
        // 📝 如果 width 存在但 height 不存在，重新计算高度
        if (textAction.width && textAction.width > 0 && textAction.height === undefined) {
          // 清除缓存，确保重新计算
          this.boundsCacheManager.deleteForAction(textAction.id);
          // 重新计算边界框
          const bounds = this.boundsCalculator.calculate(textAction);
          // 📝 保存计算出的高度（textAction 就是 selectedActionForTransform 的引用）
          textAction.height = bounds.height;
          syncedAction.height = bounds.height;
          
          logger.debug('syncAndRefreshAfterDrag: 文本高度已重新计算', {
            actionId: textAction.id,
            width: textAction.width,
            height: textAction.height
          });
        }
        
        logger.debug('syncAndRefreshAfterDrag: 文本宽度拖拽完成', {
          actionId: this.selectedActionForTransform.id,
          originalWidth: textAction.width,
          originalHeight: textAction.height,
          syncedWidth: syncedAction.width,
          syncedHeight: syncedAction.height,
          points: this.selectedActionForTransform.points[0]
        });
      }
    } else if (this.selectedActions.length > 1) {
      // 📝 多选场景：锁定状态归属于虚拟图层，不需要在这里恢复
    }
    
    // 📝 清除缓存，确保使用最新的数据重新计算
    // 📝 注意：不要在这里调用 generateResizeAnchorPoints 和 getSelectedActionsBounds
    // 📝 因为这些会在 syncLayerDataToSelectToolImmediate 之后被调用
    this.clearBoundsCache();
    this.clearAnchorCache();
    
    // 📝 返回深拷贝，确保数据完整性
    // 📝 返回的数据会被用于更新历史记录
    // 📝 注意：锁定状态已经在上面恢复到了 selectedActions 和 selectedActionForTransform
    if (this.selectedActions.length > 1) {
      // 📝 多选场景：返回所有 actions，锁定状态已经在 selectedActions 中恢复
      return this.selectedActions.map(a => JSON.parse(JSON.stringify(a)));
    } else if (this.selectedActionForTransform) {
      // 📝 单选场景：返回 selectedActionForTransform，锁定状态已经恢复
      return JSON.parse(JSON.stringify(this.selectedActionForTransform));
    }
    
    return null;
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
    
    // 如果鼠标悬停在锚点上（但未拖拽），返回对应的鼠标样式
    if (this.hoverAnchorInfo && !this.isDraggingResizeAnchor) {
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
   * 移动单个选中的图形
   * 使用 TransformOperations 模块，保持形状完整性（不会因边界约束而变形）
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

    // 🔧 使用 TransformOperations.moveAction，智能边界约束不会导致变形
    const canvasBounds = this.getCanvasBounds() || undefined;
    const result = TransformOperations.moveAction(
      this.selectedActionForTransform,
      deltaX,
      deltaY,
      canvasBounds
    );
    
    if (!result.success || !result.action) {
      logger.warn('SelectTool: 移动失败', { error: result.error });
      return null;
    }
    
    const updatedAction = result.action;
    
    // 📝 锁定状态归属于虚拟图层，不需要在这里保留
    
    // 🔧 实时更新 selectedActions 和 selectedActionForTransform
    this.selectedActions = [updatedAction];
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

    // 📝 锁定状态归属于虚拟图层，不需要在这里保留
    
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

    // 📝 锁定状态归属于虚拟图层，不需要在这里保留
    
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
    // 使用所有点坐标的累加值作为指纹，确保任意点变化时缓存失效
    // 📝 对于文本类型，还需要包含width和height，确保文本尺寸变化时缓存失效
    const actionIds = actionsToUse.map(a => a.id).sort();
    const contentFingerprint = actionsToUse.map(a => {
      if (a.points.length === 0) return `${a.id}:empty`;
      // 计算所有点坐标的累加值，任意点变化都会导致指纹变化
      let sumX = 0, sumY = 0;
      for (const p of a.points) {
        sumX += p.x;
        sumY += p.y;
      }
      let fingerprint = `${a.id}:${Math.round(sumX)},${Math.round(sumY)},${a.points.length}`;
      
      // 📝 文本类型：包含width和height，确保文本尺寸变化时缓存失效
      if (a.type === 'text') {
        const textAction = a as DrawAction & { width?: number; height?: number };
        const width = textAction.width !== undefined ? Math.round(textAction.width * 100) / 100 : 'undefined';
        const height = textAction.height !== undefined ? Math.round(textAction.height * 100) / 100 : 'undefined';
        fingerprint += `:w${width}:h${height}`;
      }
      
      return fingerprint;
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

    // 📝 锁定状态归属于虚拟图层，不需要在这里保留

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

    // 📝 锁定状态归属于虚拟图层，不需要在这里保留

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
      anchorPointsCount: this.anchorPoints.length,
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
    // 返回所有边锚点
    return this.anchorPoints.map(anchor => ({
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