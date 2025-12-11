import { DrawBoardErrorCode, type DrawBoardErrorCode as DrawBoardErrorCodeType } from './ErrorHandler';

/**
 * 错误处理配置
 * 
 * 定义不同错误类型的处理策略和恢复机制
 */
export interface ErrorConfig {
  /** 是否启用错误处理 */
  enabled: boolean;
  /** 是否在控制台显示错误 */
  showInConsole: boolean;
  /** 是否记录错误历史 */
  recordHistory: boolean;
  /** 错误历史最大数量 */
  maxHistorySize: number;
  /** 是否启用自动恢复 */
  enableAutoRecovery: boolean;
  /** 错误处理超时时间（毫秒） */
  recoveryTimeout: number;
  /** 特定错误代码的处理策略 */
  errorStrategies: Record<DrawBoardErrorCodeType, ErrorStrategy>;
}

/**
 * 错误处理策略
 */
export interface ErrorStrategy {
  /** 错误级别 */
  level: 'error' | 'warn' | 'info';
  /** 是否可恢复 */
  recoverable: boolean;
  /** 自动恢复策略 */
  autoRecovery?: 'retry' | 'fallback' | 'reset' | 'ignore';
  /** 重试次数 */
  maxRetries?: number;
  /** 重试间隔（毫秒） */
  retryInterval?: number;
  /** 用户提示消息 */
  userMessage?: string;
  /** 是否记录到错误历史 */
  recordToHistory: boolean;
}

/**
 * 默认错误处理配置
 */
export const DEFAULT_ERROR_CONFIG: ErrorConfig = {
  enabled: true,
  showInConsole: true,
  recordHistory: true,
  maxHistorySize: 100,
  enableAutoRecovery: true,
  recoveryTimeout: 5000,
  errorStrategies: {
    [DrawBoardErrorCode.INITIALIZATION_FAILED]: {
      level: 'error',
      recoverable: false,
      userMessage: '画板初始化失败，请刷新页面重试',
      recordToHistory: true
    },
    [DrawBoardErrorCode.CONTAINER_NOT_FOUND]: {
      level: 'error',
      recoverable: false,
      userMessage: '容器元素未找到',
      recordToHistory: true
    },
    [DrawBoardErrorCode.CANVAS_CREATION_FAILED]: {
      level: 'error',
      recoverable: false,
      userMessage: 'Canvas创建失败',
      recordToHistory: true
    },
    [DrawBoardErrorCode.CANVAS_ERROR]: {
      level: 'error',
      recoverable: true,
      userMessage: 'Canvas错误',
      recordToHistory: true
    },
    [DrawBoardErrorCode.CONTEXT_2D_FAILED]: {
      level: 'error',
      recoverable: false,
      userMessage: '2D上下文获取失败',
      recordToHistory: true
    },
    [DrawBoardErrorCode.LAYER_CREATION_FAILED]: {
      level: 'error',
      recoverable: false,
      userMessage: '图层创建失败',
      recordToHistory: true
    },
    [DrawBoardErrorCode.TOOL_ERROR]: {
      level: 'warn',
      recoverable: true,
      userMessage: '工具错误',
      recordToHistory: true
    },
    [DrawBoardErrorCode.TOOL_NOT_FOUND]: {
      level: 'warn',
      recoverable: true,
      userMessage: '工具未找到',
      recordToHistory: true
    },
    [DrawBoardErrorCode.TOOL_LOADING_FAILED]: {
      level: 'warn',
      recoverable: true,
      autoRecovery: 'fallback',
      maxRetries: 3,
      retryInterval: 1000,
      userMessage: '工具加载失败，已切换到基础工具',
      recordToHistory: true
    },
    [DrawBoardErrorCode.TOOL_INITIALIZATION_FAILED]: {
      level: 'warn',
      recoverable: true,
      userMessage: '工具初始化失败',
      recordToHistory: true
    },
    [DrawBoardErrorCode.MEMORY_ERROR]: {
      level: 'warn',
      recoverable: true,
      userMessage: '内存错误',
      recordToHistory: true
    },
    [DrawBoardErrorCode.MEMORY_LIMIT_EXCEEDED]: {
      level: 'warn',
      recoverable: true,
      autoRecovery: 'reset',
      userMessage: '内存使用超限，正在清理缓存',
      recordToHistory: true
    },
    [DrawBoardErrorCode.CACHE_CREATION_FAILED]: {
      level: 'warn',
      recoverable: true,
      userMessage: '缓存创建失败',
      recordToHistory: true
    },
    [DrawBoardErrorCode.RENDERING_ERROR]: {
      level: 'warn',
      recoverable: true,
      userMessage: '渲染错误',
      recordToHistory: true
    },
    [DrawBoardErrorCode.DRAW_ACTION_FAILED]: {
      level: 'warn',
      recoverable: true,
      userMessage: '绘制动作失败',
      recordToHistory: true
    },
    [DrawBoardErrorCode.REDRAW_FAILED]: {
      level: 'warn',
      recoverable: true,
      autoRecovery: 'retry',
      maxRetries: 2,
      retryInterval: 500,
      userMessage: '渲染失败，正在重试',
      recordToHistory: true
    },
    [DrawBoardErrorCode.EVENT_ERROR]: {
      level: 'warn',
      recoverable: true,
      userMessage: '事件错误',
      recordToHistory: true
    },
    [DrawBoardErrorCode.EVENT_BINDING_FAILED]: {
      level: 'warn',
      recoverable: true,
      userMessage: '事件绑定失败',
      recordToHistory: true
    },
    [DrawBoardErrorCode.EVENT_HANDLER_FAILED]: {
      level: 'warn',
      recoverable: true,
      userMessage: '事件处理失败',
      recordToHistory: true
    },
    [DrawBoardErrorCode.HISTORY_ERROR]: {
      level: 'warn',
      recoverable: true,
      userMessage: '历史记录错误',
      recordToHistory: true
    },
    [DrawBoardErrorCode.UNDO_FAILED]: {
      level: 'warn',
      recoverable: true,
      userMessage: '撤销失败',
      recordToHistory: true
    },
    [DrawBoardErrorCode.REDO_FAILED]: {
      level: 'warn',
      recoverable: true,
      userMessage: '重做失败',
      recordToHistory: true
    },
    [DrawBoardErrorCode.EXPORT_ERROR]: {
      level: 'warn',
      recoverable: true,
      userMessage: '导出错误',
      recordToHistory: true
    },
    [DrawBoardErrorCode.IMAGE_EXPORT_FAILED]: {
      level: 'warn',
      recoverable: true,
      userMessage: '图片导出失败',
      recordToHistory: true
    },
    [DrawBoardErrorCode.CLIPBOARD_COPY_FAILED]: {
      level: 'warn',
      recoverable: true,
      userMessage: '剪贴板复制失败',
      recordToHistory: true
    },
    [DrawBoardErrorCode.RESOURCE_ERROR]: {
      level: 'warn',
      recoverable: true,
      userMessage: '资源错误',
      recordToHistory: true
    },
    [DrawBoardErrorCode.RESOURCE_DESTROY_FAILED]: {
      level: 'error',
      recoverable: false,
      userMessage: '资源清理失败',
      recordToHistory: true
    },
    [DrawBoardErrorCode.RESOURCE_LEAK_DETECTED]: {
      level: 'warn',
      recoverable: true,
      userMessage: '检测到资源泄漏',
      recordToHistory: true
    },
    [DrawBoardErrorCode.UNKNOWN_ERROR]: {
      level: 'error',
      recoverable: false,
      userMessage: '发生未知错误',
      recordToHistory: true
    }
  }
};

/**
 * 开发环境错误配置
 */
export const DEVELOPMENT_ERROR_CONFIG: ErrorConfig = {
  ...DEFAULT_ERROR_CONFIG,
  showInConsole: true,
  recordHistory: true,
  maxHistorySize: 200,
  enableAutoRecovery: false, // 开发环境禁用自动恢复，便于调试
};

/**
 * 生产环境错误配置
 */
export const PRODUCTION_ERROR_CONFIG: ErrorConfig = {
  ...DEFAULT_ERROR_CONFIG,
  showInConsole: false, // 生产环境不在控制台显示详细错误
  recordHistory: true,
  maxHistorySize: 50,
  enableAutoRecovery: true,
  recoveryTimeout: 3000,
};

/**
 * 获取当前环境的错误配置
 */
export function getErrorConfig(): ErrorConfig {
  const isDevelopment = typeof window !== 'undefined' && 
                       (window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1' ||
                        window.location.hostname.includes('localhost'));
  
  return isDevelopment ? DEVELOPMENT_ERROR_CONFIG : PRODUCTION_ERROR_CONFIG;
} 