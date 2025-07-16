import type { Point } from '../../core/CanvasEngine';

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
 * 默认运笔配置
 */
export const DEFAULT_STROKE_CONFIG: StrokeConfig = {
  enablePressure: true,
  enableVelocity: true,
  enableAngle: true,
  pressureSensitivity: 0.9,
  velocitySensitivity: 0.7,
  minLineWidth: 0.8,
  maxLineWidth: 28,
  smoothing: 0.15,
  opacityVariation: true,
  enableBezierSmoothing: true,
  antiAliasLevel: 2
}; 