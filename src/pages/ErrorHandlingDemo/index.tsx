import { useState, useEffect, useRef } from 'react';
import { DrawBoard, DrawBoardErrorCode, type DrawBoardError, type DrawBoardErrorCode as DrawBoardErrorCodeType } from '../../libs/drawBoard';
import './style.scss';

interface ErrorInfo {
  code: DrawBoardErrorCodeType;
  message: string;
  timestamp: number;
  recoverable: boolean;
}

interface ResourceInfo {
  total: number;
  byType: Record<string, number>;
  destroyed: number;
  active: number;
  estimatedMemoryUsage: number;
}

export default function ErrorHandlingDemo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const drawBoardRef = useRef<DrawBoard | null>(null);
  
  const [errors, setErrors] = useState<ErrorInfo[]>([]);
  const [resourceStats, setResourceStats] = useState<ResourceInfo | null>(null);
  const [resourceLeaks, setResourceLeaks] = useState<any>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    try {
      // 初始化DrawBoard
      const drawBoard = DrawBoard.getInstance(containerRef.current, {
        maxHistorySize: 100,
        enableShortcuts: true
      });
      
      drawBoardRef.current = drawBoard;
      setIsInitialized(true);

      // 订阅错误事件
      const unsubscribe = drawBoard.onError(DrawBoardErrorCode.UNKNOWN_ERROR, (error: DrawBoardError) => {
        setErrors(prev => [...prev, {
          code: error.code,
          message: error.message,
          timestamp: error.timestamp,
          recoverable: error.recoverable
        }]);
      });

      // 定期更新资源统计
      const updateStats = () => {
        if (drawBoardRef.current) {
          setResourceStats(drawBoardRef.current.getResourceStats());
          setResourceLeaks(drawBoardRef.current.checkResourceLeaks());
        }
      };

      updateStats();
      const statsInterval = setInterval(updateStats, 2000);

      return () => {
        unsubscribe();
        clearInterval(statsInterval);
        if (drawBoardRef.current) {
          drawBoardRef.current.destroy();
        }
      };

    } catch (error) {
      console.error('初始化DrawBoard失败:', error);
      setErrors(prev => [...prev, {
        code: DrawBoardErrorCode.INITIALIZATION_FAILED,
        message: error instanceof Error ? error.message : '未知错误',
        timestamp: Date.now(),
        recoverable: false
      }]);
    }
  }, []);

  const triggerTestError = (errorCode: DrawBoardErrorCodeType) => {
    if (!drawBoardRef.current) return;

    // 模拟不同类型的错误
    switch (errorCode) {
      case DrawBoardErrorCode.TOOL_LOADING_FAILED:
        // 尝试加载不存在的工具
        drawBoardRef.current.setTool('nonexistent' as any).catch(() => {});
        break;
      case DrawBoardErrorCode.MEMORY_LIMIT_EXCEEDED:
        // 模拟内存压力
        const largeArray = new Array(1000000).fill('test');
        setTimeout(() => {
          largeArray.length = 0;
        }, 1000);
        break;
      case DrawBoardErrorCode.CANVAS_ERROR:
        // 尝试访问已销毁的Canvas
        const canvas = drawBoardRef.current.getCanvas();
        if (canvas) {
          canvas.remove();
        }
        break;
      default:
        // 触发通用错误
        const error = new Error('测试错误');
        error.name = 'TestError';
        throw error;
    }
  };

  const clearErrors = () => {
    if (drawBoardRef.current) {
      drawBoardRef.current.clearErrorHistory();
      setErrors([]);
    }
  };

  const cleanupResources = () => {
    if (drawBoardRef.current) {
      drawBoardRef.current.cleanupDestroyedResources();
      setResourceStats(drawBoardRef.current.getResourceStats());
    }
  };

  return (
    <div className="error-handling-demo">
      <div className="demo-header">
        <h1>错误处理和资源管理演示</h1>
        <p>展示DrawBoard的错误处理系统和资源管理功能</p>
      </div>

      <div className="demo-content">
        <div className="left-panel">
          <div className="drawboard-container" ref={containerRef}></div>
        </div>

        <div className="right-panel">
          <div className="control-section">
            <h3>错误测试</h3>
            <div className="button-group">
              <button 
                onClick={() => triggerTestError(DrawBoardErrorCode.TOOL_LOADING_FAILED)}
                className="error-btn tool-error"
              >
                工具加载错误
              </button>
              <button 
                onClick={() => triggerTestError(DrawBoardErrorCode.MEMORY_LIMIT_EXCEEDED)}
                className="error-btn memory-error"
              >
                内存错误
              </button>
              <button 
                onClick={() => triggerTestError(DrawBoardErrorCode.CANVAS_ERROR)}
                className="error-btn canvas-error"
              >
                Canvas错误
              </button>
              <button 
                onClick={() => triggerTestError(DrawBoardErrorCode.UNKNOWN_ERROR)}
                className="error-btn unknown-error"
              >
                未知错误
              </button>
            </div>
            <button onClick={clearErrors} className="clear-btn">
              清空错误历史
            </button>
          </div>

          <div className="stats-section">
            <h3>资源统计</h3>
            {resourceStats && (
              <div className="stats-grid">
                <div className="stat-item">
                  <span className="stat-label">总资源:</span>
                  <span className="stat-value">{resourceStats.total}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">活跃资源:</span>
                  <span className="stat-value">{resourceStats.active}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">已销毁:</span>
                  <span className="stat-value">{resourceStats.destroyed}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">内存使用:</span>
                  <span className="stat-value">{(resourceStats.estimatedMemoryUsage / 1024).toFixed(1)}KB</span>
                </div>
              </div>
            )}
            <button onClick={cleanupResources} className="cleanup-btn">
              清理已销毁资源
            </button>
          </div>

          <div className="leaks-section">
            <h3>资源泄漏检查</h3>
            {resourceLeaks && (
              <div className="leaks-info">
                <div className={`leak-status ${resourceLeaks.hasLeaks ? 'has-leaks' : 'no-leaks'}`}>
                  {resourceLeaks.hasLeaks ? '⚠️ 发现资源泄漏' : '✅ 无资源泄漏'}
                </div>
                {resourceLeaks.recommendations.length > 0 && (
                  <div className="recommendations">
                    {resourceLeaks.recommendations.map((rec: string, index: number) => (
                      <div key={index} className="recommendation">{rec}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="errors-section">
            <h3>错误历史 ({errors.length})</h3>
            <div className="errors-list">
              {errors.length === 0 ? (
                <div className="no-errors">暂无错误</div>
              ) : (
                errors.map((error, index) => (
                  <div key={index} className={`error-item ${error.recoverable ? 'recoverable' : 'non-recoverable'}`}>
                    <div className="error-header">
                      <span className="error-code">{error.code}</span>
                      <span className="error-time">
                        {new Date(error.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="error-message">{error.message}</div>
                    <div className="error-status">
                      {error.recoverable ? '🔄 可恢复' : '❌ 不可恢复'}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 