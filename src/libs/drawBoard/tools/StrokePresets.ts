import type { StrokeConfig } from './stroke/StrokeTypes';

/**
 * 笔触预设类型枚举
 * 
 * 定义了所有可用的笔触预设类型，涵盖了从日常书写到艺术创作的各种场景：
 * 
 * 书写工具：
 * - pen: 钢笔，适合精细书写
 * - pencil: 铅笔，适合草图和素描
 * - marker: 马克笔，适合标记和粗线条
 * 
 * 艺术工具：
 * - brush: 毛笔，适合水墨画和书法
 * - calligraphy: 书法笔，专门用于书法创作
 * - watercolor: 水彩笔，模拟水彩画效果
 * - oil_paint: 油画笔，模拟油画效果
 * 
 * 绘画工具：
 * - chalk: 粉笔，模拟黑板粉笔效果
 * - crayon: 蜡笔，模拟蜡笔绘画效果
 * - spray: 喷漆，模拟喷漆效果
 * 
 * 其他：
 * - custom: 自定义预设，可自由配置参数
 */
export type StrokePresetType = 
  | 'pen'           // 钢笔 - 精细书写工具
  | 'brush'         // 毛笔 - 传统水墨画工具
  | 'chalk'         // 粉笔 - 黑板书写工具
  | 'marker'        // 马克笔 - 标记和粗线条工具
  | 'pencil'        // 铅笔 - 素描和草图工具
  | 'calligraphy'   // 书法笔 - 专业书法工具
  | 'crayon'        // 蜡笔 - 儿童绘画工具
  | 'watercolor'    // 水彩笔 - 水彩画工具
  | 'oil_paint'     // 油画笔 - 油画创作工具
  | 'spray'         // 喷漆 - 街头艺术工具
  | 'custom';       // 自定义 - 用户自定义配置

/**
 * 笔触预设配置接口
 * 
 * 定义了每个预设的完整信息，包括名称、描述、图标、配置参数和使用提示
 */
export interface StrokePreset {
  /** 预设名称，用于显示 */
  name: string;
  /** 预设描述，说明预设的特点和用途 */
  description: string;
  /** 预设图标，用于UI显示 */
  icon: string;
  /** 运笔效果配置参数 */
  config: StrokeConfig;
  /** 使用提示，帮助用户更好地使用该预设 */
  tips: string[];
}

// 预设配置集合
export const STROKE_PRESETS: Record<StrokePresetType, StrokePreset> = {
  pen: {
    name: '钢笔',
    description: '经典钢笔效果，线条清晰，压力敏感',
    icon: '✒️',
    config: {
      enablePressure: true,
      enableVelocity: true,
      enableAngle: false,
      pressureSensitivity: 0.9,
      velocitySensitivity: 0.3,
      minLineWidth: 0.5,
      maxLineWidth: 8,
      smoothing: 0.1,
      opacityVariation: false,
      enableBezierSmoothing: false, // 钢笔不需要贝塞尔平滑，保持锐利
      antiAliasLevel: 1 // 轻度抗锯齿
    },
    tips: [
      '适合书写和精细绘制',
      '压力变化明显',
      '线条边缘清晰',
      '适合签名和文档'
    ]
  },

  brush: {
    name: '毛笔',
    description: '传统毛笔效果，墨色渐变，笔触自然',
    icon: '🖌️',
    config: {
      enablePressure: true,
      enableVelocity: true,
      enableAngle: true,
      pressureSensitivity: 1.0,
      velocitySensitivity: 0.8,
      minLineWidth: 2,
      maxLineWidth: 30,
      smoothing: 0.4,
      opacityVariation: true,
      enableBezierSmoothing: true, // 毛笔启用贝塞尔平滑
      antiAliasLevel: 3 // 最高抗锯齿级别
    },
    tips: [
      '压力变化非常明显',
      '速度影响墨色深浅',
      '适合书法和国画',
      '笔触有自然的墨色渐变'
    ]
  },

  chalk: {
    name: '粉笔',
    description: '粉笔效果，颗粒感强，透明度变化',
    icon: '🖍️',
    config: {
      enablePressure: true,
      enableVelocity: true,
      enableAngle: false,
      pressureSensitivity: 0.7,
      velocitySensitivity: 0.9,
      minLineWidth: 3,
      maxLineWidth: 15,
      smoothing: 0.0,
      opacityVariation: true,
      enableBezierSmoothing: false, // 粉笔保持颗粒感，不平滑
      antiAliasLevel: 0 // 无抗锯齿，保持粗糙质感
    },
    tips: [
      '颗粒感明显',
      '速度影响透明度',
      '适合黑板画',
      '线条有自然的断断续续'
    ]
  },

  marker: {
    name: '马克笔',
    description: '马克笔效果，颜色饱和，线条均匀',
    icon: '🖊️',
    config: {
      enablePressure: false,
      enableVelocity: false,
      enableAngle: false,
      pressureSensitivity: 0,
      velocitySensitivity: 0,
      minLineWidth: 4,
      maxLineWidth: 4,
      smoothing: 0.2,
      opacityVariation: false,
      enableBezierSmoothing: true, // 马克笔启用平滑
      antiAliasLevel: 2 // 中等抗锯齿
    },
    tips: [
      '线条粗细均匀',
      '颜色饱和度高',
      '适合标记和涂鸦',
      '无压力变化'
    ]
  },

  pencil: {
    name: '铅笔',
    description: '铅笔效果，灰度变化，压力敏感',
    icon: '✏️',
    config: {
      enablePressure: true,
      enableVelocity: true,
      enableAngle: false,
      pressureSensitivity: 0.8,
      velocitySensitivity: 0.5,
      minLineWidth: 0.5,
      maxLineWidth: 6,
      smoothing: 0.1,
      opacityVariation: true,
      enableBezierSmoothing: false, // 铅笔保持素描质感
      antiAliasLevel: 1 // 轻度抗锯齿
    },
    tips: [
      '压力影响线条深浅',
      '适合素描',
      '线条有自然的灰度',
      '适合草图绘制'
    ]
  },

  calligraphy: {
    name: '书法笔',
    description: '书法笔效果，笔锋变化，角度敏感',
    icon: '🖋️',
    config: {
      enablePressure: true,
      enableVelocity: true,
      enableAngle: true,
      pressureSensitivity: 1.0,
      velocitySensitivity: 0.7,
      minLineWidth: 1,
      maxLineWidth: 25,
      smoothing: 0.3,
      opacityVariation: true,
      enableBezierSmoothing: true, // 书法笔启用贝塞尔平滑
      antiAliasLevel: 2 // 中等抗锯齿
    },
    tips: [
      '笔锋变化明显',
      '角度影响线条形状',
      '适合书法练习',
      '压力控制笔锋粗细'
    ]
  },

  crayon: {
    name: '蜡笔',
    description: '蜡笔效果，质感粗糙，颜色叠加',
    icon: '🖍️',
    config: {
      enablePressure: true,
      enableVelocity: true,
      enableAngle: false,
      pressureSensitivity: 0.6,
      velocitySensitivity: 0.8,
      minLineWidth: 2,
      maxLineWidth: 12,
      smoothing: 0.0,
      opacityVariation: true,
      enableBezierSmoothing: false, // 蜡笔保持粗糙质感
      antiAliasLevel: 1 // 轻度抗锯齿
    },
    tips: [
      '质感粗糙自然',
      '适合儿童画',
      '颜色叠加效果',
      '线条有蜡笔质感'
    ]
  },

  watercolor: {
    name: '水彩笔',
    description: '水彩效果，颜色扩散，透明度高',
    icon: '🎨',
    config: {
      enablePressure: true,
      enableVelocity: true,
      enableAngle: true,
      pressureSensitivity: 0.9,
      velocitySensitivity: 1.0,
      minLineWidth: 3,
      maxLineWidth: 20,
      smoothing: 0.5,
      opacityVariation: true,
      enableBezierSmoothing: true, // 水彩笔启用贝塞尔平滑
      antiAliasLevel: 3 // 最高抗锯齿级别
    },
    tips: [
      '颜色扩散效果',
      '透明度变化明显',
      '适合水彩画',
      '速度影响颜色扩散'
    ]
  },

  oil_paint: {
    name: '油画笔',
    description: '油画效果，厚重质感，笔触明显',
    icon: '🖼️',
    config: {
      enablePressure: true,
      enableVelocity: true,
      enableAngle: true,
      pressureSensitivity: 0.8,
      velocitySensitivity: 0.6,
      minLineWidth: 4,
      maxLineWidth: 35,
      smoothing: 0.2,
      opacityVariation: false,
      enableBezierSmoothing: false, // 油画笔保持笔触痕迹
      antiAliasLevel: 1 // 轻度抗锯齿
    },
    tips: [
      '厚重质感',
      '笔触痕迹明显',
      '适合油画风格',
      '压力影响颜料厚度'
    ]
  },

  spray: {
    name: '喷漆',
    description: '喷漆效果，边缘模糊，随机散布',
    icon: '🎨',
    config: {
      enablePressure: true,
      enableVelocity: true,
      enableAngle: false,
      pressureSensitivity: 0.9,
      velocitySensitivity: 1.0,
      minLineWidth: 8,
      maxLineWidth: 40,
      smoothing: 0.6,
      opacityVariation: true,
      enableBezierSmoothing: true, // 喷漆启用贝塞尔平滑
      antiAliasLevel: 3 // 最高抗锯齿级别
    },
    tips: [
      '边缘模糊效果',
      '适合街头艺术',
      '压力控制喷射强度',
      '速度影响覆盖密度'
    ]
  },

  custom: {
    name: '自定义',
    description: '完全自定义的运笔效果配置',
    icon: '⚙️',
    config: {
      enablePressure: true,
      enableVelocity: true,
      enableAngle: true,
      pressureSensitivity: 0.8,
      velocitySensitivity: 0.6,
      minLineWidth: 1,
      maxLineWidth: 20,
      smoothing: 0.3,
      opacityVariation: true,
      enableBezierSmoothing: true, // 自定义默认启用贝塞尔平滑
      antiAliasLevel: 2 // 中等抗锯齿
    },
    tips: [
      '可以完全自定义配置',
      '适合特殊需求',
      '支持所有运笔效果',
      '灵活的参数调整'
    ]
  }
};

// 获取预设配置
export function getStrokePreset(type: StrokePresetType): StrokePreset {
  return STROKE_PRESETS[type];
}

// 获取所有预设
export function getAllStrokePresets(): StrokePreset[] {
  return Object.values(STROKE_PRESETS);
}

// 获取预设类型列表
export function getStrokePresetTypes(): StrokePresetType[] {
  return Object.keys(STROKE_PRESETS) as StrokePresetType[];
}

// 根据描述搜索预设
export function searchStrokePresets(keyword: string): StrokePreset[] {
  const lowerKeyword = keyword.toLowerCase();
  return getAllStrokePresets().filter(preset => 
    preset.name.toLowerCase().includes(lowerKeyword) ||
    preset.description.toLowerCase().includes(lowerKeyword) ||
    preset.tips.some(tip => tip.toLowerCase().includes(lowerKeyword))
  );
}

// 预设分类
export const PRESET_CATEGORIES = {
  writing: ['pen', 'pencil', 'marker'] as StrokePresetType[],
  art: ['brush', 'calligraphy', 'watercolor', 'oil_paint'] as StrokePresetType[],
  drawing: ['chalk', 'crayon', 'spray'] as StrokePresetType[],
  custom: ['custom'] as StrokePresetType[]
};

// 获取分类预设
export function getPresetsByCategory(category: keyof typeof PRESET_CATEGORIES): StrokePreset[] {
  return PRESET_CATEGORIES[category].map(type => STROKE_PRESETS[type]);
} 