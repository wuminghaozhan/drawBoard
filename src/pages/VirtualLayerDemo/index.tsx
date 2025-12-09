import React, { useRef, useEffect, useState } from 'react';
import { DrawBoard } from '../../libs/drawBoard';
import type { VirtualLayer } from '../../libs/drawBoard/core/VirtualLayerManager';
import './style.scss';

const VirtualLayerDemo: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const drawBoardRef = useRef<DrawBoard | null>(null);
  const [virtualLayers, setVirtualLayers] = useState<VirtualLayer[]>([]);
  const [activeLayer, setActiveLayer] = useState<VirtualLayer | null>(null);
  const [layerStats, setLayerStats] = useState<{
    totalLayers: number;
    visibleLayers: number;
    lockedLayers: number;
    totalActions: number;
  } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // 创建 DrawBoard 实例
    drawBoardRef.current = DrawBoard.getInstance(containerRef.current, {
      maxHistorySize: 100,
      enableShortcuts: true
    });

    // 初始化默认工具
    drawBoardRef.current.initializeDefaultTools();

    // 更新虚拟图层状态
    updateVirtualLayerState();

    // 清理函数
    return () => {
      if (drawBoardRef.current) {
        drawBoardRef.current.destroy();
        drawBoardRef.current = null;
      }
    };
  }, []);

  const updateVirtualLayerState = () => {
    if (!drawBoardRef.current) return;

    const layers = drawBoardRef.current.getAllVirtualLayers();
    const active = drawBoardRef.current.getActiveVirtualLayer();
    const stats = drawBoardRef.current.getVirtualLayerStats();

    setVirtualLayers(layers);
    setActiveLayer(active);
    setLayerStats(stats);
  };

  const handleCreateLayer = () => {
    if (!drawBoardRef.current) return;

    const layerName = prompt('请输入图层名称:');
    if (layerName) {
      const newLayer = drawBoardRef.current.createVirtualLayer(layerName);
      drawBoardRef.current.setActiveVirtualLayer(newLayer.id);
      updateVirtualLayerState();
    }
  };

  const handleDeleteLayer = (layerId: string) => {
    if (!drawBoardRef.current) return;

    const layer = drawBoardRef.current.getVirtualLayer(layerId);
    if (layer && confirm(`确定要删除图层 "${layer.name}" 吗？`)) {
      drawBoardRef.current.deleteVirtualLayer(layerId);
      updateVirtualLayerState();
    }
  };

  const handleSetActiveLayer = (layerId: string) => {
    if (!drawBoardRef.current) return;

    drawBoardRef.current.setActiveVirtualLayer(layerId);
    updateVirtualLayerState();
  };

  const handleToggleLayerVisibility = async (layerId: string) => {
    if (!drawBoardRef.current) return;

    const layer = drawBoardRef.current.getVirtualLayer(layerId);
    if (layer) {
      await drawBoardRef.current.setVirtualLayerVisible(layerId, !layer.visible);
      updateVirtualLayerState();
    }
  };

  const handleToggleLayerLock = (layerId: string) => {
    if (!drawBoardRef.current) return;

    const layer = drawBoardRef.current.getVirtualLayer(layerId);
    if (layer) {
      drawBoardRef.current.setVirtualLayerLocked(layerId, !layer.locked);
      updateVirtualLayerState();
    }
  };

  const handleRenameLayer = (layerId: string) => {
    if (!drawBoardRef.current) return;

    const layer = drawBoardRef.current.getVirtualLayer(layerId);
    if (layer) {
      const newName = prompt('请输入新的图层名称:', layer.name);
      if (newName && newName.trim()) {
        drawBoardRef.current.renameVirtualLayer(layerId, newName.trim());
        updateVirtualLayerState();
      }
    }
  };

  const handleSetLayerOpacity = async (layerId: string) => {
    if (!drawBoardRef.current) return;

    const layer = drawBoardRef.current.getVirtualLayer(layerId);
    if (layer) {
      const opacity = prompt('请输入透明度 (0-100):', Math.round(layer.opacity * 100).toString());
      if (opacity !== null) {
        const opacityValue = parseInt(opacity) / 100;
        if (!isNaN(opacityValue) && opacityValue >= 0 && opacityValue <= 1) {
          await drawBoardRef.current.setVirtualLayerOpacity(layerId, opacityValue);
          updateVirtualLayerState();
        }
      }
    }
  };

  const handleClearCanvas = () => {
    if (!drawBoardRef.current) return;
    drawBoardRef.current.clear();
    updateVirtualLayerState();
  };

  const handleUndo = () => {
    if (!drawBoardRef.current) return;
    drawBoardRef.current.undo();
    updateVirtualLayerState();
  };

  const handleRedo = () => {
    if (!drawBoardRef.current) return;
    drawBoardRef.current.redo();
    updateVirtualLayerState();
  };

  return (
    <div className="virtual-layer-demo">
      <div className="demo-header">
        <h1>虚拟图层演示</h1>
        <p>演示 DrawBoard 的虚拟图层功能 - 每个绘制动作都可以分配到不同的虚拟图层</p>
      </div>

      <div className="demo-content">
        {/* 控制面板 */}
        <div className="control-panel">
          <div className="panel-section">
            <h3>工具控制</h3>
            <div className="tool-buttons">
              <button onClick={() => drawBoardRef.current?.setTool('pen')}>画笔</button>
                             <button onClick={() => drawBoardRef.current?.setTool('pen')}>毛笔</button>
              <button onClick={() => drawBoardRef.current?.setTool('rect')}>矩形</button>
              <button onClick={() => drawBoardRef.current?.setTool('circle')}>圆形</button>
              <button onClick={() => drawBoardRef.current?.setTool('line')}>直线</button>
            </div>
          </div>

          <div className="panel-section">
            <h3>颜色和线宽</h3>
            <div className="style-controls">
              <input
                type="color"
                onChange={(e) => drawBoardRef.current?.setColor(e.target.value)}
                defaultValue="#000000"
              />
              <input
                type="range"
                min="1"
                max="20"
                defaultValue="2"
                onChange={(e) => drawBoardRef.current?.setLineWidth(parseInt(e.target.value))}
              />
                             <span>线宽: 2</span>
            </div>
          </div>

          <div className="panel-section">
            <h3>操作</h3>
            <div className="action-buttons">
              <button onClick={handleClearCanvas}>清空</button>
              <button onClick={handleUndo} disabled={!drawBoardRef.current?.canUndo()}>撤销</button>
              <button onClick={handleRedo} disabled={!drawBoardRef.current?.canRedo()}>重做</button>
            </div>
          </div>
        </div>

        {/* 画布区域 */}
        <div className="canvas-container">
          <div ref={containerRef} className="drawboard-container" />
        </div>

        {/* 虚拟图层面板 */}
        <div className="layer-panel">
          <div className="panel-header">
            <h3>虚拟图层</h3>
            <button onClick={handleCreateLayer} className="btn-create">新建图层</button>
          </div>

          <div className="layer-list">
            {virtualLayers.map((layer) => (
              <div
                key={layer.id}
                className={`layer-item ${activeLayer?.id === layer.id ? 'active' : ''} ${!layer.visible ? 'hidden' : ''} ${layer.locked ? 'locked' : ''}`}
              >
                <div className="layer-info">
                  <div className="layer-name">{layer.name}</div>
                  <div className="layer-stats">
                    {layer.actionIds.length} 个动作 | 透明度: {Math.round(layer.opacity * 100)}%
                  </div>
                </div>
                
                <div className="layer-controls">
                  <button
                    onClick={() => handleSetActiveLayer(layer.id)}
                    className="btn-activate"
                    title="设为活动图层"
                  >
                    {activeLayer?.id === layer.id ? '✓' : '○'}
                  </button>
                  
                  <button
                    onClick={() => handleToggleLayerVisibility(layer.id)}
                    className="btn-visibility"
                    title={layer.visible ? '隐藏图层' : '显示图层'}
                  >
                    {layer.visible ? '👁️' : '👁️‍🗨️'}
                  </button>
                  
                  <button
                    onClick={() => handleToggleLayerLock(layer.id)}
                    className="btn-lock"
                    title={layer.locked ? '解锁图层' : '锁定图层'}
                  >
                    {layer.locked ? '🔒' : '🔓'}
                  </button>
                  
                  <button
                    onClick={() => handleSetLayerOpacity(layer.id)}
                    className="btn-opacity"
                    title="设置透明度"
                  >
                    🎨
                  </button>
                  
                  <button
                    onClick={() => handleRenameLayer(layer.id)}
                    className="btn-rename"
                    title="重命名"
                  >
                    ✏️
                  </button>
                  
                  <button
                    onClick={() => handleDeleteLayer(layer.id)}
                    className="btn-delete"
                    title="删除图层"
                    disabled={virtualLayers.length <= 1}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>

          {layerStats && (
            <div className="layer-stats-panel">
              <h4>统计信息</h4>
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
                  <span className="stat-label">总动作:</span>
                  <span className="stat-value">{layerStats.totalActions}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="demo-footer">
        <h3>使用说明</h3>
        <ul>
          <li>选择工具后，在画布上绘制</li>
          <li>每个绘制动作会自动分配到当前活动的虚拟图层</li>
          <li>可以创建多个虚拟图层，每个图层可以独立控制可见性、透明度、锁定状态</li>
          <li>虚拟图层是逻辑概念，物理上仍然使用 CanvasEngine 的三层架构</li>
          <li>删除图层时，其中的动作会自动移动到默认图层</li>
        </ul>
      </div>
    </div>
  );
};

export default VirtualLayerDemo; 