import type { DrawAction } from '../tools/DrawTool';
import { logger } from '../infrastructure/logging/Logger';
import { ConfigConstants } from '../config/Constants';

/**
 * 历史管理器接口
 * 定义复杂度管理器对历史管理器的依赖接口
 */
interface IHistoryManager {
  /** 获取所有历史动作 */
  getAllActions(): DrawAction[];
  /** 获取历史动作数量 */
  getHistoryCount(): number;
}

/**
 * 性能管理器接口
 * 定义复杂度管理器对性能管理器的依赖接口
 */
interface IPerformanceManager {
  /** 获取内存统计信息 */
  getMemoryStats(): { cacheHitRate: number; underMemoryPressure: boolean };
  /** 更新性能配置 */
  updateConfig(config: { complexityThreshold: number }): void;
  /** 获取总绘制调用次数 */
  getTotalDrawCalls(): number;
}

/**
 * 复杂度管理器
 * 
 * 负责：
 * - 计算和缓存绘制动作的复杂度
 * - 提供复杂度评估策略
 * - 管理复杂度阈值和策略
 * - 智能触发复杂度重新计算
 * 
 * 复杂度计算基于：
 * - 点数量（基础复杂度）
 * - 工具类型（不同工具有不同复杂度）
 * - 绘制上下文（线宽、颜色等）
 * - 特殊属性（文本、选择状态等）
 * 
 * @example
 * ```typescript
 * const complexityManager = new ComplexityManager({
 *   baseThreshold: 30,
 *   cacheSize: 1000
 * });
 * 
 * // 设置依赖
 * complexityManager.setDependencies(historyManager, performanceManager);
 * 
 * // 计算单个动作复杂度
 * const complexity = complexityManager.calculateActionComplexity(action);
 * 
 * // 重新计算所有复杂度
 * const stats = complexityManager.recalculateAllComplexities();
 * ```
 */
export interface ComplexityConfig {
  /** 基础复杂度阈值 - 超过此值才启用缓存 */
  baseThreshold: number;
  /** 是否启用智能复杂度计算 - 支持动态调整策略 */
  enableIntelligentCalculation: boolean;
  /** 复杂度缓存大小 - LRU缓存的最大条目数 */
  cacheSize: number;
  /** 重新计算触发条件 - 控制何时自动重新计算复杂度 */
  recalculationTriggers: {
    /** 历史动作数量阈值 - 每累积多少个动作触发重新计算 */
    historyCountThreshold: number;
    /** 缓存命中率阈值 - 命中率低于此值时触发重新计算 */
    cacheHitRateThreshold: number;
    /** 内存压力阈值 - 内存使用率超过此值时触发重新计算 */
    memoryPressureThreshold: number;
  };
}

/**
 * 复杂度统计信息接口
 * 提供复杂度计算的详细统计数据和分布信息
 */
export interface ComplexityStats {
  /** 总复杂度 - 所有动作的复杂度总和 */
  totalComplexity: number;
  /** 平均复杂度 - 所有动作的平均复杂度 */
  averageComplexity: number;
  /** 最高复杂度 - 单个动作的最高复杂度 */
  maxComplexity: number;
  /** 最低复杂度 - 单个动作的最低复杂度 */
  minComplexity: number;
  /** 复杂度分布 - 按复杂度等级统计动作数量 */
  distribution: {
    low: number;    // 0-20: 简单动作
    medium: number; // 21-50: 中等复杂度动作
    high: number;   // 51+: 高复杂度动作
  };
  /** 重新计算次数 - 累计重新计算的次数 */
  recalculationCount: number;
  /** 最后重新计算时间 - 最后一次重新计算的时间戳 */
  lastRecalculationTime: number;
}

/**
 * 复杂度管理器实现类
 * 
 * 核心功能：
 * 1. 智能复杂度计算 - 基于多个因素综合评估
 * 2. 缓存管理 - LRU缓存机制提升性能
 * 3. 自动触发 - 根据性能指标自动重新计算
 * 4. 统计分析 - 提供详细的复杂度统计信息
 */
export class ComplexityManager {
  /** 复杂度配置 */
  private config: ComplexityConfig;
  /** 复杂度缓存 - 存储已计算的复杂度值 */
  private complexityCache: Map<string, number> = new Map();
  /** 统计信息 */
  private stats: ComplexityStats;
  /** 历史管理器依赖 */
  private historyManager?: IHistoryManager;
  /** 性能管理器依赖 */
  private performanceManager?: IPerformanceManager;

  /**
   * 默认配置
   * 提供合理的默认值，确保系统正常运行
   */
  private static readonly DEFAULT_CONFIG: ComplexityConfig = {
    baseThreshold: ConfigConstants.COMPLEXITY.BASE_THRESHOLD,
    enableIntelligentCalculation: true,
    cacheSize: ConfigConstants.COMPLEXITY.CACHE_SIZE,
    recalculationTriggers: {
      historyCountThreshold: ConfigConstants.COMPLEXITY.HISTORY_COUNT_THRESHOLD,
      cacheHitRateThreshold: ConfigConstants.COMPLEXITY.CACHE_HIT_RATE_THRESHOLD,
      memoryPressureThreshold: ConfigConstants.COMPLEXITY.MEMORY_PRESSURE_THRESHOLD
    }
  };

  /**
   * 构造函数
   * @param config 可选的配置参数，会与默认配置合并
   */
  constructor(config: Partial<ComplexityConfig> = {}) {
    this.config = { ...ComplexityManager.DEFAULT_CONFIG, ...config };
    this.stats = this.initializeStats();
  }

  /**
   * 设置依赖管理器
   * 必须在其他操作之前调用，确保管理器正常工作
   * 
   * @param historyManager 历史管理器 - 提供动作数据
   * @param performanceManager 性能管理器 - 提供性能指标
   */
  public setDependencies(historyManager: IHistoryManager, performanceManager: IPerformanceManager): void {
    this.historyManager = historyManager;
    this.performanceManager = performanceManager;
  }

  /**
   * 计算单个动作的复杂度
   * 
   * 复杂度计算策略：
   * 1. 基础复杂度：基于点数量
   * 2. 工具复杂度：不同工具有不同基础复杂度
   * 3. 上下文复杂度：线宽、颜色等影响
   * 4. 特殊属性复杂度：文本、选择状态等
   * 
   * @param action 要计算复杂度的绘制动作
   * @returns 复杂度评分（数值越大越复杂）
   */
  public calculateActionComplexity(action: DrawAction): number {
    // 检查缓存 - 避免重复计算
    if (this.complexityCache.has(action.id)) {
      return this.complexityCache.get(action.id)!;
    }

    let complexity = 0;

    // 基础复杂度：点数量（点越多越复杂）
    complexity += action.points.length * ConfigConstants.COMPLEXITY.POINTS_FACTOR;

    // 工具类型复杂度（不同工具有不同复杂度）
    complexity += this.getToolTypeComplexity(action.type);

    // 上下文复杂度（线宽、颜色等影响）
    complexity += this.getContextComplexity(action.context);

    // 特殊属性复杂度（文本、选择状态等）
    complexity += this.getSpecialAttributesComplexity(action);

    const finalComplexity = Math.round(complexity);

    // 缓存结果 - 提升后续计算性能
    this.cacheComplexity(action.id, finalComplexity);

    return finalComplexity;
  }

  /**
   * 重新计算所有动作的复杂度
   * 
   * 执行流程：
   * 1. 清空缓存，确保重新计算
   * 2. 遍历所有历史动作
   * 3. 重新计算每个动作的复杂度
   * 4. 更新统计信息
   * 5. 通知性能管理器更新阈值
   * 
   * @returns 更新后的复杂度统计信息
   */
  public recalculateAllComplexities(): ComplexityStats {
    logger.info('🔄 开始重新计算所有绘制动作的复杂度...');

    // 检查依赖是否设置
    if (!this.historyManager) {
      logger.warn('HistoryManager未设置，无法重新计算复杂度');
      return this.stats;
    }

    const allActions = this.historyManager.getAllActions();
    let totalComplexity = 0;
    let maxComplexity = 0;
    let minComplexity = Infinity;
    const distribution = { low: 0, medium: 0, high: 0 };

    // 清空缓存 - 确保重新计算
    this.complexityCache.clear();

    // 重新计算每个动作
    allActions.forEach(action => {
      // 清除旧的复杂度评分
      if (action.complexityScore !== undefined) {
        delete action.complexityScore;
      }

      // 计算新的复杂度
      const complexity = this.calculateActionComplexity(action);
      action.complexityScore = complexity;

      // 累计统计
      totalComplexity += complexity;
      maxComplexity = Math.max(maxComplexity, complexity);
      minComplexity = Math.min(minComplexity, complexity);

      // 统计分布
      if (complexity <= ConfigConstants.COMPLEXITY.DISTRIBUTION.LOW_MAX) distribution.low++;
      else if (complexity <= ConfigConstants.COMPLEXITY.DISTRIBUTION.MEDIUM_MAX) distribution.medium++;
      else distribution.high++;
    });

    // 更新统计信息
    this.stats = {
      totalComplexity,
      averageComplexity: allActions.length > 0 ? totalComplexity / allActions.length : 0,
      maxComplexity: maxComplexity === Infinity ? 0 : maxComplexity,
      minComplexity: minComplexity === Infinity ? 0 : minComplexity,
      distribution,
      recalculationCount: this.stats.recalculationCount + 1,
      lastRecalculationTime: Date.now()
    };

    // 通知性能管理器更新配置
    if (this.performanceManager) {
      // 根据平均复杂度动态调整阈值
      const newThreshold = Math.max(10, Math.floor(this.stats.averageComplexity));
      this.performanceManager.updateConfig({
        complexityThreshold: newThreshold
      });
      logger.info(`📊 更新复杂度阈值: ${newThreshold}`);
    }

    logger.info(`✅ 复杂度重新计算完成: ${allActions.length} 个动作, 总复杂度: ${totalComplexity}, 平均: ${this.stats.averageComplexity.toFixed(1)}`);

    return this.stats;
  }

  /**
   * 检查是否需要重新计算复杂度
   * 
   * 触发条件：
   * 1. 历史动作累积到阈值
   * 2. 缓存命中率过低
   * 3. 内存压力大
   * 
   * @returns 是否需要重新计算
   */
  public shouldRecalculate(): boolean {
    if (!this.historyManager || !this.performanceManager) {
      return false;
    }

    const historyCount = this.historyManager.getHistoryCount();
    const performanceStats = this.performanceManager.getMemoryStats();

    // 条件1: 历史动作累积到阈值
    if (historyCount > 0 && historyCount % this.config.recalculationTriggers.historyCountThreshold === 0) {
      logger.debug(`📊 历史动作达到${historyCount}个，触发复杂度重新计算`);
      return true;
    }

    // 条件2: 缓存命中率过低
    if (performanceStats.cacheHitRate < this.config.recalculationTriggers.cacheHitRateThreshold && 
        this.performanceManager.getTotalDrawCalls() > ConfigConstants.COMPLEXITY.MIN_DRAW_CALLS_FOR_HIT_RATE) {
      logger.debug(`📊 缓存命中率过低(${(performanceStats.cacheHitRate * 100).toFixed(1)}%)，触发复杂度重新计算`);
      return true;
    }

    // 条件3: 内存压力大
    if (performanceStats.underMemoryPressure) {
      logger.debug(`📊 检测到内存压力，触发复杂度重新计算`);
      return true;
    }

    return false;
  }

  /**
   * 获取复杂度统计信息
   * @returns 当前统计信息的副本
   */
  public getStats(): ComplexityStats {
    return { ...this.stats };
  }

  /**
   * 更新配置
   * @param newConfig 新的配置参数
   */
  public updateConfig(newConfig: Partial<ComplexityConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * 清理缓存
   * 释放内存，强制下次计算时重新计算
   */
  public clearCache(): void {
    this.complexityCache.clear();
    logger.debug('复杂度缓存已清理');
  }

  /**
   * 销毁复杂度管理器，清理所有资源
   * 
   * 清理内容：
   * - 复杂度缓存
   * - 统计信息重置
   * - 依赖引用清理
   */
  public destroy(): void {
    // 清理复杂度缓存
    this.complexityCache.clear();
    
    // 重置统计信息
    this.stats = this.initializeStats();
    
    // 清理依赖引用
    this.historyManager = undefined;
    this.performanceManager = undefined;
    
    logger.info('🗑️ ComplexityManager destroyed');
  }

  // ============================================
  // 私有方法
  // ============================================

  /**
   * 初始化统计信息
   * @returns 初始化的统计信息对象
   */
  private initializeStats(): ComplexityStats {
    return {
      totalComplexity: 0,
      averageComplexity: 0,
      maxComplexity: 0,
      minComplexity: 0,
      distribution: { low: 0, medium: 0, high: 0 },
      recalculationCount: 0,
      lastRecalculationTime: 0
    };
  }

  /**
   * 获取工具类型复杂度
   * 
   * 不同工具的复杂度评分（参见 ConfigConstants.COMPLEXITY.TOOL_COMPLEXITY）
   * 
   * @param toolType 工具类型
   * @returns 工具基础复杂度
   */
  private getToolTypeComplexity(toolType: string): number {
    const toolComplexity = ConfigConstants.COMPLEXITY.TOOL_COMPLEXITY;
    return toolComplexity[toolType] ?? toolComplexity.default;
  }

  /**
   * 获取上下文复杂度
   * 
   * 上下文因素：
   * - 线宽：越粗的线越复杂
   * - 颜色：非黑色增加复杂度
   * 
   * @param context 绘制上下文
   * @returns 上下文复杂度
   */
  private getContextComplexity(context: DrawAction['context']): number {
    const contextConfig = ConfigConstants.COMPLEXITY.CONTEXT;
    let complexity = 0;
    
    // 线宽影响 - 粗线更复杂
    complexity += context.lineWidth * contextConfig.LINE_WIDTH_FACTOR;
    
    // 样式影响 - 非黑色增加复杂度
    if (context.strokeStyle && context.strokeStyle !== '#000000') {
      complexity += contextConfig.NON_BLACK_COLOR_BONUS;
    }
    
    return complexity;
  }

  /**
   * 获取特殊属性复杂度
   * 
   * 特殊属性：
   * - 文本内容：文本渲染复杂
   * - 选择状态：选择框渲染
   * - 缓存支持：不支持缓存的动作更复杂
   * 
   * @param action 绘制动作
   * @returns 特殊属性复杂度
   */
  private getSpecialAttributesComplexity(action: DrawAction): number {
    const attrConfig = ConfigConstants.COMPLEXITY.SPECIAL_ATTRIBUTES;
    let complexity = 0;
    
    // 特殊属性检查
    if (action.text) complexity += attrConfig.TEXT_BONUS;
    if (action.selected) complexity += attrConfig.SELECTED_BONUS;
    if (action.supportsCaching === false) complexity += attrConfig.NO_CACHE_BONUS;
    
    return complexity;
  }

  /**
   * 缓存复杂度值
   * 
   * 使用LRU（最近最少使用）策略：
   * - 当缓存满时，删除最早添加的条目
   * - 确保缓存大小不超过限制
   * 
   * @param actionId 动作ID
   * @param complexity 复杂度值
   */
  private cacheComplexity(actionId: string, complexity: number): void {
    // LRU缓存管理
    if (this.complexityCache.size >= this.config.cacheSize) {
      // 获取第一个键（最早插入的）
      const keysIterator = this.complexityCache.keys();
      const firstEntry = keysIterator.next();
      
      // 安全删除第一个条目
      if (!firstEntry.done && firstEntry.value) {
        this.complexityCache.delete(firstEntry.value);
      }
    }
    
    this.complexityCache.set(actionId, complexity);
  }
} 