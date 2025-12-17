import type { DrawAction } from '../DrawTool';
import type { Bounds } from '../anchor/AnchorTypes';
import type { TextAction } from '../../types/TextTypes';

/**
 * 边界框计算配置
 */
export interface BoundsCalculatorConfig {
  /** 锚点大小（用于计算最小可见半径） */
  anchorSize: number;
  /** 默认尺寸（当无法计算时使用） */
  defaultSize: number;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: BoundsCalculatorConfig = {
  anchorSize: 8,
  defaultSize: 10
};

/**
 * 边界框计算器
 * 
 * 提取自 SelectTool 的边界框计算逻辑。
 * 为不同类型的图形提供特定的边界框计算方法。
 */
export class BoundsCalculator {
  private config: BoundsCalculatorConfig;

  constructor(config: Partial<BoundsCalculatorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 计算单个 Action 的边界框
   */
  calculate(action: DrawAction): Bounds {
    if (!action.points || action.points.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    switch (action.type) {
      case 'circle':
        return this.calculateCircleBounds(action);
      case 'rect':
        return this.calculateRectBounds(action);
      case 'line':
        return this.calculateLineBounds(action);
      case 'polygon':
        return this.calculatePolygonBounds(action);
      case 'text':
        return this.calculateTextBounds(action);
      default:
        return this.calculateGenericBounds(action);
    }
  }

  /**
   * 计算多个 Actions 的联合边界框
   */
  calculateUnion(actions: DrawAction[]): Bounds | null {
    if (actions.length === 0) {
      return null;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const action of actions) {
      const bounds = this.calculate(action);
      if (bounds.width === 0 && bounds.height === 0) {
        continue;
      }

      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
      maxX = Math.max(maxX, bounds.x + bounds.width);
      maxY = Math.max(maxY, bounds.y + bounds.height);
    }

    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      return null;
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  /**
   * 判断点是否在边界框内
   */
  isPointInBounds(point: { x: number; y: number }, bounds: Bounds): boolean {
    return (
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.height
    );
  }

  /**
   * 扩展边界框
   */
  expandBounds(bounds: Bounds, padding: number): Bounds {
    return {
      x: bounds.x - padding,
      y: bounds.y - padding,
      width: bounds.width + padding * 2,
      height: bounds.height + padding * 2
    };
  }

  /**
   * 合并两个边界框
   */
  mergeBounds(bounds1: Bounds, bounds2: Bounds): Bounds {
    const minX = Math.min(bounds1.x, bounds2.x);
    const minY = Math.min(bounds1.y, bounds2.y);
    const maxX = Math.max(bounds1.x + bounds1.width, bounds2.x + bounds2.width);
    const maxY = Math.max(bounds1.y + bounds1.height, bounds2.y + bounds2.height);

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  // ============================================
  // 形状特定的边界框计算
  // ============================================

  /**
   * 计算圆形边界框
   */
  private calculateCircleBounds(action: DrawAction): Bounds {
    if (action.points.length < 2) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    const center = action.points[0];
    const edge = action.points[action.points.length - 1];
    
    const radius = Math.sqrt(
      Math.pow(edge.x - center.x, 2) + Math.pow(edge.y - center.y, 2)
    );

    const minVisibleRadius = this.config.anchorSize;
    const validRadius = Math.max(minVisibleRadius, radius);

    if (!isFinite(center.x) || !isFinite(center.y) || !isFinite(validRadius) || validRadius <= 0) {
      return {
        x: (isFinite(center.x) ? center.x : 0) - 50,
        y: (isFinite(center.y) ? center.y : 0) - 50,
        width: 100,
        height: 100
      };
    }

    return {
      x: center.x - validRadius,
      y: center.y - validRadius,
      width: validRadius * 2,
      height: validRadius * 2
    };
  }

  /**
   * 计算矩形边界框
   * 矩形统一使用4顶点格式，支持旋转矩形
   */
  private calculateRectBounds(action: DrawAction): Bounds {
    if (action.points.length < 4) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const p of action.points) {
      if (!isFinite(p.x) || !isFinite(p.y)) continue;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }

    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    return {
      x: minX,
      y: minY,
      width: Math.max(maxX - minX, 1),
      height: Math.max(maxY - minY, 1)
    };
  }

  /**
   * 计算直线边界框
   */
  private calculateLineBounds(action: DrawAction): Bounds {
    if (action.points.length < 2) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    const start = action.points[0];
    const end = action.points[action.points.length - 1];

    if (!isFinite(start.x) || !isFinite(start.y) || !isFinite(end.x) || !isFinite(end.y)) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    const minX = Math.min(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxX = Math.max(start.x, end.x);
    const maxY = Math.max(start.y, end.y);

    return {
      x: minX,
      y: minY,
      width: Math.max(maxX - minX, 1),
      height: Math.max(maxY - minY, 1)
    };
  }

  /**
   * 计算多边形边界框
   * 多边形统一使用顶点列表格式，支持旋转
   */
  private calculatePolygonBounds(action: DrawAction): Bounds {
    // 多边形至少需要3个顶点
    if (action.points.length < 3) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const p of action.points) {
      if (!isFinite(p.x) || !isFinite(p.y)) continue;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }

    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    return {
      x: minX,
      y: minY,
      width: Math.max(maxX - minX, 1),
      height: Math.max(maxY - minY, 1)
    };
  }

  /**
   * 计算文字边界框
   */
  private calculateTextBounds(action: DrawAction): Bounds {
    const textAction = action as TextAction;
    const point = action.points[0];
    
    if (!point || !isFinite(point.x) || !isFinite(point.y)) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
    
    // 如果 TextAction 已经存储了宽高，直接使用
    if (textAction.width && textAction.height && textAction.width > 0 && textAction.height > 0) {
      return {
        x: point.x,
        y: point.y,
        width: textAction.width,
        height: textAction.height
      };
    }
    
    // 否则根据文本内容和字体大小估算
    const text = textAction.text || '';
    const fontSize = textAction.fontSize || 16;
    
    // 估算文本宽度：中文字符约等于 fontSize，英文字符约等于 fontSize * 0.6
    let estimatedWidth = 0;
    for (const char of text) {
      // 判断是否是中文字符（或其他宽字符）
      if (/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(char)) {
        estimatedWidth += fontSize;
      } else {
        estimatedWidth += fontSize * 0.6;
      }
    }
    
    // 最小宽度为一个字符宽度
    const width = Math.max(estimatedWidth, fontSize);
    const height = fontSize * 1.2; // 行高约为字体大小的 1.2 倍
    
    return {
      x: point.x,
      y: point.y,
      width,
      height
    };
  }

  /**
   * 计算通用边界框（使用所有点）
   */
  private calculateGenericBounds(action: DrawAction): Bounds {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let validPointCount = 0;

    for (const point of action.points) {
      if (!isFinite(point.x) || !isFinite(point.y)) {
        continue;
      }

      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
      validPointCount++;
    }

    if (validPointCount === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    const width = Math.max(0, maxX - minX);
    const height = Math.max(0, maxY - minY);

    return {
      x: minX,
      y: minY,
      width: width === 0 && height === 0 ? this.config.defaultSize : width,
      height: width === 0 && height === 0 ? this.config.defaultSize : height
    };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<BoundsCalculatorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取配置
   */
  getConfig(): BoundsCalculatorConfig {
    return { ...this.config };
  }
}

/**
 * 全局边界框计算器实例
 */
export const boundsCalculator = new BoundsCalculator();

