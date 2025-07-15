/**
 * 日志级别枚举
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  OFF = 4
}

/**
 * 日志管理器 - 用于控制调试日志的输出
 * 
 * 支持按环境和级别控制日志输出，避免生产环境的性能损耗
 */
export class Logger {
  private static instance: Logger;
  private currentLevel: LogLevel = LogLevel.INFO;
  private isDevelopment: boolean = process.env.NODE_ENV === 'development';

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