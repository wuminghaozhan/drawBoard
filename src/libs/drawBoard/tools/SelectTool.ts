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
import { BoundsValidator, type Bounds as BoundsType } from '../utils/BoundsValidator';
import { SpatialIndex } from '../utils/SpatialIndex';

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

  private get ANCHOR_CACHE_TTL(): number {
    return this.dragConfig.anchorCacheTTL;
  }

  // 性能优化：边界框缓存
  private boundsCache: Map<string, { x: number; y: number; width: number; height: number }> = new Map();
  private readonly MAX_CACHE_SIZE = 100; // 缓存最大大小
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

  constructor(config?: Partial<{
    sensitivity: number;
    minDragDistance: number;
    anchorCacheTTL: number;
    enableCirclePrecisionMode: boolean;
  }>) {
    super('选择', 'select');
    this.transformTool = new TransformToolRefactored();
    
    // 应用配置（如果提供）
    if (config) {
      this.updateDragConfig(config);
    }
    
    // 初始化图形处理器
    this.shapeHandlers.set('circle', new CircleAnchorHandler());
    this.shapeHandlers.set('rect', new RectAnchorHandler());
    this.shapeHandlers.set('text', new TextAnchorHandler());
    this.shapeHandlers.set('line', new LineAnchorHandler());
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
      } catch (error) {
        logger.error('获取动态图层失败，回退到interaction层:', error);
        return this.canvasEngine.getInteractionLayer();
      }
    }
    
    // 如果没有CanvasEngine，返回传入的ctx（兼容性）
    if (this.canvasEngine) {
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
    this.allActions = actions;
    
    if (clearSelection) {
      // 图层切换时，完全清空选择
      this.clearSelection();
    } else {
    // 清理不在当前图层中的选中actions
    this.selectedActions = this.selectedActions.filter(selectedAction => 
      actions.some(action => action.id === selectedAction.id)
    );
    
    // 如果选中的actions发生变化，更新变换模式
    if (this.selectedActions.length === 1) {
      this.enterTransformMode(this.selectedActions[0]);
    } else if (this.selectedActions.length === 0) {
      this.exitTransformMode();
      }
    }
    
    // 清除缓存
    this.clearBoundsCache();
    
    // 清空空间索引缓存（图层切换时重建）
    this.clearSpatialIndex();
    
    logger.debug(`SelectTool: 设置图层actions，共${actions.length}个，当前选中${this.selectedActions.length}个`, {
      clearedSelection: clearSelection
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
   * 改进：提高精确度，支持更多类型
   */
  private isPointInAction(point: Point, action: DrawAction, tolerance: number): boolean {
    try {
      if (!action || !action.points || action.points.length === 0) return false;

      // 根据action类型进行不同的碰撞检测
      switch (action.type) {
        case 'text':
          return this.isPointInTextAction(point, action, tolerance);
        case 'rect':
          return this.isPointInRectAction(point, action, tolerance);
        case 'circle':
          return this.isPointInCircleAction(point, action, tolerance);
        case 'polygon':
          return this.isPointInPolygonAction(point, action, tolerance);
        case 'line':
          return this.isPointInLineAction(point, action, tolerance);
        case 'pen':
        case 'brush':
          return this.isPointInPathAction(point, action, tolerance);
        case 'eraser':
          // 橡皮擦通常不需要选择，但为了完整性也支持
          return this.isPointInPathAction(point, action, tolerance);
        default:
          return this.isPointInBoundingBox(point, action, tolerance);
      }
    } catch (error) {
      logger.error('SelectTool: 检查点是否在action内时发生错误', error);
      return false;
    }
  }

  /**
   * 检查点是否在文字action内
   * 改进：使用更精确的文字边界框计算
   */
  private isPointInTextAction(point: Point, action: DrawAction, tolerance: number): boolean {
    if (action.points.length === 0) return false;
    
    const textPoint = action.points[0];
    const textAction = action as DrawAction & { 
      text?: string; 
      fontSize?: number;
      fontFamily?: string;
      textAlign?: CanvasTextAlign;
      textBaseline?: CanvasTextBaseline;
    };
    const text = textAction.text || '文字';
    const fontSize = textAction.fontSize || 16;
    const fontFamily = textAction.fontFamily || 'Arial';
    
    // 尝试使用 Canvas 精确测量文字宽度
    let width: number;
    let height: number;
    
    try {
      // 如果可能，使用临时 canvas 测量文字
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.font = `${fontSize}px ${fontFamily}`;
        const metrics = ctx.measureText(text);
        width = metrics.width;
        // 使用实际边界框高度
        height = (metrics.actualBoundingBoxAscent || fontSize * 0.8) + 
                 (metrics.actualBoundingBoxDescent || fontSize * 0.2);
      } else {
        // 降级方案：估算
        width = text.length * fontSize * 0.6;
        height = fontSize;
      }
    } catch {
      // 降级方案：估算
      width = text.length * fontSize * 0.6;
      height = fontSize;
    }
    
    // 考虑文字对齐方式
    let x = textPoint.x;
    const textAlign = textAction.textAlign || 'left';
    if (textAlign === 'center') {
      x = textPoint.x - width / 2;
    } else if (textAlign === 'right') {
      x = textPoint.x - width;
    }
    
    // 考虑文字基线
    let y = textPoint.y;
    const textBaseline = textAction.textBaseline || 'top';
    if (textBaseline === 'middle') {
      y = textPoint.y - height / 2;
    } else if (textBaseline === 'bottom') {
      y = textPoint.y - height;
    }
    
    return point.x >= x - tolerance &&
           point.x <= x + width + tolerance &&
           point.y >= y - tolerance &&
           point.y <= y + height + tolerance;
  }

  /**
   * 检查点是否在矩形action内（精确检测）
   * 改进：考虑线宽，提高精确度
   */
  private isPointInRectAction(point: Point, action: DrawAction, tolerance: number): boolean {
    if (action.points.length < 2) return false;
    
    const p1 = action.points[0];
    const p2 = action.points[action.points.length - 1];
    
    // 检查点有效性
    if (!isFinite(p1.x) || !isFinite(p1.y) || !isFinite(p2.x) || !isFinite(p2.y)) {
      return false;
    }
    
    const minX = Math.min(p1.x, p2.x);
    const maxX = Math.max(p1.x, p2.x);
    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);
    
    // 考虑线宽
    const lineWidth = action.context?.lineWidth || 2;
    const effectiveTolerance = tolerance + Math.max(lineWidth / 2, 1);
    
    // 检查点是否在矩形内（带容差）
    return point.x >= minX - effectiveTolerance &&
           point.x <= maxX + effectiveTolerance &&
           point.y >= minY - effectiveTolerance &&
           point.y <= maxY + effectiveTolerance;
  }

  /**
   * 检查点是否在圆形action内（精确检测）
   * 改进：考虑填充和描边，提高精确度
   */
  private isPointInCircleAction(point: Point, action: DrawAction, tolerance: number): boolean {
    if (action.points.length < 2) return false;
    
    const center = action.points[0];
    const edge = action.points[action.points.length - 1];
    
    // 检查点有效性
    if (!isFinite(center.x) || !isFinite(center.y) || 
        !isFinite(edge.x) || !isFinite(edge.y)) {
      return false;
    }
    
    const radius = Math.sqrt(
      Math.pow(edge.x - center.x, 2) + Math.pow(edge.y - center.y, 2)
    );
    
    if (!isFinite(radius) || radius <= 0) return false;
    
    const distance = Math.sqrt(
      Math.pow(point.x - center.x, 2) + Math.pow(point.y - center.y, 2)
    );
    
    // 检查点是否在圆内（带容差）
    // 对于填充的圆，点在圆内即可；对于描边的圆，需要考虑线宽
    const lineWidth = action.context?.lineWidth || 2;
    const effectiveTolerance = tolerance + Math.max(lineWidth / 2, 1);
    
    return distance <= radius + effectiveTolerance;
  }

  /**
   * 检查点是否在多边形action内（使用射线法）
   */
  private isPointInPolygonAction(point: Point, action: DrawAction, tolerance: number): boolean {
    if (action.points.length < 3) {
      // 少于3个点，使用边界框检测
      return this.isPointInBoundingBox(point, action, tolerance);
    }
    
    // 使用射线法判断点是否在多边形内
    let inside = false;
    const points = action.points;
    
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i].x;
      const yi = points[i].y;
      const xj = points[j].x;
      const yj = points[j].y;
      
      // 检查点是否在多边形边界上（带容差）
      const distToEdge = this.distanceToLineSegment(point, points[j], points[i]);
      if (distToEdge <= tolerance) {
        return true;
      }
      
      // 射线法：检查从点向右的射线是否与边相交
      const intersect = ((yi > point.y) !== (yj > point.y)) &&
                       (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
      if (intersect) {
        inside = !inside;
      }
    }
    
    return inside;
  }

  /**
   * 检查点是否在路径action内（pen/brush/eraser）
   * 改进：更精确的检测，考虑线宽和路径形状
   */
  private isPointInPathAction(point: Point, action: DrawAction, tolerance: number): boolean {
    if (action.points.length === 0) return false;
    
    // 对于路径，检查点到路径的距离
    // 如果路径有宽度，需要考虑线宽
    const lineWidth = action.context?.lineWidth || 2;
    // 增加容差，考虑线宽的一半（因为线宽是总宽度）
    const effectiveTolerance = tolerance + Math.max(lineWidth / 2, 3);
    
    // 对于单点路径，检查点是否在点的容差范围内
    if (action.points.length === 1) {
      const p = action.points[0];
      if (!isFinite(p.x) || !isFinite(p.y)) return false;
      
      const distance = Math.sqrt(
        Math.pow(point.x - p.x, 2) + Math.pow(point.y - p.y, 2)
      );
      return distance <= effectiveTolerance;
    }
    
    // 检查点到所有线段的距离
    let minDistance = Infinity;
    for (let i = 0; i < action.points.length - 1; i++) {
      const p1 = action.points[i];
      const p2 = action.points[i + 1];
      
      // 检查点有效性
      if (!isFinite(p1.x) || !isFinite(p1.y) || !isFinite(p2.x) || !isFinite(p2.y)) {
        continue;
      }
      
      const distance = this.distanceToLineSegment(point, p1, p2);
      if (distance < minDistance) {
        minDistance = distance;
      }
      
      // 如果距离在容差范围内，直接返回true（优化性能）
      if (distance <= effectiveTolerance) {
        return true;
      }
    }
    
    // 如果最小距离在容差范围内，返回true
    return minDistance <= effectiveTolerance;
  }

  /**
   * 检查点是否在线条action内
   * 改进：考虑线宽，提高精确度
   */
  private isPointInLineAction(point: Point, action: DrawAction, tolerance: number): boolean {
    if (action.points.length < 2) return false;
    
    // 考虑线宽
    const lineWidth = action.context?.lineWidth || 2;
    const effectiveTolerance = tolerance + Math.max(lineWidth / 2, 2);
    
    // 检查点到线段的距离
    for (let i = 0; i < action.points.length - 1; i++) {
      const p1 = action.points[i];
      const p2 = action.points[i + 1];
      
      // 检查点有效性
      if (!isFinite(p1.x) || !isFinite(p1.y) || !isFinite(p2.x) || !isFinite(p2.y)) {
        continue;
      }
      
      if (this.distanceToLineSegment(point, p1, p2) <= effectiveTolerance) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 计算点到线段的距离
   */
  private distanceToLineSegment(point: Point, lineStart: Point, lineEnd: Point): number {
    // 检查参数有效性
    if (!isFinite(point.x) || !isFinite(point.y) ||
        !isFinite(lineStart.x) || !isFinite(lineStart.y) ||
        !isFinite(lineEnd.x) || !isFinite(lineEnd.y)) {
      return Infinity; // 返回一个很大的值，表示不在线段上
    }
    
    const A = point.x - lineStart.x;
    const B = point.y - lineStart.y;
    const C = lineEnd.x - lineStart.x;
    const D = lineEnd.y - lineStart.y;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    
    // 检查lenSq是否溢出或为0
    if (lenSq === 0 || !isFinite(lenSq)) {
      return Math.sqrt(A * A + B * B);
    }
    
    let param = dot / lenSq;
    param = Math.max(0, Math.min(1, param));
    
    const x = lineStart.x + param * C;
    const y = lineStart.y + param * D;
    
    const dx = point.x - x;
    const dy = point.y - y;
    
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // 检查计算结果
    return isFinite(distance) ? distance : Infinity;
  }

  /**
   * 检查点是否在边界框内
   */
  private isPointInBoundingBox(point: Point, action: DrawAction, tolerance: number): boolean {
    const bounds = this.getActionBoundingBox(action);
    return point.x >= bounds.x - tolerance &&
           point.x <= bounds.x + bounds.width + tolerance &&
           point.y >= bounds.y - tolerance &&
           point.y <= bounds.y + bounds.height + tolerance;
  }

  /**
   * 获取action的边界框
   * 对于圆形，返回以圆心为中心的正方形边界框
   */
  private getActionBoundingBox(action: DrawAction): { x: number; y: number; width: number; height: number } {
    if (action.points.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    // 对于圆形，特殊处理：返回以圆心为中心的正方形边界框
    if (action.type === 'circle' && action.points.length >= 2) {
      const center = action.points[0];
      // 注意：CircleTool 使用 points[points.length - 1] 作为边缘点，而不是 points[1]
      const edge = action.points[action.points.length - 1];
      const radius = Math.sqrt(
        Math.pow(edge.x - center.x, 2) + Math.pow(edge.y - center.y, 2)
      );
      
      // 确保半径有效（至少为1，避免边界框太小）
      const validRadius = Math.max(1, radius);
      
      // 返回以圆心为中心的正方形边界框
      const bounds = {
        x: center.x - validRadius,
        y: center.y - validRadius,
        width: validRadius * 2,
        height: validRadius * 2
      };
      
      // 缓存结果
      const cacheKey = `${action.id}_${action.points.length}`;
      this.setBoundsCache(cacheKey, bounds);
      return bounds;
    }

    // 检查缓存
    const cacheKey = `${action.id}_${action.points.length}`;
    if (this.boundsCache.has(cacheKey)) {
      return this.boundsCache.get(cacheKey)!;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let validPointCount = 0;

    for (const point of action.points) {
      // 检查点坐标有效性
      if (!isFinite(point.x) || !isFinite(point.y)) {
        logger.warn('SelectTool: 发现无效的点坐标', { point, actionId: action.id });
        continue; // 跳过无效点
      }
      
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
      validPointCount++;
    }

    // 如果没有有效点，返回默认边界框
    if (validPointCount === 0) {
      logger.warn('SelectTool: action没有有效的点', { actionId: action.id });
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    // 如果所有点在同一位置，返回一个小的默认边界框
    const width = Math.max(0, maxX - minX);
    const height = Math.max(0, maxY - minY);

    const bounds = {
      x: minX,
      y: minY,
      width: width === 0 && height === 0 ? 10 : width, // 单点情况返回10x10
      height: width === 0 && height === 0 ? 10 : height
    };

    // 缓存结果（限制缓存大小）
    this.setBoundsCache(cacheKey, bounds);
    return bounds;
  }

  /**
   * 设置边界框缓存（限制大小）
   */
  private setBoundsCache(key: string, bounds: { x: number; y: number; width: number; height: number }): void {
    // 如果缓存已满，删除最旧的（FIFO策略）
    if (this.boundsCache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.boundsCache.keys().next().value;
      if (firstKey) {
        this.boundsCache.delete(firstKey);
      }
    }
    this.boundsCache.set(key, bounds);
  }

  /**
   * 清除边界框缓存
   */
  private clearBoundsCache(): void {
    this.boundsCache.clear();
  }

  /**
   * 清除特定action的边界框缓存
   */
  private clearActionBoundsCache(actionId: string): void {
    for (const key of this.boundsCache.keys()) {
      if (key.startsWith(actionId)) {
        this.boundsCache.delete(key);
      }
    }
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
   * 改进：更精确的检测，不仅检查边界框，还检查实际形状
   */
  public selectActionsInBox(bounds: { x: number; y: number; width: number; height: number }): DrawAction[] {
    const selected: DrawAction[] = [];
    
    // 检查选择框是否有效
    if (!isFinite(bounds.x) || !isFinite(bounds.y) || 
        !isFinite(bounds.width) || !isFinite(bounds.height)) {
      logger.warn('SelectTool: 无效的选择框', bounds);
      return [];
    }
    
    // 检查选择框最小尺寸（避免误选）
    if (bounds.width < 5 || bounds.height < 5) {
      logger.debug('SelectTool: 选择框太小，忽略框选', bounds);
      this.selectedActions = [];
      return [];
    }
    
    // 检查allActions是否为空
    if (this.allActions.length === 0) {
      logger.debug('SelectTool: allActions为空，无法框选');
      this.selectedActions = [];
      return [];
    }
    
    // 性能优化：如果actions数量超过阈值，使用空间索引
    if (this.allActions.length > this.BOX_SELECT_SPATIAL_INDEX_THRESHOLD) {
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
        const candidates = this.spatialIndex.queryBounds(bounds);
        
        // 对候选actions进行精确检测
        for (const action of candidates) {
          if (!action) continue;
          
          // 边界框相交，进行更精确的检测
          if (this.isActionInBox(bounds, action)) {
            selected.push(action);
          }
        }
      } else {
        // 如果空间索引初始化失败，回退到原有方式
        const actionsSnapshot = [...this.allActions];
        for (const action of actionsSnapshot) {
          if (!action) continue;
          
          const actionBounds = this.getActionBoundingBox(action);
          if (this.isBoundingBoxIntersect(bounds, actionBounds) && this.isActionInBox(bounds, action)) {
            selected.push(action);
          }
        }
      }
    } else {
      // 使用原有的遍历方式（actions数量较少时）
      // 创建快照，避免在迭代过程中数组被修改
      const actionsSnapshot = [...this.allActions];
      for (const action of actionsSnapshot) {
        if (!action) {
          logger.warn('SelectTool: 发现空的action');
          continue;
        }
        
        // 首先快速检查边界框是否相交
        const actionBounds = this.getActionBoundingBox(action);
        if (!this.isBoundingBoxIntersect(bounds, actionBounds)) {
          continue; // 边界框不相交，跳过
        }
        
        // 边界框相交，进行更精确的检测
        if (this.isActionInBox(bounds, action)) {
          selected.push(action);
        }
      }
    }
    
    this.selectedActions = selected;
    logger.debug(`SelectTool: 框选到${selected.length}个actions`, {
      bounds,
      totalActions: this.allActions.length
    });
    return selected;
  }

  /**
   * 检查action是否在选择框内（精确检测）
   */
  private isActionInBox(bounds: { x: number; y: number; width: number; height: number }, action: DrawAction): boolean {
    if (!action || !action.points || action.points.length === 0) {
      return false;
    }
    
    // 根据action类型进行不同的检测
    switch (action.type) {
      case 'rect':
        // 矩形：检查是否有任何点在框内，或者矩形完全包含选择框
        return this.isRectInBox(bounds, action);
      
      case 'circle':
        // 圆形：检查圆心是否在框内，或者圆与框相交
        return this.isCircleInBox(bounds, action);
      
      case 'polygon':
        // 多边形：检查是否有任何点在框内，或者多边形与框相交
        return this.isPolygonInBox(bounds, action);
      
      case 'line':
      case 'pen':
      case 'brush':
        // 路径：检查是否有任何点在框内，或者路径与框相交
        return this.isPathInBox(bounds, action);
      
      case 'text':
        // 文字：检查文字边界框是否与选择框相交
        return this.isBoundingBoxIntersect(bounds, this.getActionBoundingBox(action));
      
      default:
        // 默认：使用边界框检测
        return this.isBoundingBoxIntersect(bounds, this.getActionBoundingBox(action));
    }
  }

  /**
   * 检查矩形是否在选择框内
   */
  private isRectInBox(bounds: { x: number; y: number; width: number; height: number }, action: DrawAction): boolean {
    if (action.points.length < 2) return false;
    
    const p1 = action.points[0];
    const p2 = action.points[action.points.length - 1];
    
    const rectMinX = Math.min(p1.x, p2.x);
    const rectMaxX = Math.max(p1.x, p2.x);
    const rectMinY = Math.min(p1.y, p2.y);
    const rectMaxY = Math.max(p1.y, p2.y);
    
    const boxRight = bounds.x + bounds.width;
    const boxBottom = bounds.y + bounds.height;
    
    // 检查矩形是否与选择框相交
    return rectMinX < boxRight &&
           rectMaxX > bounds.x &&
           rectMinY < boxBottom &&
           rectMaxY > bounds.y;
  }

  /**
   * 检查圆形是否在选择框内
   */
  private isCircleInBox(bounds: { x: number; y: number; width: number; height: number }, action: DrawAction): boolean {
    if (action.points.length < 2) return false;
    
    const center = action.points[0];
    const edge = action.points[action.points.length - 1];
    
    const radius = Math.sqrt(
      Math.pow(edge.x - center.x, 2) + Math.pow(edge.y - center.y, 2)
    );
    
    if (!isFinite(radius) || radius <= 0) return false;
    
    const boxRight = bounds.x + bounds.width;
    const boxBottom = bounds.y + bounds.height;
    
    // 找到选择框上离圆心最近的点
    const closestX = Math.max(bounds.x, Math.min(center.x, boxRight));
    const closestY = Math.max(bounds.y, Math.min(center.y, boxBottom));
    
    // 计算选择框上最近点到圆心的距离
    const distance = Math.sqrt(
      Math.pow(center.x - closestX, 2) + Math.pow(center.y - closestY, 2)
    );
    
    // 如果距离小于半径，说明圆与选择框相交
    return distance <= radius;
  }

  /**
   * 检查多边形是否在选择框内
   */
  private isPolygonInBox(bounds: { x: number; y: number; width: number; height: number }, action: DrawAction): boolean {
    if (action.points.length < 3) {
      // 少于3个点，使用边界框检测
      return this.isBoundingBoxIntersect(bounds, this.getActionBoundingBox(action));
    }
    
    const boxRight = bounds.x + bounds.width;
    const boxBottom = bounds.y + bounds.height;
    
    // 检查是否有任何点在框内
    for (const point of action.points) {
      if (point.x >= bounds.x && point.x <= boxRight &&
          point.y >= bounds.y && point.y <= boxBottom) {
        return true;
      }
    }
    
    // 检查是否有任何边与选择框相交
    for (let i = 0; i < action.points.length; i++) {
      const p1 = action.points[i];
      const p2 = action.points[(i + 1) % action.points.length];
      
      if (this.isLineSegmentIntersectBox(p1, p2, bounds)) {
        return true;
      }
    }
    
    // 检查选择框的角是否在多边形内
    const corners = [
      { x: bounds.x, y: bounds.y },
      { x: boxRight, y: bounds.y },
      { x: boxRight, y: boxBottom },
      { x: bounds.x, y: boxBottom }
    ];
    
    for (const corner of corners) {
      if (this.isPointInPolygonAction(corner, action, 0)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 检查路径是否在选择框内
   */
  private isPathInBox(bounds: { x: number; y: number; width: number; height: number }, action: DrawAction): boolean {
    if (action.points.length === 0) return false;
    
    const boxRight = bounds.x + bounds.width;
    const boxBottom = bounds.y + bounds.height;
    
    // 检查是否有任何点在框内
    for (const point of action.points) {
      if (point.x >= bounds.x && point.x <= boxRight &&
          point.y >= bounds.y && point.y <= boxBottom) {
        return true;
      }
    }
    
    // 检查是否有任何线段与选择框相交
    for (let i = 0; i < action.points.length - 1; i++) {
      const p1 = action.points[i];
      const p2 = action.points[i + 1];
      
      if (this.isLineSegmentIntersectBox(p1, p2, bounds)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 检查线段是否与选择框相交
   */
  private isLineSegmentIntersectBox(
    p1: Point, 
    p2: Point, 
    box: { x: number; y: number; width: number; height: number }
  ): boolean {
    const boxRight = box.x + box.width;
    const boxBottom = box.y + box.height;
    
    // 快速拒绝：如果线段完全在框外
    if ((p1.x < box.x && p2.x < box.x) ||
        (p1.x > boxRight && p2.x > boxRight) ||
        (p1.y < box.y && p2.y < box.y) ||
        (p1.y > boxBottom && p2.y > boxBottom)) {
      return false;
    }
    
    // 如果线段的一个端点在框内
    if ((p1.x >= box.x && p1.x <= boxRight && p1.y >= box.y && p1.y <= boxBottom) ||
        (p2.x >= box.x && p2.x <= boxRight && p2.y >= box.y && p2.y <= boxBottom)) {
      return true;
    }
    
    // 检查线段是否与框的边相交
    const boxEdges = [
      [{ x: box.x, y: box.y }, { x: boxRight, y: box.y }], // 上边
      [{ x: boxRight, y: box.y }, { x: boxRight, y: boxBottom }], // 右边
      [{ x: boxRight, y: boxBottom }, { x: box.x, y: boxBottom }], // 下边
      [{ x: box.x, y: boxBottom }, { x: box.x, y: box.y }] // 左边
    ];
    
    for (const edge of boxEdges) {
      if (this.doLineSegmentsIntersect(p1, p2, edge[0], edge[1])) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 检查两条线段是否相交
   */
  private doLineSegmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
    const ccw = (A: Point, B: Point, C: Point): number => {
      return (C.y - A.y) * (B.x - A.x) - (B.y - A.y) * (C.x - A.x);
    };
    
    return (ccw(p1, p3, p4) * ccw(p2, p3, p4) <= 0) &&
           (ccw(p3, p1, p2) * ccw(p4, p1, p2) <= 0);
  }

  /**
   * 检查两个边界框是否相交
   */
  private isBoundingBoxIntersect(box1: { x: number; y: number; width: number; height: number }, 
                                box2: { x: number; y: number; width: number; height: number }): boolean {
    return box1.x < box2.x + box2.width &&
           box1.x + box1.width > box2.x &&
           box1.y < box2.y + box2.height &&
           box1.y + box1.height > box2.y;
  }

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
    
    // 重新生成锚点
    if (this.selectedActions.length > 0) {
      this.generateResizeAnchorPoints();
    }
    
    logger.debug(`SelectTool: 设置选中actions，共${actions.length}个`);
  }

  /**
   * 生成锚点（根据图形类型使用不同的处理器）
   * 改进：支持中心点和图形特定的锚点布局
   * 优化：添加缓存机制，减少重复计算
   */
  private generateResizeAnchorPoints(): void {
    // 检查缓存是否有效
    const currentActionIds = this.selectedActions.map(a => a.id).sort();
    const cacheKey = currentActionIds.join(',');
    
    if (this.anchorCache && 
        this.anchorCache.actionIds.sort().join(',') === cacheKey &&
        Date.now() - this.anchorCache.timestamp < this.dragConfig.anchorCacheTTL) {
      // 使用缓存
      this.anchorPoints = this.anchorCache.anchors;
      this.centerAnchorPoint = this.anchorCache.centerAnchor;
      this.moveArea = this.anchorCache.moveArea;
      
      return;
    }

    // 检查是否需要更新（节流）
    const currentTime = Date.now();
    if (currentTime - this.lastAnchorUpdateTime < this.anchorUpdateInterval) {
      // 如果缓存存在但过期，使用过期缓存（避免频繁更新）
      if (this.anchorCache && this.anchorCache.actionIds.sort().join(',') === cacheKey) {
        this.anchorPoints = this.anchorCache.anchors;
        this.centerAnchorPoint = this.anchorCache.centerAnchor;
        this.moveArea = this.anchorCache.moveArea;
      }
      return;
    }

    const bounds = this.getSelectedActionsBounds();
    if (!bounds) {
      this.clearAnchorCache();
      return;
    }

    // 多选场景：使用统一边界框，不显示中心点
    if (this.selectedActions.length > 1) {
      this.generateMultiSelectionAnchors(bounds);
      return;
    }

    // 单选场景：使用图形特定的处理器
    const action = this.selectedActions[0];
    if (!action) {
      this.anchorPoints = [];
      this.centerAnchorPoint = null;
      this.moveArea = null;
      return;
    }

    const handler = this.shapeHandlers.get(action.type);
    if (handler) {
      // 对于圆形，使用单个 action 的边界框（而不是统一边界框）
      // 这样可以确保边界框是以圆心为中心的正方形
      const actionBounds = action.type === 'circle' 
        ? this.getActionBoundingBox(action)
        : bounds;
      
      // 使用图形特定的处理器生成锚点
      const anchors = handler.generateAnchors(action, actionBounds);
      this.anchorPoints = anchors.filter(anchor => !anchor.isCenter);
      this.centerAnchorPoint = anchors.find(anchor => anchor.isCenter) || null;
    } else {
      // 默认：生成8个标准锚点（无中心点）
      logger.warn(`❌ SelectTool: 未找到图形类型 "${action.type}" 的处理器，使用默认8个锚点`);
      logger.warn(`   已注册的处理器: ${Array.from(this.shapeHandlers.keys()).join(', ')}`);
      this.generateDefaultAnchors(bounds);
      this.centerAnchorPoint = null;
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
    this.anchorCache = {
      actionIds: currentActionIds,
      bounds,
      anchors: this.anchorPoints,
      centerAnchor: this.centerAnchorPoint,
      moveArea: this.moveArea,
      timestamp: currentTime
    };
  }
  
  /**
   * 清除锚点缓存
   */
  private clearAnchorCache(): void {
    this.anchorPoints = [];
    this.centerAnchorPoint = null;
    this.moveArea = null;
    this.anchorCache = null;
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
   */
  private drawSelectionBounds(ctx: CanvasRenderingContext2D, bounds: { x: number; y: number; width: number; height: number }): void {
    ctx.save();
    
    // 绘制半透明背景
    ctx.fillStyle = 'rgba(0, 122, 255, 0.05)';
    ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    
    // 绘制边界框
    ctx.strokeStyle = '#007AFF';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
    
    ctx.restore();
  }

  /**
   * 绘制锚点（包括边锚点和中心点）
   * 改进：支持圆形锚点（圆形边界锚点）和方形锚点（矩形边界锚点）
   * 支持hover状态（放大、加粗）
   */
  private drawResizeAnchorPoints(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    
    // 绘制边锚点
    if (this.anchorPoints.length > 0) {
      for (let i = 0; i < this.anchorPoints.length; i++) {
        const anchor = this.anchorPoints[i];
        const isHovered = this.hoverAnchorInfo && 
                          !this.hoverAnchorInfo.isCenter && 
                          this.hoverAnchorInfo.index === i;
        const isDragging = i === this.draggedAnchorIndex;
        
        // 根据锚点类型决定绘制形状
        const isCircle = anchor.shapeType === 'circle';
        
        // 计算锚点大小（hover时放大）
        let anchorSize = this.anchorSize;
        if (isHovered) {
          anchorSize = 10; // hover时放大至10px
        } else if (isDragging) {
          anchorSize = 12; // 拖拽时放大至12px
        }
        
        const halfSize = anchorSize / 2;
        // 注意：anchor.x 和 anchor.y 是锚点左上角的位置，需要加上 halfSize 得到中心点
        const centerX = anchor.x + halfSize;
        const centerY = anchor.y + halfSize;
        
        // 设置样式
        ctx.fillStyle = '#FFFFFF';
        if (isDragging) {
          ctx.strokeStyle = '#FF9500'; // 拖拽时橙色
        } else {
          ctx.strokeStyle = '#007AFF'; // 默认蓝色
        }
        ctx.lineWidth = isHovered || isDragging ? 3 : 2; // hover或拖拽时加粗
        
        if (isCircle) {
          // 绘制圆形锚点（圆形边界锚点）
          ctx.beginPath();
          ctx.arc(centerX, centerY, halfSize, 0, 2 * Math.PI);
          ctx.fill();
          ctx.stroke();
        } else {
          // 绘制方形锚点（矩形边界锚点）
          ctx.beginPath();
          ctx.rect(centerX - halfSize, centerY - halfSize, anchorSize, anchorSize);
          ctx.fill();
          ctx.stroke();
        }
      }
    }
    
    // 绘制中心点（圆形，仅在单选时显示）
    if (this.centerAnchorPoint && this.selectedActions.length === 1) {
      const isHovered = this.hoverAnchorInfo && this.hoverAnchorInfo.isCenter;
      const isDragging = this.isDraggingCenter;
      
      // 计算锚点大小（hover时放大）
      let anchorSize = this.anchorSize;
      if (isHovered) {
        anchorSize = 10; // hover时放大至10px
      } else if (isDragging) {
        anchorSize = 12; // 拖拽时放大至12px
      }
      
      const halfSize = anchorSize / 2;
      // 注意：centerAnchorPoint.x 和 centerAnchorPoint.y 是锚点左上角的位置，需要加上 halfSize 得到中心点
      const centerX = this.centerAnchorPoint.x + halfSize;
      const centerY = this.centerAnchorPoint.y + halfSize;
      const radius = halfSize;
      
      // 设置样式
      ctx.fillStyle = '#FFFFFF';
      if (isDragging) {
        ctx.strokeStyle = '#34C759'; // 拖拽时绿色（中心点）
      } else {
        ctx.strokeStyle = '#007AFF'; // 默认蓝色
      }
      ctx.lineWidth = isHovered || isDragging ? 3 : 2; // hover或拖拽时加粗
      
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    }
    
    ctx.restore();
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
   * 限制边界框在画布范围内
   * 使用统一的边界验证器
   * @internal 用于边界检查和约束
   */
  private clampBoundsToCanvas(bounds: { x: number; y: number; width: number; height: number }): { x: number; y: number; width: number; height: number } {
    const canvasBounds = this.getCanvasBounds();
    if (!canvasBounds) {
      return bounds; // 如果无法获取画布尺寸，返回原值
    }
    
    const boundsType: BoundsType = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    };
    
    const canvasBoundsType: BoundsType = {
      x: 0,
      y: 0,
      width: canvasBounds.width,
      height: canvasBounds.height
    };
    
    // 使用统一的边界验证器
    const clamped = BoundsValidator.clampBoundsToCanvas(boundsType, canvasBoundsType);
    // 确保最小尺寸
    const minSize = 10;
    return BoundsValidator.ensureMinSize(clamped, minSize);
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
    let interactionCtx: CanvasRenderingContext2D;
    try {
      interactionCtx = this.getInteractionContext();
    } catch {
      // 如果无法获取交互层，使用传入的ctx（兼容性）
      interactionCtx = ctx;
    }

    // 如果有选中的actions，绘制边界框和锚点
    if (this.selectedActions.length > 0) {
      this.generateResizeAnchorPoints();
      
      // 绘制边界框
      const bounds = this.getSelectedActionsBounds();
      if (bounds) {
        this.drawSelectionBounds(interactionCtx, bounds);
      }
      
      // 绘制变形锚点（使用 SelectTool 的锚点系统，而不是 TransformTool 的控制点）
      // 注意：对于圆形，应该使用 SelectTool 的4个边界锚点 + 1个中心点，而不是 TransformTool 的8个控制点
      this.drawResizeAnchorPoints(interactionCtx);
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
    logger.debug('SelectTool.handleMouseDown 被调用', {
      point,
      allActionsCount: this.allActions.length,
      selectedActionsCount: this.selectedActions.length,
      isTransformMode: this.isTransformMode
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
      
      // 清除边界框缓存，强制重新计算
      this.clearBoundsCache();
      
      // 更新selectedActions
      if (this.selectedActions.length === 1 && this.selectedActionForTransform) {
        this.selectedActions[0] = this.selectedActionForTransform;
      }
      
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
      
      // 更新selectedActions
      if (this.selectedActions.length === 1 && this.selectedActionForTransform) {
        this.selectedActions[0] = this.selectedActionForTransform;
      }
      
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
   */
  public getSelectedActionsBounds(): { x: number; y: number; width: number; height: number } | null {
    if (this.selectedActions.length === 0) {
      this.cachedBounds = null;
      this.boundsCacheKey = null;
      return null;
    }
    
    // 生成缓存key（基于action IDs）
    // 注意：DrawAction没有modified属性，使用id作为缓存key
    const actionIds = this.selectedActions.map(a => a.id).sort();
    const cacheKey = actionIds.join(',');
    
    // 检查缓存
    if (this.boundsCacheKey === cacheKey && this.cachedBounds) {
      return this.cachedBounds;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const action of this.selectedActions) {
      const bounds = this.getActionBoundingBox(action);
      
      // 检查边界框是否有效
      if (!isFinite(bounds.x) || !isFinite(bounds.y) || 
          !isFinite(bounds.width) || !isFinite(bounds.height)) {
        logger.warn('SelectTool: 发现无效的边界框', { bounds, actionId: action.id });
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
    
    // 更新缓存
    this.boundsCacheKey = cacheKey;
    this.cachedBounds = bounds;
    
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
      boundsCacheSize: this.boundsCache.size
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
        this.clearSelection();
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