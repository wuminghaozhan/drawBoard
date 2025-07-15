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
  /** 与前一个点的距离 */
  distance?: number;
  /** 计算得出的动态线宽 */
  dynamicWidth?: number;
}

/**
 * 平滑控制点接口
 * 用于贝塞尔曲线平滑处理
 */
export interface SmoothPoint extends StrokePoint {
  /** 控制点1 */
  cp1?: Point;
  /** 控制点2 */
  cp2?: Point;
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
  /** 是否启用贝塞尔曲线平滑 */
  enableBezierSmoothing: boolean;
  /** 抗锯齿级别，0-3，值越大越平滑但性能越差 */
  antiAliasLevel: number;
}

/**
 * 画笔工具类 - 支持运笔效果的自由绘制工具
 * 
 * 这是最核心的绘制工具，支持丰富的运笔效果：
 * - 压力感应：根据绘制密度模拟压力变化
 * - 速度感应：根据绘制速度调整线条粗细
 * - 角度感应：根据绘制角度调整笔触效果
 * - 透明度变化：根据压力和速度调整透明度
 * - 贝塞尔平滑：使用三次贝塞尔曲线进行线条平滑
 * - 抗锯齿处理：多级抗锯齿算法提升绘制质量
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
 *   maxLineWidth: 20,
 *   enableBezierSmoothing: true,
 *   antiAliasLevel: 2
 * });
 * 
 * // 使用预设
 * penTool.setPreset('brush');
 * ```
 */
export class PenTool extends DrawTool {
  private strokeConfig: StrokeConfig;
  private lastTimestamp: number = 0;
  private smoothedPoints: SmoothPoint[] = [];
  private lastPressure: number = 0.5;
  private lastVelocity: number = 0.5;

  constructor() {
    super('画笔', 'pen');
    
    // 默认运笔配置 - 优化版本
    this.strokeConfig = {
      enablePressure: true,
      enableVelocity: true,
      enableAngle: true,
      pressureSensitivity: 0.9, // 提高压力敏感度
      velocitySensitivity: 0.7, // 优化速度敏感度
      minLineWidth: 0.8,
      maxLineWidth: 28, // 增加线宽范围
      smoothing: 0.15, // 优化平滑度设置
      opacityVariation: true,
      enableBezierSmoothing: true, // 启用贝塞尔平滑
      antiAliasLevel: 2 // 中等抗锯齿级别
    };
  }

  public setStrokeConfig(config: Partial<StrokeConfig>): void {
    this.strokeConfig = { ...this.strokeConfig, ...config };
    // 重置缓存
    this.smoothedPoints = [];
    this.lastPressure = 0.5;
    this.lastVelocity = 0.5;
  }

  public getStrokeConfig(): StrokeConfig {
    return { ...this.strokeConfig };
  }

  // 预设相关方法
  public setPreset(presetType: StrokePresetType): void {
    const preset = getStrokePreset(presetType);
    // 合并预设配置和优化参数
    this.strokeConfig = { 
      ...preset.config,
      enableBezierSmoothing: true,
      antiAliasLevel: 2
    };
    // 重置状态
    this.smoothedPoints = [];
    this.lastPressure = 0.5;
    this.lastVelocity = 0.5;
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
    
    // 使用优化的运笔效果绘制
    this.drawStrokePath(ctx, action.points as StrokePoint[]);
    
    this.restoreContext(ctx, originalContext);
  }

  private drawStrokePath(ctx: CanvasRenderingContext2D, points: StrokePoint[]): void {
    if (points.length < 2) return;

    // 计算运笔参数
    const strokePoints = this.calculateStrokeParameters(points);
    
    // 应用抗锯齿处理
    this.applyAntiAliasing(ctx);
    
    // 根据配置选择绘制方法
    if (this.strokeConfig.enableBezierSmoothing && strokePoints.length > 3) {
      this.drawBezierStroke(ctx, strokePoints);
    } else {
      this.drawVariableStroke(ctx, strokePoints);
    }
  }

  private calculateStrokeParameters(points: StrokePoint[]): StrokePoint[] {
    const strokePoints: StrokePoint[] = [];
    
    for (let i = 0; i < points.length; i++) {
      const point = { ...points[i] } as StrokePoint;
      
      // 计算与前一个点的距离
      if (i > 0) {
        const dx = point.x - points[i - 1].x;
        const dy = point.y - points[i - 1].y;
        point.distance = Math.sqrt(dx * dx + dy * dy);
      } else {
        point.distance = 0;
      }
      
      // 计算压力（改进算法）
      if (this.strokeConfig.enablePressure) {
        point.pressure = this.calculateImprovedPressure(points, i);
      } else {
        point.pressure = 0.5;
      }
      
      // 计算速度（改进算法）
      if (this.strokeConfig.enableVelocity && i > 0) {
        point.velocity = this.calculateImprovedVelocity(points[i - 1], points[i], point.timestamp);
        if (point.timestamp) {
          this.lastTimestamp = point.timestamp;
        }
      } else {
        point.velocity = 0.5;
      }
      
      // 计算角度
      if (this.strokeConfig.enableAngle && i > 0 && i < points.length - 1) {
        point.angle = this.calculateAngle(points[i - 1], points[i], points[i + 1]);
      } else {
        point.angle = 0;
      }
      
      // 预计算动态线宽
      point.dynamicWidth = this.calculateDynamicLineWidth(point);
      
      strokePoints.push(point);
    }
    
    return strokePoints;
  }

  /**
   * 改进的压力计算算法
   * 使用加权移动平均和自适应窗口大小
   */
     private calculateImprovedPressure(points: StrokePoint[], index: number): number {
     // 自适应窗口大小，根据绘制速度调整
     const baseWindowSize = 4;
     const localAvgDistance = this.calculateLocalAverageDistance(points, index, 3);
     const adaptiveWindowSize = Math.max(2, Math.min(8, baseWindowSize - Math.floor(localAvgDistance / 10)));
     
     const start = Math.max(0, index - adaptiveWindowSize);
     const end = Math.min(points.length - 1, index + adaptiveWindowSize);
     
     if (end <= start) return this.lastPressure;
     
     let weightedDistance = 0;
     let totalWeight = 0;
     
     // 使用高斯权重计算加权平均距离
     for (let i = start; i < end; i++) {
       if (i > 0) {
         const dx = points[i].x - points[i - 1].x;
         const dy = points[i].y - points[i - 1].y;
         const distance = Math.sqrt(dx * dx + dy * dy);
         
         // 距离当前点越近，权重越大
         const distanceFromCurrent = Math.abs(i - index);
         const weight = Math.exp(-distanceFromCurrent * 0.5);
         
         weightedDistance += distance * weight;
         totalWeight += weight;
       }
     }
     
     if (totalWeight === 0) return this.lastPressure;
     
     const weightedAvgDistance = weightedDistance / totalWeight;
     
     // 使用改进的指数衰减函数
     const pressureBase = Math.exp(-weightedAvgDistance / 15); // 调整基准距离
     
     // 添加压力平滑过渡
     const smoothingFactor = 0.7;
     const newPressure = pressureBase * this.strokeConfig.pressureSensitivity;
     const smoothedPressure = this.lastPressure * smoothingFactor + newPressure * (1 - smoothingFactor);
    
    this.lastPressure = Math.min(1, Math.max(0, smoothedPressure));
    return this.lastPressure;
  }

  /**
   * 改进的速度计算算法
   * 使用滑动窗口平均和非线性映射
   */
  private calculateImprovedVelocity(p1: Point, p2: Point, timestamp?: number): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    let velocity: number;
    
    if (!timestamp || this.lastTimestamp <= 0) {
      // 基于距离的速度估算，使用非线性映射
      velocity = Math.tanh(distance / 12); // 使用双曲正切函数进行非线性映射
    } else {
      const timeDiff = timestamp - this.lastTimestamp;
      if (timeDiff <= 0) {
        return this.lastVelocity;
      }
      
      // 计算像素/毫秒速度
      const pixelVelocity = distance / timeDiff;
      
      // 使用对数函数进行更自然的速度映射
      velocity = Math.log(1 + pixelVelocity * 3) / Math.log(1 + 8); // 调整基准值
    }
    
    // 速度平滑过渡
    const smoothingFactor = 0.6;
    const smoothedVelocity = this.lastVelocity * smoothingFactor + velocity * (1 - smoothingFactor);
    
    this.lastVelocity = Math.min(1, Math.max(0, smoothedVelocity));
    return this.lastVelocity;
  }

  /**
   * 计算局部平均距离
   */
  private calculateLocalAverageDistance(points: StrokePoint[], index: number, windowSize: number): number {
    const start = Math.max(0, index - windowSize);
    const end = Math.min(points.length - 1, index + windowSize);
    
    let totalDistance = 0;
    let count = 0;
    
    for (let i = start; i < end; i++) {
      if (i > 0) {
        const dx = points[i].x - points[i - 1].x;
        const dy = points[i].y - points[i - 1].y;
        totalDistance += Math.sqrt(dx * dx + dy * dy);
        count++;
      }
    }
    
    return count > 0 ? totalDistance / count : 0;
  }

  private calculateAngle(p1: Point, p2: Point, p3: Point): number {
    const angle1 = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const angle2 = Math.atan2(p3.y - p2.y, p3.x - p2.x);
    return angle2 - angle1;
  }

  /**
   * 应用抗锯齿处理
   */
  private applyAntiAliasing(ctx: CanvasRenderingContext2D): void {
    // 确保抗锯齿开启
    ctx.imageSmoothingEnabled = true;
    
    // 根据抗锯齿级别设置不同的质量
    switch (this.strokeConfig.antiAliasLevel) {
      case 0:
        ctx.imageSmoothingQuality = 'low';
        break;
      case 1:
        ctx.imageSmoothingQuality = 'medium';
        break;
      case 2:
        ctx.imageSmoothingQuality = 'high';
        break;
      case 3:
        // 最高质量：额外的路径平滑
        ctx.imageSmoothingQuality = 'high';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.miterLimit = 1;
        break;
    }
  }

  /**
   * 贝塞尔曲线平滑绘制
   */
  private drawBezierStroke(ctx: CanvasRenderingContext2D, points: StrokePoint[]): void {
    if (points.length < 4) {
      this.drawVariableStroke(ctx, points);
      return;
    }

    // 生成平滑控制点
    const smoothPoints = this.generateSmoothControlPoints(points);
    
    // 绘制平滑的贝塞尔曲线
    this.drawSmoothCurves(ctx, smoothPoints);
  }

  /**
   * 生成贝塞尔曲线控制点
   */
  private generateSmoothControlPoints(points: StrokePoint[]): SmoothPoint[] {
    const smoothPoints: SmoothPoint[] = [];
    const smoothingFactor = this.strokeConfig.smoothing;
    
    for (let i = 0; i < points.length; i++) {
      const point: SmoothPoint = { ...points[i] };
      
      if (i > 0 && i < points.length - 1) {
        const prev = points[i - 1];
        const next = points[i + 1];
        
        // 计算控制点
        const d1 = Math.sqrt(Math.pow(point.x - prev.x, 2) + Math.pow(point.y - prev.y, 2));
        const d2 = Math.sqrt(Math.pow(next.x - point.x, 2) + Math.pow(next.y - point.y, 2));
        
        const fa = smoothingFactor * d1 / (d1 + d2);
        const fb = smoothingFactor * d2 / (d1 + d2);
        
        const p1x = point.x - fa * (next.x - prev.x);
        const p1y = point.y - fa * (next.y - prev.y);
        const p2x = point.x + fb * (next.x - prev.x);
        const p2y = point.y + fb * (next.y - prev.y);
        
        point.cp1 = { x: p1x, y: p1y };
        point.cp2 = { x: p2x, y: p2y };
      }
      
      smoothPoints.push(point);
    }
    
    return smoothPoints;
  }

  /**
   * 绘制平滑曲线 - 平衡连续性和动态线宽
   */
  private drawSmoothCurves(ctx: CanvasRenderingContext2D, points: SmoothPoint[]): void {
    if (points.length < 2) return;
    
    // 使用改进的分段策略：连续绘制小段，每段使用不同线宽
    this.drawContinuousVariableStroke(ctx, points);
  }

  /**
   * 连续可变线宽绘制 - 新方法
   */
  private drawContinuousVariableStroke(ctx: CanvasRenderingContext2D, points: SmoothPoint[]): void {
    if (points.length < 2) return;
    
    // 计算需要的分段数，基于线宽变化和距离
    const segments = this.calculateOptimalSegments(points);
    
    // 为每个分段计算插值点和线宽
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      
      // 设置当前段的线宽
      ctx.lineWidth = segment.width;
      
      // 绘制当前段
      ctx.beginPath();
      ctx.moveTo(segment.startPoint.x, segment.startPoint.y);
      
      if (segment.isSmooth && segment.controlPoint1 && segment.controlPoint2) {
        // 使用贝塞尔曲线
        ctx.bezierCurveTo(
          segment.controlPoint1.x, segment.controlPoint1.y,
          segment.controlPoint2.x, segment.controlPoint2.y,
          segment.endPoint.x, segment.endPoint.y
        );
      } else {
        // 使用直线
        ctx.lineTo(segment.endPoint.x, segment.endPoint.y);
      }
      
      ctx.stroke();
    }
  }

  /**
   * 计算最佳分段策略
   */
  private calculateOptimalSegments(points: SmoothPoint[]): Array<{
    startPoint: Point;
    endPoint: Point;
    controlPoint1?: Point;
    controlPoint2?: Point;
    width: number;
    isSmooth: boolean;
  }> {
    const segments = [];
    
    for (let i = 0; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      
      // 计算当前段的线宽变化
      const currentWidth = current.dynamicWidth || this.strokeConfig.maxLineWidth;
      const nextWidth = next.dynamicWidth || this.strokeConfig.maxLineWidth;
      const distance = Math.sqrt(
        Math.pow(next.x - current.x, 2) + Math.pow(next.y - current.y, 2)
      );
      
      // 根据线宽变化和距离决定分段数
      const widthDiff = Math.abs(nextWidth - currentWidth);
      const subsegmentCount = Math.max(1, Math.min(8, 
        Math.ceil(distance / 5) + Math.ceil(widthDiff * 3)
      ));
      
      // 生成子段
      for (let j = 0; j < subsegmentCount; j++) {
        const t1 = j / subsegmentCount;
        const t2 = (j + 1) / subsegmentCount;
        
        let startPoint, endPoint, cp1, cp2;
        
        if (current.cp2 && next.cp1) {
          // 贝塞尔曲线插值
          startPoint = this.getBezierPoint(current, next, t1);
          endPoint = this.getBezierPoint(current, next, t2);
          
                     // 计算子段的控制点
           const tangent1 = this.getBezierTangent(current, next, t1);
           const tangent2 = this.getBezierTangent(current, next, t2);
           
           const segmentLength = Math.sqrt(
             Math.pow(endPoint.x - startPoint.x, 2) + 
             Math.pow(endPoint.y - startPoint.y, 2)
           );
           
           cp1 = {
             x: startPoint.x + tangent1.x * segmentLength * 0.3,
             y: startPoint.y + tangent1.y * segmentLength * 0.3
           };
           
           cp2 = {
             x: endPoint.x - tangent2.x * segmentLength * 0.3,
             y: endPoint.y - tangent2.y * segmentLength * 0.3
           };
        } else {
          // 直线插值
          startPoint = {
            x: current.x + (next.x - current.x) * t1,
            y: current.y + (next.y - current.y) * t1
          };
          endPoint = {
            x: current.x + (next.x - current.x) * t2,
            y: current.y + (next.y - current.y) * t2
          };
        }
        
        // 插值线宽
        const segmentWidth = currentWidth + (nextWidth - currentWidth) * ((t1 + t2) / 2);
        
        segments.push({
          startPoint,
          endPoint,
          controlPoint1: cp1,
          controlPoint2: cp2,
          width: segmentWidth,
          isSmooth: !!(current.cp2 && next.cp1)
        });
      }
    }
    
    return segments;
  }

  /**
   * 获取贝塞尔曲线切线方向
   */
  private getBezierTangent(p1: SmoothPoint, p2: SmoothPoint, t: number): { x: number; y: number } {
    if (!p1.cp2 || !p2.cp1) {
      // 降级为直线切线
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      return { x: dx / length, y: dy / length };
    }
    
    // 三次贝塞尔曲线的切线
    const u = 1 - t;
    const tt = t * t;
    const uu = u * u;
    
    const dx = 3 * uu * (p1.cp2.x - p1.x) + 
               6 * u * t * (p2.cp1.x - p1.cp2.x) + 
               3 * tt * (p2.x - p2.cp1.x);
    
    const dy = 3 * uu * (p1.cp2.y - p1.y) + 
               6 * u * t * (p2.cp1.y - p1.cp2.y) + 
               3 * tt * (p2.y - p2.cp1.y);
    
    const length = Math.sqrt(dx * dx + dy * dy);
    return length > 0 ? { x: dx / length, y: dy / length } : { x: 1, y: 0 };
  }

  /**
   * 绘制支持动态线宽的贝塞尔曲线段 - 改进版本
   */
  private drawVariableWidthBezierSegment(ctx: CanvasRenderingContext2D, p1: SmoothPoint, p2: SmoothPoint): void {
         // 计算线宽差异
     const w1 = p1.dynamicWidth || this.strokeConfig.maxLineWidth;
     const w2 = p2.dynamicWidth || this.strokeConfig.maxLineWidth;
     const widthDiff = Math.abs(w2 - w1);
     
     // 如果线宽差异很小，使用简单绘制
     if (widthDiff < this.strokeConfig.maxLineWidth * 0.1) {
      ctx.lineWidth = (w1 + w2) / 2;
      ctx.beginPath();
      
      if (p1.cp2 && p2.cp1) {
        ctx.moveTo(p1.x, p1.y);
        ctx.bezierCurveTo(p1.cp2.x, p1.cp2.y, p2.cp1.x, p2.cp1.y, p2.x, p2.y);
      } else {
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
      }
      
      ctx.stroke();
      return;
    }
    
    // 对于线宽差异较大的情况，使用渐变绘制
    const segments = Math.min(10, Math.max(3, Math.ceil(widthDiff * 2)));
    
    for (let i = 0; i < segments; i++) {
      const t1 = i / segments;
      const t2 = (i + 1) / segments;
      
      // 计算贝塞尔曲线上的点
      const point1 = this.getBezierPoint(p1, p2, t1);
      const point2 = this.getBezierPoint(p1, p2, t2);
      
      // 插值线宽
      const segmentWidth = w1 + (w2 - w1) * ((t1 + t2) / 2);
      
      ctx.lineWidth = segmentWidth;
      ctx.beginPath();
      ctx.moveTo(point1.x, point1.y);
      ctx.lineTo(point2.x, point2.y);
      ctx.stroke();
    }
  }

  /**
   * 绘制支持动态线宽的直线段 - 改进版本
   */
  private drawVariableWidthLineSegment(ctx: CanvasRenderingContext2D, p1: StrokePoint, p2: StrokePoint): void {
    const w1 = p1.dynamicWidth || this.strokeConfig.maxLineWidth;
    const w2 = p2.dynamicWidth || this.strokeConfig.maxLineWidth;
    const widthDiff = Math.abs(w2 - w1);
    
    // 如果线宽差异很小，使用简单绘制
    if (widthDiff < this.strokeConfig.maxLineWidth * 0.1) {
      ctx.lineWidth = (w1 + w2) / 2;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      return;
    }
    
    // 对于线宽差异较大的情况，使用渐变绘制
    const distance = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    const segments = Math.min(15, Math.max(2, Math.ceil(distance / 3)));
    
    for (let i = 0; i < segments; i++) {
      const t1 = i / segments;
      const t2 = (i + 1) / segments;
      
      // 插值点位置
      const point1 = {
        x: p1.x + (p2.x - p1.x) * t1,
        y: p1.y + (p2.y - p1.y) * t1
      };
      
      const point2 = {
        x: p1.x + (p2.x - p1.x) * t2,
        y: p1.y + (p2.y - p1.y) * t2
      };
      
      // 插值线宽
      const segmentWidth = w1 + (w2 - w1) * ((t1 + t2) / 2);
      
      ctx.lineWidth = segmentWidth;
      ctx.beginPath();
      ctx.moveTo(point1.x, point1.y);
      ctx.lineTo(point2.x, point2.y);
      ctx.stroke();
    }
  }

  /**
   * 计算贝塞尔曲线需要的分段数
   */
  private calculateBezierSegments(p1: SmoothPoint, p2: SmoothPoint): number {
    // 计算曲线长度的近似值
    const distance = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    const widthDiff = Math.abs((p1.dynamicWidth || 1) - (p2.dynamicWidth || 1));
    
    // 根据距离、线宽差异和曲率确定分段数
    const baseSegments = Math.ceil(distance / 4);
    const widthSegments = Math.ceil(widthDiff * 8);
    
    return Math.max(4, Math.min(30, Math.max(baseSegments, widthSegments)));
  }

  /**
   * 获取贝塞尔曲线上指定参数t处的点
   */
  private getBezierPoint(p1: SmoothPoint, p2: SmoothPoint, t: number): Point {
    if (!p1.cp2 || !p2.cp1) {
      // 降级为线性插值
      return {
        x: p1.x + (p2.x - p1.x) * t,
        y: p1.y + (p2.y - p1.y) * t
      };
    }
    
    // 三次贝塞尔曲线公式
    const u = 1 - t;
    const tt = t * t;
    const uu = u * u;
    const uuu = uu * u;
    const ttt = tt * t;
    
    const x = uuu * p1.x + 3 * uu * t * p1.cp2.x + 3 * u * tt * p2.cp1.x + ttt * p2.x;
    const y = uuu * p1.y + 3 * uu * t * p1.cp2.y + 3 * u * tt * p2.cp1.y + ttt * p2.y;
    
    return { x, y };
  }

  private drawVariableStroke(ctx: CanvasRenderingContext2D, points: StrokePoint[]): void {
    if (points.length < 2) return;

    // 使用分段绘制来确保运笔效果的一致性
    if (points.length === 2) {
      // 只有两个点时使用直线
      this.drawVariableWidthLineSegment(ctx, points[0], points[1]);
    } else {
      // 多个点时使用优化的分段绘制
      this.drawOptimizedSegmentedStroke(ctx, points);
    }
  }

  /**
   * 优化的分段绘制
   */
  private drawOptimizedSegmentedStroke(ctx: CanvasRenderingContext2D, points: StrokePoint[]): void {
    // 直接绘制每个线段，每段使用不同的线宽
    for (let i = 0; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      
      // 使用变宽线段绘制
      this.drawVariableWidthLineSegment(ctx, current, next);
    }
  }

  /**
   * 计算线段需要的分割数量
   */
  private calculateSegmentCount(p1: StrokePoint, p2: StrokePoint): number {
    const distance = p1.distance || 0;
    const widthDiff = Math.abs((p1.dynamicWidth || 1) - (p2.dynamicWidth || 1));
    
    // 根据距离和线宽变化确定分段数
    const distanceSegments = Math.ceil(distance / 5);
    const widthSegments = Math.ceil(widthDiff * 2);
    
    return Math.max(1, Math.min(8, Math.max(distanceSegments, widthSegments)));
  }

  /**
   * 插值计算运笔点
   */
  private interpolateStrokePoint(p1: StrokePoint, p2: StrokePoint, t: number): StrokePoint {
    return {
      x: p1.x + (p2.x - p1.x) * t,
      y: p1.y + (p2.y - p1.y) * t,
      pressure: (p1.pressure || 0.5) + ((p2.pressure || 0.5) - (p1.pressure || 0.5)) * t,
      velocity: (p1.velocity || 0.5) + ((p2.velocity || 0.5) - (p1.velocity || 0.5)) * t,
      angle: (p1.angle || 0) + ((p2.angle || 0) - (p1.angle || 0)) * t,
      dynamicWidth: (p1.dynamicWidth || 1) + ((p2.dynamicWidth || 1) - (p1.dynamicWidth || 1)) * t
    };
  }

  private drawLineSegment(ctx: CanvasRenderingContext2D, p1: StrokePoint, p2: StrokePoint): void {
    // 使用变宽线段绘制替代简单线段
    this.drawVariableWidthLineSegment(ctx, p1, p2);
  }

  private applyStrokeEffect(ctx: CanvasRenderingContext2D, point: StrokePoint): void {
    // 使用预计算的动态线宽
    const lineWidth = point.dynamicWidth || this.calculateDynamicLineWidth(point);
    
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
      const pressureContribution = (this.strokeConfig.maxLineWidth - this.strokeConfig.minLineWidth) * point.pressure;
      width += pressureContribution;
    }
    
    // 速度影响线宽（速度越快，线越细）
    if (point.velocity !== undefined) {
      const velocityFactor = 1 - point.velocity * this.strokeConfig.velocitySensitivity * 0.8; // 减少速度影响强度
      width *= Math.max(0.3, velocityFactor); // 确保最小宽度
    }
    
    return Math.max(this.strokeConfig.minLineWidth, 
                   Math.min(this.strokeConfig.maxLineWidth, width));
  }

  private calculateDynamicAlpha(point: StrokePoint): number {
    if (!this.strokeConfig.opacityVariation) return 1.0;
    
    let alpha = 1.0;
    
    // 压力影响透明度
    if (point.pressure !== undefined) {
      alpha *= 0.6 + point.pressure * 0.4; // 调整透明度范围为0.6-1.0
    }
    
    // 速度影响透明度（速度越快，稍微越透明）
    if (point.velocity !== undefined) {
      const velocityAlpha = 1 - point.velocity * 0.2; // 减少速度对透明度的影响
      alpha *= velocityAlpha;
    }
    
    return Math.max(0.2, Math.min(1.0, alpha)); // 确保最小透明度
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
    
    // 使用优化的实时绘制
    this.drawOptimizedRealTime(ctx, strokePoints);
  }

  /**
   * 优化的实时绘制方法
   */
  private drawOptimizedRealTime(ctx: CanvasRenderingContext2D, points: StrokePoint[]): void {
    // 对于实时绘制，使用简化的计算来保持流畅性
    const simplifiedPoints = this.calculateSimplifiedStrokeParameters(points);
    
    // 应用轻量级抗锯齿
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';
    
    // 根据点数选择绘制方法
    if (this.strokeConfig.enableBezierSmoothing && simplifiedPoints.length > 6) {
      this.drawSimplifiedBezierStroke(ctx, simplifiedPoints);
    } else {
      this.drawVariableStroke(ctx, simplifiedPoints);
    }
  }

  /**
   * 简化的运笔参数计算（用于实时绘制）
   */
  private calculateSimplifiedStrokeParameters(points: StrokePoint[]): StrokePoint[] {
    const strokePoints: StrokePoint[] = [];
    
    for (let i = 0; i < points.length; i++) {
      const point = { ...points[i] } as StrokePoint;
      
      // 简化的压力计算
      if (this.strokeConfig.enablePressure) {
        point.pressure = this.calculateSimplifiedPressure(points, i);
      } else {
        point.pressure = 0.5;
      }
      
      // 简化的速度计算
      if (this.strokeConfig.enableVelocity && i > 0) {
        const dx = point.x - points[i - 1].x;
        const dy = point.y - points[i - 1].y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        point.velocity = Math.min(1, distance / 12);
      } else {
        point.velocity = 0.5;
      }
      
      // 预计算线宽
      point.dynamicWidth = this.calculateDynamicLineWidth(point);
      
      strokePoints.push(point);
    }
    
    return strokePoints;
  }

  /**
   * 简化的压力计算
   */
  private calculateSimplifiedPressure(points: StrokePoint[], index: number): number {
    const windowSize = 2; // 减小窗口大小
    const start = Math.max(0, index - windowSize);
    const end = Math.min(points.length - 1, index + windowSize);
    
    if (end <= start) return 0.5;
    
    let totalDistance = 0;
    let count = 0;
    
    for (let i = start; i < end; i++) {
      if (i > 0) {
        const dx = points[i].x - points[i - 1].x;
        const dy = points[i].y - points[i - 1].y;
        totalDistance += Math.sqrt(dx * dx + dy * dy);
        count++;
      }
    }
    
         if (count === 0) return 0.5;
     
     const simplifiedAvgDistance = totalDistance / count;
     const pressure = Math.exp(-simplifiedAvgDistance / 18);
    
    return Math.min(1, Math.max(0, pressure * this.strokeConfig.pressureSensitivity));
  }

  /**
   * 简化的贝塞尔曲线绘制
   */
  private drawSimplifiedBezierStroke(ctx: CanvasRenderingContext2D, points: StrokePoint[]): void {
    if (points.length < 3) {
      this.drawVariableStroke(ctx, points);
      return;
    }

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    
    // 使用二次贝塞尔曲线进行简化平滑
    for (let i = 1; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      
      this.applyStrokeEffect(ctx, current);
      
      const cpx = (current.x + next.x) / 2;
      const cpy = (current.y + next.y) / 2;
      
      ctx.quadraticCurveTo(current.x, current.y, cpx, cpy);
    }
    
    // 绘制最后一个点
    const lastPoint = points[points.length - 1];
    ctx.lineTo(lastPoint.x, lastPoint.y);
    ctx.stroke();
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
    score += action.points.length * 1.2; // 稍微增加点数权重

    // 基于线宽（更粗的线运笔效果更明显）
    score += action.context.lineWidth * 3;

    // 基于运笔效果配置
    if (this.strokeConfig.enablePressure) score += 15;
    if (this.strokeConfig.enableVelocity) score += 15;
    if (this.strokeConfig.enableAngle) score += 10;
    if (this.strokeConfig.opacityVariation) score += 10;
    if (this.strokeConfig.enableBezierSmoothing) score += 20; // 贝塞尔平滑增加复杂度
    
    // 基于抗锯齿级别
    score += this.strokeConfig.antiAliasLevel * 5;

    // 基于平滑度（平滑度越低，计算越复杂）
    score += (1 - this.strokeConfig.smoothing) * 10;

    // 基于敏感度（敏感度越高，计算越复杂）
    score += this.strokeConfig.pressureSensitivity * 6;
    score += this.strokeConfig.velocitySensitivity * 6;

    return Math.round(score);
  }

  public getActionType(): string {
    return 'pen';
  }
} 