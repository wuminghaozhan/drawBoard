/**
 * 错误处理基础设施模块
 * 
 * 提供统一的错误处理机制：
 * - ErrorHandler: 错误处理器
 * - ErrorConfig: 错误配置
 * - SafeExecutor: 安全执行器
 * - APIErrorHandler: API 错误处理
 */

export { ErrorHandler } from './ErrorHandler';
export { 
  DrawBoardErrorConfig,
  type ErrorConfig,
  type ErrorLevel,
  type ErrorCategory 
} from './ErrorConfig';
export { SafeExecutor } from './SafeExecutor';
export { APIErrorHandler, type APIError } from './APIErrorHandler';

