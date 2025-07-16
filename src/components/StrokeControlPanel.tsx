import React, { useState, useEffect } from 'react';
import type { StrokeConfig } from '../libs/drawBoard/tools/stroke/StrokeTypes';

interface StrokeControlPanelProps {
  drawBoard: any; // DrawBoard实例
  visible?: boolean;
  onConfigChange?: (config: StrokeConfig) => void;
}

export const StrokeControlPanel: React.FC<StrokeControlPanelProps> = ({
  drawBoard,
  visible = true,
  onConfigChange
}) => {
  const [config, setConfig] = useState<StrokeConfig>({
    enablePressure: true,
    enableVelocity: true,
    enableAngle: true,
    enableBezierSmoothing: true,
    antiAliasLevel: 2,
    pressureSensitivity: 0.8,
    velocitySensitivity: 0.6,
    minLineWidth: 1,
    maxLineWidth: 20,
    smoothing: 0.3,
    opacityVariation: true
  });

  useEffect(() => {
    if (drawBoard) {
      const currentConfig = drawBoard.getStrokeConfig();
      if (currentConfig) {
        setConfig(currentConfig);
      }
    }
  }, [drawBoard]);

  const updateConfig = (updates: Partial<StrokeConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    
    if (drawBoard) {
      drawBoard.setStrokeConfig(newConfig);
    }
    
    if (onConfigChange) {
      onConfigChange(newConfig);
    }
  };

  if (!visible) return null;

  return (
    <div className="stroke-control-panel" style={{
      position: 'absolute',
      top: '10px',
      right: '10px',
      background: 'rgba(255, 255, 255, 0.95)',
      border: '1px solid #ccc',
      borderRadius: '8px',
      padding: '15px',
      minWidth: '280px',
      boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
      zIndex: 1000
    }}>
      <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#333' }}>
        运笔效果控制
      </h3>
      
      {/* 功能开关 */}
      <div style={{ marginBottom: '15px' }}>
        <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#666' }}>功能开关</h4>
        
        <label style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
          <input
            type="checkbox"
            checked={config.enablePressure}
            onChange={(e) => updateConfig({ enablePressure: e.target.checked })}
            style={{ marginRight: '8px' }}
          />
          压力感应
        </label>
        
        <label style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
          <input
            type="checkbox"
            checked={config.enableVelocity}
            onChange={(e) => updateConfig({ enableVelocity: e.target.checked })}
            style={{ marginRight: '8px' }}
          />
          速度感应
        </label>
        
        <label style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
          <input
            type="checkbox"
            checked={config.enableAngle}
            onChange={(e) => updateConfig({ enableAngle: e.target.checked })}
            style={{ marginRight: '8px' }}
          />
          角度感应
        </label>
        
        <label style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
          <input
            type="checkbox"
            checked={config.opacityVariation}
            onChange={(e) => updateConfig({ opacityVariation: e.target.checked })}
            style={{ marginRight: '8px' }}
          />
          透明度变化
        </label>
      </div>
      
      {/* 敏感度控制 */}
      <div style={{ marginBottom: '15px' }}>
        <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#666' }}>敏感度控制</h4>
        
        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px' }}>
            压力敏感度: {config.pressureSensitivity.toFixed(2)}
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={config.pressureSensitivity}
            onChange={(e) => updateConfig({ pressureSensitivity: parseFloat(e.target.value) })}
            style={{ width: '100%' }}
          />
        </div>
        
        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px' }}>
            速度敏感度: {config.velocitySensitivity.toFixed(2)}
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={config.velocitySensitivity}
            onChange={(e) => updateConfig({ velocitySensitivity: parseFloat(e.target.value) })}
            style={{ width: '100%' }}
          />
        </div>
        
        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px' }}>
            平滑度: {config.smoothing.toFixed(2)}
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={config.smoothing}
            onChange={(e) => updateConfig({ smoothing: parseFloat(e.target.value) })}
            style={{ width: '100%' }}
          />
        </div>
      </div>
      
      {/* 线宽控制 */}
      <div style={{ marginBottom: '15px' }}>
        <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#666' }}>线宽控制</h4>
        
        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px' }}>
            最小线宽: {config.minLineWidth}px
          </label>
          <input
            type="range"
            min="0.5"
            max="10"
            step="0.5"
            value={config.minLineWidth}
            onChange={(e) => updateConfig({ minLineWidth: parseFloat(e.target.value) })}
            style={{ width: '100%' }}
          />
        </div>
        
        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px' }}>
            最大线宽: {config.maxLineWidth}px
          </label>
          <input
            type="range"
            min="5"
            max="50"
            step="1"
            value={config.maxLineWidth}
            onChange={(e) => updateConfig({ maxLineWidth: parseFloat(e.target.value) })}
            style={{ width: '100%' }}
          />
        </div>
      </div>
      
      {/* 预设按钮 */}
      <div style={{ marginBottom: '15px' }}>
        <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#666' }}>预设效果</h4>
        
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => updateConfig({
              enablePressure: true,
              enableVelocity: true,
              enableAngle: true,
              pressureSensitivity: 0.8,
              velocitySensitivity: 0.6,
              minLineWidth: 1,
              maxLineWidth: 20,
              smoothing: 0.3,
              opacityVariation: true
            })}
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              background: '#f5f5f5',
              cursor: 'pointer'
            }}
          >
            自然笔触
          </button>
          
          <button
            onClick={() => updateConfig({
              enablePressure: true,
              enableVelocity: false,
              enableAngle: false,
              pressureSensitivity: 1.0,
              velocitySensitivity: 0,
              minLineWidth: 2,
              maxLineWidth: 15,
              smoothing: 0.1,
              opacityVariation: false
            })}
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              background: '#f5f5f5',
              cursor: 'pointer'
            }}
          >
            压力笔
          </button>
          
          <button
            onClick={() => updateConfig({
              enablePressure: false,
              enableVelocity: true,
              enableAngle: true,
              pressureSensitivity: 0,
              velocitySensitivity: 1.0,
              minLineWidth: 1,
              maxLineWidth: 8,
              smoothing: 0.5,
              opacityVariation: true
            })}
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              background: '#f5f5f5',
              cursor: 'pointer'
            }}
          >
            速度笔
          </button>
          
          <button
            onClick={() => updateConfig({
              enablePressure: false,
              enableVelocity: false,
              enableAngle: false,
              pressureSensitivity: 0,
              velocitySensitivity: 0,
              minLineWidth: 2,
              maxLineWidth: 2,
              smoothing: 0,
              opacityVariation: false
            })}
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              background: '#f5f5f5',
              cursor: 'pointer'
            }}
          >
            普通笔
          </button>
        </div>
      </div>
      
      {/* 重置按钮 */}
      <button
        onClick={() => updateConfig({
          enablePressure: true,
          enableVelocity: true,
          enableAngle: true,
          pressureSensitivity: 0.8,
          velocitySensitivity: 0.6,
          minLineWidth: 1,
          maxLineWidth: 20,
          smoothing: 0.3,
          opacityVariation: true
        })}
        style={{
          width: '100%',
          padding: '8px',
          fontSize: '12px',
          border: '1px solid #007acc',
          borderRadius: '4px',
          background: '#007acc',
          color: 'white',
          cursor: 'pointer'
        }}
      >
        重置为默认
      </button>
    </div>
  );
}; 