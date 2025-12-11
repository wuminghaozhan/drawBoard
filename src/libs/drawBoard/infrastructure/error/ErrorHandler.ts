import { logger } from '../logging/Logger';

/**
 * DrawBoard错误代码枚举
 */
export const DrawBoardErrorCode = {
  // 初始化相关错误
  INITIALIZATION_FAILED: 'INIT_FAILED',
  CONTAINER_NOT_FOUND: 'CONTAINER_NOT_FOUND',
  CANVAS_CREATION_FAILED: 'CANVAS_CREATION_FAILED',
  
  // Canvas相关错误
  CANVAS_ERROR: 'CANVAS_ERROR',
  CONTEXT_2D_FAILED: 'CONTEXT_2D_FAILED',
  LAYER_CREATION_FAILED: 'LAYER_CREATION_FAILED',
  
  // 工具相关错误
  TOOL_ERROR: 'TOOL_ERROR',
  TOOL_NOT_FOUND: 'TOOL_NOT_FOUND',
  TOOL_LOADING_FAILED: 'TOOL_LOADING_FAILED',
  TOOL_INITIALIZATION_FAILED: 'TOOL_INIT_FAILED',
  
  // 内存相关错误
  MEMORY_ERROR: 'MEMORY_ERROR',
  MEMORY_LIMIT_EXCEEDED: 'MEMORY_LIMIT_EXCEEDED',
  CACHE_CREATION_FAILED: 'CACHE_CREATION_FAILED',
  
  // 渲染相关错误
  RENDERING_ERROR: 'RENDERING_ERROR',
  DRAW_ACTION_FAILED: 'DRAW_ACTION_FAILED',
  REDRAW_FAILED: 'REDRAW_FAILED',
  
  // 事件相关错误
  EVENT_ERROR: 'EVENT_ERROR',
  EVENT_BINDING_FAILED: 'EVENT_BINDING_FAILED',
  EVENT_HANDLER_FAILED: 'EVENT_HANDLER_FAILED',
  
  // 历史记录相关错误
  HISTORY_ERROR: 'HISTORY_ERROR',
  UNDO_FAILED: 'UNDO_FAILED',
  REDO_FAILED: 'REDO_FAILED',
  
  // 导出相关错误
  EXPORT_ERROR: 'EXPORT_ERROR',
  IMAGE_EXPORT_FAILED: 'IMAGE_EXPORT_FAILED',
  CLIPBOARD_COPY_FAILED: 'CLIPBOARD_COPY_FAILED',
  
  // 资源管理相关错误
  RESOURCE_ERROR: 'RESOURCE_ERROR',
  RESOURCE_DESTROY_FAILED: 'RESOURCE_DESTROY_FAILED',
  RESOURCE_LEAK_DETECTED: 'RESOURCE_LEAK_DETECTED',
  
  // 未知错误
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
} as const;

/**
 * DrawBoard错误代码类型
 */
export type DrawBoardErrorCode = typeof DrawBoardErrorCode[keyof typeof DrawBoardErrorCode];

/**
 * DrawBoard自定义错误类
 */
export class DrawBoardError extends Error {
  public readonly code: DrawBoardErrorCode;
  public readonly context?: any;
  public readonly recoverable: boolean;
  public readonly timestamp: number;
  public readonly stack?: string;

  constructor(
    code: DrawBoardErrorCode,
    message: string,
    context?: any,
    recoverable: boolean = true
  ) {
    super(message);
    this.name = 'DrawBoardError';
    this.code = code;
    this.context = context;
    this.recoverable = recoverable;
    this.timestamp = Date.now();
    
    // 确保stack trace正确
    if ((Error as any).captureStackTrace) {
      (Error as any).captureStackTrace(this, DrawBoardError);
    }
  }

  /**
   * 创建错误实例的静态方法
   */
  static create(
    code: DrawBoardErrorCode,
    message: string,
    context?: any,
    recoverable: boolean = true
  ): DrawBoardError {
    return new DrawBoardError(code, message, context, recoverable);
  }

  /**
   * 从其他错误创建DrawBoardError
   */
  static fromError(
    error: Error,
    code: DrawBoardErrorCode = DrawBoardErrorCode.UNKNOWN_ERROR,
    context?: any,
    recoverable: boolean = true
  ): DrawBoardError {
    return new DrawBoardError(
      code,
      error.message,
      { originalError: error, ...context },
      recoverable
    );
  }

  /**
   * 获取错误的详细信息
   */
  getDetails(): {
    code: DrawBoardErrorCode;
    message: string;
    context?: any;
    recoverable: boolean;
    timestamp: number;
    stack?: string;
  } {
    return {
      code: this.code,
      message: this.message,
      context: this.context,
      recoverable: this.recoverable,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

/**
 * 错误恢复策略
 */
export interface ErrorRecoveryStrategy {
  /** 错误代码 */
  code: DrawBoardErrorCode;
  /** 恢复函数 */
  recovery: (error: DrawBoardError) => Promise<boolean>;
  /** 优先级（数字越小优先级越高） */
  priority: number;
}

/**
 * 统一错误处理器
 */
export class ErrorHandler {
  private static instance: ErrorHandler;
  private errorCallbacks: Map<DrawBoardErrorCode, ((error: DrawBoardError) => void)[]> = new Map();
  private recoveryStrategies: ErrorRecoveryStrategy[] = [];
  private errorHistory: DrawBoardError[] = [];
  private maxErrorHistory: number = 100;
  private isHandling: boolean = false;

  private constructor() {}

  public static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  /**
   * 处理错误
   */
  public async handle(error: DrawBoardError): Promise<void> {
    if (this.isHandling) {
      logger.warn('错误处理器正在处理其他错误，跳过:', error.code);
      return;
    }

    this.isHandling = true;

    try {
      // 记录错误
      this.recordError(error);
      
      // 记录到日志
      logger.error(`[${error.code}] ${error.message}`, {
        context: error.context,
        recoverable: error.recoverable,
        timestamp: error.timestamp
      });

      // 通知订阅者
      await this.notifySubscribers(error);

      // 尝试恢复
      if (error.recoverable) {
        await this.attemptRecovery(error);
      }

      // 记录不可恢复的错误
      if (!error.recoverable) {
        logger.error('遇到不可恢复的错误:', error.getDetails());
      }

    } catch (handlingError) {
      logger.error('错误处理过程中发生异常:', handlingError);
    } finally {
      this.isHandling = false;
    }
  }

  /**
   * 注册错误回调
   */
  public onError(code: DrawBoardErrorCode, callback: (error: DrawBoardError) => void): () => void {
    if (!this.errorCallbacks.has(code)) {
      this.errorCallbacks.set(code, []);
    }
    
    this.errorCallbacks.get(code)!.push(callback);
    
    // 返回取消订阅函数
    return () => {
      const callbacks = this.errorCallbacks.get(code);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    };
  }

  /**
   * 注册恢复策略
   */
  public registerRecoveryStrategy(strategy: ErrorRecoveryStrategy): void {
    this.recoveryStrategies.push(strategy);
    // 按优先级排序
    this.recoveryStrategies.sort((a, b) => a.priority - b.priority);
  }

  /**
   * 记录错误到历史
   */
  private recordError(error: DrawBoardError): void {
    this.errorHistory.push(error);
    
    // 限制历史记录数量
    if (this.errorHistory.length > this.maxErrorHistory) {
      this.errorHistory.shift();
    }
  }

  /**
   * 通知订阅者
   */
  private async notifySubscribers(error: DrawBoardError): Promise<void> {
    const callbacks = this.errorCallbacks.get(error.code) || [];
    const allCallbacks = this.errorCallbacks.get(DrawBoardErrorCode.UNKNOWN_ERROR) || [];
    
    const allHandlers = [...callbacks, ...allCallbacks];
    
    // 并行执行所有回调
    await Promise.allSettled(
      allHandlers.map(async (callback) => {
        try {
          await callback(error);
        } catch (callbackError) {
          logger.error('错误回调执行失败:', callbackError);
        }
      })
    );
  }

  /**
   * 尝试恢复
   */
  private async attemptRecovery(error: DrawBoardError): Promise<void> {
    const strategies = this.recoveryStrategies.filter(s => s.code === error.code);
    
    for (const strategy of strategies) {
      try {
        logger.debug(`尝试恢复策略: ${strategy.code} (优先级: ${strategy.priority})`);
        
        const recovered = await strategy.recovery(error);
        if (recovered) {
          logger.info(`错误恢复成功: ${error.code}`);
          return;
        }
      } catch (recoveryError) {
        logger.error(`恢复策略执行失败: ${strategy.code}`, recoveryError);
      }
    }
    
    logger.warn(`无法恢复错误: ${error.code}`);
  }

  /**
   * 获取错误历史
   */
  public getErrorHistory(): DrawBoardError[] {
    return [...this.errorHistory];
  }

  /**
   * 获取特定类型的错误历史
   */
  public getErrorsByCode(code: DrawBoardErrorCode): DrawBoardError[] {
    return this.errorHistory.filter(error => error.code === code);
  }

  /**
   * 清空错误历史
   */
  public clearErrorHistory(): void {
    this.errorHistory = [];
  }

  /**
   * 获取错误统计
   */
  public getErrorStats(): {
    total: number;
    byCode: Record<DrawBoardErrorCode, number>;
    recoverable: number;
    nonRecoverable: number;
  } {
    const byCode: Record<DrawBoardErrorCode, number> = {} as any;
    let recoverable = 0;
    let nonRecoverable = 0;

    this.errorHistory.forEach(error => {
      byCode[error.code] = (byCode[error.code] || 0) + 1;
      if (error.recoverable) {
        recoverable++;
      } else {
        nonRecoverable++;
      }
    });

    return {
      total: this.errorHistory.length,
      byCode,
      recoverable,
      nonRecoverable
    };
  }

  /**
   * 销毁错误处理器
   */
  public destroy(): void {
    this.errorCallbacks.clear();
    this.recoveryStrategies = [];
    this.errorHistory = [];
    this.isHandling = false;
  }
}

/**
 * 预定义的恢复策略
 */
export const DefaultRecoveryStrategies: ErrorRecoveryStrategy[] = [
  // 工具加载失败恢复策略
  {
    code: DrawBoardErrorCode.TOOL_LOADING_FAILED,
    priority: 1,
    recovery: async (_error: DrawBoardError) => {
      logger.info('尝试使用基础工具作为恢复策略');
      // 这里可以尝试加载基础工具作为备选
      return true;
    }
  },
  
  // 内存错误恢复策略
  {
    code: DrawBoardErrorCode.MEMORY_LIMIT_EXCEEDED,
    priority: 2,
    recovery: async (_error: DrawBoardError) => {
      logger.info('尝试清理缓存以恢复内存');
      // 这里可以触发缓存清理
      return true;
    }
  },
  
  // Canvas错误恢复策略
  {
    code: DrawBoardErrorCode.CANVAS_ERROR,
    priority: 3,
    recovery: async (_error: DrawBoardError) => {
      logger.info('尝试重新创建Canvas');
      // 这里可以尝试重新创建Canvas
      return true;
    }
  }
];

// 注册默认恢复策略
DefaultRecoveryStrategies.forEach(strategy => {
  ErrorHandler.getInstance().registerRecoveryStrategy(strategy);
}); 