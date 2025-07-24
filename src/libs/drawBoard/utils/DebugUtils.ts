import { logger } from './Logger';

/**
 * 调试工具类
 * 
 * 提供统一的调试功能：
 * - 性能监控
 * - 内存使用监控
 * - 错误追踪
 * - 调试信息收集
 */
export class DebugUtils {
  private static instance: DebugUtils;
  private isEnabled: boolean = false;
  private performanceMarks: Map<string, number> = new Map();
  private memorySnapshots: Array<{ timestamp: number; memory: number }> = [];
  private errorCounts: Map<string, number> = new Map();
  private debugInfo: Map<string, unknown> = new Map();

  private constructor() {
    this.isEnabled = this.detectDebugMode();
  }

  public static getInstance(): DebugUtils {
    if (!DebugUtils.instance) {
      DebugUtils.instance = new DebugUtils();
    }
    return DebugUtils.instance;
  }

  /**
   * 检测是否启用调试模式
   */
  private detectDebugMode(): boolean {
    // 检查URL参数
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('debug') === 'true') {
        return true;
      }
      
      // 检查localStorage
      if (localStorage.getItem('drawboard_debug') === 'true') {
        return true;
      }
      
      // 检查开发环境
      if (window.location.hostname === 'localhost' || 
          window.location.hostname === '127.0.0.1') {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 启用/禁用调试模式
   */
  public setDebugMode(enabled: boolean): void {
    this.isEnabled = enabled;
    if (typeof window !== 'undefined') {
      localStorage.setItem('drawboard_debug', enabled.toString());
    }
    logger.info(`调试模式${enabled ? '启用' : '禁用'}`);
  }

  /**
   * 检查调试模式是否启用
   */
  public isDebugEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * 性能监控 - 开始计时
   */
  public startTimer(name: string): void {
    if (!this.isEnabled) return;
    
    this.performanceMarks.set(name, performance.now());
    logger.performance(`⏱️ 开始计时: ${name}`);
  }

  /**
   * 性能监控 - 结束计时
   */
  public endTimer(name: string): number {
    if (!this.isEnabled) return 0;
    
    const startTime = this.performanceMarks.get(name);
    if (!startTime) {
      logger.warn(`计时器 ${name} 未找到`);
      return 0;
    }
    
    const duration = performance.now() - startTime;
    this.performanceMarks.delete(name);
    
    logger.performance(`⏱️ 结束计时: ${name} - ${duration.toFixed(2)}ms`);
    return duration;
  }

  /**
   * 内存监控 - 记录内存快照
   */
  public recordMemorySnapshot(label?: string): void {
    if (!this.isEnabled) return;
    
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      const snapshot = {
        timestamp: Date.now(),
        memory: memory.usedJSHeapSize / 1024 / 1024 // MB
      };
      
      this.memorySnapshots.push(snapshot);
      
      // 保持最近100个快照
      if (this.memorySnapshots.length > 100) {
        this.memorySnapshots.shift();
      }
      
      logger.performance(`💾 内存快照${label ? ` (${label})` : ''}: ${snapshot.memory.toFixed(2)}MB`);
    }
  }

  /**
   * 错误追踪 - 记录错误
   */
  public recordError(errorType: string, error?: Error): void {
    if (!this.isEnabled) return;
    
    const count = this.errorCounts.get(errorType) || 0;
    this.errorCounts.set(errorType, count + 1);
    
    logger.error(`🚨 错误记录 [${errorType}]: ${count + 1}次`, error);
  }

  /**
   * 调试信息 - 设置调试信息
   */
  public setDebugInfo(key: string, value: unknown): void {
    if (!this.isEnabled) return;
    
    this.debugInfo.set(key, value);
    logger.debug(`🔧 调试信息设置: ${key} =`, value);
  }

  /**
   * 调试信息 - 获取调试信息
   */
  public getDebugInfo(key: string): unknown {
    return this.debugInfo.get(key);
  }

  /**
   * 调试信息 - 获取所有调试信息
   */
  public getAllDebugInfo(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    this.debugInfo.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  /**
   * 获取性能统计
   */
  public getPerformanceStats(): {
    memorySnapshots: Array<{ timestamp: number; memory: number }>;
    errorCounts: Record<string, number>;
    debugInfo: Record<string, unknown>;
  } {
    const errorCountsRecord: Record<string, number> = {};
    this.errorCounts.forEach((count, type) => {
      errorCountsRecord[type] = count;
    });

    return {
      memorySnapshots: [...this.memorySnapshots],
      errorCounts: errorCountsRecord,
      debugInfo: this.getAllDebugInfo()
    };
  }

  /**
   * 清理调试数据
   */
  public clear(): void {
    this.performanceMarks.clear();
    this.memorySnapshots = [];
    this.errorCounts.clear();
    this.debugInfo.clear();
    logger.debug('🧹 调试数据已清理');
  }

  /**
   * 销毁调试工具
   */
  public destroy(): void {
    this.clear();
    DebugUtils.instance = undefined as any;
    logger.info('🗑️ DebugUtils已销毁');
  }

  /**
   * 生成调试报告
   */
  public generateDebugReport(): string {
    if (!this.isEnabled) return '调试模式未启用';
    
    const stats = this.getPerformanceStats();
    const report = {
      timestamp: new Date().toISOString(),
      memorySnapshots: stats.memorySnapshots.length,
      errorCounts: stats.errorCounts,
      debugInfo: stats.debugInfo,
      totalMemory: stats.memorySnapshots.length > 0 
        ? stats.memorySnapshots[stats.memorySnapshots.length - 1].memory.toFixed(2) + 'MB'
        : 'N/A'
    };
    
    return JSON.stringify(report, null, 2);
  }
}

// 导出单例实例
export const debugUtils = DebugUtils.getInstance(); 