import React, { useState, useRef, useEffect } from 'react';
import { DrawBoard } from '@/libs/drawBoard';
import type { ToolType } from '@/libs/drawBoard';
import type { VirtualLayer } from '@/libs/drawBoard/core/VirtualLayerManager';
import './style.scss';

const Test: React.FC = () => {
  const [drawData, setDrawData] = useState({
    color: '#000000',
    lineWidth: 2,
    tool: 'pen' as ToolType
  });
  
  const [cursorState, setCursorState] = useState({
    isDrawing: false,
    toolLoadingState: 'idle' as 'idle' | 'loading' | 'ready' | 'error'
  });

  // 虚拟图层状态
  const [virtualLayers, setVirtualLayers] = useState<VirtualLayer[]>([]);
  const [activeLayer, setActiveLayer] = useState<VirtualLayer | null>(null);
  const [layerStats, setLayerStats] = useState<{
    totalLayers: number;
    visibleLayers: number;
    lockedLayers: number;
    totalActions: number;
  } | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const drawBoardRef = useRef<DrawBoard | null>(null);

  // 更新虚拟图层状态
  const updateVirtualLayerState = () => {
    if (!drawBoardRef.current) return;

    const layers = drawBoardRef.current.getAllVirtualLayers();
    const active = drawBoardRef.current.getActiveVirtualLayer();
    const stats = drawBoardRef.current.getVirtualLayerStats();

    setVirtualLayers(layers);
    setActiveLayer(active);
    setLayerStats(stats);
  };

  // 初始化DrawBoard
  useEffect(() => {
    // 使用ref来跟踪初始化状态，避免React严格模式的双重调用
    const initRef = { initialized: false };

    const initDrawBoard = () => {
      const container = containerRef.current;
      if (!container) return;

      // 检查是否已经初始化
      if (initRef.initialized || drawBoardRef.current) {
        return;
      }

      // 等待容器渲染完成
      if (container.offsetWidth === 0 || container.offsetHeight === 0) {
        setTimeout(initDrawBoard, 100);
        return;
      }

      initRef.initialized = true;

      try {
        // 创建DrawBoard实例
        drawBoardRef.current = DrawBoard.getInstance(container, {
          maxHistorySize: 100,
          enableShortcuts: true
        });

        
        // 监听状态变化
        drawBoardRef.current.onStateChange((state) => {
          setCursorState({
            isDrawing: state.drawingState?.isDrawing || false,
            toolLoadingState: drawBoardRef.current?.getToolLoadingState() || 'idle'
          });
        });
        
        // 初始化默认工具
        drawBoardRef.current.initializeDefaultTools().then(() => {
          
          // 设置初始工具和颜色
          if (drawBoardRef.current) {
            drawBoardRef.current.setTool(drawData.tool);
            drawBoardRef.current.setColor(drawData.color);
            drawBoardRef.current.setLineWidth(drawData.lineWidth);
            
            // 更新虚拟图层状态
            updateVirtualLayerState();
          }
        }).catch(error => {
          console.error('Failed to initialize default tools:', error);
        });

      } catch (error) {
        console.error('DrawBoard initialization failed:', error);
        initRef.initialized = false; // 重置状态，允许重试
      }
    };

    initDrawBoard();
    setTimeout(() => {
      // 测试快捷键功能
      if (drawBoardRef.current) {
        const shortcuts = drawBoardRef.current.getShortcuts();
      }
    }, 4000);

    // 清理函数
    return () => {
      if (drawBoardRef.current) {
        const container = containerRef.current;
        if (container) {
          DrawBoard.destroyInstance(container);
        } else {
          drawBoardRef.current.destroy();
        }
        drawBoardRef.current = null;
        initRef.initialized = false; // 重置初始化状态
      }
    };
  }, []);

  // 更新工具设置
  useEffect(() => {
    if (drawBoardRef.current) {
      drawBoardRef.current.setTool(drawData.tool);
      drawBoardRef.current.setColor(drawData.color);
      drawBoardRef.current.setLineWidth(drawData.lineWidth);
    }
  }, [drawData]);

  // 清空画布
  const clearCanvas = () => {
    if (drawBoardRef.current) {
      drawBoardRef.current.clear();
    }
  };

  // 撤销
  const undo = () => {
    if (drawBoardRef.current) {
      drawBoardRef.current.undo();
    }
  };

  // 重做
  const redo = () => {
    if (drawBoardRef.current) {
      drawBoardRef.current.redo();
    }
  };

  // 导出图片
  const exportImage = () => {
    if (drawBoardRef.current) {
      drawBoardRef.current.saveAsImage(`drawing-${Date.now()}.png`);
    }
  };

  // 测试光标功能
  const testCursor = () => {
    if (drawBoardRef.current) {
      const cursors = ['default', 'crosshair', 'pointer', 'text', 'grab', 'none'];
      let index = 0;
      
      const interval = setInterval(() => {
        if (index < cursors.length) {
          drawBoardRef.current!.setCursor(cursors[index]);
          index++;
        } else {
          clearInterval(interval);
          // 恢复默认光标
          drawBoardRef.current!.setTool(drawData.tool);
        }
      }, 1000);
    }
  };

  // 重新计算复杂度
  const recalculateComplexity = () => {
    if (drawBoardRef.current) {
      drawBoardRef.current.recalculateComplexity();
    }
  };

  // 获取复杂度统计
  const getComplexityStats = () => {
    if (drawBoardRef.current) {
      const stats = drawBoardRef.current.getComplexityStats();
      alert(`复杂度统计:\n总复杂度: ${stats.totalComplexity}\n平均复杂度: ${stats.averageComplexity.toFixed(1)}\n重新计算次数: ${stats.recalculationCount}`);
    }
  };

  // 测试工具类型
  const testToolTypes = () => {
    if (!drawBoardRef.current) return;
    
    const toolManager = drawBoardRef.current.getToolManager();
    const availableTools = toolManager.getAvailableToolTypes();
    const toolNames = toolManager.getToolNames();
    const stats = toolManager.getStats();
    
    
    // 添加更详细的调试信息
    
    alert(`可用工具类型: ${availableTools.join(', ')}\n\n工具统计:\n- 当前工具: ${stats.currentTool}\n- 加载状态: ${stats.loadingState}\n- 可用工具数: ${stats.availableTools}\n- 缓存工具数: ${stats.cachedTools}`);
  };

  // 图层控制
  const [layerVisibility, setLayerVisibility] = useState({
    background: true,
    draw: true,
    interaction: true
  });

  const toggleLayer = (layerName: string) => {
    if (drawBoardRef.current) {
      const newVisible = !layerVisibility[layerName as keyof typeof layerVisibility];
      drawBoardRef.current.setLayerVisible(layerName, newVisible);
      setLayerVisibility(prev => ({
        ...prev,
        [layerName]: newVisible
      }));
    }
  };

  // 虚拟图层管理功能
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

  const handleToggleLayerVisibility = (layerId: string) => {
    if (!drawBoardRef.current) return;

    const layer = drawBoardRef.current.getVirtualLayer(layerId);
    if (layer) {
      drawBoardRef.current.setVirtualLayerVisible(layerId, !layer.visible).then(() => {
        updateVirtualLayerState();
      });
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

  // 获取三层物理canvas信息
  const getCanvasLayersInfo = () => {
    if (!drawBoardRef.current) return null;
    
    try {
      // 通过反射获取canvasEngine
      const drawBoard = drawBoardRef.current as unknown as { 
        canvasEngine?: {
          getLayer: (name: string) => {
            canvas?: HTMLCanvasElement;
            ctx?: CanvasRenderingContext2D;
          } | null;
        } 
      };
      const canvasEngine = drawBoard.canvasEngine;
      if (canvasEngine) {
        const backgroundLayer = canvasEngine.getLayer('background');
        const drawLayer = canvasEngine.getLayer('draw');
        const interactionLayer = canvasEngine.getLayer('interaction');
        
        return {
          background: {
            canvas: backgroundLayer?.canvas,
            ctx: backgroundLayer?.ctx,
            visible: layerVisibility.background,
            width: backgroundLayer?.canvas?.width || 0,
            height: backgroundLayer?.canvas?.height || 0
          },
          draw: {
            canvas: drawLayer?.canvas,
            ctx: drawLayer?.ctx,
            visible: layerVisibility.draw,
            width: drawLayer?.canvas?.width || 0,
            height: drawLayer?.canvas?.height || 0
          },
          interaction: {
            canvas: interactionLayer?.canvas,
            ctx: interactionLayer?.ctx,
            visible: layerVisibility.interaction,
            width: interactionLayer?.canvas?.width || 0,
            height: interactionLayer?.canvas?.height || 0
          }
        };
      }
    } catch (error) {
      console.error('获取canvas层信息失败:', error);
    }
    
    return null;
  };

  // 显示canvas层信息
  const showCanvasLayersInfo = () => {
    const info = getCanvasLayersInfo();
    if (info) {
      alert(`Canvas层信息:\n\n` +
            `背景层:\n- 可见: ${info.background.visible}\n- 尺寸: ${info.background.width}x${info.background.height}\n\n` +
            `绘制层:\n- 可见: ${info.draw.visible}\n- 尺寸: ${info.draw.width}x${info.draw.height}\n\n` +
            `交互层:\n- 可见: ${info.interaction.visible}\n- 尺寸: ${info.interaction.width}x${info.interaction.height}`);
    } else {
      alert('无法获取Canvas层信息');
    }
  };

  // 显示快捷键信息
  const showShortcutsInfo = () => {
    if (!drawBoardRef.current) {
      alert('DrawBoard未初始化');
      return;
    }

    const shortcuts = drawBoardRef.current.getShortcuts();
    
    if (shortcuts.length === 0) {
      alert('没有注册的快捷键');
      return;
    }

    // 检测操作系统
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    
    // 格式化快捷键显示
    const formatShortcut = (key: string) => {
      if (isMac) {
        return key
          .replace(/Meta\+/g, '⌘+')
          .replace(/Ctrl\+/g, 'Ctrl+')
          .replace(/Alt\+/g, '⌥+')
          .replace(/Shift\+/g, '⇧+');
      }
      return key;
    };

    const shortcutsText = shortcuts.map(s => 
      `${formatShortcut(s.key)}: ${s.description}`
    ).join('\n');
    
    alert(`已注册的快捷键 (${isMac ? 'Mac' : 'Windows/Linux'}):\n\n${shortcutsText}`);
  };

  // 快捷键测试工具
  const testShortcuts = () => {
    if (!drawBoardRef.current) {
      alert('DrawBoard未初始化');
      return;
    }

    const shortcutManager = drawBoardRef.current.getShortcutManager();
    const shortcuts = shortcutManager.getShortcuts();
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    
    const testInfo = `
快捷键测试工具

系统信息:
- 操作系统: ${isMac ? 'Mac' : 'Windows/Linux'}
- 已注册快捷键: ${shortcuts.length} 个
- 快捷键管理器状态: ${shortcutManager.getEnabled() ? '✅ 启用' : '❌ 禁用'}

已注册的快捷键:
${shortcuts.map(s => `  ${s.key}: ${s.description} (优先级: ${s.priority || 0})`).join('\n')}

测试步骤:
1. 在画布上绘制一些内容
2. 尝试以下快捷键:
   ${isMac ? 
     '• Cmd+Z: 撤销\n• Cmd+Shift+Z: 重做\n• Cmd+C: 复制\n• Cmd+A: 全选\n• Cmd+S: 保存' :
     '• Ctrl+Z: 撤销\n• Ctrl+Y: 重做\n• Ctrl+C: 复制\n• Ctrl+A: 全选\n• Ctrl+S: 保存'
   }
   • Delete/Backspace: 删除
   • Escape: 取消选择

注意: 请查看控制台获取详细调试信息
    `;
    
    alert(testInfo);
  };



  return (
    <div className="test-page">
      <div className="test-header">
        <h1>🧪 DrawBoard 测试页面</h1>
        <p>测试DrawBoard的基本绘图功能</p>
      </div>

      <div className="test-content">
        <div className="control-panel">
          <div className="control-group">
            <label>工具:</label>
            <select
              value={drawData.tool}
              onChange={(e) => setDrawData(prev => ({ ...prev, tool: e.target.value as ToolType }))}
            >
              <option value="pen">画笔</option>
              <option value="rect">矩形</option>
              <option value="circle">圆形</option>
              <option value="line">直线</option>
              <option value="polygon">多边形</option>
              <option value="text">文字</option>
              <option value="eraser">橡皮擦</option>
              <option value="select">选择</option>
            </select>
          </div>

          <div className="control-group">
            <label>颜色:</label>
            <input
              type="color"
              value={drawData.color}
              onChange={(e) => setDrawData(prev => ({ ...prev, color: e.target.value }))}
            />
          </div>

          <div className="control-group">
            <label>画笔大小:</label>
            <input
              type="range"
              min="1"
              max="20"
              value={drawData.lineWidth}
              onChange={(e) => setDrawData(prev => ({ ...prev, lineWidth: parseInt(e.target.value) }))}
            />
            <span>{drawData.lineWidth}px</span>
          </div>

          <div className="control-group">
            <button onClick={clearCanvas} className="btn btn-clear">清空画布</button>
            <button onClick={undo} className="btn btn-undo">撤销</button>
            <button onClick={redo} className="btn btn-redo">重做</button>
            <button onClick={exportImage} className="btn btn-export">导出图片</button>
            <button onClick={testCursor} className="btn btn-test">测试光标</button>
            <button onClick={recalculateComplexity} className="btn btn-complexity">重新计算复杂度</button>
            <button onClick={getComplexityStats} className="btn btn-complexity">获取复杂度统计</button>
            <button onClick={testToolTypes} className="btn btn-complexity">测试工具类型</button>
            <button onClick={showCanvasLayersInfo} className="btn btn-canvas">显示Canvas层</button>
            <button onClick={showShortcutsInfo} className="btn btn-shortcuts">显示快捷键</button>
            <button onClick={testShortcuts} className="btn btn-shortcuts">测试快捷键</button>
          </div>

          <div className="control-group layer-controls">
            <label>物理图层控制:</label>
            <div className="layer-buttons">
              <button 
                onClick={() => toggleLayer('background')}
                className={`btn btn-layer ${layerVisibility.background ? 'active' : ''}`}
              >
                {layerVisibility.background ? '✅' : '❌'} 背景
              </button>
              <button 
                onClick={() => toggleLayer('draw')}
                className={`btn btn-layer ${layerVisibility.draw ? 'active' : ''}`}
              >
                {layerVisibility.draw ? '✅' : '❌'} 绘制
              </button>
              <button 
                onClick={() => toggleLayer('interaction')}
                className={`btn btn-layer ${layerVisibility.interaction ? 'active' : ''}`}
              >
                {layerVisibility.interaction ? '✅' : '❌'} 交互
              </button>
            </div>
          </div>

          {/* 虚拟图层管理 */}
          <div className="control-group virtual-layer-controls">
            <label>虚拟图层管理:</label>
            <div className="virtual-layer-buttons">
              <button onClick={handleCreateLayer} className="btn btn-create-layer">
                ➕ 新建图层
              </button>
              <button onClick={updateVirtualLayerState} className="btn btn-refresh-layers">
                🔄 刷新状态
              </button>
            </div>
          </div>

          {/* 测试功能 */}
          <div className="control-group test-controls">
            <label>测试功能:</label>
            <div className="test-buttons">
              <button onClick={() => {
                // 创建测试图层
                handleCreateLayer();
                setTimeout(() => {
                  // 绘制一些内容
                  if (drawBoardRef.current) {
                    drawBoardRef.current.setTool('rect');
                    drawBoardRef.current.setColor('#ff0000');
                  }
                }, 100);
              }} className="btn btn-test-layer">
                🧪 测试图层
              </button>
            </div>
          </div>
        </div>

        <div className="canvas-container">
          <div
            ref={containerRef}
            className="drawing-container"
          />
        </div>

        <div className="status-panel">
          <div className="status-item">
            <span>状态:</span>
            <span>{drawBoardRef.current ? '✅ 已初始化' : '❌ 未初始化'}</span>
          </div>
          <div className="status-item">
            <span>当前工具:</span>
            <span>{drawData.tool}</span>
          </div>
          <div className="status-item">
            <span>颜色:</span>
            <span style={{color: drawData.color}}>● {drawData.color}</span>
          </div>
          <div className="status-item">
            <span>画笔大小:</span>
            <span>{drawData.lineWidth}px</span>
          </div>
          <div className="status-item">
            <span>绘制状态:</span>
            <span style={{color: cursorState.isDrawing ? '#dc3545' : '#28a745'}}>
              {cursorState.isDrawing ? '🖱️ 绘制中' : '⏸️ 空闲'}
            </span>
          </div>
          <div className="status-item">
            <span>工具加载:</span>
            <span style={{color: 
              cursorState.toolLoadingState === 'ready' ? '#28a745' :
              cursorState.toolLoadingState === 'loading' ? '#ffc107' :
              cursorState.toolLoadingState === 'error' ? '#dc3545' : '#6c757d'
            }}>
              {cursorState.toolLoadingState === 'ready' ? '✅ 就绪' :
               cursorState.toolLoadingState === 'loading' ? '🔄 加载中' :
               cursorState.toolLoadingState === 'error' ? '❌ 错误' : '⏸️ 空闲'}
            </span>
          </div>
          
          {/* 快捷键状态 */}
          <div className="status-item">
            <span>快捷键:</span>
            <span style={{color: drawBoardRef.current ? '#28a745' : '#6c757d'}}>
              {drawBoardRef.current ? 
                `${drawBoardRef.current.getShortcuts().length} 个已注册` : 
                '❌ 未初始化'}
            </span>
          </div>
          
          <div className="status-item">
            <span>操作系统:</span>
            <span style={{color: '#17a2b8'}}>
              {navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? '🍎 Mac' : '💻 其他'}
            </span>
          </div>
          
          {/* 虚拟图层状态 */}
          {layerStats && (
            <>
              <div className="status-item">
                <span>虚拟图层:</span>
                <span>{layerStats.totalLayers} 个</span>
              </div>
              <div className="status-item">
                <span>可见图层:</span>
                <span>{layerStats.visibleLayers} 个</span>
              </div>
              <div className="status-item">
                <span>锁定图层:</span>
                <span>{layerStats.lockedLayers} 个</span>
              </div>
              <div className="status-item">
                <span>总操作数:</span>
                <span>{layerStats.totalActions} 个</span>
              </div>
              <div className="status-item">
                <span>当前图层:</span>
                <span style={{color: activeLayer ? '#28a745' : '#6c757d'}}>
                  {activeLayer ? `📁 ${activeLayer.name}` : '❌ 无'}
                </span>
              </div>
              <div className="status-item">
                <span>actions数量:</span>
                <span style={{color: activeLayer ? '#28a745' : '#6c757d'}}>
                  {drawBoardRef.current?.getHistoryManager().getAllActions().length}
                </span>
              </div>
            </>
          )}
        </div>

        {/* 虚拟图层列表 */}
        {virtualLayers.length > 0 && (
          <div className="virtual-layer-panel">
            <h3>📚 虚拟图层列表</h3>
            <div className="virtual-layer-list">
              {virtualLayers.map((layer) => (
                <div
                  key={layer.id}
                  className={`virtual-layer-item ${activeLayer?.id === layer.id ? 'active' : ''} ${!layer.visible ? 'hidden' : ''} ${layer.locked ? 'locked' : ''}`}
                >
                  <div className="layer-info">
                    <div className="layer-name" onDoubleClick={() => handleRenameLayer(layer.id)}>
                      {layer.name}
                      {activeLayer?.id === layer.id && <span className="active-indicator">⭐</span>}
                      {layer.locked && <span className="lock-icon">🔒</span>}
                    </div>
                    <div className="layer-meta">
                      {layer.actionIds.length} 个操作 | 透明度: {Math.round(layer.opacity * 100)}%
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
          </div>
        )}
      </div>
    </div>
  );
};

export default Test;