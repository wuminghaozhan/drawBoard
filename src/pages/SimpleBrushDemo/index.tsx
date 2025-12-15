import React, { useRef, useEffect, useState, useCallback } from 'react';
import { DrawBoard } from '../../libs/drawBoard';
import { 
  BRUSH_PRESETS, 
  type BrushPreset,
  getAllBrushPresets 
} from '../../libs/drawBoard/tools/SimplePenTool';
import './style.scss';

const SimpleBrushDemo: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const drawBoardRef = useRef<DrawBoard | null>(null);
  
  const [currentPreset, setCurrentPreset] = useState<BrushPreset>('marker');
  const [currentColor, setCurrentColor] = useState('#2c3e50');
  const [lineWidth, setLineWidth] = useState(2);

  useEffect(() => {
    if (containerRef.current && !drawBoardRef.current) {
      drawBoardRef.current = new DrawBoard(containerRef.current);
      drawBoardRef.current.setTool('pen');
      drawBoardRef.current.setColor(currentColor);
      drawBoardRef.current.setLineWidth(lineWidth);
    }

    return () => {
      if (drawBoardRef.current) {
        drawBoardRef.current.destroy();
      }
      drawBoardRef.current = null;
    };
  }, []);

  const handlePresetChange = useCallback((preset: BrushPreset) => {
    setCurrentPreset(preset);
    const presetConfig = BRUSH_PRESETS[preset];
    
    if (drawBoardRef.current) {
      drawBoardRef.current.setTool('pen');
      drawBoardRef.current.setLineWidth(presetConfig.recommendedWidth);
      setLineWidth(presetConfig.recommendedWidth);
      
      // 如果预设有推荐颜色，使用推荐颜色
      if (presetConfig.color) {
        drawBoardRef.current.setColor(presetConfig.color);
        setCurrentColor(presetConfig.color);
      }
    }
  }, []);

  const handleColorChange = (color: string) => {
    setCurrentColor(color);
    drawBoardRef.current?.setColor(color);
  };

  const handleWidthChange = (width: number) => {
    setLineWidth(width);
    drawBoardRef.current?.setLineWidth(width);
  };

  const handleClear = () => {
    drawBoardRef.current?.clear();
  };

  const handleUndo = () => {
    drawBoardRef.current?.undo();
  };

  const presets = getAllBrushPresets();
  const currentConfig = BRUSH_PRESETS[currentPreset];

  // 预设图标映射
  const presetIcons: Record<BrushPreset, string> = {
    pen: '🖊️',
    pencil: '✏️',
    marker: '🖍️',
    brush: '🖌️',
    highlighter: '🔆',
    crayon: '🖍️'
  };

  return (
    <div className="simple-brush-demo">
      <header className="demo-header">
        <h1>🎨 简化笔触预设</h1>
        <p>6 种基础笔触，简单易用，效果自然</p>
      </header>

      <div className="demo-body">
        {/* 左侧预设面板 */}
        <aside className="preset-panel">
          <h2>笔触预设</h2>
          
          <div className="preset-grid">
            {presets.map(preset => {
              const config = BRUSH_PRESETS[preset];
              const isActive = currentPreset === preset;
              
              return (
                <button
                  key={preset}
                  className={`preset-card ${isActive ? 'active' : ''}`}
                  onClick={() => handlePresetChange(preset)}
                >
                  <span className="preset-icon">{presetIcons[preset]}</span>
                  <span className="preset-name">{config.name}</span>
                  <span className="preset-type">
                    {config.config.type === 'pressure' ? '压感' : '固定'}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 当前预设信息 */}
          <div className="current-info">
            <h3>{presetIcons[currentPreset]} {currentConfig.name}</h3>
            <p>{currentConfig.description}</p>
            
            <div className="config-details">
              <div className="config-row">
                <span>类型</span>
                <span className={`badge ${currentConfig.config.type}`}>
                  {currentConfig.config.type === 'pressure' ? '压感笔触' : '平滑笔触'}
                </span>
              </div>
              <div className="config-row">
                <span>透明度</span>
                <span>{Math.round(currentConfig.config.opacity * 100)}%</span>
              </div>
              <div className="config-row">
                <span>抖动</span>
                <span>{currentConfig.config.jitter > 0 ? '有' : '无'}</span>
              </div>
              <div className="config-row">
                <span>纹理</span>
                <span>{currentConfig.config.texture === 'none' ? '无' : currentConfig.config.texture}</span>
              </div>
            </div>
          </div>

          {/* 工具设置 */}
          <div className="tool-settings">
            <h3>工具设置</h3>
            
            <div className="setting-row">
              <label>颜色</label>
              <input
                type="color"
                value={currentColor}
                onChange={(e) => handleColorChange(e.target.value)}
              />
            </div>
            
            <div className="setting-row">
              <label>线宽: {lineWidth}px</label>
              <input
                type="range"
                min="1"
                max="30"
                value={lineWidth}
                onChange={(e) => handleWidthChange(Number(e.target.value))}
              />
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="action-buttons">
            <button onClick={handleUndo} className="btn-undo">
              ↩️ 撤销
            </button>
            <button onClick={handleClear} className="btn-clear">
              🗑️ 清空
            </button>
          </div>
        </aside>

        {/* 画布区域 */}
        <main className="canvas-area">
          <div className="canvas-header">
            <span className="current-brush">
              {presetIcons[currentPreset]} 当前: {currentConfig.name}
            </span>
          </div>
          <div ref={containerRef} className="canvas-container" />
          <div className="canvas-hint">
            在画布上绘制，体验 {currentConfig.name} 效果
          </div>
        </main>

        {/* 右侧效果对比 */}
        <aside className="comparison-panel">
          <h2>预设对比</h2>
          
          <div className="comparison-table">
            <div className="table-header">
              <span>预设</span>
              <span>类型</span>
              <span>特点</span>
            </div>
            
            {presets.map(preset => {
              const config = BRUSH_PRESETS[preset];
              const isActive = currentPreset === preset;
              
              return (
                <div 
                  key={preset} 
                  className={`table-row ${isActive ? 'active' : ''}`}
                  onClick={() => handlePresetChange(preset)}
                >
                  <span className="cell-name">
                    {presetIcons[preset]} {config.name}
                  </span>
                  <span className="cell-type">
                    {config.config.type === 'pressure' ? '压感' : '固定'}
                  </span>
                  <span className="cell-feature">
                    {config.config.jitter > 0 && '抖动 '}
                    {config.config.texture !== 'none' && '纹理 '}
                    {config.config.opacity < 1 && '透明 '}
                    {config.config.pressureSensitivity > 0.5 && '高敏感 '}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="usage-tips">
            <h3>💡 使用提示</h3>
            <ul>
              <li><strong>钢笔</strong>: 适合书写、签名</li>
              <li><strong>铅笔</strong>: 草图、素描</li>
              <li><strong>马克笔</strong>: 标注、涂鸦</li>
              <li><strong>毛笔</strong>: 书法、国画</li>
              <li><strong>荧光笔</strong>: 高亮、标记</li>
              <li><strong>蜡笔</strong>: 儿童画、插画</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default SimpleBrushDemo;

