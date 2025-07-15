import React, { useRef, useEffect, useState } from 'react';
import { DrawBoard } from '../../libs/drawBoard';
import type { ToolType } from '../../libs/drawBoard';
import ToolPanel from '../../components/ToolPanel';
import { StrokeControlPanel } from '../../components/StrokeControlPanel';
import './style.scss';

const Test: React.FC = () => {
  console.log('=== Test component rendering ===');
  
  const containerRef = useRef<HTMLDivElement>(null);
  const drawBoardRef = useRef<DrawBoard | null>(null);
  
  console.log('=== Refs created ===');
  console.log('containerRef.current:', containerRef.current);
  console.log('drawBoardRef.current:', drawBoardRef.current);
  const [currentTool, setCurrentTool] = useState<ToolType>('pen');
  const [currentColor, setCurrentColor] = useState('#000000');
  const [currentLineWidth, setCurrentLineWidth] = useState(2);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [historyCount, setHistoryCount] = useState(0);
  const [hasSelection, setHasSelection] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [showStrokePanel, setShowStrokePanel] = useState(false);
  
  // 移动端适配状态
  const [isMobile, setIsMobile] = useState(false);
  const [showToolPanel, setShowToolPanel] = useState(false);

  // 检测移动端
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    console.log('=== Test useEffect triggered ===');
    console.log('containerRef.current:', containerRef.current);
    console.log('drawBoardRef.current:', drawBoardRef.current);
    
    // 确保只初始化一次
    if (containerRef.current && !drawBoardRef.current) {
      console.log('=== 开始初始化画板 ===');
      console.log('容器尺寸:', containerRef.current.offsetWidth, 'x', containerRef.current.offsetHeight);
      console.log('容器元素:', containerRef.current);
      
      try {
        console.log('=== 创建DrawBoard ===');
        // 延迟初始化，确保DOM完全渲染
        setTimeout(() => {
          if (containerRef.current && !drawBoardRef.current) { // 再次检查，防止重复初始化
            console.log('=== 延迟创建DrawBoard ===');
            console.log('延迟后容器尺寸:', containerRef.current.offsetWidth, 'x', containerRef.current.offsetHeight);
            drawBoardRef.current = new DrawBoard(containerRef.current);
            console.log('=== DrawBoard创建成功 ===');
            // 初始化状态
            updateState();
          } else {
            console.log('=== 跳过延迟初始化，已存在实例 ===');
          }
        }, 100);
      } catch (error) {
        console.error('=== DrawBoard创建失败 ===', error);
      }
    } else {
      console.log('=== 跳过初始化 ===');
      console.log('containerRef.current存在:', !!containerRef.current);
      console.log('drawBoardRef.current存在:', !!drawBoardRef.current);
    }

    return () => {
      console.log('=== useEffect cleanup ===');
      if (drawBoardRef.current) {
        drawBoardRef.current.destroy();
      }
      drawBoardRef.current = null;
    };
  }, []);

  const handleToolChange = (tool: ToolType) => {
    setCurrentTool(tool);
    drawBoardRef.current?.setTool(tool);
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

  const handleClearSelection = () => {
    drawBoardRef.current?.clearSelection();
    updateState();
  };

  const handleDeleteSelection = () => {
    drawBoardRef.current?.deleteSelection();
    updateState();
  };

  const handleCopySelection = () => {
    const copiedActions = drawBoardRef.current?.copySelection();
    if (copiedActions && copiedActions.length > 0) {
      console.log('复制了', copiedActions.length, '个动作');
      // 这里可以实现粘贴功能，暂时只打印日志
      alert(`已复制 ${copiedActions.length} 个绘制对象`);
    }
  };

  const updateState = () => {
    if (drawBoardRef.current) {
      const state = drawBoardRef.current.getState();
      setCanUndo(state.canUndo);
      setCanRedo(state.canRedo);
      setHistoryCount(state.historyCount);
      setHasSelection(drawBoardRef.current.hasSelection());
    }
  };

  // 监听窗口大小变化
  useEffect(() => {
    const handleResize = () => {
      if (drawBoardRef.current) {
        drawBoardRef.current.resize();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSave = () => {
    drawBoardRef.current?.saveAsImage();
  };

  const handleCopy = async () => {
    const success = await drawBoardRef.current?.copyToClipboard();
    if (success) {
      alert('已复制到剪贴板！');
    } else {
      alert('复制失败，请重试');
    }
  };

  const handleToggleGrid = () => {
    setShowGrid(!showGrid);
    drawBoardRef.current?.showGrid(!showGrid);
  };

  console.log('Test component rendering JSX...');
  
  return (
    <div className="test-page">
      {/* 桌面端工具栏 */}
      {!isMobile && (
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
          onClearSelection={handleClearSelection}
          onDeleteSelection={handleDeleteSelection}
          onCopySelection={handleCopySelection}
          onSave={handleSave}
          onCopy={handleCopy}
        />
      )}
      
      <div id="board">
        <div className="board-controls">
          {/* 移动端工具栏切换按钮 */}
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
            onClick={handleToggleGrid}
            className={`grid-toggle ${showGrid ? 'active' : ''}`}
            title="显示/隐藏网格"
          >
            {showGrid ? '🔲' : '⬜'} {!isMobile && '网格'}
          </button>
          
          <button 
            onClick={() => setShowStrokePanel(!showStrokePanel)}
            className={`stroke-toggle ${showStrokePanel ? 'active' : ''}`}
            title="运笔效果控制"
          >
            ✏️ {!isMobile && '运笔'}
          </button>
        </div>
        
        {/* 移动端工具栏 */}
        {isMobile && showToolPanel && (
          <div className="mobile-tool-panel">
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
              onClearSelection={handleClearSelection}
              onDeleteSelection={handleDeleteSelection}
              onCopySelection={handleCopySelection}
              onSave={handleSave}
              onCopy={handleCopy}
            />
          </div>
        )}
        
        <div 
          ref={containerRef}
          style={{ 
            width: '100%', 
            height: '100%',
            position: 'absolute',
            top: 0,
            left: 0,
            cursor: 'crosshair',
            border: '2px solid red', // 添加红色边框便于调试
            minHeight: '400px', // 确保最小高度
            backgroundColor: 'white' // 添加白色背景
          }}
        />
        
        {/* 运笔效果控制面板 */}
        <StrokeControlPanel
          drawBoard={drawBoardRef.current}
          visible={showStrokePanel}
          onConfigChange={(config) => {
            console.log('运笔配置已更新:', config);
          }}
        />
      </div>
    </div>
  );
};

export default Test; 