import React, { useRef, useEffect, useState } from 'react';
import { DrawBoard } from '../../libs/drawBoard';
import type { ToolType } from '../../libs/drawBoard';
import ToolPanel from '../../components/ToolPanel';
import './style.scss';

const CursorDemo: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const drawBoardRef = useRef<DrawBoard | null>(null);
  
  const [currentTool, setCurrentTool] = useState<ToolType>('pen');
  const [currentColor, setCurrentColor] = useState('#000000');
  const [currentLineWidth, setCurrentLineWidth] = useState(2);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [historyCount, setHistoryCount] = useState(0);
  const [hasSelection, setHasSelection] = useState(false);

  useEffect(() => {
    if (containerRef.current && !drawBoardRef.current) {
      drawBoardRef.current = new DrawBoard(containerRef.current, {
        maxHistorySize: 100,
        enableShortcuts: true
      });

      // 设置初始状态
      drawBoardRef.current.setTool(currentTool);
      drawBoardRef.current.setColor(currentColor);
      drawBoardRef.current.setLineWidth(currentLineWidth);

      updateState();
    }

    return () => {
      if (drawBoardRef.current) {
        drawBoardRef.current.destroy();
      }
      drawBoardRef.current = null;
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
      alert(`已复制 ${copiedActions.length} 个绘制对象`);
    }
  };

  const handleSave = () => {
    drawBoardRef.current?.saveAsImage('鼠标样式演示');
  };

  const handleCopy = () => {
    drawBoardRef.current?.copyToClipboard();
  };

  return (
    <div className="cursor-demo">
      <div className="demo-header">
        <h1>鼠标样式演示</h1>
        <p>切换不同工具体验各种鼠标样式效果，绘制时样式会动态变化</p>
      </div>

      <div className="demo-container">
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
            onClearSelection={handleClearSelection}
            onDeleteSelection={handleDeleteSelection}
            onCopySelection={handleCopySelection}
            onSave={handleSave}
            onCopy={handleCopy}
          />
        </div>

        <div className="canvas-container">
          <div 
            ref={containerRef}
            className="draw-board"
          />
        </div>

        <div className="info-panel">
          <h3>鼠标样式说明</h3>
          
          <div className="tool-info">
            <h4>🖊️ 画笔工具</h4>
            <p>• 静态：画笔图标，定位在笔尖</p>
            <p>• 绘制中：小圆点，精确绘制定位</p>
          </div>

          <div className="tool-info">
            <h4>🧽 橡皮擦工具</h4>
            <p>• 静态：橡皮擦图标</p>
            <p>• 绘制中：空心圆，显示擦除范围</p>
          </div>

          <div className="tool-info">
            <h4>👆 选择工具</h4>
            <p>• 静态：鼠标指针图标</p>
            <p>• 选择中：十字光标，精确选择</p>
          </div>

          <div className="tool-info">
            <h4>⬜ 矩形工具</h4>
            <p>• 静态：矩形图标</p>
            <p>• 绘制中：十字光标，精确定位</p>
          </div>

          <div className="tool-info">
            <h4>⭕ 圆形工具</h4>
            <p>• 静态：圆形图标</p>
            <p>• 绘制中：十字光标，精确定位</p>
          </div>

          <div className="tool-info">
            <h4>📝 文字工具</h4>
            <p>• 始终显示：系统文字光标</p>
            <p>• 适合文字输入和编辑</p>
          </div>

          <div className="usage-tips">
            <h4>使用技巧</h4>
            <ul>
              <li>观察鼠标样式的变化来了解当前状态</li>
              <li>绘制时鼠标样式会提供视觉反馈</li>
              <li>不同工具的样式帮助快速识别当前功能</li>
              <li>使用快捷键快速切换工具（B/R/C/T/E/S）</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CursorDemo; 