/**
 * 锚点缓存管理器
 * 负责管理选择工具的锚点缓存，优化性能
 * 
 * 从 SelectTool 中提取，提高代码可维护性和可测试性
 */

import type { AnchorPoint } from '../anchor/AnchorTypes';
import type { DrawAction } from '../DrawTool';
import { logger } from '../../infrastructure/logging/Logger';

/**
 * 锚点缓存数据结构
 */
export interface AnchorCacheData {
  /** 缓存键（基于 action IDs 和内容指纹） */
  cacheKey: string;
  /** 选中的 action IDs */
  actionIds: string[];
  /** 边界框 */
  bounds: { x: number; y: number; width: number; height: number } | null;
  /** 边锚点数组 */
  anchors: AnchorPoint[];
  /** 中心锚点 */
  centerAnchor: AnchorPoint | null;
  /** 移动区域 */
  moveArea: { x: number; y: number; width: number; height: number } | null;
  /** 缓存时间戳 */
  timestamp: number;
}

/**
 * 锚点缓存配置
 */
export interface AnchorCacheConfig {
  /** 缓存 TTL（毫秒） */
  cacheTTL: number;
  /** 节流间隔（毫秒） */
  throttleInterval: number;
}

const DEFAULT_CONFIG: AnchorCacheConfig = {
  cacheTTL: 100,
  throttleInterval: 16 // ~60fps
};

/**
 * 锚点缓存管理器
 */
export class AnchorCacheManager {
  private cache: AnchorCacheData | null = null;
  private lastUpdateTime: number = 0;
  private config: AnchorCacheConfig;

  constructor(config?: Partial<AnchorCacheConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 更新配置
   */
  public updateConfig(config: Partial<AnchorCacheConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 生成缓存键
   * 包含 action IDs 和内容指纹（第一个/最后一个点坐标）
   */
  public generateCacheKey(actions: DrawAction[]): string {
    const actionIds = actions.map(a => a.id).sort();
    const contentFingerprint = actions.map(a => {
      if (a.points.length === 0) return `${a.id}:empty`;
      const first = a.points[0];
      const last = a.points[a.points.length - 1];
      // 使用四舍五入减少浮点精度问题
      return `${a.id}:${Math.round(first.x)},${Math.round(first.y)},${Math.round(last.x)},${Math.round(last.y)},${a.points.length}`;
    }).join('|');
    
    return `${actionIds.join(',')}_${contentFingerprint}`;
  }

  /**
   * 检查缓存是否有效
   */
  public isCacheValid(cacheKey: string, isDragging: boolean = false): boolean {
    // 拖拽时不使用缓存
    if (isDragging) {
      return false;
    }

    if (!this.cache) {
      return false;
    }

    // 检查缓存键是否匹配
    if (this.cache.cacheKey !== cacheKey) {
      return false;
    }

    // 检查缓存是否过期
    const now = Date.now();
    if (now - this.cache.timestamp > this.config.cacheTTL) {
      return false;
    }

    return true;
  }

  /**
   * 检查是否应该节流（跳过更新）
   */
  public shouldThrottle(isDragging: boolean = false): boolean {
    // 拖拽时不节流
    if (isDragging) {
      return false;
    }

    const now = Date.now();
    return now - this.lastUpdateTime < this.config.throttleInterval;
  }

  /**
   * 获取缓存数据
   */
  public getCache(): AnchorCacheData | null {
    return this.cache;
  }

  /**
   * 设置缓存数据
   */
  public setCache(data: Omit<AnchorCacheData, 'timestamp'>): void {
    const now = Date.now();
    
    // 深拷贝数据，避免引用问题
    this.cache = {
      cacheKey: data.cacheKey,
      actionIds: [...data.actionIds],
      bounds: data.bounds ? { ...data.bounds } : null,
      anchors: data.anchors.map(a => ({ ...a })),
      centerAnchor: data.centerAnchor ? { ...data.centerAnchor } : null,
      moveArea: data.moveArea ? { ...data.moveArea } : null,
      timestamp: now
    };

    this.lastUpdateTime = now;

    logger.debug('AnchorCacheManager: 缓存已更新', {
      cacheKey: data.cacheKey,
      anchorsCount: data.anchors.length,
      hasCenterAnchor: !!data.centerAnchor
    });
  }

  /**
   * 清除缓存
   */
  public clearCache(): void {
    this.cache = null;
    this.lastUpdateTime = 0;
    logger.debug('AnchorCacheManager: 缓存已清除');
  }

  /**
   * 从缓存中获取锚点数据
   */
  public getAnchorsFromCache(): {
    anchors: AnchorPoint[];
    centerAnchor: AnchorPoint | null;
    moveArea: { x: number; y: number; width: number; height: number } | null;
  } | null {
    if (!this.cache) {
      return null;
    }

    return {
      anchors: [...this.cache.anchors],
      centerAnchor: this.cache.centerAnchor ? { ...this.cache.centerAnchor } : null,
      moveArea: this.cache.moveArea ? { ...this.cache.moveArea } : null
    };
  }

  /**
   * 获取配置
   */
  public getConfig(): AnchorCacheConfig {
    return { ...this.config };
  }
}

