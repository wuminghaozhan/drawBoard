import { DrawTool } from './DrawTool';
import type { DrawAction } from './DrawTool';
import type { Point } from '../core/CanvasEngine';
import { getStrokePreset, type StrokePresetType } from './StrokePresets';
import { StrokeCalculator } from './stroke/StrokeCalculator';
import { BezierRenderer } from './stroke/BezierRenderer';
import { RealtimeRenderer } from './stroke/RealtimeRenderer';
import type { StrokePoint, StrokeConfig } from './stroke/StrokeTypes';
import { DEFAULT_STROKE_CONFIG } from './stroke/StrokeTypes';

/**
 * 画笔工具类 - 重构版本
 * 
 * 使用模块化设计，将复杂的运笔效果逻辑分离到专门的模块中：
 * - StrokeCalculator: 运笔参数计算
 * - BezierRenderer: 贝塞尔曲线渲染
 * - RealtimeRenderer: 实时绘制优化
 * 
 * 重构后的优势：
 * - 单一职责：每个模块只负责特定功能
 * - 易于测试：各模块可独立测试
 * - 便于维护：功能修改影响范围小
 * - 可复用性：渲染器可被其他工具复用
 * 
 * @example
 * ```typescript
 * const penTool = new PenToolRefactored();
 * 
 * // 配置运笔效果
 * penTool.setStrokeConfig({
 *   enablePressure: true,
 *   pressureSensitivity: 0.8,
 *   enableBezierSmoothing: true
 * });
 * 
 * // 使用预设
 * penTool.setPreset('brush');
 * ```
 */
export class PenToolRefactored extends DrawTool {
  private strokeConfig: StrokeConfig;
  private currentPreset: StrokePresetType | null = null;
  
  // 核心模块
  private calculator: StrokeCalculator;
  private bezierRenderer: BezierRenderer;
  private realtimeRenderer: RealtimeRenderer;
  


  constructor() {
    super('画笔', 'pen');
    
    // 使用默认配置
    this.strokeConfig = { ...DEFAULT_STROKE_CONFIG };
    
    // 初始化核心模块
    this.calculator = new StrokeCalculator(this.strokeConfig);
    this.bezierRenderer = new BezierRenderer(this.strokeConfig);
    this.realtimeRenderer = new RealtimeRenderer(this.strokeConfig);
  }

  // ============================================
  // 配置管理
  // ============================================

  /**
   * 设置运笔配置
   */
  public setStrokeConfig(config: Partial<StrokeConfig>): void {
    this.strokeConfig = { ...this.strokeConfig, ...config };
    
    // 更新所有模块的配置
    this.calculator.updateConfig(this.strokeConfig);
    this.bezierRenderer.updateConfig(this.strokeConfig);
    this.realtimeRenderer.updateConfig(this.strokeConfig);
  }

  /**
   * 获取当前运笔配置
   */
  public getStrokeConfig(): StrokeConfig {
    return { ...this.strokeConfig };
  }

  /**
   * 应用预设配置
   */
  public setPreset(presetType: StrokePresetType): void {
    const preset = getStrokePreset(presetType);
    if (preset) {
      this.setStrokeConfig(preset.config);
      this.currentPreset = presetType;
    }
  }

  /**
   * 获取当前预设
   */
  public getCurrentPreset(): StrokePresetType | null {
    return this.currentPreset;
  }

  // ============================================
  // 绘制方法
  // ============================================

  /**
   * 主绘制方法
   */
  public draw(ctx: CanvasRenderingContext2D, action: DrawAction): void {
    if (action.points.length < 2) return;

    const originalContext = this.saveContext(ctx);
    this.setContext(ctx, action.context);
    
    // 设置复杂度评分和缓存支持
    this.updateActionMetadata(action);
    
    // 使用贝塞尔渲染器进行高质量绘制
    this.drawStrokePath(ctx, action.points as StrokePoint[]);
    
    this.restoreContext(ctx, originalContext);
  }

  /**
   * 实时绘制方法
   */
  public drawRealTime(ctx: CanvasRenderingContext2D, points: Point[]): void {
    if (points.length < 2) return;

    const originalContext = this.saveContext(ctx);
    
    // 使用实时渲染器
    this.realtimeRenderer.drawRealTime(ctx, points);
    
    this.restoreContext(ctx, originalContext);
  }

  /**
   * 绘制运笔路径
   */
  private drawStrokePath(ctx: CanvasRenderingContext2D, points: StrokePoint[]): void {
    // 计算运笔参数
    const strokePoints = this.calculator.calculateStrokeParameters(points);
    
    // 根据配置选择渲染方式
    if (this.strokeConfig.enableBezierSmoothing && strokePoints.length > 4) {
      this.bezierRenderer.drawBezierStroke(ctx, strokePoints);
    } else {
      this.drawSimpleStroke(ctx, strokePoints);
    }
  }

  /**
   * 简单笔触绘制（回退方案）
   */
  private drawSimpleStroke(ctx: CanvasRenderingContext2D, points: StrokePoint[]): void {
    if (points.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i++) {
      const point = points[i];
      
      // 应用动态线宽
      if (point.dynamicWidth) {
        ctx.lineWidth = point.dynamicWidth;
      }
      
      // 应用动态透明度
      if (this.strokeConfig.opacityVariation) {
        const alpha = this.calculator.calculateDynamicAlpha(point);
        const currentStyle = ctx.strokeStyle as string;
        
        if (currentStyle.startsWith('#')) {
          // 处理十六进制颜色
          const r = parseInt(currentStyle.slice(1, 3), 16);
          const g = parseInt(currentStyle.slice(3, 5), 16);
          const b = parseInt(currentStyle.slice(5, 7), 16);
          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
      }
      
      ctx.lineTo(point.x, point.y);
    }

    ctx.stroke();
  }

  // ============================================
  // 辅助方法
  // ============================================

  /**
   * 更新动作元数据
   */
  private updateActionMetadata(action: DrawAction): void {
    if (!action.complexityScore) {
      action.complexityScore = this.calculateComplexity(action);
    }
    if (action.supportsCaching === undefined) {
      action.supportsCaching = true; // 画笔工具支持缓存
    }
  }

  /**
   * 计算复杂度评分
   */
  private calculateComplexity(action: DrawAction): number {
    let score = 0;

    // 基于点数量
    score += action.points.length * 0.5;

    // 画笔工具基础复杂度
    score += 30;

    // 基于运笔效果配置
    if (this.strokeConfig.enablePressure) score += 10;
    if (this.strokeConfig.enableVelocity) score += 10;
    if (this.strokeConfig.enableBezierSmoothing) score += 20;
    if (this.strokeConfig.antiAliasLevel > 1) score += this.strokeConfig.antiAliasLevel * 5;

    // 基于线宽
    score += action.context.lineWidth * 2;

    return Math.round(score);
  }

  /**
   * 获取工具类型
   */
  public getActionType(): string {
    return 'pen';
  }

  // ============================================
  // 性能和调试信息
  // ============================================

  /**
   * 获取渲染统计信息
   */
  public getRenderStats(): {
    calculator: any;
    bezierRenderer: any;
    realtimeRenderer: ReturnType<RealtimeRenderer['getRenderStats']>;
  } {
    return {
      calculator: {
        config: this.strokeConfig
      },
      bezierRenderer: {
        config: this.strokeConfig
      },
      realtimeRenderer: this.realtimeRenderer.getRenderStats()
    };
  }

  /**
   * 设置性能模式
   */
  public setPerformanceMode(mode: 'high' | 'medium' | 'low'): void {
    this.realtimeRenderer.setPerformanceMode(mode);
  }

  /**
   * 获取模块引用（用于高级用法）
   */
  public getModules(): {
    calculator: StrokeCalculator;
    bezierRenderer: BezierRenderer;
    realtimeRenderer: RealtimeRenderer;
  } {
    return {
      calculator: this.calculator,
      bezierRenderer: this.bezierRenderer,
      realtimeRenderer: this.realtimeRenderer
    };
  }

  /**
   * 销毁资源
   */
  public destroy(): void {
    // 清理资源
    this.currentPreset = null;
    this.lastTimestamp = 0;
    this.lastPressure = 0.5;
    this.lastVelocity = 0.5;
  }
} 