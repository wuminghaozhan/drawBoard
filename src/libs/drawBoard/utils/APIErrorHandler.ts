import { DrawBoardError, type DrawBoardErrorCode as DrawBoardErrorCodeType } from './ErrorHandler';
import { ErrorHandler } from './ErrorHandler';
import { logger } from './Logger';

/**
 * API 错误处理包装器
 * 
 * 为 API 模块提供统一的错误处理机制，包括：
 * - 错误捕获和转换
 * - 错误日志记录
 * - 错误恢复策略
 * 
 * @example
 * ```typescript
 * const result = await APIErrorHandler.execute(
 *   () => someAsyncOperation(),
 *   DrawBoardErrorCode.TOOL_ERROR,
 *   { operation: 'setTool', toolType: 'pen' }
 * );
 * ```
 */
export class APIErrorHandler {
  /**
   * 执行异步操作并处理错误
   * @param operation 要执行的操作
   * @param errorCode 错误代码
   * @param context 错误上下文
   * @returns 操作结果
   */
  static async execute<T>(
    operation: () => Promise<T>,
    errorCode: DrawBoardErrorCodeType,
    context?: any
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const drawBoardError = DrawBoardError.fromError(
        error as Error,
        errorCode,
        context
      );
      
      // 记录错误
      logger.error(`API操作失败 [${errorCode}]`, {
        context,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // 使用统一错误处理器
      await ErrorHandler.getInstance().handle(drawBoardError);
      
      // 重新抛出错误，让调用方决定如何处理
      throw drawBoardError;
    }
  }

  /**
   * 执行同步操作并处理错误
   * @param operation 要执行的操作
   * @param errorCode 错误代码
   * @param context 错误上下文
   * @returns 操作结果
   */
  static executeSync<T>(
    operation: () => T,
    errorCode: DrawBoardErrorCodeType,
    context?: any
  ): T {
    try {
      return operation();
    } catch (error) {
      const drawBoardError = DrawBoardError.fromError(
        error as Error,
        errorCode,
        context
      );
      
      // 记录错误
      logger.error(`API操作失败 [${errorCode}]`, {
        context,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // 使用统一错误处理器（异步，但不等待）
      ErrorHandler.getInstance().handle(drawBoardError).catch(err => {
        logger.error('错误处理失败', err);
      });
      
      // 重新抛出错误，让调用方决定如何处理
      throw drawBoardError;
    }
  }

  /**
   * 执行操作并返回结果和状态
   * @param operation 要执行的操作
   * @param errorCode 错误代码
   * @param context 错误上下文
   * @returns 包含结果和状态的对象
   */
  static async executeWithStatus<T>(
    operation: () => Promise<T>,
    errorCode: DrawBoardErrorCodeType,
    context?: any
  ): Promise<{ success: boolean; result?: T; error?: DrawBoardError }> {
    try {
      const result = await operation();
      return { success: true, result };
    } catch (error) {
      const drawBoardError = DrawBoardError.fromError(
        error as Error,
        errorCode,
        context
      );
      
      logger.error(`API操作失败 [${errorCode}]`, {
        context,
        error: error instanceof Error ? error.message : String(error)
      });
      
      await ErrorHandler.getInstance().handle(drawBoardError);
      
      return { success: false, error: drawBoardError };
    }
  }
}

