import { DrawTool } from './DrawTool';
import type { DrawAction } from './DrawTool';
import type { Point } from '../core/CanvasEngine';
import { getStrokePreset, getStrokePresetTypes, type StrokePresetType } from './StrokePresets';

/**
 * 运笔点接口 - 扩展基础Point，添加运笔相关属性
 * 
 * 这个接口定义了支持运笔效果的点的数据结构，
 * 包含了压力、速度、角度等运笔相关的属性
 */
export interface StrokePoint extends Point {
  /** 压力值，范围0-1，1为最大压力 */
  pressure?: number;
  /** 速度值，基于两点间距离和时间计算 */
  velocity?: number;
  /** 笔触角度，弧度制 */
  angle?: number;
  /** 时间戳，用于计算速度和压力 */
  timestamp?: number;
}

/**
 * 运笔效果配置接口
 * 
 * 定义了画笔工具的各种运笔效果参数，
 * 可以通过这些参数来模拟不同类型的笔触效果
 */
export interface StrokeConfig {
  /** 是否启用压力感应效果 */
  enablePressure: boolean;
  /** 是否启用速度感应效果 */
  enableVelocity: boolean;
  /** 是否启用角度感应效果 */
  enableAngle: boolean;
  /** 压力敏感度，范围0-1，值越大压力效果越明显 */
  pressureSensitivity: number;
  /** 速度敏感度，范围0-1，值越大速度效果越明显 */
  velocitySensitivity: number;
  /** 最小线宽，像素单位 */
  minLineWidth: number;
  /** 最大线宽，像素单位 */
  maxLineWidth: number;
  /** 平滑度，范围0-1，值越大线条越平滑 */
  smoothing: number;
  /** 是否启用透明度变化效果 */
  opacityVariation: boolean;
}

/**
 * 画笔工具类 - 支持运笔效果的自由绘制工具
 * 
 * 这是最核心的绘制工具，支持丰富的运笔效果：
 * - 压力感应：根据绘制密度模拟压力变化
 * - 速度感应：根据绘制速度调整线条粗细
 * - 角度感应：根据绘制角度调整笔触效果
 * - 透明度变化：根据压力和速度调整透明度
 * 
 * @example
 * ```typescript
 * const penTool = new PenTool();
 * 
 * // 配置运笔效果
 * penTool.setStrokeConfig({
 *   enablePressure: true,
 *   pressureSensitivity: 0.8,
 *   minLineWidth: 1,
 *   maxLineWidth: 20
 * });
 * 
 * // 使用预设
 * penTool.setPreset('brush');
 * ```
 */
export class PenTool extends DrawTool {
  private strokeConfig: StrokeConfig;
  private lastTimestamp: number = 0;

  constructor() {
    super('画笔', 'pen');
    
    // 默认运笔配置
    this.strokeConfig = {
      enablePressure: true,
      enableVelocity: true,
      enableAngle: true,
      pressureSensitivity: 1.0, // 增加压力敏感度
      velocitySensitivity: 0.8, // 增加速度敏感度
      minLineWidth: 1,
      maxLineWidth: 25, // 增加最大线宽
      smoothing: 0.2, // 减少平滑度，让效果更明显
      opacityVariation: true
    };
  }

  public setStrokeConfig(config: Partial<StrokeConfig>): void {
    this.strokeConfig = { ...this.strokeConfig, ...config };
  }

  public getStrokeConfig(): StrokeConfig {
    return { ...this.strokeConfig };
  }

  // 预设相关方法
  public setPreset(presetType: StrokePresetType): void {
    const preset = getStrokePreset(presetType);
    this.strokeConfig = { ...preset.config };
  }

  public getCurrentPreset(): StrokePresetType | null {
    // 通过比较配置来确定当前预设
    const presetTypes = getStrokePresetTypes();
    
    for (const presetType of presetTypes) {
      if (presetType === 'custom') continue;
      
      const preset = getStrokePreset(presetType);
      const isMatch = Object.entries(preset.config).every(([key, value]) => 
        this.strokeConfig[key as keyof StrokeConfig] === value
      );
      
      if (isMatch) {
        return presetType;
      }
    }
    
    return null;
  }

  public draw(ctx: CanvasRenderingContext2D, action: DrawAction): void {
    if (action.points.length < 2) return;

    const originalContext = this.saveContext(ctx);
    this.setContext(ctx, action.context);
    
    // 设置复杂度评分和缓存支持
    if (!action.complexityScore) {
      action.complexityScore = this.calculateComplexity(action);
    }
    if (action.supportsCaching === undefined) {
      action.supportsCaching = true; // 画笔工具支持缓存
    }
    
    // 使用运笔效果绘制
    this.drawStrokePath(ctx, action.points as StrokePoint[]);
    
    this.restoreContext(ctx, originalContext);
  }

  private drawStrokePath(ctx: CanvasRenderingContext2D, points: StrokePoint[]): void {
    if (points.length < 2) return;

    // 计算运笔参数
    const strokePoints = this.calculateStrokeParameters(points);
    
    // 绘制运笔路径
    this.drawVariableStroke(ctx, strokePoints);
  }

  private calculateStrokeParameters(points: StrokePoint[]): StrokePoint[] {
    const strokePoints: StrokePoint[] = [];
    
    for (let i = 0; i < points.length; i++) {
      const point = { ...points[i] } as StrokePoint;
      
      // 计算压力（基于点密度或模拟压力）
      if (this.strokeConfig.enablePressure) {
        point.pressure = this.calculatePressure(points, i);
      } else {
        point.pressure = 0.5; // 默认中等压力
      }
      
      // 计算速度
      if (this.strokeConfig.enableVelocity && i > 0) {
        point.velocity = this.calculateVelocity(points[i - 1], points[i], point.timestamp);
        // 更新最后时间戳用于下次计算
        if (point.timestamp) {
          this.lastTimestamp = point.timestamp;
        }
      } else {
        point.velocity = 0.5; // 默认中等速度
      }
      
      // 计算角度
      if (this.strokeConfig.enableAngle && i > 0 && i < points.length - 1) {
        point.angle = this.calculateAngle(points[i - 1], points[i], points[i + 1]);
      } else {
        point.angle = 0; // 默认角度
      }
      
      strokePoints.push(point);
    }
    
    return strokePoints;
  }

  private calculatePressure(points: StrokePoint[], index: number): number {
    // 基于点密度计算压力 - 点越密集，压力越大
    const windowSize = 3;
    const start = Math.max(0, index - windowSize);
    const end = Math.min(points.length - 1, index + windowSize);
    
    if (end <= start) return 0.5; // 默认中等压力
    
    let totalDistance = 0;
    let pointCount = 0;
    
    for (let i = start; i < end; i++) {
      if (i > 0) {
        const dx = points[i].x - points[i - 1].x;
        const dy = points[i].y - points[i - 1].y;
        totalDistance += Math.sqrt(dx * dx + dy * dy);
        pointCount++;
      }
    }
    
    if (pointCount === 0) return 0.5;
    
    // 平均距离越小，压力越大
    const avgDistance = totalDistance / pointCount;
    // 使用指数衰减函数，让压力变化更自然
    const pressure = Math.exp(-avgDistance / 20); // 20是基准距离
    
    return Math.min(1, Math.max(0, pressure * this.strokeConfig.pressureSensitivity));
  }

  private calculateVelocity(p1: Point, p2: Point, timestamp?: number): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // 如果没有时间戳，基于距离估算速度
    if (!timestamp || this.lastTimestamp <= 0) {
      // 距离越大，速度越快（假设）
      return Math.min(1, distance / 15);
    }
    
    const timeDiff = timestamp - this.lastTimestamp;
    if (timeDiff <= 0) {
      return 0.5; // 默认中等速度
    }
    
    // 计算实际速度 (像素/毫秒)
    const velocity = distance / timeDiff;
    // 归一化速度 (0-1)，使用对数函数让速度变化更自然
    const normalizedVelocity = Math.log(1 + velocity) / Math.log(1 + 5); // 5是基准速度
    
    return Math.min(1, Math.max(0, normalizedVelocity));
  }

  private calculateAngle(p1: Point, p2: Point, p3: Point): number {
    const angle1 = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const angle2 = Math.atan2(p3.y - p2.y, p3.x - p2.x);
    return angle2 - angle1;
  }

  private drawVariableStroke(ctx: CanvasRenderingContext2D, points: StrokePoint[]): void {
    if (points.length < 2) return;

    // 使用分段绘制来确保运笔效果的一致性
    if (points.length === 2) {
      // 只有两个点时使用直线
      this.drawLineSegment(ctx, points[0], points[1]);
    } else {
      // 多个点时使用分段绘制
      this.drawSegmentedStroke(ctx, points);
    }
  }

  private drawSegmentedStroke(ctx: CanvasRenderingContext2D, points: StrokePoint[]): void {
    // 分段绘制，每段使用相同的运笔效果
    for (let i = 0; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      
      // 计算当前段的运笔效果（使用两个点的平均值）
      const avgPoint: StrokePoint = {
        x: (current.x + next.x) / 2,
        y: (current.y + next.y) / 2,
        pressure: current.pressure !== undefined && next.pressure !== undefined 
          ? (current.pressure + next.pressure) / 2 
          : current.pressure || next.pressure || 0.5,
        velocity: current.velocity !== undefined && next.velocity !== undefined 
          ? (current.velocity + next.velocity) / 2 
          : current.velocity || next.velocity || 0.5,
        angle: current.angle || 0
      };
      
      this.drawLineSegment(ctx, current, next, avgPoint);
    }
  }

  private drawLineSegment(ctx: CanvasRenderingContext2D, p1: StrokePoint, p2: StrokePoint, effectPoint?: StrokePoint): void {
    // 应用运笔效果
    const effect = effectPoint || p1;
    this.applyStrokeEffect(ctx, effect);
    
    // 绘制线段
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }

  private applyStrokeEffect(ctx: CanvasRenderingContext2D, point: StrokePoint): void {
    // 计算动态线宽
    const lineWidth = this.calculateDynamicLineWidth(point);
    
    // 计算动态透明度
    const alpha = this.calculateDynamicAlpha(point);
    
    // 应用效果
    ctx.lineWidth = lineWidth;
    ctx.globalAlpha = alpha;
    
    // 应用角度效果（笔触倾斜）
    if (this.strokeConfig.enableAngle && point.angle !== undefined) {
      this.applyAngleEffect(ctx, point);
    }
  }

  private calculateDynamicLineWidth(point: StrokePoint): number {
    let width = this.strokeConfig.minLineWidth;
    
    // 压力影响线宽
    if (point.pressure !== undefined) {
      width += (this.strokeConfig.maxLineWidth - this.strokeConfig.minLineWidth) * point.pressure;
    }
    
    // 速度影响线宽（速度越快，线越细）
    if (point.velocity !== undefined) {
      const velocityFactor = 1 - point.velocity * this.strokeConfig.velocitySensitivity;
      width *= velocityFactor;
    }
    
    return Math.max(this.strokeConfig.minLineWidth, 
                   Math.min(this.strokeConfig.maxLineWidth, width));
  }

  private calculateDynamicAlpha(point: StrokePoint): number {
    if (!this.strokeConfig.opacityVariation) return 1.0;
    
    let alpha = 1.0;
    
    // 压力影响透明度
    if (point.pressure !== undefined) {
      alpha *= 0.5 + point.pressure * 0.5; // 0.5-1.0范围
    }
    
    // 速度影响透明度（速度越快，越透明）
    if (point.velocity !== undefined) {
      const velocityAlpha = 1 - point.velocity * 0.3; // 最多减少30%透明度
      alpha *= velocityAlpha;
    }
    
    return Math.max(0.1, Math.min(1.0, alpha));
  }

  private applyAngleEffect(ctx: CanvasRenderingContext2D, point: StrokePoint): void {
    if (point.angle === undefined) return;
    
    // 根据角度调整线帽样式
    const absAngle = Math.abs(point.angle);
    if (absAngle > Math.PI / 4) { // 45度
      ctx.lineCap = 'round';
    } else {
      ctx.lineCap = 'butt';
    }
    
    // 根据角度调整连接样式
    if (absAngle > Math.PI / 6) { // 30度
      ctx.lineJoin = 'round';
    } else {
      ctx.lineJoin = 'miter';
    }
  }

  // 实时绘制方法（用于交互层）
  public drawRealTime(ctx: CanvasRenderingContext2D, points: Point[]): void {
    if (points.length < 2) return;
    
    // 转换为StrokePoint并添加时间戳
    const strokePoints: StrokePoint[] = points.map((point, index) => ({
      ...point,
      timestamp: Date.now() + index * 16 // 模拟时间戳
    }));
    
    this.drawStrokePath(ctx, strokePoints);
  }

  /**
   * 计算画笔工具的复杂度评分
   * 画笔工具的复杂度主要基于：
   * - 点数量（运笔点越多越复杂）
   * - 线宽（越粗的线运笔效果越明显）
   * - 运笔效果配置（启用的效果越多越复杂）
   */
  private calculateComplexity(action: DrawAction): number {
    let score = 0;

    // 基于点数量（画笔工具的核心复杂度来源）
    score += action.points.length * 1.0; // 每个点1分

    // 基于线宽（更粗的线运笔效果更明显）
    score += action.context.lineWidth * 3;

    // 基于运笔效果配置
    if (this.strokeConfig.enablePressure) score += 15;
    if (this.strokeConfig.enableVelocity) score += 15;
    if (this.strokeConfig.enableAngle) score += 10;
    if (this.strokeConfig.opacityVariation) score += 10;

    // 基于平滑度（平滑度越低，计算越复杂）
    score += (1 - this.strokeConfig.smoothing) * 10;

    // 基于敏感度（敏感度越高，计算越复杂）
    score += this.strokeConfig.pressureSensitivity * 5;
    score += this.strokeConfig.velocitySensitivity * 5;

    return Math.round(score);
  }

  public getActionType(): string {
    return 'pen';
  }
} 