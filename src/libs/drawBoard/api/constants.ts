// 常量和配置相关导出
import type { DrawBoardConfig } from '../DrawBoard';

// 版本信息
export const VERSION = '1.0.0';
export const AUTHOR = 'DrawBoard Team';
export const DESCRIPTION = '一个功能强大的Canvas画板库，支持多种绘制工具和运笔效果';

// 默认配置
export const DEFAULT_CONFIG: DrawBoardConfig = {
  maxHistorySize: 100,
  enableShortcuts: true,
  strokeConfig: {
    enablePressure: true,
    enableVelocity: true,
    enableAngle: true,
    pressureSensitivity: 0.8,
    velocitySensitivity: 0.6,
    minLineWidth: 1,
    maxLineWidth: 20,
    smoothing: 0.3,
    opacityVariation: true,
    enableBezierSmoothing: true, // 默认启用贝塞尔平滑
    antiAliasLevel: 2 // 中等抗锯齿级别
  }
}; 