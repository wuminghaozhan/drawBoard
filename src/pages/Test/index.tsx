import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { DrawBoard } from '@/libs/drawBoard';
import type { ToolType } from '@/libs/drawBoard';
import { LayerManager, type Layer } from '@/libs/drawBoard/core/LayerManager';
import ToolPanel from '@/components/ToolPanel';
import { StrokeControlPanel } from '@/components/StrokeControlPanel';
import { StrokePresetSelector } from '@/components/StrokePresetSelector';
import './style.scss';

// 优化：将接口定义提取到组件外部
interface PerformanceData {
  fps: number;
  memoryUsage: number;
  renderTime: number;
  actionCount: number;
}

interface LayerStats {
  totalLayers: number;
  visibleLayers: number;
  lockedLayers: number;
  totalActions: number;
}

const Test: React.FC = () => {
  console.log('=== Test component rendering ===');
  
  const containerRef = useRef<HTMLDivElement>(null);
  const drawBoardRef = useRef<DrawBoard | null>(null);
  const layerManagerRef = useRef<LayerManager | null>(null);
  const initializationRef = useRef<boolean>(false);
  
  // 基础状态 - 合并相关状态
  const [toolState, setToolState] = useState({
    currentTool: 'pen' as ToolType,
    currentColor: '#000000',
    currentLineWidth: 2,
    showGrid: false,
  });
  
  const [boardState, setBoardState] = useState({
    canUndo: false,
    canRedo: false,
    historyCount: 0,
    hasSelection: false,
  });

  // 面板显示状态 - 合并为对象
  const [panelStates, setPanelStates] = useState({
    showStroke: false,
    showPreset: false,
    showLayer: false,
    showGeometry: false,
    showPerformance: false,
    showInfo: true,
  });
  
  // 移动端状态
  const [isMobile, setIsMobile] = useState(false);
  const [showToolPanel, setShowToolPanel] = useState(false);

  // 图层状态 - 合并为对象
  const [layerState, setLayerState] = useState({
    layers: [] as Layer[],
    activeLayerId: '',
    stats: { totalLayers: 0, visibleLayers: 0, lockedLayers: 0, totalActions: 0 } as LayerStats,
  });

  // 几何工具状态 - 合并为对象
  const [geometryState, setGeometryState] = useState({
    lineType: 'line' as 'line' | 'arrow' | 'dashed',
    arrowStyle: 'end' as 'none' | 'start' | 'end' | 'both',
    polygonType: 'triangle' as 'triangle' | 'square' | 'pentagon' | 'hexagon' | 'star' | 'custom',
    polygonSides: 5,
    fillMode: 'stroke' as 'stroke' | 'fill' | 'both',
  });

  // 性能监控状态
  const [performanceData, setPerformanceData] = useState<PerformanceData>({
    fps: 0,
    memoryUsage: 0,
    renderTime: 0,
    actionCount: 0
  });

  // 优化：使用 useCallback 来避免不必要的重新创建
  const updateState = useCallback(() => {
    if (drawBoardRef.current) {
      const state = drawBoardRef.current.getState();
      setBoardState({
        canUndo: state.canUndo,
        canRedo: state.canRedo,
        historyCount: state.historyCount,
        hasSelection: drawBoardRef.current.hasSelection(),
      });
    }
  }, []);

  const updateLayerState = useCallback(() => {
    if (layerManagerRef.current) {
      const allLayers = layerManagerRef.current.getAllLayers();
      const activeLayer = layerManagerRef.current.getActiveLayer();
      const stats = layerManagerRef.current.getLayerStats();
      
      setLayerState({
        layers: allLayers,
        activeLayerId: activeLayer?.id || '',
        stats,
      });
    }
  }, []);

  // 优化：使用 useCallback 和 useMemo 来优化性能监控
  const updatePerformanceData = useCallback(() => {
    if (drawBoardRef.current) {
      const state = drawBoardRef.current.getState();
      const memoryInfo = (performance as any).memory;
      
      setPerformanceData({
        fps: Math.round(60), // 模拟FPS
        memoryUsage: memoryInfo ? Math.round(memoryInfo.usedJSHeapSize / 1024 / 1024) : 0,
        renderTime: Math.round(Math.random() * 5),
        actionCount: state.historyCount
      });
    }
  }, []);

  // 检测移动端 - 优化
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 优化：改进初始化逻辑
  useEffect(() => {
    console.log('=== Test useEffect triggered ===');
    
    // 防止重复初始化
    if (initializationRef.current || !containerRef.current || drawBoardRef.current) {
      return;
    }
    
    initializationRef.current = true;
    
    const initializeDrawBoard = async () => {
      const container = containerRef.current!;
      
      console.log('=== 开始初始化画板 ===');
      console.log('容器尺寸:', {
        offsetWidth: container.offsetWidth,
        offsetHeight: container.offsetHeight,
        clientWidth: container.clientWidth,
        clientHeight: container.clientHeight
      });
      
      // 确保容器有正确的尺寸
      if (container.offsetWidth === 0 || container.offsetHeight === 0) {
        console.warn('容器尺寸为0，等待容器准备就绪...');
        
        // 使用 requestAnimationFrame 等待容器准备就绪
        await new Promise<void>((resolve) => {
          const checkSize = () => {
            if (container.offsetWidth > 0 && container.offsetHeight > 0) {
              resolve();
            } else {
              requestAnimationFrame(checkSize);
            }
          };
          checkSize();
        });
      }
      
      try {
        // 优化：使用更精简的配置
        drawBoardRef.current = new DrawBoard(container, {
          maxHistorySize: 100,
          enableShortcuts: true,
          performanceConfig: {
            maxCacheMemoryMB: 100,
            complexityThreshold: 20,
            enableMemoryMonitoring: true,
          }
        });

        // 初始化图层管理器
        layerManagerRef.current = new LayerManager({
          maxLayers: 20,
          defaultLayerName: '图层'
        });

        console.log('=== DrawBoard创建成功 ===');
        
        // 验证canvas创建
        const canvases = container.querySelectorAll('canvas');
        console.log('找到的canvas元素数量:', canvases.length);
        
        if (canvases.length === 0) {
          throw new Error('Canvas未成功创建');
        }
        
        // 初始化状态
        updateState();
        updateLayerState();
        
        // 启动性能监控
        const performanceInterval = setInterval(updatePerformanceData, 2000);
        
        // 清理函数
        return () => {
          clearInterval(performanceInterval);
        };
        
      } catch (error) {
        console.error('=== DrawBoard创建失败 ===', error);
        initializationRef.current = false;
      }
    };
    
    // 延迟执行以确保DOM完全渲染
    const timeoutId = setTimeout(initializeDrawBoard, 50);
    
    return () => {
      clearTimeout(timeoutId);
      console.log('=== useEffect cleanup ===');
      if (drawBoardRef.current) {
        drawBoardRef.current.destroy();
        drawBoardRef.current = null;
      }
      if (layerManagerRef.current) {
        layerManagerRef.current.destroy();
        layerManagerRef.current = null;
      }
      initializationRef.current = false;
    };
  }, [updateState, updateLayerState, updatePerformanceData]);

  // 优化：合并工具事件处理
  const handleToolChange = useCallback((tool: ToolType) => {
    setToolState(prev => ({ ...prev, currentTool: tool }));
    drawBoardRef.current?.setTool(tool);
    updateState();
  }, [updateState]);

  const handleColorChange = useCallback((color: string) => {
    setToolState(prev => ({ ...prev, currentColor: color }));
    drawBoardRef.current?.setColor(color);
  }, []);

  const handleLineWidthChange = useCallback((width: number) => {
    setToolState(prev => ({ ...prev, currentLineWidth: width }));
    drawBoardRef.current?.setLineWidth(width);
  }, []);

  // 优化：合并历史操作
  const historyHandlers = useMemo(() => ({
    undo: () => {
      drawBoardRef.current?.undo();
      updateState();
      updateLayerState();
    },
    redo: () => {
      drawBoardRef.current?.redo();
      updateState();
      updateLayerState();
    },
    clear: () => {
      drawBoardRef.current?.clear();
      updateState();
      updateLayerState();
    },
  }), [updateState, updateLayerState]);

  // 优化：合并选择操作
  const selectionHandlers = useMemo(() => ({
    clearSelection: () => {
      drawBoardRef.current?.clearSelection();
      updateState();
    },
    deleteSelection: () => {
      drawBoardRef.current?.deleteSelection();
      updateState();
    },
    copySelection: () => {
      const copiedActions = drawBoardRef.current?.copySelection();
      if (copiedActions && copiedActions.length > 0) {
        alert(`已复制 ${copiedActions.length} 个绘制对象`);
      }
    },
  }), [updateState]);

  // 监听窗口大小变化
  useEffect(() => {
    const handleResize = () => {
      drawBoardRef.current?.resize();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 优化：合并其他处理函数
  const otherHandlers = useMemo(() => ({
    save: () => drawBoardRef.current?.saveAsImage('测试画板'),
    copy: async () => {
      const success = await drawBoardRef.current?.copyToClipboard();
      alert(success ? '已复制到剪贴板！' : '复制失败，请重试');
    },
    toggleGrid: () => {
      const newShowGrid = !toolState.showGrid;
      setToolState(prev => ({ ...prev, showGrid: newShowGrid }));
      drawBoardRef.current?.showGrid(newShowGrid);
    },
  }), [toolState.showGrid]);

  // 图层管理处理函数 - 优化
  const layerHandlers = useMemo(() => ({
    create: () => {
      if (layerManagerRef.current) {
        try {
          const newLayer = layerManagerRef.current.createLayer();
          layerManagerRef.current.setActiveLayer(newLayer.id);
          updateLayerState();
        } catch (error) {
          alert(`创建图层失败: ${error}`);
        }
      }
    },
    delete: (layerId: string) => {
      if (layerManagerRef.current?.deleteLayer(layerId)) {
        updateLayerState();
      } else {
        alert('无法删除图层');
      }
    },
    select: (layerId: string) => {
      if (layerManagerRef.current?.setActiveLayer(layerId)) {
        updateLayerState();
      }
    },
    toggleVisibility: (layerId: string) => {
      if (layerManagerRef.current) {
        const layer = layerManagerRef.current.getLayer(layerId);
        if (layer) {
          layerManagerRef.current.setLayerVisible(layerId, !layer.visible);
          updateLayerState();
        }
      }
    },
    toggleLock: (layerId: string) => {
      if (layerManagerRef.current) {
        const layer = layerManagerRef.current.getLayer(layerId);
        if (layer) {
          layerManagerRef.current.setLayerLocked(layerId, !layer.locked);
          updateLayerState();
        }
      }
    },
    changeOpacity: (layerId: string, opacity: number) => {
      layerManagerRef.current?.setLayerOpacity(layerId, opacity / 100);
      updateLayerState();
    },
    rename: (layerId: string) => {
      const layer = layerManagerRef.current?.getLayer(layerId);
      if (layer) {
        const newName = prompt('请输入新的图层名称:', layer.name);
        if (newName && layerManagerRef.current) {
          layerManagerRef.current.renameLayer(layerId, newName);
          updateLayerState();
        }
      }
    },
  }), [updateLayerState]);

  // 面板切换处理 - 优化
  const togglePanel = useCallback((panelName: keyof typeof panelStates) => {
    setPanelStates(prev => ({
      ...prev,
      [panelName]: !prev[panelName]
    }));
  }, []);

  // 导入导出处理 - 优化
  const dataHandlers = useMemo(() => ({
    export: () => {
      if (layerManagerRef.current && drawBoardRef.current) {
        const exportData = {
          layers: layerManagerRef.current.exportLayers(),
          settings: {
            ...toolState,
            timestamp: Date.now()
          }
        };
        
        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `drawboard-export-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        
        URL.revokeObjectURL(url);
      }
    },
    import: (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);
          
          if (layerManagerRef.current && data.layers) {
            layerManagerRef.current.importLayers(data.layers);
            updateLayerState();
          }
          
          if (data.settings) {
            setToolState(prev => ({
              ...prev,
              ...data.settings
            }));
          }
          
          alert('数据导入成功！');
        } catch (error) {
          alert('导入失败：文件格式错误');
        }
      };
      
      reader.readAsText(file);
      event.target.value = '';
    },
  }), [toolState, updateLayerState]);

  console.log('Test component rendering JSX...');
  
  return (
    <div className="test-page">
      {/* 功能说明面板 - 优化后的版本 */}
      <div className={`feature-info ${panelStates.showInfo ? 'expanded' : 'collapsed'}`}>
        <div className="info-toggle" onClick={() => togglePanel('showInfo')}>
          <h3>🧪 DrawBoard 完整功能测试 {panelStates.showInfo ? '📖' : '📄'}</h3>
          <button className="toggle-btn">
            {panelStates.showInfo ? '收起' : '展开'}
          </button>
        </div>
        
        {panelStates.showInfo && (
          <div className="info-content">
            <p>这里集成了所有绘图功能，可以体验完整的专业绘图体验</p>
            
            <div className="feature-list">
              <div className="feature-category">
                <h4>🎨 绘图工具</h4>
                <ul>
                  <li>✏️ 画笔工具 - 支持压感和运笔效果</li>
                  <li>🔲 矩形工具 - 绘制矩形</li>
                  <li>⭕ 圆形工具 - 绘制圆形</li>
                  <li>📏 直线工具 - 支持箭头和虚线</li>
                  <li>🔷 多边形工具 - 三角形到多边形</li>
                  <li>📝 文字工具 - 添加文字</li>
                  <li>🧽 橡皮擦 - 擦除内容</li>
                  <li>🎯 选择工具 - 选择和变换</li>
                </ul>
              </div>
              
              <div className="feature-category">
                <h4>⚡ 高级功能</h4>
                <ul>
                  <li>📚 图层管理 - 多图层支持</li>
                  <li>🎨 笔触预设 - 钢笔、毛笔等</li>
                  <li>✏️ 运笔效果 - 压感、速度控制</li>
                  <li>🔷 几何设置 - 箭头、填充模式</li>
                  <li>⚡ 性能监控 - 实时性能数据</li>
                  <li>💾 导入导出 - 保存和加载数据</li>
                </ul>
              </div>
              
              <div className="feature-category">
                <h4>🔧 快捷键</h4>
                <ul>
                  <li>P - 画笔工具</li>
                  <li>R - 矩形工具</li>
                  <li>C - 圆形工具</li>
                  <li>L - 直线工具</li>
                  <li>S - 选择工具</li>
                  <li>E - 橡皮擦</li>
                  <li>Ctrl+Z - 撤销</li>
                  <li>Ctrl+Y - 重做</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="main-content">
        {/* 桌面端工具栏 */}
        {!isMobile && (
          <ToolPanel
            currentTool={toolState.currentTool}
            currentColor={toolState.currentColor}
            currentLineWidth={toolState.currentLineWidth}
            canUndo={boardState.canUndo}
            canRedo={boardState.canRedo}
            historyCount={boardState.historyCount}
            hasSelection={boardState.hasSelection}
            onToolChange={handleToolChange}
            onColorChange={handleColorChange}
            onLineWidthChange={handleLineWidthChange}
            onUndo={historyHandlers.undo}
            onRedo={historyHandlers.redo}
            onClear={historyHandlers.clear}
            onClearSelection={selectionHandlers.clearSelection}
            onDeleteSelection={selectionHandlers.deleteSelection}
            onCopySelection={selectionHandlers.copySelection}
            onSave={otherHandlers.save}
            onCopy={otherHandlers.copy}
          />
        )}
        
        <div className="board-container">
          <div className="board-controls">
            <button 
              onClick={() => togglePanel('showInfo')}
              className={`info-toggle-btn ${panelStates.showInfo ? 'active' : ''}`}
              title="切换功能说明"
            >
              📖 {!isMobile && '说明'}
            </button>

            {isMobile && (
              <button 
                onClick={() => setShowToolPanel(!showToolPanel)}
                className="mobile-tool-toggle"
                title="切换工具栏"
              >
                {showToolPanel ? '✕' : '⚙️'}
              </button>
            )}
            
            <button 
              onClick={otherHandlers.toggleGrid}
              className={`grid-toggle ${toolState.showGrid ? 'active' : ''}`}
              title="显示/隐藏网格"
            >
              {toolState.showGrid ? '🔲' : '⬜'} {!isMobile && '网格'}
            </button>
            
            <button 
              onClick={() => togglePanel('showStroke')}
              className={`stroke-toggle ${panelStates.showStroke ? 'active' : ''}`}
              title="运笔效果控制"
            >
              ✏️ {!isMobile && '运笔'}
            </button>

            <button 
              onClick={() => togglePanel('showPreset')}
              className={`preset-toggle ${panelStates.showPreset ? 'active' : ''}`}
              title="笔触预设"
            >
              🎨 {!isMobile && '预设'}
            </button>

            <button 
              onClick={() => togglePanel('showLayer')}
              className={`layer-toggle ${panelStates.showLayer ? 'active' : ''}`}
              title="图层管理"
            >
              📚 {!isMobile && '图层'}
            </button>

            <button 
              onClick={() => togglePanel('showGeometry')}
              className={`geometry-toggle ${panelStates.showGeometry ? 'active' : ''}`}
              title="几何工具设置"
            >
              🔷 {!isMobile && '几何'}
            </button>

            <button 
              onClick={() => togglePanel('showPerformance')}
              className={`performance-toggle ${panelStates.showPerformance ? 'active' : ''}`}
              title="性能监控"
            >
              ⚡ {!isMobile && '性能'}
            </button>

            <button 
              onClick={dataHandlers.export}
              className="export-btn"
              title="导出数据"
            >
              💾 {!isMobile && '导出'}
            </button>

            <label className="import-btn" title="导入数据">
              📁 {!isMobile && '导入'}
              <input 
                type="file" 
                accept=".json" 
                onChange={dataHandlers.import}
                style={{ display: 'none' }}
              />
            </label>
          </div>
          
          {/* 移动端工具栏 */}
          {isMobile && showToolPanel && (
            <div className="mobile-tool-panel">
              <ToolPanel
                currentTool={toolState.currentTool}
                currentColor={toolState.currentColor}
                currentLineWidth={toolState.currentLineWidth}
                canUndo={boardState.canUndo}
                canRedo={boardState.canRedo}
                historyCount={boardState.historyCount}
                hasSelection={boardState.hasSelection}
                onToolChange={handleToolChange}
                onColorChange={handleColorChange}
                onLineWidthChange={handleLineWidthChange}
                onUndo={historyHandlers.undo}
                onRedo={historyHandlers.redo}
                onClear={historyHandlers.clear}
                onClearSelection={selectionHandlers.clearSelection}
                onDeleteSelection={selectionHandlers.deleteSelection}
                onCopySelection={selectionHandlers.copySelection}
                onSave={otherHandlers.save}
                onCopy={otherHandlers.copy}
              />
            </div>
          )}
          
          {/* 画板容器 - 优化后的单一版本 */}
          <div 
            ref={containerRef}
            className="draw-board"
            style={{ 
              position: 'absolute',
              top: '60px',
              left: '10px',
              right: '10px',
              bottom: '10px',
              backgroundColor: 'white',
              border: '1px solid #ddd',
              borderRadius: '4px',
            }}
          />
          
          {/* 调试信息面板 - 优化 */}
          <div className="debug-panel">
            <div>状态: {drawBoardRef.current ? '✅ 已创建' : '❌ 未创建'}</div>
            <div>容器: {containerRef.current ? `${containerRef.current.offsetWidth}x${containerRef.current.offsetHeight}` : '未知'}</div>
            <div>Canvas: {containerRef.current ? containerRef.current.querySelectorAll('canvas').length : 0}</div>
            <div>内存: {performanceData.memoryUsage}MB</div>
          </div>
          
          {/* 功能面板 */}
          <StrokeControlPanel
            drawBoard={drawBoardRef.current}
            visible={panelStates.showStroke}
            onConfigChange={(config) => console.log('运笔配置:', config)}
          />

          <StrokePresetSelector
            onPresetChange={(preset) => console.log('预设:', preset)}
            visible={panelStates.showPreset}
            onClose={() => togglePanel('showPreset')}
          />

          {/* 图层管理面板 - 简化版本 */}
          {panelStates.showLayer && (
            <div className="layer-panel">
              <div className="panel-header">
                <h3>📚 图层管理</h3>
                <button onClick={() => togglePanel('showLayer')}>✕</button>
              </div>
              
              <div className="layer-stats">
                <div className="stat-item">总计: {layerState.stats.totalLayers}</div>
                <div className="stat-item">可见: {layerState.stats.visibleLayers}</div>
                <div className="stat-item">锁定: {layerState.stats.lockedLayers}</div>
                <div className="stat-item">操作: {layerState.stats.totalActions}</div>
              </div>

              <div className="layer-actions">
                <button onClick={layerHandlers.create} className="btn btn-primary">
                  ➕ 新建图层
                </button>
              </div>

              <div className="layer-list">
                {layerState.layers.map((layer) => (
                  <div 
                    key={layer.id}
                    className={`layer-item ${layer.id === layerState.activeLayerId ? 'active' : ''} ${layer.locked ? 'locked' : ''}`}
                    onClick={() => layerHandlers.select(layer.id)}
                  >
                    <div className="layer-info">
                      <div className="layer-name" onDoubleClick={() => layerHandlers.rename(layer.id)}>
                        {layer.name}
                        {layer.locked && <span className="lock-icon">🔒</span>}
                      </div>
                      <div className="layer-meta">
                        {layer.actions.length} 个操作 | {Math.round(layer.opacity * 100)}%
                      </div>
                    </div>
                    
                    <div className="layer-controls">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          layerHandlers.toggleVisibility(layer.id);
                        }}
                        className={`visibility-btn ${layer.visible ? 'visible' : 'hidden'}`}
                      >
                        {layer.visible ? '👁️' : '🚫'}
                      </button>
                      
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          layerHandlers.toggleLock(layer.id);
                        }}
                        className={`lock-btn ${layer.locked ? 'locked' : 'unlocked'}`}
                      >
                        {layer.locked ? '🔒' : '🔓'}
                      </button>
                      
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          layerHandlers.delete(layer.id);
                        }}
                        className="delete-btn"
                      >
                        🗑️
                      </button>
                    </div>
                    
                    <div className="opacity-control">
                      <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        value={Math.round(layer.opacity * 100)}
                        onChange={(e) => layerHandlers.changeOpacity(layer.id, parseInt(e.target.value))}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 几何工具面板 - 简化版本 */}
          {panelStates.showGeometry && (toolState.currentTool === 'line' || toolState.currentTool === 'polygon') && (
            <div className="geometry-panel">
              <div className="panel-header">
                <h3>🔷 几何工具设置</h3>
                <button onClick={() => togglePanel('showGeometry')}>✕</button>
              </div>
              
              {toolState.currentTool === 'line' && (
                <div className="line-settings">
                  <div className="setting-group">
                    <label>线条类型:</label>
                    <select 
                      value={geometryState.lineType} 
                      onChange={(e) => setGeometryState(prev => ({ 
                        ...prev, 
                        lineType: e.target.value as any 
                      }))}
                    >
                      <option value="line">直线</option>
                      <option value="arrow">箭头</option>
                      <option value="dashed">虚线</option>
                    </select>
                  </div>
                </div>
              )}
              
              {toolState.currentTool === 'polygon' && (
                <div className="polygon-settings">
                  <div className="setting-group">
                    <label>多边形类型:</label>
                    <select 
                      value={geometryState.polygonType} 
                      onChange={(e) => setGeometryState(prev => ({ 
                        ...prev, 
                        polygonType: e.target.value as any 
                      }))}
                    >
                      <option value="triangle">三角形</option>
                      <option value="square">正方形</option>
                      <option value="pentagon">五边形</option>
                      <option value="hexagon">六边形</option>
                      <option value="star">五角星</option>
                      <option value="custom">自定义</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 性能监控面板 - 简化版本 */}
          {panelStates.showPerformance && (
            <div className="performance-panel">
              <div className="panel-header">
                <h3>⚡ 性能监控</h3>
                <button onClick={() => togglePanel('showPerformance')}>✕</button>
              </div>
              
              <div className="performance-stats">
                <div className="stat-item">
                  <span className="stat-label">FPS:</span>
                  <span className="stat-value">{performanceData.fps}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">内存 (MB):</span>
                  <span className="stat-value">{performanceData.memoryUsage}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">操作数量:</span>
                  <span className="stat-value">{performanceData.actionCount}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Test; 