/**
 * 日志级别定义
 */
export const LogLevel = {
  DEBUG: 0,
  INFO: 1, 
  WARN: 2,
  ERROR: 3
} as const;

export type LogLevel = typeof LogLevel[keyof typeof LogLevel];

/**
 * 日志管理器
 * 支持分级日志和环境检测
 */
export class Logger {
  private static instance: Logger;
  private currentLevel: LogLevel = LogLevel.DEBUG;
  private isDevelopment: boolean = typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  private constructor() {
    // 生产环境默认关闭调试日志
    if (!this.isDevelopment) {
      this.currentLevel = LogLevel.ERROR;
    } else {
      // 开发环境启用DEBUG级别，方便调试
      this.currentLevel = LogLevel.DEBUG;
    }
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * 设置日志级别
   */
  public setLevel(level: LogLevel): void {
    this.currentLevel = level;
  }

  /**
   * 获取当前日志级别
   */
  public getLevel(): LogLevel {
    return this.currentLevel;
  }

  /**
   * 调试日志
   */
  public debug(message: string, ...args: any[]): void {
    if (this.currentLevel <= LogLevel.DEBUG) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  }

  /**
   * 信息日志
   */
  public info(message: string, ...args: any[]): void {
    if (this.currentLevel <= LogLevel.INFO) {
      console.info(`[INFO] ${message}`, ...args);
    }
  }

  /**
   * 警告日志
   */
  public warn(message: string, ...args: any[]): void {
    if (this.currentLevel <= LogLevel.WARN) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }

  /**
   * 错误日志
   */
  public error(message: string, ...args: any[]): void {
    if (this.currentLevel <= LogLevel.ERROR) {
      console.error(`[ERROR] ${message}`, ...args);
    }
  }

  /**
   * 性能日志（仅开发环境）
   */
  public perf(message: string, ...args: any[]): void {
    if (this.isDevelopment && this.currentLevel <= LogLevel.DEBUG) {
      console.log(`[PERF] ${message}`, ...args);
    }
  }

  /**
   * 绘制相关日志（可单独控制）
   */
  public draw(message: string, ...args: any[]): void {
    if (this.isDevelopment && this.currentLevel <= LogLevel.DEBUG) {
      console.log(`[DRAW] ${message}`, ...args);
    }
  }
}

// 导出单例实例
export const logger = Logger.getInstance(); 