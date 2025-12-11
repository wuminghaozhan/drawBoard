import type { Bounds } from '../../utils/BoundsValidator';
import { logger } from '../logging/Logger';

/**
 * 脏矩形配置
 */
export interface DirtyRectConfig {
  /** 合并阈值：两个矩形距离小于此值时合并 */
  mergeThreshold: number;
  /** 最大脏矩形数量：超过此数量时触发全量重绘 */
  maxDirtyRects: number;
  /** 脏矩形扩展边距：为了确保边缘完全重绘 */
  padding: number;
  /** 最小脏矩形面积：小于此面积的变化忽略 */
  minArea: number;
  /** 全量重绘阈值：脏区域面积占比超过此值时使用全量重绘 */
  fullRedrawThreshold: number;
}

/**
 * 脏矩形统计信息
 */
export interface DirtyRectStats {
  /** 当前脏矩形数量 */
  dirtyRectCount: number;
  /** 脏区域总面积 */
  totalDirtyArea: number;
  /** 画布总面积 */
  canvasArea: number;
  /** 脏区域占比 */
  dirtyRatio: number;
  /** 是否需要全量重绘 */
  needsFullRedraw: boolean;
  /** 合并后的脏矩形数量 */
  mergedRectCount: number;
}

/**
 * 脏矩形管理器
 * 
 * 实现脏矩形算法，只重绘发生变化的区域，提升渲染性能。
 * 
 * 核心功能：
 * - 跟踪变化区域（脏矩形）
 * - 合并重叠/相邻的脏矩形
 * - 计算最优重绘区域
 * - 智能判断全量重绘 vs 局部重绘
 * 
 * @example
 * ```typescript
 * const dirtyManager = new DirtyRectManager(canvasWidth, canvasHeight);
 * 
 * // 标记变化区域
 * dirtyManager.markDirty({ x: 100, y: 100, width: 50, height: 50 });
 * 
 * // 获取合并后的脏区域
 * const dirtyRects = dirtyManager.getDirtyRects();
 * 
 * // 使用 clip 进行局部重绘
 * for (const rect of dirtyRects) {
 *   ctx.save();
 *   ctx.beginPath();
 *   ctx.rect(rect.x, rect.y, rect.width, rect.height);
 *   ctx.clip();
 *   // 重绘该区域内的元素
 *   ctx.restore();
 * }
 * 
 * // 清除脏标记
 * dirtyManager.clear();
 * ```
 */
export class DirtyRectManager {
  /** 画布宽度 */
  private canvasWidth: number;
  /** 画布高度 */
  private canvasHeight: number;
  /** 脏矩形集合 */
  private dirtyRects: Bounds[] = [];
  /** 配置 */
  private config: DirtyRectConfig;
  /** 是否强制全量重绘 */
  private forceFullRedraw: boolean = false;

  /** 默认配置 */
  private static readonly DEFAULT_CONFIG: DirtyRectConfig = {
    mergeThreshold: 20,      // 20px 内的矩形合并
    maxDirtyRects: 50,       // 超过 50 个脏矩形时全量重绘
    padding: 2,              // 2px 边距
    minArea: 4,              // 4px² 最小面积
    fullRedrawThreshold: 0.5 // 脏区域超过 50% 时全量重绘
  };

  constructor(
    canvasWidth: number,
    canvasHeight: number,
    config?: Partial<DirtyRectConfig>
  ) {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.config = { ...DirtyRectManager.DEFAULT_CONFIG, ...config };
  }

  /**
   * 更新画布尺寸
   */
  updateCanvasSize(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;
    // 尺寸变化时强制全量重绘
    this.forceFullRedraw = true;
  }

  /**
   * 标记脏区域
   * @param bounds 变化的边界框
   */
  markDirty(bounds: Bounds): void {
    // 验证边界
    if (!this.isValidBounds(bounds)) {
      return;
    }

    // 扩展边距
    const expandedBounds = this.expandBounds(bounds, this.config.padding);
    
    // 裁剪到画布范围
    const clippedBounds = this.clipToCanvas(expandedBounds);
    
    // 检查面积
    const area = clippedBounds.width * clippedBounds.height;
    if (area < this.config.minArea) {
      return;
    }

    // 添加到脏矩形列表
    this.dirtyRects.push(clippedBounds);

    // 检查是否超过最大数量
    if (this.dirtyRects.length > this.config.maxDirtyRects) {
      logger.debug('脏矩形数量超限，切换到全量重绘', {
        count: this.dirtyRects.length,
        max: this.config.maxDirtyRects
      });
      this.forceFullRedraw = true;
    }
  }

  /**
   * 根据两个边界框标记脏区域（适用于移动场景）
   * @param oldBounds 旧边界框
   * @param newBounds 新边界框
   */
  markDirtyFromMove(oldBounds: Bounds, newBounds: Bounds): void {
    // 标记旧位置
    this.markDirty(oldBounds);
    // 标记新位置
    this.markDirty(newBounds);
  }

  /**
   * 根据点集合计算并标记脏区域
   * @param points 点集合
   * @param lineWidth 线宽（用于扩展边界）
   */
  markDirtyFromPoints(
    points: Array<{ x: number; y: number }>,
    lineWidth: number = 2
  ): void {
    if (points.length === 0) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const point of points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }

    // 扩展线宽
    const halfWidth = lineWidth / 2;
    const bounds: Bounds = {
      x: minX - halfWidth,
      y: minY - halfWidth,
      width: maxX - minX + lineWidth,
      height: maxY - minY + lineWidth
    };

    this.markDirty(bounds);
  }

  /**
   * 强制全量重绘
   */
  markFullRedraw(): void {
    this.forceFullRedraw = true;
  }

  /**
   * 检查是否需要全量重绘
   */
  needsFullRedraw(): boolean {
    if (this.forceFullRedraw) {
      return true;
    }

    if (this.dirtyRects.length === 0) {
      return false;
    }

    // 计算脏区域占比
    const stats = this.getStats();
    return stats.dirtyRatio > this.config.fullRedrawThreshold;
  }

  /**
   * 获取合并后的脏矩形列表
   */
  getDirtyRects(): Bounds[] {
    if (this.forceFullRedraw) {
      return [{
        x: 0,
        y: 0,
        width: this.canvasWidth,
        height: this.canvasHeight
      }];
    }

    if (this.dirtyRects.length === 0) {
      return [];
    }

    // 合并重叠/相邻的矩形
    return this.mergeRects(this.dirtyRects);
  }

  /**
   * 获取单个合并后的脏矩形（所有脏区域的并集）
   */
  getMergedDirtyRect(): Bounds | null {
    if (this.forceFullRedraw) {
      return {
        x: 0,
        y: 0,
        width: this.canvasWidth,
        height: this.canvasHeight
      };
    }

    if (this.dirtyRects.length === 0) {
      return null;
    }

    return this.unionAll(this.dirtyRects);
  }

  /**
   * 清除所有脏标记
   */
  clear(): void {
    this.dirtyRects = [];
    this.forceFullRedraw = false;
  }

  /**
   * 检查是否有脏区域
   */
  hasDirtyRects(): boolean {
    return this.forceFullRedraw || this.dirtyRects.length > 0;
  }

  /**
   * 获取统计信息
   */
  getStats(): DirtyRectStats {
    const canvasArea = this.canvasWidth * this.canvasHeight;
    
    if (this.forceFullRedraw) {
      return {
        dirtyRectCount: 1,
        totalDirtyArea: canvasArea,
        canvasArea,
        dirtyRatio: 1,
        needsFullRedraw: true,
        mergedRectCount: 1
      };
    }

    const mergedRects = this.mergeRects(this.dirtyRects);
    let totalDirtyArea = 0;
    
    for (const rect of mergedRects) {
      totalDirtyArea += rect.width * rect.height;
    }

    const dirtyRatio = canvasArea > 0 ? totalDirtyArea / canvasArea : 0;

    return {
      dirtyRectCount: this.dirtyRects.length,
      totalDirtyArea,
      canvasArea,
      dirtyRatio,
      needsFullRedraw: dirtyRatio > this.config.fullRedrawThreshold,
      mergedRectCount: mergedRects.length
    };
  }

  /**
   * 使用脏矩形进行裁剪重绘
   * @param ctx Canvas 上下文
   * @param drawFn 绘制函数
   */
  async clipAndRedraw(
    ctx: CanvasRenderingContext2D,
    drawFn: (ctx: CanvasRenderingContext2D, clipRect: Bounds) => Promise<void>
  ): Promise<void> {
    const dirtyRects = this.getDirtyRects();
    
    if (dirtyRects.length === 0) {
      return;
    }

    // 如果只有一个覆盖全画布的脏矩形，直接全量重绘
    if (this.needsFullRedraw()) {
      ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
      await drawFn(ctx, {
        x: 0,
        y: 0,
        width: this.canvasWidth,
        height: this.canvasHeight
      });
      return;
    }

    // 局部重绘
    for (const rect of dirtyRects) {
      ctx.save();
      
      // 清除脏区域
      ctx.clearRect(rect.x, rect.y, rect.width, rect.height);
      
      // 设置裁剪区域
      ctx.beginPath();
      ctx.rect(rect.x, rect.y, rect.width, rect.height);
      ctx.clip();
      
      // 执行绘制
      await drawFn(ctx, rect);
      
      ctx.restore();
    }

    logger.debug('脏矩形局部重绘完成', {
      rectCount: dirtyRects.length,
      stats: this.getStats()
    });
  }

  // ============================================
  // 私有方法
  // ============================================

  /**
   * 验证边界有效性
   */
  private isValidBounds(bounds: Bounds): boolean {
    return (
      isFinite(bounds.x) &&
      isFinite(bounds.y) &&
      isFinite(bounds.width) &&
      isFinite(bounds.height) &&
      bounds.width > 0 &&
      bounds.height > 0
    );
  }

  /**
   * 扩展边界
   */
  private expandBounds(bounds: Bounds, padding: number): Bounds {
    return {
      x: bounds.x - padding,
      y: bounds.y - padding,
      width: bounds.width + padding * 2,
      height: bounds.height + padding * 2
    };
  }

  /**
   * 裁剪到画布范围
   */
  private clipToCanvas(bounds: Bounds): Bounds {
    const x = Math.max(0, bounds.x);
    const y = Math.max(0, bounds.y);
    const right = Math.min(this.canvasWidth, bounds.x + bounds.width);
    const bottom = Math.min(this.canvasHeight, bounds.y + bounds.height);

    return {
      x,
      y,
      width: Math.max(0, right - x),
      height: Math.max(0, bottom - y)
    };
  }

  /**
   * 合并矩形列表
   */
  private mergeRects(rects: Bounds[]): Bounds[] {
    if (rects.length <= 1) {
      return [...rects];
    }

    // 复制数组以避免修改原始数据
    const remaining = [...rects];
    const merged: Bounds[] = [];

    while (remaining.length > 0) {
      let current = remaining.pop()!;
      let changed = true;

      while (changed) {
        changed = false;

        for (let i = remaining.length - 1; i >= 0; i--) {
          const other = remaining[i];

          // 检查是否应该合并
          if (this.shouldMerge(current, other)) {
            current = this.unionRects(current, other);
            remaining.splice(i, 1);
            changed = true;
          }
        }
      }

      merged.push(current);
    }

    return merged;
  }

  /**
   * 判断两个矩形是否应该合并
   */
  private shouldMerge(a: Bounds, b: Bounds): boolean {
    // 检查是否重叠
    if (this.intersects(a, b)) {
      return true;
    }

    // 检查是否足够接近
    const gap = this.getGap(a, b);
    return gap <= this.config.mergeThreshold;
  }

  /**
   * 检查两个矩形是否相交
   */
  private intersects(a: Bounds, b: Bounds): boolean {
    return !(
      a.x + a.width < b.x ||
      b.x + b.width < a.x ||
      a.y + a.height < b.y ||
      b.y + b.height < a.y
    );
  }

  /**
   * 计算两个矩形之间的间隙
   */
  private getGap(a: Bounds, b: Bounds): number {
    const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width));
    const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height));
    return Math.max(dx, dy);
  }

  /**
   * 合并两个矩形
   */
  private unionRects(a: Bounds, b: Bounds): Bounds {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const right = Math.max(a.x + a.width, b.x + b.width);
    const bottom = Math.max(a.y + a.height, b.y + b.height);

    return {
      x,
      y,
      width: right - x,
      height: bottom - y
    };
  }

  /**
   * 合并所有矩形
   */
  private unionAll(rects: Bounds[]): Bounds {
    if (rects.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    let result = rects[0];
    for (let i = 1; i < rects.length; i++) {
      result = this.unionRects(result, rects[i]);
    }
    return result;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<DirtyRectConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取当前配置
   */
  getConfig(): DirtyRectConfig {
    return { ...this.config };
  }

  // ============================================
  // 调试可视化功能
  // ============================================

  /** 是否启用调试模式 */
  private debugEnabled: boolean = false;
  /** 调试样式配置 */
  private debugStyle = {
    dirtyRectColor: 'rgba(255, 0, 0, 0.3)',
    dirtyRectBorderColor: 'rgba(255, 0, 0, 0.8)',
    mergedRectColor: 'rgba(0, 255, 0, 0.2)',
    mergedRectBorderColor: 'rgba(0, 255, 0, 0.8)',
    fullRedrawColor: 'rgba(255, 165, 0, 0.2)',
    fullRedrawBorderColor: 'rgba(255, 165, 0, 0.8)',
    textColor: '#ffffff',
    textBgColor: 'rgba(0, 0, 0, 0.7)',
    fontSize: 12
  };

  /**
   * 启用调试模式
   * @param enabled 是否启用
   */
  setDebugEnabled(enabled: boolean): void {
    this.debugEnabled = enabled;
    logger.info(`DirtyRectManager 调试模式: ${enabled ? '开启' : '关闭'}`);
  }

  /**
   * 获取调试模式状态
   */
  isDebugEnabled(): boolean {
    return this.debugEnabled;
  }

  /**
   * 设置调试样式
   */
  setDebugStyle(style: Partial<typeof this.debugStyle>): void {
    this.debugStyle = { ...this.debugStyle, ...style };
  }

  /**
   * 绘制调试可视化
   * 在画布上显示脏矩形区域、合并后的区域和统计信息
   * 
   * @param ctx Canvas 上下文
   * @param options 可视化选项
   */
  drawDebugOverlay(
    ctx: CanvasRenderingContext2D,
    options: {
      showOriginalRects?: boolean;  // 显示原始脏矩形
      showMergedRects?: boolean;    // 显示合并后的矩形
      showStats?: boolean;          // 显示统计信息
      showLabels?: boolean;         // 显示区域标签
    } = {}
  ): void {
    if (!this.debugEnabled) return;

    const {
      showOriginalRects = true,
      showMergedRects = true,
      showStats = true,
      showLabels = true
    } = options;

    ctx.save();

    // 1. 绘制原始脏矩形（红色半透明）
    if (showOriginalRects) {
      for (let i = 0; i < this.dirtyRects.length; i++) {
        const rect = this.dirtyRects[i];
        
        // 填充
        ctx.fillStyle = this.debugStyle.dirtyRectColor;
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        
        // 边框
        ctx.strokeStyle = this.debugStyle.dirtyRectBorderColor;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
        
        // 标签
        if (showLabels) {
          this.drawLabel(ctx, `D${i + 1}`, rect.x + 2, rect.y + 2);
        }
      }
    }

    // 2. 绘制合并后的矩形（绿色半透明）
    if (showMergedRects) {
      const mergedRects = this.mergeRects(this.dirtyRects);
      
      for (let i = 0; i < mergedRects.length; i++) {
        const rect = mergedRects[i];
        
        // 如果是全量重绘，使用橙色
        const isFullRedraw = this.forceFullRedraw || (
          rect.x === 0 && rect.y === 0 &&
          rect.width === this.canvasWidth && rect.height === this.canvasHeight
        );
        
        // 填充
        ctx.fillStyle = isFullRedraw
          ? this.debugStyle.fullRedrawColor
          : this.debugStyle.mergedRectColor;
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        
        // 边框
        ctx.strokeStyle = isFullRedraw
          ? this.debugStyle.fullRedrawBorderColor
          : this.debugStyle.mergedRectBorderColor;
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
        
        // 标签
        if (showLabels) {
          const label = isFullRedraw ? 'FULL' : `M${i + 1}`;
          this.drawLabel(ctx, label, rect.x + rect.width - 40, rect.y + 2);
        }
      }
    }

    // 3. 绘制统计信息面板
    if (showStats) {
      this.drawStatsPanel(ctx);
    }

    ctx.restore();
  }

  /**
   * 绘制标签
   */
  private drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
    ctx.font = `${this.debugStyle.fontSize}px monospace`;
    const metrics = ctx.measureText(text);
    const padding = 3;
    const height = this.debugStyle.fontSize + padding * 2;
    const width = metrics.width + padding * 2;

    // 背景
    ctx.fillStyle = this.debugStyle.textBgColor;
    ctx.fillRect(x, y, width, height);

    // 文字
    ctx.fillStyle = this.debugStyle.textColor;
    ctx.textBaseline = 'top';
    ctx.fillText(text, x + padding, y + padding);
  }

  /**
   * 绘制统计信息面板
   */
  private drawStatsPanel(ctx: CanvasRenderingContext2D): void {
    const stats = this.getStats();
    const padding = 10;
    const lineHeight = 18;
    const panelWidth = 220;
    const panelHeight = lineHeight * 8 + padding * 2;
    const panelX = this.canvasWidth - panelWidth - padding;
    const panelY = padding;

    // 面板背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
    
    // 边框
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);

    // 标题
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = '#00ff00';
    ctx.textBaseline = 'top';
    ctx.fillText('🔲 Dirty Rect Debug', panelX + padding, panelY + padding);

    // 统计信息
    ctx.font = '12px monospace';
    ctx.fillStyle = '#ffffff';
    
    const lines = [
      `原始脏矩形: ${stats.dirtyRectCount}`,
      `合并后矩形: ${stats.mergedRectCount}`,
      `脏区域面积: ${stats.totalDirtyArea.toLocaleString()} px²`,
      `画布面积: ${stats.canvasArea.toLocaleString()} px²`,
      `脏区域占比: ${(stats.dirtyRatio * 100).toFixed(1)}%`,
      `全量重绘: ${stats.needsFullRedraw ? '是 ⚠️' : '否 ✅'}`,
      `阈值: ${(this.config.fullRedrawThreshold * 100).toFixed(0)}%`
    ];

    let y = panelY + padding + lineHeight;
    for (const line of lines) {
      ctx.fillText(line, panelX + padding, y);
      y += lineHeight;
    }
  }

  /**
   * 创建调试控制器（用于开发者工具集成）
   * 返回一个可以挂载到 window 的调试对象
   */
  createDebugController(): DirtyRectDebugController {
    return {
      enable: () => this.setDebugEnabled(true),
      disable: () => this.setDebugEnabled(false),
      toggle: () => this.setDebugEnabled(!this.debugEnabled),
      isEnabled: () => this.debugEnabled,
      getStats: () => this.getStats(),
      getDirtyRects: () => [...this.dirtyRects],
      getMergedRects: () => this.getDirtyRects(),
      getConfig: () => this.getConfig(),
      updateConfig: (config: Partial<DirtyRectConfig>) => this.updateConfig(config),
      setStyle: (style: Partial<typeof this.debugStyle>) => this.setDebugStyle(style),
      clear: () => this.clear(),
      markFullRedraw: () => this.markFullRedraw(),
      markDirty: (rect: Bounds) => this.markDirty(rect)
    };
  }
}

/**
 * 脏矩形调试控制器接口
 * 可以挂载到 window 对象用于开发者工具
 */
export interface DirtyRectDebugController {
  enable: () => void;
  disable: () => void;
  toggle: () => void;
  isEnabled: () => boolean;
  getStats: () => DirtyRectStats;
  getDirtyRects: () => Bounds[];
  getMergedRects: () => Bounds[];
  getConfig: () => DirtyRectConfig;
  updateConfig: (config: Partial<DirtyRectConfig>) => void;
  setStyle: (style: Record<string, string | number>) => void;
  clear: () => void;
  markFullRedraw: () => void;
  markDirty: (rect: Bounds) => void;
}

