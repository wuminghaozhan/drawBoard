import React, { useState, useRef, useEffect } from 'react';
import { DrawBoard } from '@/libs/drawBoard';
import type { ToolType } from '@/libs/drawBoard';
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
  
  const containerRef = useRef<HTMLDivElement>(null);
  const drawBoardRef = useRef<DrawBoard | null>(null);

  // 初始化DrawBoard
  useEffect(() => {
    // 使用ref来跟踪初始化状态，避免React严格模式的双重调用
    const initRef = { initialized: false };

    const initDrawBoard = () => {
      const container = containerRef.current;
      if (!container) return;

      // 检查是否已经初始化
      if (initRef.initialized || drawBoardRef.current) {
        console.log('DrawBoard already initialized or initializing');
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

        console.log('DrawBoard initialized successfully');
        
        // 监听状态变化
        drawBoardRef.current.onStateChange((state) => {
          setCursorState({
            isDrawing: state.isDrawing,
            toolLoadingState: drawBoardRef.current?.getToolLoadingState() || 'idle'
          });
        });
        
        // 初始化默认工具
        drawBoardRef.current.initializeDefaultTools().then(() => {
          console.log('Default tools loaded');
          
          // 设置初始工具和颜色
          if (drawBoardRef.current) {
            drawBoardRef.current.setTool(drawData.tool);
            drawBoardRef.current.setColor(drawData.color);
            drawBoardRef.current.setLineWidth(drawData.lineWidth);
            console.log('Initial tool settings applied');
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
      console.log('Canvas cleared');
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
          console.log(`测试光标: ${cursors[index]}`);
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
      console.log('复杂度统计:', stats);
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
    
    console.log('可用工具类型:', availableTools);
    console.log('工具名称:', toolNames);
    console.log('工具统计:', stats);
    
    // 添加更详细的调试信息
    console.log('=== ToolFactory 调试信息 ===');
    console.log('ToolManager 实例:', toolManager);
    console.log('ToolFactory 统计:', stats);
    console.log('已注册的工具类型数量:', availableTools.length);
    console.log('当前工具:', stats.currentTool);
    console.log('加载状态:', stats.loadingState);
    
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
          </div>

          <div className="control-group layer-controls">
            <label>图层控制:</label>
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
        </div>
      </div>
    </div>
  );
};

export default Test; 