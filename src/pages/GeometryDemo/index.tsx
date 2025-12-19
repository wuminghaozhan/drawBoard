import React, { useState, useRef, useEffect } from 'react';
import { DrawBoard } from '../../libs/drawBoard';
import './style.scss';

const GeometryDemo: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawBoardRef = useRef<DrawBoard | null>(null);
  const [currentTool, setCurrentTool] = useState<string>('rect');
  const [currentColor, setCurrentColor] = useState('#2c3e50');
  const [currentLineWidth, setCurrentLineWidth] = useState(3);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [historyCount, setHistoryCount] = useState(0);
  const [hasSelection, setHasSelection] = useState(false);
  
  // 几何工具特定选项
  const [lineType, setLineType] = useState<'line' | 'arrow' | 'dashed'>('line');
  const [arrowStyle, setArrowStyle] = useState<'none' | 'start' | 'end' | 'both'>('end');
  const [polygonType, setPolygonType] = useState<'triangle' | 'pentagon' | 'hexagon' | 'star'>('hexagon');
  const [polygonSides, setPolygonSides] = useState(6);
  const [filled, setFilled] = useState(false);

  useEffect(() => {
    if (canvasRef.current && !drawBoardRef.current) {
      drawBoardRef.current = new DrawBoard(canvasRef.current, {
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

  const handleToolChange = (tool: string) => {
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
    drawBoardRef.current?.saveAsImage('几何工具演示');
  };

  // 几何工具相关处理函数
  const handleLineTypeChange = (type: 'line' | 'arrow' | 'dashed') => {
    setLineType(type);
    // 这里可以设置特定的工具选项，目前先保存状态
  };

  const handlePolygonTypeChange = (type: 'triangle' | 'pentagon' | 'hexagon' | 'star') => {
    setPolygonType(type);
    // 这里可以设置特定的工具选项，目前先保存状态
  };

  return (
    <div className="geometry-demo">
      <div className="demo-header">
        <h1>🔷 几何工具演示</h1>
        <p>体验新增的直线、箭头、多边形等几何绘图工具</p>
      </div>

      <div className="demo-container">
        {/* 左侧工具栏 */}
        <div className="toolbar">
          <div className="tool-section">
            <h3>几何工具</h3>
            {currentTool === 'polyline' && (
              <div className="tool-tip" style={{ marginBottom: '10px', padding: '8px', background: '#e3f2fd', borderRadius: '4px', fontSize: '12px', lineHeight: '1.5' }}>
                💡 <strong>折线工具使用说明：</strong><br/>
                • 点击画布添加点<br/>
                • 双击最后一个点完成绘制<br/>
                • 按 Enter 完成绘制<br/>
                • 按 ESC 取消绘制<br/>
                • 按 Backspace 删除最后一个点
              </div>
            )}
            <div className="tool-buttons">
              <button
                className={`tool-btn ${currentTool === 'line' ? 'active' : ''}`}
                onClick={() => handleToolChange('line')}
                title="直线/箭头工具"
              >
                ➖ 直线
              </button>
              <button
                className={`tool-btn ${currentTool === 'polyline' ? 'active' : ''}`}
                onClick={() => handleToolChange('polyline')}
                title="折线工具 - 点击添加点，双击完成"
              >
                📐 折线
              </button>
              <button
                className={`tool-btn ${currentTool === 'polygon' ? 'active' : ''}`}
                onClick={() => handleToolChange('polygon')}
                title="多边形工具"
              >
                🔷 多边形
              </button>
              <button
                className={`tool-btn ${currentTool === 'rect' ? 'active' : ''}`}
                onClick={() => handleToolChange('rect')}
                title="矩形工具"
              >
                ⬜ 矩形
              </button>
              <button
                className={`tool-btn ${currentTool === 'circle' ? 'active' : ''}`}
                onClick={() => handleToolChange('circle')}
                title="圆形工具"
              >
                ⭕ 圆形
              </button>
            </div>
          </div>

          <div className="tool-section">
            <h3>基础工具</h3>
            <div className="tool-buttons">
              <button
                className={`tool-btn ${currentTool === 'pen' ? 'active' : ''}`}
                onClick={() => handleToolChange('pen')}
                title="画笔工具"
              >
                🖊️ 画笔
              </button>
              <button
                className={`tool-btn ${currentTool === 'eraser' ? 'active' : ''}`}
                onClick={() => handleToolChange('eraser')}
                title="橡皮擦"
              >
                🧽 橡皮擦
              </button>
              <button
                className={`tool-btn ${currentTool === 'select' ? 'active' : ''}`}
                onClick={() => handleToolChange('select')}
                title="选择工具"
              >
                🎯 选择
              </button>
            </div>
          </div>

          {/* 直线工具选项 */}
          {currentTool === 'line' && (
            <div className="tool-section">
              <h3>直线选项</h3>
              <div className="option-group">
                <label>线条类型：</label>
                <select value={lineType} onChange={(e) => handleLineTypeChange(e.target.value as any)}>
                  <option value="line">普通直线</option>
                  <option value="arrow">箭头</option>
                  <option value="dashed">虚线</option>
                </select>
              </div>
              {lineType === 'arrow' && (
                <div className="option-group">
                  <label>箭头样式：</label>
                  <select value={arrowStyle} onChange={(e) => setArrowStyle(e.target.value as any)}>
                    <option value="end">尾部箭头</option>
                    <option value="start">头部箭头</option>
                    <option value="both">双向箭头</option>
                    <option value="none">无箭头</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {/* 多边形工具选项 */}
          {currentTool === 'polygon' && (
            <div className="tool-section">
              <h3>多边形选项</h3>
              <div className="option-group">
                <label>形状类型：</label>
                <select value={polygonType} onChange={(e) => handlePolygonTypeChange(e.target.value as any)}>
                  <option value="triangle">三角形</option>
                  <option value="pentagon">五边形</option>
                  <option value="hexagon">六边形</option>
                  <option value="star">五角星</option>
                </select>
              </div>
              <div className="option-group">
                <label>边数：</label>
                <input
                  type="range"
                  min="3"
                  max="12"
                  value={polygonSides}
                  onChange={(e) => setPolygonSides(Number(e.target.value))}
                />
                <span>{polygonSides}</span>
              </div>
              <div className="option-group">
                <label>
                  <input
                    type="checkbox"
                    checked={filled}
                    onChange={(e) => setFilled(e.target.checked)}
                  />
                  填充
                </label>
              </div>
            </div>
          )}

          <div className="tool-section">
            <h3>颜色和线宽</h3>
            <div className="color-picker">
              <input
                type="color"
                value={currentColor}
                onChange={(e) => handleColorChange(e.target.value)}
                title="选择颜色"
              />
              <span className="color-label">颜色</span>
            </div>
            <div className="line-width-control">
              <label>线宽: {currentLineWidth}px</label>
              <input
                type="range"
                min="1"
                max="20"
                value={currentLineWidth}
                onChange={(e) => handleLineWidthChange(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="tool-section">
            <h3>操作</h3>
            <div className="action-buttons">
              <button onClick={handleUndo} disabled={!canUndo}>
                ↶ 撤销
              </button>
              <button onClick={handleRedo} disabled={!canRedo}>
                ↷ 重做
              </button>
              <button onClick={handleClear}>
                🗑️ 清空
              </button>
              <button onClick={handleSave}>
                💾 保存
              </button>
            </div>
          </div>
        </div>

        {/* 画板区域 */}
        <div className="canvas-container">
          <div 
            ref={canvasRef}
            className="draw-board"
          />
        </div>

        {/* 右侧信息面板 */}
        <div className="info-panel">
          <div className="info-section">
            <h4>当前状态</h4>
            <div className="status-info">
              <div className="status-item">
                <span>当前工具：</span>
                <span className={`tool-indicator ${currentTool}`}>
                  {currentTool === 'line' ? '➖ 直线' : 
                   currentTool === 'polygon' ? '🔷 多边形' :
                   currentTool === 'pen' ? '🖊️ 画笔' :
                   currentTool === 'rect' ? '⬜ 矩形' :
                   currentTool === 'circle' ? '⭕ 圆形' :
                   currentTool === 'select' ? '🎯 选择' : '🧽 橡皮擦'}
                </span>
              </div>
              <div className="status-item">
                <span>历史记录：</span>
                <span>{historyCount} 步</span>
              </div>
              <div className="status-item">
                <span>颜色：</span>
                <span style={{ backgroundColor: currentColor, padding: '2px 8px', borderRadius: '3px', color: 'white' }}>
                  {currentColor}
                </span>
              </div>
              <div className="status-item">
                <span>线宽：</span>
                <span>{currentLineWidth}px</span>
              </div>
            </div>
          </div>

          <div className="info-section">
            <h4>使用说明</h4>
            <div className="usage-tips">
              <div className="tip-item">
                <strong>➖ 直线工具：</strong>
                <p>点击起点，拖拽到终点绘制直线、箭头或虚线</p>
              </div>
              <div className="tip-item">
                <strong>🔷 多边形工具：</strong>
                <p>点击中心，拖拽设置大小，支持三角形到十二边形和五角星</p>
              </div>
              <div className="tip-item">
                <strong>⬜ 矩形工具：</strong>
                <p>拖拽绘制矩形，支持各种尺寸比例</p>
              </div>
              <div className="tip-item">
                <strong>⭕ 圆形工具：</strong>
                <p>从中心点拖拽到边缘绘制圆形</p>
              </div>
            </div>
          </div>

          <div className="info-section">
            <h4>几何特性</h4>
            <div className="feature-list">
              <div className="feature-item">
                <span className="feature-icon">🎯</span>
                <span>精确几何图形</span>
              </div>
              <div className="feature-item">
                <span className="feature-icon">🎨</span>
                <span>自定义颜色和线宽</span>
              </div>
              <div className="feature-item">
                <span className="feature-icon">⚡</span>
                <span>实时预览效果</span>
              </div>
              <div className="feature-item">
                <span className="feature-icon">🔄</span>
                <span>支持变换编辑</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GeometryDemo; 