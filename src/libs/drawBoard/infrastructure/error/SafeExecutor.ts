import { logger } from '../logging/Logger';

/**
 * 安全执行工具
 * 提供统一的错误处理和降级策略
 */
export class SafeExecutor {
  /**
   * 安全执行同步函数
   * @param fn 要执行的函数
   * @param fallback 失败时的降级值
   * @param errorMessage 错误消息（可选）
   * @returns 执行结果或降级值
   */
  static execute<T>(
    fn: () => T,
    fallback: T,
    errorMessage?: string
  ): T {
    try {
      return fn();
    } catch (error) {
      logger.error(errorMessage || '执行失败', error);
      return fallback;
    }
  }
  
  /**
   * 安全执行异步函数
   * @param fn 要执行的异步函数
   * @param fallback 失败时的降级值
   * @param errorMessage 错误消息（可选）
   * @returns 执行结果或降级值
   */
  static async executeAsync<T>(
    fn: () => Promise<T>,
    fallback: T,
    errorMessage?: string
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      logger.error(errorMessage || '异步执行失败', error);
      return fallback;
    }
  }
  
  /**
   * 安全执行函数，返回结果和错误状态
   * @param fn 要执行的函数
   * @param fallback 失败时的降级值
   * @param errorMessage 错误消息（可选）
   * @returns 包含结果和错误状态的对象
   */
  static executeWithStatus<T>(
    fn: () => T,
    fallback: T,
    errorMessage?: string
  ): { result: T; success: boolean; error?: Error } {
    try {
      const result = fn();
      return { result, success: true };
    } catch (error) {
      logger.error(errorMessage || '执行失败', error);
      return {
        result: fallback,
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }
  
  /**
   * 安全执行异步函数，返回结果和错误状态
   * @param fn 要执行的异步函数
   * @param fallback 失败时的降级值
   * @param errorMessage 错误消息（可选）
   * @returns 包含结果和错误状态的对象
   */
  static async executeAsyncWithStatus<T>(
    fn: () => Promise<T>,
    fallback: T,
    errorMessage?: string
  ): Promise<{ result: T; success: boolean; error?: Error }> {
    try {
      const result = await fn();
      return { result, success: true };
    } catch (error) {
      logger.error(errorMessage || '异步执行失败', error);
      return {
        result: fallback,
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }
  
  /**
   * 重试执行函数
   * @param fn 要执行的函数
   * @param maxRetries 最大重试次数
   * @param delay 重试延迟（毫秒）
   * @param fallback 失败时的降级值
   * @param errorMessage 错误消息（可选）
   * @returns 执行结果或降级值
   */
  static async retry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000,
    fallback: T,
    errorMessage?: string
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < maxRetries) {
          logger.warn(`执行失败，${delay}ms后重试 (${attempt + 1}/${maxRetries})`, lastError);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          logger.error(errorMessage || `执行失败，已重试${maxRetries}次`, lastError);
        }
      }
    }
    
    return fallback;
  }
  
  /**
   * 批量安全执行
   * @param tasks 任务数组
   * @param fallback 失败时的降级值
   * @param stopOnError 遇到错误是否停止（默认false）
   * @returns 执行结果数组
   */
  static executeBatch<T>(
    tasks: Array<() => T>,
    fallback: T,
    stopOnError: boolean = false
  ): T[] {
    const results: T[] = [];
    
    for (const task of tasks) {
      const { result, success } = SafeExecutor.executeWithStatus(task, fallback);
      results.push(result);
      
      if (!success && stopOnError) {
        break;
      }
    }
    
    return results;
  }
  
  /**
   * 批量安全执行异步任务
   * @param tasks 异步任务数组
   * @param fallback 失败时的降级值
   * @param stopOnError 遇到错误是否停止（默认false）
   * @returns 执行结果数组
   */
  static async executeBatchAsync<T>(
    tasks: Array<() => Promise<T>>,
    fallback: T,
    stopOnError: boolean = false
  ): Promise<T[]> {
    const results: T[] = [];
    
    for (const task of tasks) {
      const { result, success } = await SafeExecutor.executeAsyncWithStatus(task, fallback);
      results.push(result);
      
      if (!success && stopOnError) {
        break;
      }
    }
    
    return results;
  }
}

