import type { Point } from '../../core/CanvasEngine';
import type { StrokePoint, StrokeConfig } from './StrokeTypes';
import { StrokeCalculator } from './StrokeCalculator';

/**
 * 实时渲染器
 * 
 * 负责高性能的实时绘制：
 * - 简化的运笔计算
 * - 优化的渲染策略
 * - 性能友好的抗锯齿
 * - 自适应质量控制
 */
export class RealtimeRenderer {
  private config: StrokeConfig;
  private calculator: StrokeCalculator;
  private lastRenderTime: number = 0;
  private performanceMode: 'high' | 'medium' | 'low' = 'medium';

  constructor(config: StrokeConfig) {
    this.config = config;
    this.calculator = new StrokeCalculator(config);
  }

  /**
   * 更新配置
   */
  public updateConfig(config: Partial<StrokeConfig>): void {
    this.config = { ...this.config, ...config };
    this.calculator.updateConfig(this.config);
  }

  /**
   * 实时绘制入口
   */
  public drawRealTime(ctx: CanvasRenderingContext2D, points: Point[]): void {
    const startTime = performance.now();
    
    // 转换为StrokePoint
    const strokePoints = this.convertToStrokePoints(points);
    
    // 自适应性能调整
    this.adjustPerformanceMode();
    
    // 根据性能模式选择渲染策略
    switch (this.performanceMode) {
      case 'high':
        this.drawHighQualityRealtime(ctx, strokePoints);
        break;
      case 'medium':
        this.drawOptimizedRealTime(ctx, strokePoints);
        break;
      case 'low':
        this.drawFastRealtime(ctx, strokePoints);
        break;
    }
    
    // 记录渲染时间
    this.lastRenderTime = performance.now() - startTime;
  }

  /**
   * 高质量实时绘制
   */
  private drawHighQualityRealtime(ctx: CanvasRenderingContext2D, points: StrokePoint[]): void {
    if (points.length < 2) return;

    // 完整的运笔参数计算
    const enhancedPoints = this.calculator.calculateStrokeParameters(points);
    
    // 应用高质量抗锯齿
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // 使用贝塞尔平滑
    if (this.config.enableBezierSmoothing && enhancedPoints.length > 6) {
      this.drawSmoothBezierRealtime(ctx, enhancedPoints);
    } else {
      this.drawVariableStroke(ctx, enhancedPoints);
    }
  }

  /**
   * 优化的实时绘制
   */
  private drawOptimizedRealTime(ctx: CanvasRenderingContext2D, points: StrokePoint[]): void {
    if (points.length < 2) return;

    // 简化的运笔参数计算
    const simplifiedPoints = this.calculator.calculateSimplifiedStrokeParameters(points);
    
    // 应用中等抗锯齿
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';
    
    // 根据点数选择绘制方法
    if (this.config.enableBezierSmoothing && simplifiedPoints.length > 6) {
      this.drawSimplifiedBezierStroke(ctx, simplifiedPoints);
    } else {
      this.drawVariableStroke(ctx, simplifiedPoints);
    }
  }

  /**
   * 快速实时绘制
   */
  private drawFastRealtime(ctx: CanvasRenderingContext2D, points: StrokePoint[]): void {
    if (points.length < 2) return;

    // 禁用抗锯齿以提高性能
    ctx.imageSmoothingEnabled = false;
    
    // 使用简单的线性绘制
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    
    ctx.stroke();
  }

  /**
   * 实时贝塞尔绘制
   */
  private drawSmoothBezierRealtime(ctx: CanvasRenderingContext2D, points: StrokePoint[]): void {
    if (points.length < 4) {
      this.drawVariableStroke(ctx, points);
      return;
    }

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    // 使用二次贝塞尔曲线（比三次贝塞尔性能更好）
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

  /**
   * 简化的贝塞尔绘制
   */
  private drawSimplifiedBezierStroke(ctx: CanvasRenderingContext2D, points: StrokePoint[]): void {
    if (points.length < 3) {
      this.drawVariableStroke(ctx, points);
      return;
    }

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    // 每隔一个点作为控制点
    for (let i = 2; i < points.length; i += 2) {
      const control = points[i - 1];
      const end = points[i];
      
      // 设置动态线宽
      if (control.dynamicWidth) {
        ctx.lineWidth = control.dynamicWidth;
      }
      
      ctx.quadraticCurveTo(control.x, control.y, end.x, end.y);
    }

    // 处理剩余的点
    if (points.length % 2 === 0) {
      const lastPoint = points[points.length - 1];
      ctx.lineTo(lastPoint.x, lastPoint.y);
    }

    ctx.stroke();
  }

  /**
   * 绘制可变线宽的线段
   */
  private drawVariableStroke(ctx: CanvasRenderingContext2D, points: StrokePoint[]): void {
    if (points.length < 2) return;

    ctx.beginPath();
    
    for (let i = 0; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      
      // 设置当前点的线宽
      if (current.dynamicWidth) {
        ctx.lineWidth = current.dynamicWidth;
      }
      
      if (i === 0) {
        ctx.moveTo(current.x, current.y);
      }
      
      ctx.lineTo(next.x, next.y);
    }
    
    ctx.stroke();
  }

  /**
   * 转换为StrokePoint
   */
  private convertToStrokePoints(points: Point[]): StrokePoint[] {
    const now = Date.now();
    return points.map((point, index) => ({
      ...point,
      timestamp: now - (points.length - index) * 16, // 假设16ms间隔
      pressure: 0.5, // 默认压力
      velocity: 0.5  // 默认速度
    }));
  }

  /**
   * 自适应性能调整
   */
  private adjustPerformanceMode(): void {
    // 基于上次渲染时间调整性能模式
    if (this.lastRenderTime > 16) { // 超过16ms (60fps)
      if (this.performanceMode === 'high') {
        this.performanceMode = 'medium';
      } else if (this.performanceMode === 'medium') {
        this.performanceMode = 'low';
      }
    } else if (this.lastRenderTime < 8) { // 小于8ms (120fps)
      if (this.performanceMode === 'low') {
        this.performanceMode = 'medium';
      } else if (this.performanceMode === 'medium') {
        this.performanceMode = 'high';
      }
    }
  }

  /**
   * 获取当前性能模式
   */
  public getPerformanceMode(): 'high' | 'medium' | 'low' {
    return this.performanceMode;
  }

  /**
   * 手动设置性能模式
   */
  public setPerformanceMode(mode: 'high' | 'medium' | 'low'): void {
    this.performanceMode = mode;
  }

  /**
   * 获取渲染统计
   */
  public getRenderStats(): {
    lastRenderTime: number;
    performanceMode: string;
    averageFps: number;
  } {
    return {
      lastRenderTime: this.lastRenderTime,
      performanceMode: this.performanceMode,
      averageFps: this.lastRenderTime > 0 ? 1000 / this.lastRenderTime : 0
    };
  }
} 