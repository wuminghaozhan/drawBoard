/**
 * DrawAction 和标准 Shape 格式的转换器
 * 
 * 提供双向转换：
 * - DrawAction → Shape（导出）
 * - Shape → DrawAction（导入）
 */

import type { DrawAction, DrawContext } from '../tools/DrawTool';
import type { Point } from '../core/CanvasEngine';
import type {
  Shape,
  PenShape,
  CircleShape,
  RectShape,
  LineShape,
  TextShape,
  PolygonShape,
  StyleContext,
  Point2D,
  PressurePoint
} from '../types/ExportFormats';
import { logger } from '../infrastructure/logging/Logger';

// ============================================
// DrawAction → Shape 转换
// ============================================

export class ShapeConverter {
  /**
   * 将 DrawAction 转换为标准 Shape 格式
   */
  public static toShape(action: DrawAction): Shape | null {
    switch (action.type) {
      case 'pen':
        return this.toPenShape(action);
      case 'circle':
        return this.toCircleShape(action);
      case 'rect':
        return this.toRectShape(action);
      case 'line':
        return this.toLineShape(action);
      case 'text':
        return this.toTextShape(action);
      case 'polygon':
        return this.toPolygonShape(action);
      default:
        logger.warn('不支持的 action 类型', { type: action.type });
        return null;
    }
  }

  /**
   * 批量转换
   */
  public static toShapes(actions: DrawAction[]): Shape[] {
    return actions
      .map(action => this.toShape(action))
      .filter((shape): shape is Shape => shape !== null);
  }

  /**
   * 转换样式上下文
   */
  private static toStyleContext(context: DrawContext): StyleContext {
    return {
      strokeStyle: String(context.strokeStyle || '#000000'),
      fillStyle: context.fillStyle ? String(context.fillStyle) : undefined,
      lineWidth: context.lineWidth || 1,
      lineCap: context.lineCap as StyleContext['lineCap'],
      lineJoin: context.lineJoin as StyleContext['lineJoin'],
      globalAlpha: context.globalAlpha
    };
  }

  /**
   * 获取变换属性
   */
  private static getTransformProps(action: DrawAction) {
    const any = action as Record<string, unknown>;
    const props: Record<string, number> = {};
    
    if (typeof any.rotation === 'number') props.rotation = any.rotation;
    if (typeof any.scaleX === 'number') props.scaleX = any.scaleX;
    if (typeof any.scaleY === 'number') props.scaleY = any.scaleY;
    
    return Object.keys(props).length > 0 ? props : undefined;
  }

  // ============================================
  // 各工具类型转换
  // ============================================

  private static toPenShape(action: DrawAction): PenShape {
    return {
      type: 'pen',
      id: action.id,
      path: action.points.map(p => ({
        x: p.x,
        y: p.y,
        ...(p.pressure !== undefined && { pressure: p.pressure })
      })),
      style: this.toStyleContext(action.context),
      transform: this.getTransformProps(action),
      timestamp: action.timestamp
    };
  }

  private static toCircleShape(action: DrawAction): CircleShape {
    // 绘制时使用 points[0] 作为圆心，points[length-1] 作为圆周上的点
    const center = action.points[0] || { x: 0, y: 0 };
    const edgePoint = action.points[action.points.length - 1] || center;
    const radius = Math.sqrt(
      Math.pow(edgePoint.x - center.x, 2) + Math.pow(edgePoint.y - center.y, 2)
    );

    return {
      type: 'circle',
      id: action.id,
      center: { x: center.x, y: center.y },
      radius,
      style: this.toStyleContext(action.context),
      transform: this.getTransformProps(action),
      timestamp: action.timestamp
    };
  }

  private static toRectShape(action: DrawAction): RectShape {
    // 矩形统一使用4顶点格式
    // 顶点顺序：左上、右上、右下、左下
    const vertices = action.points.map(p => ({ x: p.x, y: p.y }));

    return {
      type: 'rect',
      id: action.id,
      vertices,
      style: this.toStyleContext(action.context),
      transform: this.getTransformProps(action),
      timestamp: action.timestamp
    };
  }

  private static toLineShape(action: DrawAction): LineShape {
    // 绘制时使用 points[0] 作为起点，points[length-1] 作为终点
    const start = action.points[0] || { x: 0, y: 0 };
    const end = action.points[action.points.length - 1] || start;
    const any = action as Record<string, unknown>;

    return {
      type: 'line',
      id: action.id,
      start: { x: start.x, y: start.y },
      end: { x: end.x, y: end.y },
      style: this.toStyleContext(action.context),
      lineType: any.lineType as LineShape['lineType'],
      arrowStyle: any.arrowStyle as LineShape['arrowStyle'],
      dashPattern: any.dashPattern as number[],
      transform: this.getTransformProps(action),
      timestamp: action.timestamp
    };
  }

  private static toTextShape(action: DrawAction): TextShape {
    const pos = action.points[0] || { x: 0, y: 0 };
    const any = action as Record<string, unknown>;

    return {
      type: 'text',
      id: action.id,
      position: { x: pos.x, y: pos.y },
      content: action.text || '',
      fontSize: (any.fontSize as number) || 16,
      fontFamily: (any.fontFamily as string) || 'Arial',
      color: String(action.context.strokeStyle || '#000000'),
      textAlign: any.textAlign as TextShape['textAlign'],
      width: any.width as number | undefined,
      height: any.height as number | undefined,
      lineHeight: any.lineHeight as number | undefined,
      transform: this.getTransformProps(action),
      timestamp: action.timestamp
    };
  }

  private static toPolygonShape(action: DrawAction): PolygonShape {
    const any = action as Record<string, unknown>;
    const polygonType = (any.polygonType as PolygonShape['polygonType']) || 'custom';
    
    // 统一使用顶点列表格式
    return {
      type: 'polygon',
      id: action.id,
      polygonType,
      vertices: action.points.map(p => ({ x: p.x, y: p.y })),
      style: this.toStyleContext(action.context),
      filled: any.filled as boolean | undefined,
      transform: this.getTransformProps(action),
      timestamp: action.timestamp
    };
  }

  // ============================================
  // Shape → DrawAction 转换
  // ============================================

  /**
   * 将标准 Shape 格式转换回 DrawAction
   */
  public static fromShape(shape: Shape): DrawAction {
    switch (shape.type) {
      case 'pen':
        return this.fromPenShape(shape);
      case 'circle':
        return this.fromCircleShape(shape);
      case 'rect':
        return this.fromRectShape(shape);
      case 'line':
        return this.fromLineShape(shape);
      case 'text':
        return this.fromTextShape(shape);
      case 'polygon':
        return this.fromPolygonShape(shape);
      default:
        throw new Error(`不支持的形状类型: ${(shape as Shape).type}`);
    }
  }

  /**
   * 批量转换
   */
  public static fromShapes(shapes: Shape[]): DrawAction[] {
    return shapes.map(shape => this.fromShape(shape));
  }

  /**
   * 转换样式上下文
   */
  private static fromStyleContext(style: StyleContext): DrawContext {
    return {
      strokeStyle: style.strokeStyle,
      fillStyle: style.fillStyle || 'transparent',
      lineWidth: style.lineWidth,
      lineCap: style.lineCap || 'round',
      lineJoin: style.lineJoin || 'round',
      globalAlpha: style.globalAlpha ?? 1,
      globalCompositeOperation: 'source-over'
    };
  }

  private static fromPenShape(shape: PenShape): DrawAction {
    const action: DrawAction = {
      id: shape.id,
      type: 'pen',
      points: shape.path.map(p => ({
        x: p.x,
        y: p.y,
        pressure: p.pressure
      })),
      context: this.fromStyleContext(shape.style),
      timestamp: shape.timestamp
    };

    if (shape.transform) {
      Object.assign(action, shape.transform);
    }

    return action;
  }

  private static fromCircleShape(shape: CircleShape): DrawAction {
    // 用两个点表示：圆心 + 边上的点
    const edgePoint = {
      x: shape.center.x + shape.radius,
      y: shape.center.y
    };

    const action: DrawAction = {
      id: shape.id,
      type: 'circle',
      points: [shape.center, edgePoint],
      context: this.fromStyleContext(shape.style),
      timestamp: shape.timestamp
    };

    if (shape.transform) {
      Object.assign(action, shape.transform);
    }

    return action;
  }

  private static fromRectShape(shape: RectShape): DrawAction {
    // 矩形使用4顶点格式
    const action: DrawAction = {
      id: shape.id,
      type: 'rect',
      points: shape.vertices.map(v => ({ x: v.x, y: v.y })),
      context: this.fromStyleContext(shape.style),
      timestamp: shape.timestamp
    };

    if (shape.transform) {
      Object.assign(action, shape.transform);
    }

    return action;
  }

  private static fromLineShape(shape: LineShape): DrawAction {
    const action: DrawAction & Record<string, unknown> = {
      id: shape.id,
      type: 'line',
      points: [shape.start, shape.end],
      context: this.fromStyleContext(shape.style),
      timestamp: shape.timestamp
    };

    if (shape.lineType) action.lineType = shape.lineType;
    if (shape.arrowStyle) action.arrowStyle = shape.arrowStyle;
    if (shape.dashPattern) action.dashPattern = shape.dashPattern;
    if (shape.transform) Object.assign(action, shape.transform);

    return action as DrawAction;
  }

  private static fromTextShape(shape: TextShape): DrawAction {
    const action: DrawAction & Record<string, unknown> = {
      id: shape.id,
      type: 'text',
      points: [shape.position],
      context: {
        ...this.fromStyleContext({ 
          strokeStyle: shape.color, 
          lineWidth: 1 
        })
      },
      text: shape.content,
      timestamp: shape.timestamp
    };

    action.fontSize = shape.fontSize;
    action.fontFamily = shape.fontFamily;
    if (shape.textAlign) action.textAlign = shape.textAlign;
    if (shape.width) action.width = shape.width;
    if (shape.height) action.height = shape.height;
    if (shape.lineHeight) action.lineHeight = shape.lineHeight;
    if (shape.transform) Object.assign(action, shape.transform);

    return action as DrawAction;
  }

  private static fromPolygonShape(shape: PolygonShape): DrawAction {
    // 统一使用顶点列表格式
    const points: Point[] = shape.vertices 
      ? shape.vertices.map(v => ({ x: v.x, y: v.y }))
      : [];

    const action: DrawAction & Record<string, unknown> = {
      id: shape.id,
      type: 'polygon',
      points,
      context: this.fromStyleContext(shape.style),
      timestamp: shape.timestamp
    };

    action.polygonType = shape.polygonType;
    if (shape.filled) action.filled = shape.filled;
    if (shape.transform) Object.assign(action, shape.transform);

    return action as DrawAction;
  }
}

