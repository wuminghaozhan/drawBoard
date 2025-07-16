import type { Point } from '../../core/CanvasEngine';
import type { StrokePoint, SmoothPoint, StrokeConfig } from './StrokeTypes';

/**
 * 贝塞尔曲线渲染器
 * 
 * 负责高质量的贝塞尔曲线绘制：
 * - 平滑控制点生成
 * - 可变线宽贝塞尔绘制
 * - 连续曲线渲染
 * - 抗锯齿处理
 */
export class BezierRenderer {
  private config: StrokeConfig;

  constructor(config: StrokeConfig) {
    this.config = config;
  }

  /**
   * 更新配置
   */
  public updateConfig(config: Partial<StrokeConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 绘制贝塞尔平滑曲线
   */
  public drawBezierStroke(ctx: CanvasRenderingContext2D, points: StrokePoint[]): void {
    if (points.length < 4) {
      this.drawVariableStroke(ctx, points);
      return;
    }

    // 应用抗锯齿
    this.applyAntiAliasing(ctx);

    // 生成平滑控制点
    const smoothPoints = this.generateSmoothControlPoints(points);

    // 绘制平滑曲线
    this.drawSmoothCurves(ctx, smoothPoints);
  }

  /**
   * 生成平滑控制点
   */
  public generateSmoothControlPoints(points: StrokePoint[]): SmoothPoint[] {
    const smoothPoints: SmoothPoint[] = [];

    for (let i = 0; i < points.length; i++) {
      const smoothPoint: SmoothPoint = { ...points[i] };

      // 为中间点生成控制点
      if (i > 0 && i < points.length - 1) {
        const prev = points[i - 1];
        const current = points[i];
        const next = points[i + 1];

        // 计算控制点
        const smoothing = this.config.smoothing || 0.15;
        
        // 前控制点
        smoothPoint.cp1 = {
          x: current.x - (next.x - prev.x) * smoothing,
          y: current.y - (next.y - prev.y) * smoothing
        };

        // 后控制点
        smoothPoint.cp2 = {
          x: current.x + (next.x - prev.x) * smoothing,
          y: current.y + (next.y - prev.y) * smoothing
        };
      }

      smoothPoints.push(smoothPoint);
    }

    return smoothPoints;
  }

  /**
   * 绘制平滑曲线
   */
  private drawSmoothCurves(ctx: CanvasRenderingContext2D, points: SmoothPoint[]): void {
    if (points.length < 2) return;

    // 使用连续可变线宽绘制
    this.drawContinuousVariableStroke(ctx, points);
  }

  /**
   * 绘制连续可变线宽的笔触
   */
  private drawContinuousVariableStroke(ctx: CanvasRenderingContext2D, points: SmoothPoint[]): void {
    if (points.length < 2) return;

    // 计算最优分段
    const segments = this.calculateOptimalSegments(points);

    // 绘制每个分段
    for (const segment of segments) {
      this.drawSegment(ctx, segment.points, segment.startWidth, segment.endWidth);
    }
  }

  /**
   * 计算最优分段策略
   */
  private calculateOptimalSegments(points: SmoothPoint[]): Array<{
    points: SmoothPoint[];
    startWidth: number;
    endWidth: number;
  }> {
    const segments: Array<{
      points: SmoothPoint[];
      startWidth: number;
      endWidth: number;
    }> = [];

    const segmentSize = 4; // 每段4个点
    
    for (let i = 0; i < points.length - 1; i += segmentSize - 1) {
      const endIndex = Math.min(i + segmentSize, points.length);
      const segmentPoints = points.slice(i, endIndex);
      
      const startWidth = segmentPoints[0].dynamicWidth || this.config.minLineWidth;
      const endWidth = segmentPoints[segmentPoints.length - 1].dynamicWidth || this.config.minLineWidth;
      
      segments.push({
        points: segmentPoints,
        startWidth,
        endWidth
      });
    }

    return segments;
  }

  /**
   * 绘制单个分段
   */
  private drawSegment(
    ctx: CanvasRenderingContext2D, 
    points: SmoothPoint[], 
    startWidth: number, 
    endWidth: number
  ): void {
    if (points.length < 2) return;

    // 计算分段数量
    const segmentCount = Math.max(10, Math.floor(
      Math.sqrt(Math.pow(points[points.length - 1].x - points[0].x, 2) + 
               Math.pow(points[points.length - 1].y - points[0].y, 2)) / 2
    ));

    ctx.beginPath();
    
    for (let i = 0; i <= segmentCount; i++) {
      const t = i / segmentCount;
      
      // 获取贝塞尔曲线上的点
      const point = this.getBezierPoint(points[0], points[points.length - 1], t);
      
      // 插值线宽
      const width = startWidth + (endWidth - startWidth) * t;
      ctx.lineWidth = width;
      
      if (i === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    }
    
    ctx.stroke();
  }

  /**
   * 获取贝塞尔曲线上的点
   */
  private getBezierPoint(p1: SmoothPoint, p2: SmoothPoint, t: number): Point {
    if (!p1.cp2 || !p2.cp1) {
      // 线性插值
      return {
        x: p1.x + (p2.x - p1.x) * t,
        y: p1.y + (p2.y - p1.y) * t
      };
    }

    // 三次贝塞尔曲线
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;
    const t2 = t * t;
    const t3 = t2 * t;

    return {
      x: mt3 * p1.x + 3 * mt2 * t * p1.cp2.x + 3 * mt * t2 * p2.cp1.x + t3 * p2.x,
      y: mt3 * p1.y + 3 * mt2 * t * p1.cp2.y + 3 * mt * t2 * p2.cp1.y + t3 * p2.y
    };
  }

  /**
   * 绘制可变线宽的线段（退化版本）
   */
  private drawVariableStroke(ctx: CanvasRenderingContext2D, points: StrokePoint[]): void {
    if (points.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i++) {
      const point = points[i];
      
      // 设置动态线宽
      if (point.dynamicWidth) {
        ctx.lineWidth = point.dynamicWidth;
      }
      
      ctx.lineTo(point.x, point.y);
    }

    ctx.stroke();
  }

  /**
   * 应用抗锯齿
   */
  private applyAntiAliasing(ctx: CanvasRenderingContext2D): void {
    const level = this.config.antiAliasLevel;
    
    ctx.imageSmoothingEnabled = level > 0;
    
    switch (level) {
      case 1:
        ctx.imageSmoothingQuality = 'low';
        break;
      case 2:
        ctx.imageSmoothingQuality = 'medium';
        break;
      case 3:
        ctx.imageSmoothingQuality = 'high';
        break;
      default:
        ctx.imageSmoothingEnabled = false;
    }
  }

  /**
   * 简化版贝塞尔绘制（用于实时）
   */
  public drawSimplifiedBezierStroke(ctx: CanvasRenderingContext2D, points: StrokePoint[]): void {
    if (points.length < 4) {
      this.drawVariableStroke(ctx, points);
      return;
    }

    // 应用中等抗锯齿
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    // 使用二次贝塞尔曲线（性能更好）
    for (let i = 1; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      
      // 设置动态线宽
      if (current.dynamicWidth) {
        ctx.lineWidth = current.dynamicWidth;
      }
      
      // 控制点为当前点
      const cpX = current.x;
      const cpY = current.y;
      
      // 二次贝塞尔曲线到下一个点
      ctx.quadraticCurveTo(cpX, cpY, next.x, next.y);
    }

    ctx.stroke();
  }
} 