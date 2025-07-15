import React, { useRef, useEffect, useState } from 'react';
import { DrawBoard } from '../../libs/drawBoard';
import { getAllStrokePresets, type StrokePresetType } from '../../libs/drawBoard/tools/StrokePresets';
import './style.scss';

const PresetDemo: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const drawBoardRef = useRef<DrawBoard | null>(null);
  
  const [currentPreset, setCurrentPreset] = useState<StrokePresetType>('pen');
  const [currentColor, setCurrentColor] = useState('#000000');
  const [showInfo, setShowInfo] = useState(true);
  const [currentTool, setCurrentTool] = useState('pen');

  useEffect(() => {
    if (containerRef.current && !drawBoardRef.current) {
      drawBoardRef.current = new DrawBoard(containerRef.current);
      
      // 确保当前工具是画笔工具
      drawBoardRef.current.setTool('pen');
      
      // 设置初始预设
      drawBoardRef.current.setStrokePreset(currentPreset);
    }

    return () => {
      if (drawBoardRef.current) {
        drawBoardRef.current.destroy();
      }
      drawBoardRef.current = null;
    };
  }, []);

  const handlePresetChange = (presetType: StrokePresetType) => {
    setCurrentPreset(presetType);
    if (drawBoardRef.current) {
      // 确保当前工具是画笔工具
      drawBoardRef.current.setTool('pen');
      setCurrentTool('pen');
      // 设置预设
      drawBoardRef.current.setStrokePreset(presetType);
    }
  };

  const handleColorChange = (color: string) => {
    setCurrentColor(color);
    drawBoardRef.current?.setColor(color);
  };

  const handleClear = () => {
    drawBoardRef.current?.clear();
  };

  const handleSave = () => {
    drawBoardRef.current?.saveAsImage('笔触预设演示');
  };

  const presets = getAllStrokePresets();
  const categories = [
    { key: 'writing', label: '书写工具', icon: '✍️' },
    { key: 'art', label: '艺术工具', icon: '🖼️' },
    { key: 'drawing', label: '绘画工具', icon: '🖌️' }
  ];

  return (
    <div className="preset-demo">
      <div className="demo-header">
        <h1>笔触预设效果演示</h1>
        <p>体验不同类型的笔触效果，从钢笔到毛笔，从粉笔到水彩</p>
      </div>

      <div className="demo-container">
        {/* 左侧预设选择器 */}
        <div className="preset-sidebar">
          <div className="sidebar-header">
            <h3>笔触预设</h3>
            <div className="color-picker">
              <input
                type="color"
                value={currentColor}
                onChange={(e) => handleColorChange(e.target.value)}
                title="选择颜色"
              />
              <span>颜色</span>
            </div>
          </div>

          {/* 分类选择 */}
          <div className="category-tabs">
            {categories.map(category => (
              <button
                key={category.key}
                className="category-tab"
                onClick={() => {
                  // 这里可以添加分类切换逻辑
                }}
              >
                <span>{category.icon}</span>
                <span>{category.label}</span>
              </button>
            ))}
          </div>

          {/* 预设列表 */}
          <div className="preset-list">
            {presets.map((preset) => {
              const presetType = preset.name.toLowerCase().replace(/\s+/g, '_') as StrokePresetType;
              const isSelected = currentPreset === presetType;
              
              return (
                <div
                  key={preset.name}
                  className={`preset-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => handlePresetChange(presetType)}
                >
                  <div className="preset-icon">{preset.icon}</div>
                  <div className="preset-info">
                    <div className="preset-name">{preset.name}</div>
                    <div className="preset-desc">{preset.description}</div>
                  </div>
                  {isSelected && <div className="selected-indicator">✓</div>}
                </div>
              );
            })}
          </div>

          {/* 操作按钮 */}
          <div className="action-buttons">
            <button onClick={handleClear} className="action-btn clear-btn">
              🗑️ 清空画板
            </button>
            <button onClick={handleSave} className="action-btn save-btn">
              💾 保存图片
            </button>
          </div>
        </div>

        {/* 中间画板区域 */}
        <div className="canvas-area">
          <div className="canvas-header">
            <h2>当前使用: {presets.find(p => p.name.toLowerCase().replace(/\s+/g, '_') === currentPreset)?.name}</h2>
            <div className="debug-info">
              <span>当前工具: {currentTool}</span>
              <span>当前预设: {currentPreset}</span>
            </div>
            <button 
              onClick={() => setShowInfo(!showInfo)}
              className="info-toggle"
            >
              {showInfo ? '隐藏' : '显示'} 使用说明
            </button>
          </div>

          <div className="canvas-container">
            <div ref={containerRef} className="draw-board" />
          </div>

          {/* 使用说明 */}
          {showInfo && (
            <div className="usage-info">
              <h3>使用说明</h3>
              <div className="tips">
                {presets.find(p => p.name.toLowerCase().replace(/\s+/g, '_') === currentPreset)?.tips.map((tip, index) => (
                  <div key={index} className="tip-item">
                    • {tip}
                  </div>
                ))}
              </div>
              <div className="demo-tips">
                <h4>演示建议:</h4>
                <ul>
                  <li>尝试不同的绘制速度</li>
                  <li>改变压力（点密度）</li>
                  <li>绘制不同的线条形状</li>
                  <li>体验每种笔触的独特效果</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* 右侧效果预览 */}
        <div className="preview-panel">
          <h3>效果预览</h3>
          <div className="preview-content">
            <div className="current-preset">
              <h4>当前预设</h4>
              <div className="preset-preview">
                <div className="preset-icon-large">
                  {presets.find(p => p.name.toLowerCase().replace(/\s+/g, '_') === currentPreset)?.icon}
                </div>
                <div className="preset-details">
                  <div className="preset-name-large">
                    {presets.find(p => p.name.toLowerCase().replace(/\s+/g, '_') === currentPreset)?.name}
                  </div>
                  <div className="preset-desc-large">
                    {presets.find(p => p.name.toLowerCase().replace(/\s+/g, '_') === currentPreset)?.description}
                  </div>
                </div>
              </div>
            </div>

            <div className="preset-config">
              <h4>配置参数</h4>
              {(() => {
                const preset = presets.find(p => p.name.toLowerCase().replace(/\s+/g, '_') === currentPreset);
                if (!preset) return null;
                
                return (
                  <div className="config-grid">
                    <div className="config-item">
                      <span>压力感应:</span>
                      <span className={preset.config.enablePressure ? 'enabled' : 'disabled'}>
                        {preset.config.enablePressure ? '开启' : '关闭'}
                      </span>
                    </div>
                    <div className="config-item">
                      <span>速度感应:</span>
                      <span className={preset.config.enableVelocity ? 'enabled' : 'disabled'}>
                        {preset.config.enableVelocity ? '开启' : '关闭'}
                      </span>
                    </div>
                    <div className="config-item">
                      <span>角度感应:</span>
                      <span className={preset.config.enableAngle ? 'enabled' : 'disabled'}>
                        {preset.config.enableAngle ? '开启' : '关闭'}
                      </span>
                    </div>
                    <div className="config-item">
                      <span>透明度变化:</span>
                      <span className={preset.config.opacityVariation ? 'enabled' : 'disabled'}>
                        {preset.config.opacityVariation ? '开启' : '关闭'}
                      </span>
                    </div>
                    <div className="config-item">
                      <span>压力敏感度:</span>
                      <span>{preset.config.pressureSensitivity.toFixed(2)}</span>
                    </div>
                    <div className="config-item">
                      <span>速度敏感度:</span>
                      <span>{preset.config.velocitySensitivity.toFixed(2)}</span>
                    </div>
                    <div className="config-item">
                      <span>线宽范围:</span>
                      <span>{preset.config.minLineWidth}-{preset.config.maxLineWidth}px</span>
                    </div>
                    <div className="config-item">
                      <span>平滑度:</span>
                      <span>{preset.config.smoothing.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PresetDemo; 