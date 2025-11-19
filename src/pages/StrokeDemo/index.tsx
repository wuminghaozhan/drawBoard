import React, { useRef, useEffect, useState } from 'react';
import { DrawBoard } from '../../libs/drawBoard';
import type { ToolType } from '../../libs/drawBoard';
import { StrokeControlPanel } from '../../components/StrokeControlPanel';
import { StrokePresetSelector } from '../../components/StrokePresetSelector';
import type { StrokeConfig } from '../../libs/drawBoard/tools/stroke/StrokeTypes';
import type { StrokePresetType } from '../../libs/drawBoard/tools/StrokePresets';
import './style.scss';

const StrokeDemo: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const drawBoardRef = useRef<DrawBoard | null>(null);
  
  const [currentTool, setCurrentTool] = useState<ToolType>('pen');
  const [currentColor, setCurrentColor] = useState('#000000');
  const [currentLineWidth, setCurrentLineWidth] = useState(2);
  const [showStrokePanel, setShowStrokePanel] = useState(true);
  const [showPresetSelector, setShowPresetSelector] = useState(false);
  const [strokeConfig, setStrokeConfig] = useState<StrokeConfig | null>(null);
  const [currentPreset, setCurrentPreset] = useState<StrokePresetType | null>(null);

  useEffect(() => {
    if (containerRef.current && !drawBoardRef.current) {
      // 使用运笔效果配置初始化画板
      const initialStrokeConfig: Partial<StrokeConfig> = {
        enablePressure: true,
        enableVelocity: true,
        enableAngle: true,
        pressureSensitivity: 0.8,
        velocitySensitivity: 0.6,
        minLineWidth: 1,
        maxLineWidth: 20,
        smoothing: 0.3,
        opacityVariation: true
      };

      drawBoardRef.current = new DrawBoard(containerRef.current, {
        strokeConfig: initialStrokeConfig
      });

      // 确保当前工具是画笔工具
      drawBoardRef.current.setTool('pen');

      // 获取初始配置
      setStrokeConfig(drawBoardRef.current.getStrokeConfig());
    }

    return () => {
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

  const handleStrokeConfigChange = (config: StrokeConfig) => {
    setStrokeConfig(config);
  };

  const handlePresetChange = (presetType: StrokePresetType, config: StrokeConfig) => {
    setCurrentPreset(presetType);
    setStrokeConfig(config);
    
    // 确保当前工具是画笔工具
    if (drawBoardRef.current) {
      drawBoardRef.current.setTool('pen');
    }
    setCurrentTool('pen');
    
  };

  const handleClear = () => {
    drawBoardRef.current?.clear();
  };

  const handleUndo = () => {
    drawBoardRef.current?.undo();
  };

  const handleRedo = () => {
    drawBoardRef.current?.redo();
  };

  const handleSave = () => {
    drawBoardRef.current?.saveAsImage('运笔效果演示');
  };

  return (
    <div className="stroke-demo">
      <div className="demo-header">
        <h1>运笔效果演示</h1>
        <p>体验真实的笔触效果，包括压力、速度、角度等动态变化</p>
      </div>

      <div className="demo-container">
        {/* 左侧工具栏 */}
        <div className="toolbar">
          <div className="tool-section">
            <h3>工具选择</h3>
            <div className="tool-buttons">
              <button
                className={`tool-btn ${currentTool === 'pen' ? 'active' : ''}`}
                onClick={() => handleToolChange('pen')}
                title="画笔工具"
              >
                ✏️ 画笔
              </button>
              <button
                className={`tool-btn ${currentTool === 'eraser' ? 'active' : ''}`}
                onClick={() => handleToolChange('eraser')}
                title="橡皮擦"
              >
                🧽 橡皮擦
              </button>
            </div>
          </div>

          <div className="tool-section">
            <h3>颜色设置</h3>
            <div className="color-picker">
              <input
                type="color"
                value={currentColor}
                onChange={(e) => handleColorChange(e.target.value)}
                title="选择颜色"
              />
              <span className="color-label">当前颜色</span>
            </div>
          </div>

          <div className="tool-section">
            <h3>线宽设置</h3>
            <div className="line-width-control">
              <input
                type="range"
                min="1"
                max="20"
                value={currentLineWidth}
                onChange={(e) => handleLineWidthChange(parseInt(e.target.value))}
              />
              <span>{currentLineWidth}px</span>
            </div>
          </div>

          <div className="tool-section">
            <h3>操作</h3>
            <div className="action-buttons">
              <button onClick={handleUndo} title="撤销">
                ↩️ 撤销
              </button>
              <button onClick={handleRedo} title="重做">
                ↪️ 重做
              </button>
              <button onClick={handleClear} title="清空画板">
                🗑️ 清空
              </button>
              <button onClick={handleSave} title="保存图片">
                💾 保存
              </button>
            </div>
          </div>

          <div className="tool-section">
            <h3>运笔控制</h3>
            <button
              className={`stroke-toggle ${showStrokePanel ? 'active' : ''}`}
              onClick={() => setShowStrokePanel(!showStrokePanel)}
            >
              {showStrokePanel ? '隐藏' : '显示'} 运笔面板
            </button>
            <button
              className={`preset-toggle ${showPresetSelector ? 'active' : ''}`}
              onClick={() => setShowPresetSelector(!showPresetSelector)}
              style={{ marginTop: '8px' }}
            >
              {showPresetSelector ? '隐藏' : '显示'} 预设选择器
            </button>
          </div>
        </div>

        {/* 中间画板区域 */}
        <div className="canvas-container">
          <div className="canvas-wrapper">
            <div 
              ref={containerRef}
              className="draw-board"
            />
            
            {/* 运笔效果控制面板 */}
            <StrokeControlPanel
              drawBoard={drawBoardRef.current}
              visible={showStrokePanel}
              onConfigChange={handleStrokeConfigChange}
            />
            
            {/* 预设选择器 */}
            <StrokePresetSelector
              drawBoard={drawBoardRef.current}
              onPresetChange={(presetType, config) => {
                setCurrentPreset(presetType);
                if (config) {
                  handleStrokeConfigChange(config);
                }
              }}
              visible={showPresetSelector}
            />
          </div>
        </div>

        {/* 右侧信息面板 */}
        <div className="info-panel">
          <div className="info-section">
            <h3>当前配置</h3>
            {currentPreset && (
              <div style={{ 
                marginBottom: '10px', 
                padding: '8px', 
                background: '#e8f5e8', 
                borderRadius: '4px',
                border: '1px solid #c3e6c3'
              }}>
                <div style={{ fontSize: '12px', color: '#2d5a2d', marginBottom: '2px' }}>
                  当前预设:
                </div>
                <div style={{ fontSize: '14px', color: '#1a4a1a', fontWeight: '500' }}>
                  {currentPreset}
                </div>
              </div>
            )}
            {strokeConfig && (
              <div className="config-info">
                <div className="config-item">
                  <span>压力感应:</span>
                  <span className={strokeConfig.enablePressure ? 'enabled' : 'disabled'}>
                    {strokeConfig.enablePressure ? '开启' : '关闭'}
                  </span>
                </div>
                <div className="config-item">
                  <span>速度感应:</span>
                  <span className={strokeConfig.enableVelocity ? 'enabled' : 'disabled'}>
                    {strokeConfig.enableVelocity ? '开启' : '关闭'}
                  </span>
                </div>
                <div className="config-item">
                  <span>角度感应:</span>
                  <span className={strokeConfig.enableAngle ? 'enabled' : 'disabled'}>
                    {strokeConfig.enableAngle ? '开启' : '关闭'}
                  </span>
                </div>
                <div className="config-item">
                  <span>透明度变化:</span>
                  <span className={strokeConfig.opacityVariation ? 'enabled' : 'disabled'}>
                    {strokeConfig.opacityVariation ? '开启' : '关闭'}
                  </span>
                </div>
                <div className="config-item">
                  <span>压力敏感度:</span>
                  <span>{strokeConfig.pressureSensitivity.toFixed(2)}</span>
                </div>
                <div className="config-item">
                  <span>速度敏感度:</span>
                  <span>{strokeConfig.velocitySensitivity.toFixed(2)}</span>
                </div>
                <div className="config-item">
                  <span>平滑度:</span>
                  <span>{strokeConfig.smoothing.toFixed(2)}</span>
                </div>
                <div className="config-item">
                  <span>线宽范围:</span>
                  <span>{strokeConfig.minLineWidth}-{strokeConfig.maxLineWidth}px</span>
                </div>
              </div>
            )}
          </div>

          <div className="info-section">
            <h3>使用提示</h3>
            <div className="tips">
              <p>• 快速绘制会产生细线条</p>
              <p>• 慢速绘制会产生粗线条</p>
              <p>• 压力感应基于点密度计算</p>
              <p>• 角度感应影响线条连接样式</p>
              <p>• 透明度变化让笔触更自然</p>
            </div>
          </div>

          <div className="info-section">
            <h3>效果说明</h3>
            <div className="effects">
              <div className="effect-item">
                <h4>压力效果</h4>
                <p>基于绘制点密度模拟压力，点越密集压力越大，线条越粗</p>
              </div>
              <div className="effect-item">
                <h4>速度效果</h4>
                <p>绘制速度越快，线条越细，透明度越低</p>
              </div>
              <div className="effect-item">
                <h4>角度效果</h4>
                <p>线条转折角度影响连接样式，锐角使用圆角连接</p>
              </div>
              <div className="effect-item">
                <h4>平滑效果</h4>
                <p>使用贝塞尔曲线实现平滑的线条过渡</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StrokeDemo; 