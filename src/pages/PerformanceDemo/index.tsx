import React, { useState, useRef, useEffect } from 'react';
import { DrawBoard } from '../../libs/drawBoard';
import type { ToolType } from '../../libs/drawBoard';
import { PerformanceMode } from '../../libs/drawBoard/core/PerformanceManager';
import './style.scss';

interface PerformanceStats {
  currentCacheMemoryMB: number;
  currentCacheItems: number;
  cacheHitRate: number;
  estimatedTotalMemoryMB: number;
  underMemoryPressure: boolean;
}

const PerformanceDemo: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const drawBoardRef = useRef<DrawBoard | null>(null);
  
  // 状态
  const [currentTool, setCurrentTool] = useState<ToolType>('pen');
  const [performanceMode, setPerformanceMode] = useState<'auto' | 'high_performance' | 'low_memory' | 'balanced'>('auto');
  const [performanceStats, setPerformanceStats] = useState<PerformanceStats | null>(null);
  const [isForceRealTime, setIsForceRealTime] = useState(false);
  const [historyCount, setHistoryCount] = useState(0);

  // 初始化画板
  useEffect(() => {
    if (containerRef.current && !drawBoardRef.current) {
      console.log('=== 初始化性能演示画板 ===');
      
      drawBoardRef.current = new DrawBoard(containerRef.current, {
        maxHistorySize: 200,
        enableShortcuts: true,
        performanceConfig: {
          mode: PerformanceMode.AUTO,
          maxCacheMemoryMB: 100,
          maxCacheItems: 100,
          complexityThreshold: 25,
          enableMemoryMonitoring: true
        }
      });
      
      // 设置默认预设为毛笔（高复杂度）
      drawBoardRef.current.setStrokePreset('brush');
      
      updateStats();
    }

    return () => {
      if (drawBoardRef.current) {
        drawBoardRef.current.destroy();
      }
      drawBoardRef.current = null;
    };
  }, []);

  // 定期更新统计信息
  useEffect(() => {
    const interval = setInterval(() => {
      updateStats();
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);

  const updateStats = () => {
    if (drawBoardRef.current) {
      const stats = drawBoardRef.current.getPerformanceStats();
      const state = drawBoardRef.current.getState();
      setPerformanceStats(stats);
      setHistoryCount(state.historyCount);
    }
  };

  const handleToolChange = (tool: ToolType) => {
    setCurrentTool(tool);
    drawBoardRef.current?.setTool(tool);
    updateStats();
  };

  const handlePerformanceModeChange = (mode: 'auto' | 'high_performance' | 'low_memory' | 'balanced') => {
    setPerformanceMode(mode);
    drawBoardRef.current?.setPerformanceMode(mode);
    updateStats();
  };

  const handleForceRealTimeToggle = (enabled: boolean) => {
    setIsForceRealTime(enabled);
    drawBoardRef.current?.setForceRealTimeRender && drawBoardRef.current.setForceRealTimeRender(enabled);
    updateStats();
  };

  const handleClearCache = () => {
    drawBoardRef.current?.clearPerformanceCache();
    updateStats();
  };

  const handleRecalculateComplexity = () => {
    drawBoardRef.current?.recalculateComplexity();
    updateStats();
  };

  const handlePresetChange = (preset: string) => {
    const validPresets = ['brush', 'pen', 'pencil', 'marker'] as const;
    if (validPresets.includes(preset as typeof validPresets[number])) {
      drawBoardRef.current?.setStrokePreset(preset as typeof validPresets[number]);
    }
    updateStats();
  };

  const handleClear = () => {
    drawBoardRef.current?.clear();
    updateStats();
  };

  const formatMemory = (mb: number) => {
    if (mb < 1) {
      return `${(mb * 1024).toFixed(1)} KB`;
    }
    return `${mb.toFixed(1)} MB`;
  };

  const formatPercentage = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  return (
    <div className="performance-demo">
      <div className="demo-header">
        <h1>性能优化演示</h1>
        <p>这个演示展示了预渲染缓存对绘制性能的影响</p>
      </div>

      <div className="demo-controls">
        {/* 工具选择 */}
        <div className="control-group">
          <label>绘制工具:</label>
          <div className="tool-buttons">
            {(['pen', 'rect', 'circle'] as ToolType[]).map(tool => (
              <button
                key={tool}
                className={currentTool === tool ? 'active' : ''}
                onClick={() => handleToolChange(tool)}
              >
                {tool === 'pen' ? '画笔' : tool === 'rect' ? '矩形' : '圆形'}
              </button>
            ))}
          </div>
        </div>

        {/* 画笔预设 */}
        <div className="control-group">
          <label>画笔预设:</label>
          <select onChange={(e) => handlePresetChange(e.target.value)}>
            <option value="brush">毛笔 (高复杂度)</option>
            <option value="pen">钢笔 (中复杂度)</option>
            <option value="pencil">铅笔 (中复杂度)</option>
            <option value="marker">马克笔 (低复杂度)</option>
          </select>
        </div>

        {/* 性能模式 */}
        <div className="control-group">
          <label>性能模式:</label>
          <select 
            value={performanceMode} 
            onChange={(e) => {
              const value = e.target.value as 'auto' | 'high_performance' | 'low_memory' | 'balanced';
              handlePerformanceModeChange(value);
            }}
          >
            <option value="auto">自动模式</option>
            <option value="high_performance">高性能模式</option>
            <option value="balanced">平衡模式</option>
            <option value="low_memory">低内存模式</option>
          </select>
        </div>

        {/* 调试选项 */}
        <div className="control-group">
          <label>调试选项:</label>
          <div className="debug-controls">
            <label>
              <input
                type="checkbox"
                checked={isForceRealTime}
                onChange={(e) => handleForceRealTimeToggle(e.target.checked)}
              />
              强制实时绘制
            </label>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="control-group">
          <label>操作:</label>
          <div className="action-buttons">
            <button onClick={handleClearCache}>清空缓存</button>
            <button onClick={handleRecalculateComplexity}>重新计算复杂度</button>
            <button onClick={handleClear}>清空画板</button>
          </div>
        </div>
      </div>

      {/* 性能统计面板 */}
      <div className="stats-panel">
        <h3>性能统计</h3>
        {performanceStats ? (
          <div className="stats-grid">
            <div className="stat-item">
              <span className="stat-label">历史记录数:</span>
              <span className="stat-value">{historyCount}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">缓存项数量:</span>
              <span className="stat-value">{performanceStats.currentCacheItems}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">缓存内存使用:</span>
              <span className="stat-value">{formatMemory(performanceStats.currentCacheMemoryMB)}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">估算总内存:</span>
              <span className="stat-value">{formatMemory(performanceStats.estimatedTotalMemoryMB)}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">缓存命中率:</span>
              <span className="stat-value">{formatPercentage(performanceStats.cacheHitRate)}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">内存压力:</span>
              <span className={`stat-value ${performanceStats.underMemoryPressure ? 'warning' : 'ok'}`}>
                {performanceStats.underMemoryPressure ? '是' : '否'}
              </span>
            </div>
          </div>
        ) : (
          <p>加载统计数据中...</p>
        )}
      </div>

      {/* 画板容器 */}
      <div className="canvas-container">
        <div className="canvas-wrapper" ref={containerRef}></div>
      </div>

      {/* 使用说明 */}
      <div className="demo-instructions">
        <h3>使用说明</h3>
        <ul>
          <li><strong>高复杂度工具测试:</strong> 选择"毛笔"预设，绘制复杂的运笔线条，观察缓存效果</li>
          <li><strong>低复杂度工具测试:</strong> 选择矩形或圆形工具，这些工具不会使用缓存</li>
          <li><strong>性能模式对比:</strong> 切换不同的性能模式，观察内存使用和缓存行为的变化</li>
          <li><strong>实时绘制对比:</strong> 开启"强制实时绘制"可以关闭缓存，对比性能差异</li>
          <li><strong>内存监控:</strong> 观察缓存命中率和内存使用情况，了解优化效果</li>
        </ul>
      </div>
    </div>
  );
};

export default PerformanceDemo; 