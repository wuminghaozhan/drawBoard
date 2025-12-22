import type { Point } from '../../core/CanvasEngine';
import type { StrokePoint, StrokeConfig } from './StrokeTypes';
import { GeometryUtils } from '../../utils/GeometryUtils';

/**
 * 运笔参数计算器
 * 
 * 负责计算运笔相关的各种参数：
 * - 压力感应计算
 * - 速度感应计算
 * - 角度计算
 * - 动态线宽计算
 */
export class StrokeCalculator {
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
   * 计算完整的运笔参数
   */
  public calculateStrokeParameters(points: StrokePoint[]): StrokePoint[] {
    if (points.length < 2) return points;

    const enhancedPoints: StrokePoint[] = [...points];

    for (let i = 0; i < enhancedPoints.length; i++) {
      const point = enhancedPoints[i];

      // 计算压力
      if (this.config.enablePressure) {
        point.pressure = this.calculateImprovedPressure(enhancedPoints, i);
      }

      // 计算速度
      if (this.config.enableVelocity && i > 0) {
        const prevPoint = enhancedPoints[i - 1];
        point.velocity = this.calculateImprovedVelocity(prevPoint, point, point.timestamp);
      }

      // 计算角度
      if (this.config.enableAngle && i > 0 && i < enhancedPoints.length - 1) {
        const prevPoint = enhancedPoints[i - 1];
        const nextPoint = enhancedPoints[i + 1];
        point.angle = this.calculateAngle(prevPoint, point, nextPoint);
      }

      // 计算距离
      if (i > 0) {
        const prevPoint = enhancedPoints[i - 1];
        point.distance = Math.sqrt(
          Math.pow(point.x - prevPoint.x, 2) + Math.pow(point.y - prevPoint.y, 2)
        );
      }

      // 计算动态线宽
      point.dynamicWidth = this.calculateDynamicLineWidth(point);
    }

    return enhancedPoints;
  }

  /**
   * 改进的压力计算算法
   * 基于局部点密度和绘制距离来模拟压力变化
   */
  public calculateImprovedPressure(points: StrokePoint[], index: number): number {
    if (!this.config.enablePressure) return 0.5;

    const windowSize = 5; // 分析窗口大小
    // const startIndex = Math.max(0, index - windowSize);
    // const endIndex = Math.min(points.length - 1, index + windowSize);
    
    // 计算局部平均距离（点密度的倒数）
    const localAvgDistance = this.calculateLocalAverageDistance(points, index, windowSize);
    
    // 距离越小（点越密集），压力越大
    const basePressure = Math.max(0.1, 1 - (localAvgDistance / 15));
    
    // 应用压力敏感度
    const adjustedPressure = basePressure * this.config.pressureSensitivity + 
                            (1 - this.config.pressureSensitivity) * 0.5;
    
    // 平滑处理
    if (index > 0 && points[index - 1].pressure !== undefined) {
      const prevPressure = points[index - 1].pressure!;
      return prevPressure * 0.7 + adjustedPressure * 0.3;
    }
    
    return Math.max(0.1, Math.min(1.0, adjustedPressure));
  }

  /**
   * 改进的速度计算算法
   * 基于距离和时间计算真实速度
   */
  public calculateImprovedVelocity(p1: Point, p2: Point, timestamp?: number): number {
    if (!this.config.enableVelocity) return 0.5;

    const distance = GeometryUtils.distance(p1, p2);
    
    // 如果有时间戳，计算真实速度
    let velocity: number;
    if (timestamp && (p1 as StrokePoint).timestamp) {
      const timeDelta = Math.max(1, timestamp - (p1 as StrokePoint).timestamp!);
      velocity = distance / timeDelta * 1000; // 像素/秒
      velocity = Math.min(velocity / 200, 1); // 标准化到0-1范围
    } else {
      // 基于距离的简化速度计算
      velocity = Math.min(distance / 20, 1);
    }
    
    return Math.max(0.1, Math.min(1.0, velocity));
  }

  /**
   * 计算局部平均距离
   */
  private calculateLocalAverageDistance(points: StrokePoint[], index: number, windowSize: number): number {
    const startIndex = Math.max(0, index - windowSize);
    const endIndex = Math.min(points.length - 1, index + windowSize);
    
    let totalDistance = 0;
    let count = 0;
    
    for (let i = startIndex; i < endIndex; i++) {
      totalDistance += GeometryUtils.distance(points[i], points[i + 1]);
      count++;
    }
    
    return count > 0 ? totalDistance / count : 1;
  }

  /**
   * 计算角度
   */
  public calculateAngle(p1: Point, p2: Point, p3: Point): number {
    const angle1 = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const angle2 = Math.atan2(p3.y - p2.y, p3.x - p2.x);
    return Math.abs(angle2 - angle1);
  }

  /**
   * 计算动态线宽
   */
  public calculateDynamicLineWidth(point: StrokePoint): number {
    const pressure = point.pressure || 0.5;
    const velocity = point.velocity || 0.5;

    // 基础线宽基于压力
    let width = this.config.minLineWidth + 
                (this.config.maxLineWidth - this.config.minLineWidth) * pressure;

    // 速度影响（快速绘制时线条变细）
    if (this.config.enableVelocity) {
      const velocityFactor = 1 - (velocity * this.config.velocitySensitivity * 0.3);
      width *= velocityFactor;
    }

    return Math.max(this.config.minLineWidth, Math.min(this.config.maxLineWidth, width));
  }

  /**
   * 计算动态透明度
   */
  public calculateDynamicAlpha(point: StrokePoint): number {
    if (!this.config.opacityVariation) return 1.0;

    const pressure = point.pressure || 0.5;
    const velocity = point.velocity || 0.5;

    // 基于压力的透明度（压力大时更不透明）
    let alpha = 0.3 + pressure * 0.7;

    // 速度影响透明度（快速时更透明）
    if (this.config.enableVelocity) {
      alpha *= (1 - velocity * 0.2);
    }

    return Math.max(0.1, Math.min(1.0, alpha));
  }

  /**
   * 简化版本的运笔参数计算（用于实时绘制）
   */
  public calculateSimplifiedStrokeParameters(points: StrokePoint[]): StrokePoint[] {
    if (points.length < 2) return points;

    const enhancedPoints: StrokePoint[] = [...points];

    for (let i = 0; i < enhancedPoints.length; i++) {
      const point = enhancedPoints[i];

      // 简化的压力计算
      if (this.config.enablePressure) {
        point.pressure = this.calculateSimplifiedPressure(enhancedPoints, i);
      }

      // 简化的速度计算
      if (this.config.enableVelocity && i > 0) {
        const prevPoint = enhancedPoints[i - 1];
        const distance = Math.sqrt(
          Math.pow(point.x - prevPoint.x, 2) + Math.pow(point.y - prevPoint.y, 2)
        );
        point.velocity = Math.min(distance / 10, 1);
      }

      // 计算动态线宽
      point.dynamicWidth = this.calculateDynamicLineWidth(point);
    }

    return enhancedPoints;
  }

  /**
   * 简化的压力计算
   */
  private calculateSimplifiedPressure(points: StrokePoint[], index: number): number {
    if (index === 0) return 0.5;

    const prevPoint = points[index - 1];
    const currentPoint = points[index];
    const distance = Math.sqrt(
      Math.pow(currentPoint.x - prevPoint.x, 2) + Math.pow(currentPoint.y - prevPoint.y, 2)
    );

    // 距离越小，压力越大
    const pressure = Math.max(0.1, 1 - (distance / 10));
    
    // 与前一个点的压力进行平滑
    const prevPressure = prevPoint.pressure || 0.5;
    return prevPressure * 0.8 + pressure * 0.2;
  }
} 