import type { Point } from '../../core/CanvasEngine';
import type { DrawAction } from '../DrawTool';
import type { ControlPoint, ControlPointType, ShapeBounds, TransformConfig } from './TransformTypes';
import { ControlPointType as CPType } from './TransformTypes';

/**
 * 控制点生成器
 * 
 * 负责为不同类型的图形生成相应的控制点：
 * - 矩形：8个控制点（4个角点 + 4个边点）
 * - 圆形：8个控制点
 * - 线条：起点、终点和中间点
 * - 通用图形：基于边界框的控制点
 */
export class ControlPointGenerator {
  private config: TransformConfig;

  constructor(config: TransformConfig) {
    this.config = config;
  }

  /**
   * 更新配置
   */
  public updateConfig(config: Partial<TransformConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 为指定动作生成控制点
   */
  public generateControlPoints(action: DrawAction): ControlPoint[] {
    switch (action.type) {
      case 'rect':
        return this.generateRectangleControlPoints(action);
      case 'circle':
        return this.generateCircleControlPoints(action);
      case 'line':
        return this.generateLineControlPoints(action);
      default:
        return this.generateDefaultControlPoints(action);
    }
  }

  /**
   * 生成矩形控制点
   */
  public generateRectangleControlPoints(action: DrawAction): ControlPoint[] {
    const bounds = this.calculateBounds(action);
    const points: ControlPoint[] = [];

    // 四个角点
    points.push(this.createControlPoint('tl', CPType.CORNER_TOP_LEFT, bounds.x, bounds.y, 'nw-resize'));
    points.push(this.createControlPoint('tr', CPType.CORNER_TOP_RIGHT, bounds.x + bounds.width, bounds.y, 'ne-resize'));
    points.push(this.createControlPoint('bl', CPType.CORNER_BOTTOM_LEFT, bounds.x, bounds.y + bounds.height, 'sw-resize'));
    points.push(this.createControlPoint('br', CPType.CORNER_BOTTOM_RIGHT, bounds.x + bounds.width, bounds.y + bounds.height, 'se-resize'));

    // 四个边点
    points.push(this.createControlPoint('t', CPType.EDGE_TOP, bounds.centerX, bounds.y, 'n-resize'));
    points.push(this.createControlPoint('r', CPType.EDGE_RIGHT, bounds.x + bounds.width, bounds.centerY, 'e-resize'));
    points.push(this.createControlPoint('b', CPType.EDGE_BOTTOM, bounds.centerX, bounds.y + bounds.height, 's-resize'));
    points.push(this.createControlPoint('l', CPType.EDGE_LEFT, bounds.x, bounds.centerY, 'w-resize'));

    return points;
  }

  /**
   * 生成圆形控制点
   */
  public generateCircleControlPoints(action: DrawAction): ControlPoint[] {
    if (action.points.length < 2) return [];

    const start = action.points[0];
    const end = action.points[action.points.length - 1];
    const centerX = start.x;
    const centerY = start.y;
    const radius = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));

    const points: ControlPoint[] = [];

    // 8个方向的控制点
    const angles = [0, Math.PI/4, Math.PI/2, 3*Math.PI/4, Math.PI, 5*Math.PI/4, 3*Math.PI/2, 7*Math.PI/4];
    const types = [
      CPType.EDGE_RIGHT, CPType.CORNER_TOP_RIGHT, CPType.EDGE_TOP, CPType.CORNER_TOP_LEFT,
      CPType.EDGE_LEFT, CPType.CORNER_BOTTOM_LEFT, CPType.EDGE_BOTTOM, CPType.CORNER_BOTTOM_RIGHT
    ];
    const cursors = ['e-resize', 'ne-resize', 'n-resize', 'nw-resize', 'w-resize', 'sw-resize', 's-resize', 'se-resize'];

    for (let i = 0; i < angles.length; i++) {
      const angle = angles[i];
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      
      points.push(this.createControlPoint(`circle-${i}`, types[i], x, y, cursors[i]));
    }

    return points;
  }

  /**
   * 生成线条控制点
   */
  public generateLineControlPoints(action: DrawAction): ControlPoint[] {
    if (action.points.length < 2) return [];

    const points: ControlPoint[] = [];
    const actionPoints = action.points;

    // 起点
    points.push(this.createControlPoint(
      'line-start', 
      CPType.LINE_START, 
      actionPoints[0].x, 
      actionPoints[0].y, 
      'move',
      0
    ));

    // 终点
    points.push(this.createControlPoint(
      'line-end', 
      CPType.LINE_END, 
      actionPoints[actionPoints.length - 1].x, 
      actionPoints[actionPoints.length - 1].y, 
      'move',
      actionPoints.length - 1
    ));

    // 中间点（如果有多个点）
    if (actionPoints.length > 2) {
      for (let i = 1; i < actionPoints.length - 1; i++) {
        points.push(this.createControlPoint(
          `line-point-${i}`,
          CPType.LINE_POINT,
          actionPoints[i].x,
          actionPoints[i].y,
          'move',
          i
        ));
      }
    }

    return points;
  }

  /**
   * 生成默认控制点（基于边界框）
   */
  public generateDefaultControlPoints(action: DrawAction): ControlPoint[] {
    const bounds = this.calculateBounds(action);
    const points: ControlPoint[] = [];

    // 简化版：只有四个角点
    points.push(this.createControlPoint('tl', CPType.CORNER_TOP_LEFT, bounds.x, bounds.y, 'nw-resize'));
    points.push(this.createControlPoint('tr', CPType.CORNER_TOP_RIGHT, bounds.x + bounds.width, bounds.y, 'ne-resize'));
    points.push(this.createControlPoint('bl', CPType.CORNER_BOTTOM_LEFT, bounds.x, bounds.y + bounds.height, 'sw-resize'));
    points.push(this.createControlPoint('br', CPType.CORNER_BOTTOM_RIGHT, bounds.x + bounds.width, bounds.y + bounds.height, 'se-resize'));

    return points;
  }

  /**
   * 计算动作的边界框
   */
  public calculateBounds(action: DrawAction): ShapeBounds {
    if (action.points.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0, centerX: 0, centerY: 0 };
    }

    let minX = action.points[0].x;
    let minY = action.points[0].y;
    let maxX = action.points[0].x;
    let maxY = action.points[0].y;

    for (const point of action.points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }

    const width = maxX - minX;
    const height = maxY - minY;

    return {
      x: minX,
      y: minY,
      width,
      height,
      centerX: minX + width / 2,
      centerY: minY + height / 2
    };
  }

  /**
   * 创建单个控制点
   */
  private createControlPoint(
    id: string, 
    type: ControlPointType, 
    x: number, 
    y: number, 
    cursor: string,
    pointIndex?: number
  ): ControlPoint {
    return {
      id,
      type,
      x,
      y,
      size: this.config.controlPointSize,
      visible: true,
      cursor,
      pointIndex
    };
  }

  /**
   * 检查点是否在控制点范围内
   */
  public getControlPointAt(point: Point, controlPoints: ControlPoint[]): ControlPoint | null {
    for (const cp of controlPoints) {
      if (!cp.visible) continue;

      const distance = Math.sqrt(
        Math.pow(point.x - cp.x, 2) + Math.pow(point.y - cp.y, 2)
      );

      if (distance <= cp.size / 2 + 2) { // 2px tolerance
        return cp;
      }
    }

    return null;
  }

  /**
   * 检查点是否在选中图形内部
   */
  public isPointInShape(point: Point, action: DrawAction): boolean {
    const bounds = this.calculateBounds(action);
    
    return point.x >= bounds.x && 
           point.x <= bounds.x + bounds.width &&
           point.y >= bounds.y && 
           point.y <= bounds.y + bounds.height;
  }

  /**
   * 更新控制点位置（当图形变换后）
   */
  public updateControlPoints(action: DrawAction): ControlPoint[] {
    // 重新生成控制点（保持简单）
    return this.generateControlPoints(action);
  }

  /**
   * 计算缩放后的点位置
   */
  public calculateResizePoints(
    startPoints: Point[], 
    _controlPoint: ControlPoint, 
    startBounds: ShapeBounds, 
    currentPoint: Point
  ): Point[] {
    const scaleX = (currentPoint.x - startBounds.x) / startBounds.width;
    const scaleY = (currentPoint.y - startBounds.y) / startBounds.height;
    
    return startPoints.map(point => ({
      ...point,
      x: startBounds.x + (point.x - startBounds.x) * scaleX,
      y: startBounds.y + (point.y - startBounds.y) * scaleY
    }));
  }

  /**
   * 计算重塑后的点位置
   */
  public calculateReshapePoints(startPoints: Point[], controlPoint: ControlPoint, currentPoint: Point): Point[] {
    // 简单实现：移动特定点
    return startPoints.map((point, index) => {
      if (index === controlPoint.pointIndex) {
        return { ...point, x: currentPoint.x, y: currentPoint.y };
      }
      return point;
    });
  }
} 