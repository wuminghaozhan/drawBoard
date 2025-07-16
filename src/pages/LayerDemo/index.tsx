import React, { useRef, useEffect, useState } from 'react';
import { DrawBoard } from '../../libs/drawBoard';
import type { ToolType } from '../../libs/drawBoard';
import { LayerManager, type Layer } from '../../libs/drawBoard/core/LayerManager';
import ToolPanel from '../../components/ToolPanel';
import './style.scss';

const LayerDemo: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const drawBoardRef = useRef<DrawBoard | null>(null);
  const layerManagerRef = useRef<LayerManager | null>(null);
  
  const [currentTool, setCurrentTool] = useState<ToolType>('pen');
  const [currentColor, setCurrentColor] = useState('#2c3e50');
  const [currentLineWidth, setCurrentLineWidth] = useState(3);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [historyCount, setHistoryCount] = useState(0);
  const [hasSelection, setHasSelection] = useState(false);
  
  // 图层相关状态
  const [layers, setLayers] = useState<Layer[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string>('');
  const [layerStats, setLayerStats] = useState({ totalLayers: 0, visibleLayers: 0, lockedLayers: 0, totalActions: 0 });

  useEffect(() => {
    if (containerRef.current && !drawBoardRef.current) {
      // 初始化画板
      drawBoardRef.current = new DrawBoard(containerRef.current, {
        maxHistorySize: 100,
        enableShortcuts: true
      });

      // 初始化图层管理器
      layerManagerRef.current = new LayerManager({
        maxLayers: 10,
        defaultLayerName: '图层'
      });

      // 设置初始状态
      drawBoardRef.current.setTool(currentTool);
      drawBoardRef.current.setColor(currentColor);
      drawBoardRef.current.setLineWidth(currentLineWidth);

      updateState();
      updateLayerState();
    }

    return () => {
      if (drawBoardRef.current) {
        drawBoardRef.current.destroy();
      }
      if (layerManagerRef.current) {
        layerManagerRef.current.destroy();
      }
      drawBoardRef.current = null;
      layerManagerRef.current = null;
    };
  }, []);

  const updateState = () => {
    if (drawBoardRef.current) {
      const state = drawBoardRef.current.getState();
      setCanUndo(state.canUndo);
      setCanRedo(state.canRedo);
      setHistoryCount(state.historyCount);
      setHasSelection(drawBoardRef.current.hasSelection());
    }
  };

  const updateLayerState = () => {
    if (layerManagerRef.current) {
      const allLayers = layerManagerRef.current.getAllLayers();
      const activeLayer = layerManagerRef.current.getActiveLayer();
      const stats = layerManagerRef.current.getLayerStats();
      
      setLayers(allLayers);
      setActiveLayerId(activeLayer?.id || '');
      setLayerStats(stats);
    }
  };

  // 基础工具方法
  const handleToolChange = (tool: ToolType) => {
    setCurrentTool(tool);
    drawBoardRef.current?.setTool(tool);
    updateState();
  };

  const handleColorChange = (color: string) => {
    setCurrentColor(color);
    drawBoardRef.current?.setColor(color);
  };

  const handleLineWidthChange = (width: number) => {
    setCurrentLineWidth(width);
    drawBoardRef.current?.setLineWidth(width);
  };

  const handleUndo = () => {
    drawBoardRef.current?.undo();
    updateState();
  };

  const handleRedo = () => {
    drawBoardRef.current?.redo();
    updateState();
  };

  const handleClear = () => {
    drawBoardRef.current?.clear();
    updateState();
  };

  const handleSave = () => {
    drawBoardRef.current?.saveAsImage('图层管理演示');
  };

  // 图层管理方法
  const handleCreateLayer = () => {
    if (layerManagerRef.current) {
      try {
        const newLayer = layerManagerRef.current.createLayer();
        layerManagerRef.current.setActiveLayer(newLayer.id);
        updateLayerState();
      } catch (error) {
        alert(`创建图层失败: ${error}`);
      }
    }
  };

  const handleDeleteLayer = (layerId: string) => {
    if (layerManagerRef.current) {
      const success = layerManagerRef.current.deleteLayer(layerId);
      if (success) {
        updateLayerState();
      } else {
        alert('无法删除图层');
      }
    }
  };

  const handleSelectLayer = (layerId: string) => {
    if (layerManagerRef.current) {
      const success = layerManagerRef.current.setActiveLayer(layerId);
      if (success) {
        updateLayerState();
      }
    }
  };

  const handleToggleLayerVisibility = (layerId: string) => {
    if (layerManagerRef.current) {
      const layer = layerManagerRef.current.getLayer(layerId);
      if (layer) {
        layerManagerRef.current.setLayerVisible(layerId, !layer.visible);
        updateLayerState();
      }
    }
  };

  const handleToggleLayerLock = (layerId: string) => {
    if (layerManagerRef.current) {
      const layer = layerManagerRef.current.getLayer(layerId);
      if (layer) {
        layerManagerRef.current.setLayerLocked(layerId, !layer.locked);
        updateLayerState();
      }
    }
  };

  const handleLayerOpacityChange = (layerId: string, opacity: number) => {
    if (layerManagerRef.current) {
      layerManagerRef.current.setLayerOpacity(layerId, opacity / 100);
      updateLayerState();
    }
  };

  const handleRenameLayer = (layerId: string) => {
    const layer = layerManagerRef.current?.getLayer(layerId);
    if (layer) {
      const newName = prompt('请输入新的图层名称:', layer.name);
      if (newName && layerManagerRef.current) {
        layerManagerRef.current.renameLayer(layerId, newName);
        updateLayerState();
      }
    }
  };

  const handleDuplicateLayer = (layerId: string) => {
    if (layerManagerRef.current) {
      const newLayer = layerManagerRef.current.duplicateLayer(layerId);
      if (newLayer) {
        layerManagerRef.current.setActiveLayer(newLayer.id);
        updateLayerState();
      }
    }
  };

  const handleClearLayer = (layerId: string) => {
    if (layerManagerRef.current) {
      const layer = layerManagerRef.current.getLayer(layerId);
      if (layer && confirm(`确定清空图层 "${layer.name}" 的内容吗？`)) {
        layerManagerRef.current.clearLayer(layerId);
        updateLayerState();
      }
    }
  };

  const handleMoveLayer = (layerId: string, direction: 'up' | 'down') => {
    if (layerManagerRef.current) {
      const currentIndex = layers.findIndex(layer => layer.id === layerId);
      const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      
      if (newIndex >= 0 && newIndex < layers.length) {
        layerManagerRef.current.moveLayer(layerId, newIndex);
        updateLayerState();
      }
    }
  };

  return (
    <div className="layer-demo">
      <div className="demo-header">
        <h1>📚 图层管理演示</h1>
        <p>体验专业级的多图层绘制功能，支持图层可见性、透明度、锁定等控制</p>
      </div>

      <div className="demo-container">
        {/* 左侧工具栏 */}
        <div className="toolbar">
          <ToolPanel
            currentTool={currentTool}
            currentColor={currentColor}
            currentLineWidth={currentLineWidth}
            canUndo={canUndo}
            canRedo={canRedo}
            historyCount={historyCount}
            hasSelection={hasSelection}
            onToolChange={handleToolChange}
            onColorChange={handleColorChange}
            onLineWidthChange={handleLineWidthChange}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onClear={handleClear}
            onClearSelection={() => {}}
            onDeleteSelection={() => {}}
            onCopySelection={() => {}}
            onSave={handleSave}
          />
        </div>

        {/* 画板区域 */}
        <div className="canvas-container">
          <div 
            ref={containerRef}
            className="draw-board"
          />
        </div>

        {/* 右侧图层面板 */}
        <div className="layer-panel">
          {/* 图层统计 */}
          <div className="layer-stats">
            <h3>📊 图层统计</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <span className="stat-label">总图层:</span>
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
                <span className="stat-label">总操作:</span>
                <span className="stat-value">{layerStats.totalActions}</span>
              </div>
            </div>
          </div>

          {/* 图层操作按钮 */}
          <div className="layer-actions">
            <button onClick={handleCreateLayer} className="action-btn create-btn">
              ➕ 新建图层
            </button>
            <button 
              onClick={() => activeLayerId && handleDuplicateLayer(activeLayerId)} 
              disabled={!activeLayerId}
              className="action-btn duplicate-btn"
            >
              📋 复制图层
            </button>
          </div>

          {/* 图层列表 */}
          <div className="layer-list">
            <h3>📚 图层列表</h3>
            <div className="layers">
              {layers.map((layer, index) => (
                <div 
                  key={layer.id}
                  className={`layer-item ${layer.id === activeLayerId ? 'active' : ''} ${layer.locked ? 'locked' : ''}`}
                  onClick={() => handleSelectLayer(layer.id)}
                >
                  <div className="layer-info">
                    <div className="layer-name" onDoubleClick={() => handleRenameLayer(layer.id)}>
                      {layer.name}
                      {layer.locked && <span className="lock-icon">🔒</span>}
                    </div>
                    <div className="layer-meta">
                      {layer.actions.length} 个操作 | {Math.round(layer.opacity * 100)}% 透明度
                    </div>
                  </div>

                  <div className="layer-controls">
                    {/* 可见性控制 */}
                    <button
                      className={`control-btn visibility-btn ${layer.visible ? 'visible' : 'hidden'}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleLayerVisibility(layer.id);
                      }}
                      title={layer.visible ? '隐藏图层' : '显示图层'}
                    >
                      {layer.visible ? '👁️' : '👁️‍🗨️'}
                    </button>

                    {/* 锁定控制 */}
                    <button
                      className={`control-btn lock-btn ${layer.locked ? 'locked' : 'unlocked'}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleLayerLock(layer.id);
                      }}
                      title={layer.locked ? '解锁图层' : '锁定图层'}
                    >
                      {layer.locked ? '🔒' : '🔓'}
                    </button>

                    {/* 上移 */}
                    <button
                      className="control-btn move-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveLayer(layer.id, 'up');
                      }}
                      disabled={index === 0}
                      title="上移图层"
                    >
                      ⬆️
                    </button>

                    {/* 下移 */}
                    <button
                      className="control-btn move-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveLayer(layer.id, 'down');
                      }}
                      disabled={index === layers.length - 1}
                      title="下移图层"
                    >
                      ⬇️
                    </button>

                    {/* 删除 */}
                    <button
                      className="control-btn delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteLayer(layer.id);
                      }}
                      disabled={layers.length <= 1}
                      title="删除图层"
                    >
                      🗑️
                    </button>
                  </div>

                  {/* 透明度滑块 */}
                  <div className="opacity-control" onClick={(e) => e.stopPropagation()}>
                    <label>透明度: {Math.round(layer.opacity * 100)}%</label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(layer.opacity * 100)}
                      onChange={(e) => handleLayerOpacityChange(layer.id, Number(e.target.value))}
                      className="opacity-slider"
                    />
                  </div>

                  {/* 图层操作菜单 */}
                  <div className="layer-menu">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClearLayer(layer.id);
                      }}
                      className="menu-btn"
                      disabled={layer.locked}
                    >
                      🧹 清空内容
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 使用说明 */}
          <div className="usage-tips">
            <h4>📖 使用说明</h4>
            <div className="tip-list">
              <div className="tip-item">
                <strong>创建图层：</strong>点击"新建图层"按钮
              </div>
              <div className="tip-item">
                <strong>切换图层：</strong>点击图层项选择活动图层
              </div>
              <div className="tip-item">
                <strong>重命名：</strong>双击图层名称进行重命名
              </div>
              <div className="tip-item">
                <strong>可见性：</strong>点击眼睛图标控制显示/隐藏
              </div>
              <div className="tip-item">
                <strong>锁定：</strong>锁定的图层无法编辑
              </div>
              <div className="tip-item">
                <strong>透明度：</strong>拖拽滑块调整图层透明度
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LayerDemo; 