import type { DrawAction } from '../DrawTool';
import type { Point } from '../../core/CanvasEngine';
import type { ShapeAnchorHandler, AnchorPoint, AnchorType, Bounds } from '../anchor/AnchorTypes';
import { logger } from '../../infrastructure/logging/Logger';

// 重新导出类型以保持向后兼容
export type { AnchorType, Bounds, AnchorPoint } from '../anchor/AnchorTypes';

/**
 * 锚点生成配置
 */
export interface AnchorGeneratorConfig {
  anchorSize: number;
  anchorTolerance: number;
  enableRotateAnchor: boolean;
  enableCenterAnchor: boolean;
}

/**
 * 锚点生成结果
 */
export interface AnchorGeneratorResult {
  anchors: AnchorPoint[];
  centerAnchor: AnchorPoint | null;
  moveArea: Bounds | null;
}

/**
 * 旋转锚点配置
 */
export interface RotateAnchorConfig {
  /** 旋转锚点距离边界的偏移量 */
  offset: number;
  /** 旋转锚点与边界的连接线长度 */
  lineLength: number;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: AnchorGeneratorConfig = {
  anchorSize: 8,
  anchorTolerance: 6,
  enableRotateAnchor: true, // 默认启用旋转锚点
  enableCenterAnchor: true
};

/**
 * 默认旋转锚点配置
 */
const DEFAULT_ROTATE_CONFIG: RotateAnchorConfig = {
  offset: 25,    // 距离顶部边界 25px
  lineLength: 20 // 连接线长度 20px
};

/**
 * 锚点生成器
 * 
 * 负责生成各种类型的锚点（缩放、旋转、移动等）
 */
export class AnchorGenerator {
  private config: AnchorGeneratorConfig;
  private shapeHandlers: Map<string, ShapeAnchorHandler>;

  constructor(
    config: Partial<AnchorGeneratorConfig> = {},
    shapeHandlers?: Map<string, ShapeAnchorHandler>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.shapeHandlers = shapeHandlers || new Map();
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<AnchorGeneratorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 设置形状处理器
   */
  setShapeHandlers(handlers: Map<string, ShapeAnchorHandler>): void {
    this.shapeHandlers = handlers;
  }

  /**
   * 为选中的 Actions 生成锚点
   */
  generateAnchors(
    selectedActions: DrawAction[],
    bounds: Bounds | null
  ): AnchorGeneratorResult {
    if (!bounds || selectedActions.length === 0) {
      return {
        anchors: [],
        centerAnchor: null,
        moveArea: null
      };
    }

    // 单选时使用形状特定锚点，多选使用通用锚点
    if (selectedActions.length === 1) {
      return this.generateSingleSelectionAnchors(selectedActions[0], bounds);
    } else {
      return this.generateMultiSelectionAnchors(selectedActions, bounds);
    }
  }

  /**
   * 生成单选锚点（使用形状特定处理器）
   */
  private generateSingleSelectionAnchors(
    action: DrawAction,
    bounds: Bounds
  ): AnchorGeneratorResult {
    const handler = this.shapeHandlers.get(action.type);
    
    if (handler) {
      // 使用形状特定的锚点处理器
      const anchors = handler.generateAnchors(action, bounds);
      const centerAnchor = this.config.enableCenterAnchor 
        ? this.createCenterAnchor(bounds) 
        : null;
      
      return {
        anchors,
        centerAnchor,
        moveArea: bounds
      };
    }

    // 没有特定处理器，使用默认锚点
    return this.generateDefaultAnchors(bounds);
  }

  /**
   * 生成多选锚点
   */
  private generateMultiSelectionAnchors(
    _actions: DrawAction[],
    bounds: Bounds
  ): AnchorGeneratorResult {
    const anchors: AnchorPoint[] = [];
    const { x, y, width, height } = bounds;

    // 四个角的锚点
    anchors.push(
      { x, y, type: 'resize-nw', cursor: 'nwse-resize' },
      { x: x + width, y, type: 'resize-ne', cursor: 'nesw-resize' },
      { x, y: y + height, type: 'resize-sw', cursor: 'nesw-resize' },
      { x: x + width, y: y + height, type: 'resize-se', cursor: 'nwse-resize' }
    );

    // 四条边中点的锚点
    anchors.push(
      { x: x + width / 2, y, type: 'resize-n', cursor: 'ns-resize' },
      { x: x + width / 2, y: y + height, type: 'resize-s', cursor: 'ns-resize' },
      { x, y: y + height / 2, type: 'resize-w', cursor: 'ew-resize' },
      { x: x + width, y: y + height / 2, type: 'resize-e', cursor: 'ew-resize' }
    );

    // 旋转锚点（在顶部中心上方）
    if (this.config.enableRotateAnchor) {
      anchors.push(this.createRotateAnchor(bounds));
    }

    // 中心锚点
    const centerAnchor = this.config.enableCenterAnchor 
      ? this.createCenterAnchor(bounds) 
      : null;

    return {
      anchors,
      centerAnchor,
      moveArea: bounds
    };
  }

  /**
   * 生成默认锚点（8个缩放锚点 + 可选的旋转锚点）
   */
  private generateDefaultAnchors(bounds: Bounds): AnchorGeneratorResult {
    const anchors: AnchorPoint[] = [];
    const { x, y, width, height } = bounds;

    // 四个角的锚点
    anchors.push(
      { x, y, type: 'resize-nw', cursor: 'nwse-resize' },
      { x: x + width, y, type: 'resize-ne', cursor: 'nesw-resize' },
      { x, y: y + height, type: 'resize-sw', cursor: 'nesw-resize' },
      { x: x + width, y: y + height, type: 'resize-se', cursor: 'nwse-resize' }
    );

    // 四条边中点的锚点
    anchors.push(
      { x: x + width / 2, y, type: 'resize-n', cursor: 'ns-resize' },
      { x: x + width / 2, y: y + height, type: 'resize-s', cursor: 'ns-resize' },
      { x, y: y + height / 2, type: 'resize-w', cursor: 'ew-resize' },
      { x: x + width, y: y + height / 2, type: 'resize-e', cursor: 'ew-resize' }
    );

    // 可选的旋转锚点（在顶部中心上方）
    if (this.config.enableRotateAnchor) {
      anchors.push(this.createRotateAnchor(bounds));
    }

    // 中心锚点
    const centerAnchor = this.config.enableCenterAnchor 
      ? this.createCenterAnchor(bounds) 
      : null;

    return {
      anchors,
      centerAnchor,
      moveArea: bounds
    };
  }

  /**
   * 创建中心锚点
   */
  private createCenterAnchor(bounds: Bounds): AnchorPoint {
    return {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
      type: 'center',
      cursor: 'move'
    };
  }

  /**
   * 创建旋转锚点
   * 旋转锚点位于边界框顶部中心上方
   */
  private createRotateAnchor(bounds: Bounds): AnchorPoint {
    const { offset } = DEFAULT_ROTATE_CONFIG;
    return {
      x: bounds.x + bounds.width / 2,
      y: bounds.y - offset,
      type: 'rotate',
      cursor: 'grab'
    };
  }

  /**
   * 获取旋转锚点的连接线端点
   * 用于 SelectionRenderer 绘制旋转手柄连接线
   */
  getRotateAnchorLine(bounds: Bounds): { start: Point; end: Point } | null {
    if (!this.config.enableRotateAnchor) return null;
    
    const { offset, lineLength } = DEFAULT_ROTATE_CONFIG;
    const centerX = bounds.x + bounds.width / 2;
    
    return {
      start: { x: centerX, y: bounds.y },
      end: { x: centerX, y: bounds.y - lineLength }
    };
  }

  /**
   * 判断是否为旋转锚点
   */
  static isRotateAnchor(anchorType: AnchorType): boolean {
    return anchorType === 'rotate';
  }

  /**
   * 查找指定位置的锚点
   */
  findAnchorAt(
    point: Point,
    anchors: AnchorPoint[],
    centerAnchor: AnchorPoint | null
  ): { index: number; anchor: AnchorPoint; isCenter: boolean } | null {
    const tolerance = this.config.anchorTolerance + this.config.anchorSize / 2;

    // 先检查中心锚点
    if (centerAnchor) {
      const dist = Math.sqrt(
        Math.pow(point.x - centerAnchor.x, 2) + 
        Math.pow(point.y - centerAnchor.y, 2)
      );
      if (dist <= tolerance) {
        return { index: -1, anchor: centerAnchor, isCenter: true };
      }
    }

    // 检查其他锚点
    for (let i = 0; i < anchors.length; i++) {
      const anchor = anchors[i];
      const dist = Math.sqrt(
        Math.pow(point.x - anchor.x, 2) + 
        Math.pow(point.y - anchor.y, 2)
      );
      if (dist <= tolerance) {
        return { index: i, anchor, isCenter: false };
      }
    }

    return null;
  }

  /**
   * 判断点是否在移动区域内
   */
  isPointInMoveArea(point: Point, moveArea: Bounds | null): boolean {
    if (!moveArea) {
      return false;
    }

    return (
      point.x >= moveArea.x &&
      point.x <= moveArea.x + moveArea.width &&
      point.y >= moveArea.y &&
      point.y <= moveArea.y + moveArea.height
    );
  }

  /**
   * 根据锚点类型计算新边界
   */
  calculateNewBoundsForAnchor(
    originalBounds: Bounds,
    anchorType: AnchorType,
    deltaX: number,
    deltaY: number,
    aspectRatio?: number
  ): Bounds {
    let { x, y, width, height } = originalBounds;
    const minSize = 10;

    switch (anchorType) {
      case 'resize-nw':
        x += deltaX;
        y += deltaY;
        width -= deltaX;
        height -= deltaY;
        break;
      case 'resize-ne':
        y += deltaY;
        width += deltaX;
        height -= deltaY;
        break;
      case 'resize-sw':
        x += deltaX;
        width -= deltaX;
        height += deltaY;
        break;
      case 'resize-se':
        width += deltaX;
        height += deltaY;
        break;
      case 'resize-n':
        y += deltaY;
        height -= deltaY;
        break;
      case 'resize-s':
        height += deltaY;
        break;
      case 'resize-w':
        x += deltaX;
        width -= deltaX;
        break;
      case 'resize-e':
        width += deltaX;
        break;
      default:
        break;
    }

    // 保持宽高比（如果指定）
    if (aspectRatio && aspectRatio > 0) {
      const isCorner = anchorType.includes('nw') || anchorType.includes('ne') ||
                       anchorType.includes('sw') || anchorType.includes('se');
      if (isCorner) {
        const newHeight = width / aspectRatio;
        if (anchorType.includes('n')) {
          y += height - newHeight;
        }
        height = newHeight;
      }
    }

    // 确保最小尺寸
    if (width < minSize) {
      if (anchorType.includes('w')) {
        x -= minSize - width;
      }
      width = minSize;
    }
    if (height < minSize) {
      if (anchorType.includes('n')) {
        y -= minSize - height;
      }
      height = minSize;
    }

    return { x, y, width, height };
  }

  /**
   * 获取锚点的光标样式
   */
  getCursorForAnchor(anchorType: AnchorType): string {
    const cursorMap: Partial<Record<AnchorType, string>> = {
      // 功能描述型锚点
      'resize-nw': 'nwse-resize',
      'resize-n': 'ns-resize',
      'resize-ne': 'nesw-resize',
      'resize-w': 'ew-resize',
      'resize-e': 'ew-resize',
      'resize-sw': 'nesw-resize',
      'resize-s': 'ns-resize',
      'resize-se': 'nwse-resize',
      'rotate': 'grab',
      'move': 'move',
      'center': 'move',
      'custom': 'pointer',
      // 位置描述型锚点
      'top-left': 'nwse-resize',
      'top': 'ns-resize',
      'top-right': 'nesw-resize',
      'left': 'ew-resize',
      'right': 'ew-resize',
      'bottom-left': 'nesw-resize',
      'bottom': 'ns-resize',
      'bottom-right': 'nwse-resize',
      'start': 'pointer',
      'end': 'pointer',
      'vertex': 'crosshair',
      'key-point': 'pointer'
    };

    return cursorMap[anchorType] || 'default';
  }

  /**
   * 获取当前配置
   */
  getConfig(): AnchorGeneratorConfig {
    return { ...this.config };
  }
}

