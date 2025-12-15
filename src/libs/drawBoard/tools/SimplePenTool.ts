/**
 * 简化版画笔工具
 * 
 * 6 种基础笔触预设：
 * 1. pen - 钢笔：细腻平滑，固定宽度
 * 2. pencil - 铅笔：轻微抖动，模拟铅笔质感
 * 3. marker - 马克笔：粗线条，半透明叠加
 * 4. brush - 毛笔：压感变化，书法效果
 * 5. highlighter - 荧光笔：宽扁笔触，高亮效果
 * 6. crayon - 蜡笔：粗糙边缘，蜡笔质感
 * 
 * 设计原则：
 * - 代码简洁，易于理解和维护
 * - 高性能，适合实时绘制
 * - 效果自然，满足基本绘画需求
 */

import { DrawTool } from './DrawTool';
import type { DrawAction } from './DrawTool';
import type { Point } from '../core/CanvasEngine';

// ============================================
// 类型定义
// ============================================

/** 笔触类型 */
export type BrushType = 'simple' | 'pressure';

/** 笔触预设类型 */
export type BrushPreset = 'pen' | 'pencil' | 'marker' | 'brush' | 'highlighter' | 'crayon';

/** 笔触配置 */
export interface SimpleBrushConfig {
  type: BrushType;
  /** 平滑度 0-1，值越大越平滑 */
  smoothing: number;
  /** 压感敏感度 0-1（仅 pressure 类型有效） */
  pressureSensitivity: number;
  /** 透明度 0-1 */
  opacity: number;
  /** 抖动强度 0-1（模拟手绘效果） */
  jitter: number;
  /** 笔触纹理类型 */
  texture: 'none' | 'rough' | 'soft';
}

/** 预设配置 */
export interface PresetConfig {
  name: string;
  description: string;
  config: SimpleBrushConfig;
  recommendedWidth: number;
  color?: string;
}

/** 所有预设 */
export const BRUSH_PRESETS: Record<BrushPreset, PresetConfig> = {
  pen: {
    name: '钢笔',
    description: '细腻平滑的线条，适合书写和精细绘画',
    config: {
      type: 'simple',
      smoothing: 0.7,
      pressureSensitivity: 0,
      opacity: 1,
      jitter: 0,
      texture: 'none'
    },
    recommendedWidth: 2
  },
  pencil: {
    name: '铅笔',
    description: '带有轻微抖动的线条，模拟真实铅笔质感',
    config: {
      type: 'simple',
      smoothing: 0.3,
      pressureSensitivity: 0.3,
      opacity: 0.9,
      jitter: 0.15,
      texture: 'rough'
    },
    recommendedWidth: 1.5
  },
  marker: {
    name: '马克笔',
    description: '粗线条，半透明叠加效果',
    config: {
      type: 'simple',
      smoothing: 0.5,
      pressureSensitivity: 0,
      opacity: 0.7,
      jitter: 0,
      texture: 'none'
    },
    recommendedWidth: 8
  },
  brush: {
    name: '毛笔',
    description: '压感变化明显，适合书法和艺术创作',
    config: {
      type: 'pressure',
      smoothing: 0.6,
      pressureSensitivity: 0.9,
      opacity: 1,
      jitter: 0,
      texture: 'soft'
    },
    recommendedWidth: 6
  },
  highlighter: {
    name: '荧光笔',
    description: '宽扁笔触，用于高亮标记',
    config: {
      type: 'simple',
      smoothing: 0.4,
      pressureSensitivity: 0,
      opacity: 0.4,
      jitter: 0,
      texture: 'none'
    },
    recommendedWidth: 16,
    color: '#FFFF00'
  },
  crayon: {
    name: '蜡笔',
    description: '粗糙边缘，蜡笔质感',
    config: {
      type: 'pressure',
      smoothing: 0.2,
      pressureSensitivity: 0.5,
      opacity: 0.85,
      jitter: 0.3,
      texture: 'rough'
    },
    recommendedWidth: 10
  }
};

const DEFAULT_CONFIG: SimpleBrushConfig = {
  type: 'simple',
  smoothing: 0.5,
  pressureSensitivity: 0.8,
  opacity: 1,
  jitter: 0,
  texture: 'none'
};

// ============================================
// 简化版画笔工具
// ============================================

export class SimplePenTool extends DrawTool {
  private config: SimpleBrushConfig;
  private currentPreset: BrushPreset | null = null;

  constructor(config: Partial<SimpleBrushConfig> = {}) {
    super('画笔', 'pen');
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 应用预设
   */
  public setPreset(preset: BrushPreset): void {
    const presetConfig = BRUSH_PRESETS[preset];
    if (presetConfig) {
      this.config = { ...presetConfig.config };
      this.currentPreset = preset;
    }
  }

  /**
   * 获取当前预设
   */
  public getCurrentPreset(): BrushPreset | null {
    return this.currentPreset;
  }

  /**
   * 获取预设信息
   */
  public static getPresetInfo(preset: BrushPreset): PresetConfig {
    return BRUSH_PRESETS[preset];
  }

  /**
   * 获取所有预设
   */
  public static getAllPresets(): Record<BrushPreset, PresetConfig> {
    return BRUSH_PRESETS;
  }

  /**
   * 设置笔触类型
   */
  public setBrushType(type: BrushType): void {
    this.config.type = type;
    this.currentPreset = null;
  }

  /**
   * 获取笔触类型
   */
  public getBrushType(): BrushType {
    return this.config.type;
  }

  /**
   * 更新配置
   */
  public setConfig(config: Partial<SimpleBrushConfig>): void {
    this.config = { ...this.config, ...config };
    this.currentPreset = null;
  }

  /**
   * 获取当前配置
   */
  public getConfig(): SimpleBrushConfig {
    return { ...this.config };
  }

  /**
   * 主绘制方法
   */
  public draw(ctx: CanvasRenderingContext2D, action: DrawAction): void {
    if (action.points.length < 2) return;

    const originalContext = this.saveContext(ctx);
    this.setContext(ctx, action.context);

    // 应用透明度
    if (this.config.opacity < 1) {
      ctx.globalAlpha = this.config.opacity;
    }

    // 根据类型选择绘制方式
    if (this.config.type === 'pressure') {
      this.drawPressureStroke(ctx, action);
    } else {
      this.drawSimpleStroke(ctx, action);
    }

    this.restoreContext(ctx, originalContext);
  }

  // ============================================
  // 笔触类型 1: Simple - 平滑曲线
  // ============================================

  /**
   * 简单笔触 - 使用二次贝塞尔曲线平滑
   * 
   * 原理：每两个点之间使用中点作为控制点
   * 优点：线条平滑，计算简单，性能好
   */
  private drawSimpleStroke(ctx: CanvasRenderingContext2D, action: DrawAction): void {
    // 先插值，确保快速绘制时也有足够的点
    const interpolatedPoints = this.interpolatePoints(action.points);
    const points = this.applyJitter(interpolatedPoints);
    
    // 确保抗锯齿设置
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // 如果点很少，直接画线
    if (points.length <= 3) {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
      return;
    }
    
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    // 第一段：直接连到第一个中点
    const firstMidX = (points[0].x + points[1].x) / 2;
    const firstMidY = (points[0].y + points[1].y) / 2;
    ctx.lineTo(firstMidX, firstMidY);

    // 使用二次贝塞尔曲线连接中间点
    for (let i = 1; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      
      // 中点作为终点，当前点作为控制点
      const midX = (current.x + next.x) / 2;
      const midY = (current.y + next.y) / 2;
      
      ctx.quadraticCurveTo(current.x, current.y, midX, midY);
    }

    // 连接到最后一个点
    const lastPoint = points[points.length - 1];
    const secondLast = points[points.length - 2];
    ctx.quadraticCurveTo(secondLast.x, secondLast.y, lastPoint.x, lastPoint.y);

    ctx.stroke();

    // 应用纹理效果
    if (this.config.texture === 'rough') {
      this.applyRoughTexture(ctx, points, action.context.lineWidth);
    }
  }

  /**
   * 点插值 - 当两点距离过大时插入中间点
   * 解决快速绘制时采样点不足的问题
   */
  private interpolatePoints(points: Point[]): Point[] {
    if (points.length < 2) return points;

    const maxDistance = 8; // 最大允许距离（像素）
    const result: Point[] = [points[0]];

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > maxDistance) {
        // 需要插入中间点
        const segments = Math.ceil(distance / maxDistance);
        for (let j = 1; j < segments; j++) {
          const t = j / segments;
          result.push({
            x: prev.x + dx * t,
            y: prev.y + dy * t,
            pressure: prev.pressure !== undefined && curr.pressure !== undefined
              ? prev.pressure + (curr.pressure - prev.pressure) * t
              : curr.pressure
          });
        }
      }

      result.push(curr);
    }

    return result;
  }

  // ============================================
  // 笔触类型 2: Pressure - 可变宽度笔触
  // ============================================

  /**
   * 压感笔触 - 使用填充多边形实现平滑可变宽度
   * 
   * 原理：计算路径的左右边缘轮廓，用 fill 绘制闭合区域
   * 优点：无锯齿，线宽变化平滑自然
   */
  private drawPressureStroke(ctx: CanvasRenderingContext2D, action: DrawAction): void {
    // 先插值，确保快速绘制时也有足够的点
    const points = this.interpolatePoints(action.points);
    if (points.length < 2) return;
    
    const baseWidth = action.context.lineWidth;
    const sensitivity = this.config.pressureSensitivity;

    // 确保 fillStyle 与 strokeStyle 一致（用于 fill 绘制）
    ctx.fillStyle = action.context.strokeStyle;

    // 计算每个点的宽度
    const widths: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const pressure = this.getPressure(points[i], i, points.length);
      widths.push(this.calculateWidth(baseWidth, pressure, sensitivity));
    }

    // 使用填充多边形绘制平滑变宽路径
    this.drawVariableWidthPath(ctx, points, widths);
  }

  /**
   * 绘制可变宽度路径（使用填充多边形）
   */
  private drawVariableWidthPath(
    ctx: CanvasRenderingContext2D, 
    points: Point[], 
    widths: number[]
  ): void {
    if (points.length < 2) return;

    // 计算左右边缘点
    const leftPoints: Point[] = [];
    const rightPoints: Point[] = [];

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const w = widths[i] / 2;

      // 计算法线方向
      let nx = 0, ny = 0;
      
      if (i === 0) {
        // 第一个点：使用到下一个点的方向
        const next = points[i + 1];
        const dx = next.x - p.x;
        const dy = next.y - p.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        nx = -dy / len;
        ny = dx / len;
      } else if (i === points.length - 1) {
        // 最后一个点：使用从上一个点来的方向
        const prev = points[i - 1];
        const dx = p.x - prev.x;
        const dy = p.y - prev.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        nx = -dy / len;
        ny = dx / len;
      } else {
        // 中间点：使用前后点的平均方向
        const prev = points[i - 1];
        const next = points[i + 1];
        const dx = next.x - prev.x;
        const dy = next.y - prev.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        nx = -dy / len;
        ny = dx / len;
      }

      // 左右边缘点
      leftPoints.push({ x: p.x + nx * w, y: p.y + ny * w });
      rightPoints.push({ x: p.x - nx * w, y: p.y - ny * w });
    }

    // 绘制填充路径
    ctx.beginPath();
    
    // 左边缘（顺序）
    ctx.moveTo(leftPoints[0].x, leftPoints[0].y);
    for (let i = 1; i < leftPoints.length; i++) {
      // 使用二次贝塞尔曲线平滑
      if (i < leftPoints.length - 1) {
        const curr = leftPoints[i];
        const next = leftPoints[i + 1];
        const midX = (curr.x + next.x) / 2;
        const midY = (curr.y + next.y) / 2;
        ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
      } else {
        ctx.lineTo(leftPoints[i].x, leftPoints[i].y);
      }
    }

    // 末端圆角
    const lastIdx = points.length - 1;
    const endRadius = widths[lastIdx] / 2;
    ctx.arc(
      points[lastIdx].x, 
      points[lastIdx].y, 
      endRadius, 
      Math.atan2(leftPoints[lastIdx].y - points[lastIdx].y, leftPoints[lastIdx].x - points[lastIdx].x),
      Math.atan2(rightPoints[lastIdx].y - points[lastIdx].y, rightPoints[lastIdx].x - points[lastIdx].x),
      false
    );

    // 右边缘（逆序）
    for (let i = rightPoints.length - 1; i >= 0; i--) {
      if (i > 0) {
        const curr = rightPoints[i];
        const prev = rightPoints[i - 1];
        const midX = (curr.x + prev.x) / 2;
        const midY = (curr.y + prev.y) / 2;
        ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
      } else {
        ctx.lineTo(rightPoints[i].x, rightPoints[i].y);
      }
    }

    // 起始端圆角
    const startRadius = widths[0] / 2;
    ctx.arc(
      points[0].x, 
      points[0].y, 
      startRadius, 
      Math.atan2(rightPoints[0].y - points[0].y, rightPoints[0].x - points[0].x),
      Math.atan2(leftPoints[0].y - points[0].y, leftPoints[0].x - points[0].x),
      false
    );

    ctx.closePath();
    ctx.fill();
  }

  /**
   * 获取压力值
   * 优先使用点自带的压力值，否则根据位置模拟
   */
  private getPressure(point: Point, index: number, total: number): number {
    // 如果点有压力数据，直接使用
    if (point.pressure !== undefined) {
      return point.pressure;
    }

    // 模拟压力：开始和结束较轻，中间较重
    // 使用正弦函数模拟自然的笔触压力变化
    const t = index / total;
    return 0.3 + 0.7 * Math.sin(t * Math.PI);
  }

  /**
   * 根据压力计算线宽
   */
  private calculateWidth(baseWidth: number, pressure: number, sensitivity: number): number {
    // 压力影响范围：0.3x ~ 1.5x 基础线宽
    const minFactor = 0.3;
    const maxFactor = 1.5;
    const factor = minFactor + (maxFactor - minFactor) * pressure * sensitivity;
    return baseWidth * factor;
  }

  // ============================================
  // 辅助方法
  // ============================================

  /**
   * 应用抖动效果（模拟手绘）
   */
  private applyJitter(points: Point[]): Point[] {
    if (this.config.jitter <= 0) return points;

    const jitterAmount = this.config.jitter * 2;
    return points.map((p, i) => {
      // 首尾点不抖动
      if (i === 0 || i === points.length - 1) return p;
      
      return {
        x: p.x + (Math.random() - 0.5) * jitterAmount,
        y: p.y + (Math.random() - 0.5) * jitterAmount,
        pressure: p.pressure
      };
    });
  }

  /**
   * 应用粗糙纹理效果
   */
  private applyRoughTexture(
    ctx: CanvasRenderingContext2D, 
    points: Point[], 
    lineWidth: number
  ): void {
    const density = Math.max(1, Math.floor(lineWidth / 2));
    ctx.globalAlpha = 0.1;
    
    for (let i = 0; i < points.length; i += 2) {
      const p = points[i];
      for (let j = 0; j < density; j++) {
        const offsetX = (Math.random() - 0.5) * lineWidth;
        const offsetY = (Math.random() - 0.5) * lineWidth;
        const size = Math.random() * 1.5;
        
        ctx.beginPath();
        ctx.arc(p.x + offsetX, p.y + offsetY, size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  public getActionType(): string {
    return 'pen';
  }
}

// ============================================
// 导出便捷函数
// ============================================

/** 创建简单笔触工具 */
export function createSimplePen(): SimplePenTool {
  return new SimplePenTool({ type: 'simple' });
}

/** 创建压感笔触工具 */
export function createPressurePen(): SimplePenTool {
  return new SimplePenTool({ type: 'pressure' });
}

/** 根据预设创建笔触工具 */
export function createBrushFromPreset(preset: BrushPreset): SimplePenTool {
  const tool = new SimplePenTool();
  tool.setPreset(preset);
  return tool;
}

/** 获取所有预设列表 */
export function getAllBrushPresets(): BrushPreset[] {
  return Object.keys(BRUSH_PRESETS) as BrushPreset[];
}

