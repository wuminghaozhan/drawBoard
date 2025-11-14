import React, { useEffect, useRef, useState } from 'react';
import { DrawBoard } from '../../libs/drawBoard';
import FunctionalModule from '../../libs/drawBoard/functional';
import './style.scss';

const FunctionalDemo: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [drawBoard, setDrawBoard] = useState<DrawBoard | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [configPresets, setConfigPresets] = useState<any[]>([]);
  const [currentPreset, setCurrentPreset] = useState<string>('default');

  useEffect(() => {
    if (!containerRef.current) return;

    // 使用函数式配置预设
    const presets = FunctionalModule.config.getConfigPresets();
    setConfigPresets(presets);

    // 创建 DrawBoard 实例
    const board = new DrawBoard(containerRef.current, {
      maxHistorySize: 100,
      enableShortcuts: true,
      strokeConfig: {
        enablePressure: true,
        pressureSensitivity: 0.8
      }
    });

    setDrawBoard(board);

    return () => {
      board.destroy();
    };
  }, []);

  // 更新统计信息
  const updateStats = () => {
    if (!drawBoard) return;

    const historyStats = drawBoard.getHistoryStats();
    const state = drawBoard.getState();
    const performanceStats = FunctionalModule.state.computePerformanceStats(state);
    const toolStats = FunctionalModule.state.computeToolStats(state);

    setStats({
      history: historyStats,
      performance: performanceStats,
      tools: toolStats
    });
  };

  // 应用配置预设
  const applyPreset = (presetName: string) => {
    if (!drawBoard) return;

    const preset = FunctionalModule.config.getConfigPresetByName(presetName);
    if (!preset) return;

    // 这里可以应用预设配置
    console.log('应用预设:', preset);
    setCurrentPreset(presetName);
  };

  // 处理绘制数据
  const processDrawData = () => {
    if (!drawBoard) return;

    const samplePoints = [
      { x: 100, y: 100, pressure: 0.5, timestamp: Date.now() },
      { x: 150, y: 120, pressure: 0.7, timestamp: Date.now() + 100 },
      { x: 200, y: 110, pressure: 0.3, timestamp: Date.now() + 200 }
    ];

    const processed = drawBoard.processDrawData(samplePoints);
    console.log('处理后的绘制数据:', processed);
  };

  // 创建状态快照
  const createSnapshot = () => {
    if (!drawBoard) return;

    const snapshot = drawBoard.createSnapshot();
    console.log('状态快照:', snapshot);
  };

  // 使用管道处理数据
  const processWithPipeline = () => {
    if (!drawBoard) return;

    const data = { name: 'test', value: 42 };
    const result = drawBoard.processDataWithPipeline(data);
    console.log('管道处理结果:', result);
  };

  // 记忆化计算
  const testMemoization = () => {
    if (!drawBoard) return;

    const result1 = drawBoard.memoizedCalculation(5);
    const result2 = drawBoard.memoizedCalculation(5); // 应该从缓存获取
    console.log('记忆化计算结果:', result1, result2);
  };

  return (
    <div className="functional-demo">
      <div className="demo-header">
        <h1>函数式编程演示</h1>
        <p>展示 DrawBoard 混合架构中函数式编程的使用</p>
      </div>

      <div className="demo-content">
        <div className="control-panel">
          <div className="section">
            <h3>配置预设</h3>
            <div className="preset-buttons">
              {configPresets.map(preset => (
                <button
                  key={preset.name}
                  className={currentPreset === preset.name ? 'active' : ''}
                  onClick={() => applyPreset(preset.name)}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          <div className="section">
            <h3>函数式操作</h3>
            <div className="function-buttons">
              <button onClick={processDrawData}>处理绘制数据</button>
              <button onClick={createSnapshot}>创建状态快照</button>
              <button onClick={processWithPipeline}>管道处理</button>
              <button onClick={testMemoization}>记忆化计算</button>
              <button onClick={updateStats}>更新统计</button>
            </div>
          </div>

          {stats && (
            <div className="section">
              <h3>统计信息</h3>
              <div className="stats">
                <div className="stat-group">
                  <h4>历史记录</h4>
                  <p>总动作数: {stats.history.totalActions}</p>
                  <p>内存使用: {Math.round(stats.history.memoryUsage / 1024)}KB</p>
                  <p>复杂度评分: {Math.round(stats.history.complexityScore)}</p>
                </div>
                <div className="stat-group">
                  <h4>性能</h4>
                  <p>平均复杂度: {Math.round(stats.performance.averageComplexity)}</p>
                  <p>性能模式: {stats.performance.performanceMode}</p>
                  <p>需要优化: {stats.performance.needsOptimization ? '是' : '否'}</p>
                </div>
                <div className="stat-group">
                  <h4>工具使用</h4>
                  <p>当前工具: {stats.tools.currentTool}</p>
                  <p>最常用工具: {stats.tools.mostUsedTool}</p>
                  <p>使用工具数: {stats.tools.totalToolsUsed}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="drawboard-container" ref={containerRef}></div>
      </div>

      <div className="demo-footer">
        <h3>混合架构优势</h3>
        <ul>
          <li><strong>函数式数据处理:</strong> 纯函数处理绘制数据，易于测试和组合</li>
          <li><strong>函数式配置管理:</strong> 不可变配置，预设和验证</li>
          <li><strong>函数式状态管理:</strong> 不可变状态更新，状态计算和比较</li>
          <li><strong>面向对象协调:</strong> 复杂业务逻辑和副作用管理</li>
          <li><strong>最佳实践结合:</strong> 在适合的场景使用合适的范式</li>
        </ul>
      </div>
    </div>
  );
};

export default FunctionalDemo; 