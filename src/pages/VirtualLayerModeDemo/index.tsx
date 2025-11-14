import React, { useEffect, useRef, useState } from 'react';
import { DrawBoard } from '../../libs/drawBoard';
import type { VirtualLayerMode } from '../../libs/drawBoard/core/VirtualLayerManager';
import './style.scss';

const VirtualLayerModeDemo: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [drawBoard, setDrawBoard] = useState<DrawBoard | null>(null);
  const [currentMode, setCurrentMode] = useState<VirtualLayerMode>('individual');
  const [layerStats, setLayerStats] = useState<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // 创建 DrawBoard 实例，使用单图层对应单个动作模式
    const board = new DrawBoard(containerRef.current, {
      maxHistorySize: 100,
      enableShortcuts: true,
      virtualLayerConfig: {
        mode: 'individual',
        autoCreateLayer: true,
        maxActionsPerLayer: 1000
      }
    });

    setDrawBoard(board);
    setCurrentMode(board.getVirtualLayerMode());

    return () => {
      board.destroy();
    };
  }, []);

  // 更新图层统计信息
  const updateLayerStats = () => {
    if (!drawBoard) return;

    const stats = drawBoard.getVirtualLayerStats();
    const config = drawBoard.getVirtualLayerConfig();
    
    setLayerStats({
      ...stats,
      currentMode: config.mode
    });
  };

  // 切换虚拟图层模式
  const switchMode = (mode: VirtualLayerMode) => {
    if (!drawBoard) return;

    drawBoard.setVirtualLayerMode(mode);
    setCurrentMode(mode);
    updateLayerStats();
    
    console.log(`虚拟图层模式已切换为: ${mode}`);
  };

  // 清空画板
  const clearCanvas = () => {
    if (!drawBoard) return;

    drawBoard.clear();
    updateLayerStats();
  };

  // 定期更新统计信息
  useEffect(() => {
    if (!drawBoard) return;

    updateLayerStats();
    const interval = setInterval(updateLayerStats, 1000);

    return () => clearInterval(interval);
  }, [drawBoard]);

  return (
    <div className="virtual-layer-mode-demo">
      <div className="demo-header">
        <h1>虚拟图层模式演示</h1>
        <p>演示单图层对应单个动作和多图层对应多个动作两种模式</p>
      </div>

      <div className="demo-content">
        <div className="control-panel">
          <div className="mode-controls">
            <h3>模式控制</h3>
            <div className="mode-buttons">
              <button
                            className={`mode-btn ${currentMode === 'individual' ? 'active' : ''}`}
            onClick={() => switchMode('individual')}
              >
                单图层对应单个动作
              </button>
              <button
                            className={`mode-btn ${currentMode === 'grouped' ? 'active' : ''}`}
            onClick={() => switchMode('grouped')}
              >
                单图层对应多个动作
              </button>
            </div>
            
            <div className="mode-description">
              {currentMode === 'individual' ? (
                <p>每个绘制动作都会创建独立的虚拟图层，适合精细控制</p>
              ) : (
                <p>多个绘制动作共享同一个虚拟图层，适合批量管理</p>
              )}
            </div>
          </div>

          <div className="settings-controls">
            <h3>设置</h3>
            <div className="action-buttons">
              <button onClick={clearCanvas} className="clear-btn">
                清空画板
              </button>
            </div>
          </div>

          <div className="stats-panel">
            <h3>图层统计</h3>
            {layerStats && (
              <div className="stats-grid">
                <div className="stat-item">
                  <span className="stat-label">当前模式:</span>
                  <span className="stat-value">
                    {layerStats.currentMode === 'individual' 
                      ? '单图层对应单个动作' 
                      : '单图层对应多个动作'}
                  </span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">总图层数:</span>
                  <span className="stat-value">{layerStats.totalLayers}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">可见图层:</span>
                  <span className="stat-value">{layerStats.visibleLayers}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">锁定图层:</span>
                  <span className="stat-value">{layerStats.lockedLayers}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">总动作数:</span>
                  <span className="stat-value">{layerStats.totalActions}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="canvas-container">
          <div className="canvas-wrapper">
            <div ref={containerRef} className="draw-board-container" />
          </div>
          <div className="canvas-info">
            <p>在画板上绘制来测试虚拟图层模式</p>
            <p>单图层模式：每个动作创建独立图层</p>
            <p>多图层模式：动作共享图层，可设置自动创建新图层</p>
          </div>
        </div>
      </div>

      <div className="demo-footer">
        <div className="usage-tips">
          <h3>使用提示</h3>
          <ul>
            <li><strong>单图层对应单个动作模式：</strong>每个绘制动作都会创建独立的虚拟图层，适合需要精细控制每个元素的场景</li>
            <li><strong>单图层对应多个动作模式：</strong>多个绘制动作共享同一个虚拟图层，适合批量管理和组织相关元素</li>
            <li>在画板上绘制不同的图形来观察图层创建行为</li>
            <li>切换模式后，新绘制的动作将按照新模式处理</li>
            <li>查看统计面板了解当前图层状态</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default VirtualLayerModeDemo; 