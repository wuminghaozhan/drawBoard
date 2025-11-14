/**
 * 日志级别枚举
 */
export const LogLevel = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
} as const;

export type LogLevel = typeof LogLevel[keyof typeof LogLevel];

/**
 * 日志管理器
 * 
 * 提供统一的日志记录功能，支持：
 * - 不同级别的日志
 * - 环境检测（开发/生产）
 * - 性能优化（生产环境禁用调试日志）
 * - 错误处理集成
 */
export class Logger {
  private static instance: Logger;
  private currentLevel: LogLevel = LogLevel.INFO;
  private isDevelopment: boolean = false;
  private isProduction: boolean = false;
  private errorHandler?: unknown; // 避免循环依赖

  private constructor() {
    // 检测环境
    this.isDevelopment = typeof window !== 'undefined' && 
                        (window.location.hostname === 'localhost' || 
                         window.location.hostname === '127.0.0.1' ||
                         window.location.hostname.includes('localhost'));
    this.isProduction = typeof window !== 'undefined' && 
                       !this.isDevelopment && 
                       !window.location.hostname.includes('dev');
    
    // 开发环境启用DEBUG级别，方便调试
    if (this.isDevelopment) {
      this.currentLevel = LogLevel.DEBUG;
    } else {
      // 生产环境只显示错误和警告
      this.currentLevel = LogLevel.WARN;
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
   * 设置错误处理器引用（避免循环依赖）
   */
  public setErrorHandler(errorHandler: any): void {
    this.errorHandler = errorHandler;
  }

  /**
   * 错误日志
   */
  public error(message: string, ...args: unknown[]): void {
    if (this.currentLevel >= LogLevel.ERROR) {
      console.error(`[ERROR] ${message}`, ...args);
      
      // 如果有错误处理器，尝试记录错误
      if (this.errorHandler && args[0] instanceof Error) {
        try {
          (this.errorHandler as any).recordError(args[0] as Error);
        } catch (e) {
          // 避免错误处理器本身出错导致无限循环
          console.error('Error handler failed:', e);
        }
      }
    }
  }

  /**
   * 警告日志
   */
  public warn(message: string, ...args: unknown[]): void {
    if (this.currentLevel >= LogLevel.WARN) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }

  /**
   * 信息日志
   */
  public info(message: string, ...args: unknown[]): void {
    if (this.currentLevel >= LogLevel.INFO) {
      console.info(`[INFO] ${message}`, ...args);
    }
  }

  /**
   * 调试日志（仅在开发环境显示）
   */
  public debug(message: string, ...args: unknown[]): void {
    if (this.isDevelopment && this.currentLevel >= LogLevel.DEBUG) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  }

  /**
   * 性能日志（仅在开发环境显示）
   */
  public performance(message: string, ...args: unknown[]): void {
    if (this.isDevelopment && this.currentLevel >= LogLevel.DEBUG) {
      console.log(`[PERF] ${message}`, ...args);
    }
  }

  /**
   * 安全日志（始终记录，但格式不同）
   */
  public security(message: string, ...args: unknown[]): void {
    console.warn(`[SECURITY] ${message}`, ...args);
  }

  /**
   * 销毁日志管理器
   */
  public destroy(): void {
    this.errorHandler = undefined;
    Logger.instance = undefined as any;
  }

  /**
   * 获取环境信息
   */
  public getEnvironmentInfo(): {
    isDevelopment: boolean;
    isProduction: boolean;
    currentLevel: LogLevel;
  } {
    return {
      isDevelopment: this.isDevelopment,
      isProduction: this.isProduction,
      currentLevel: this.currentLevel
    };
  }
}

// 导出单例实例
export const logger = Logger.getInstance(); 