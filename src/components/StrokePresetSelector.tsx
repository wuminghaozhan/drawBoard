import React, { useState } from 'react';
import { getAllStrokePresets, getPresetsByCategory, type StrokePresetType } from '../libs/drawBoard/tools/StrokePresets';
import type { StrokeConfig } from '../libs/drawBoard/tools/PenTool';

interface StrokePresetSelectorProps {
  drawBoard: any; // DrawBoard实例
  onPresetChange?: (presetType: StrokePresetType, config: StrokeConfig) => void;
  visible?: boolean;
}

export const StrokePresetSelector: React.FC<StrokePresetSelectorProps> = ({
  drawBoard,
  onPresetChange,
  visible = true
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'writing' | 'art' | 'drawing'>('all');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [currentPreset, setCurrentPreset] = useState<StrokePresetType | null>(null);

  // 获取当前预设
  React.useEffect(() => {
    if (drawBoard) {
      const preset = drawBoard.getCurrentStrokePreset();
      setCurrentPreset(preset);
    }
  }, [drawBoard]);

  // 获取显示的预设列表
  const getDisplayPresets = () => {
    let presets = getAllStrokePresets();
    
    // 按分类过滤
    if (selectedCategory !== 'all') {
      presets = getPresetsByCategory(selectedCategory);
    }
    
    // 按关键词搜索
    if (searchKeyword.trim()) {
      const lowerKeyword = searchKeyword.toLowerCase();
      presets = presets.filter(preset => 
        preset.name.toLowerCase().includes(lowerKeyword) ||
        preset.description.toLowerCase().includes(lowerKeyword) ||
        preset.tips.some(tip => tip.toLowerCase().includes(lowerKeyword))
      );
    }
    
    return presets;
  };

  const handlePresetSelect = (presetType: StrokePresetType) => {
    if (drawBoard) {
      drawBoard.setStrokePreset(presetType);
      setCurrentPreset(presetType);
      
      const preset = getDisplayPresets().find(p => p.name === presetType);
      if (preset && onPresetChange) {
        onPresetChange(presetType, preset.config);
      }
    }
  };

  const displayPresets = getDisplayPresets();

  if (!visible) return null;

  return (
    <div className="stroke-preset-selector" style={{
      position: 'absolute',
      top: '10px',
      left: '10px',
      background: 'rgba(255, 255, 255, 0.95)',
      backdropFilter: 'blur(10px)',
      border: '1px solid #ccc',
      borderRadius: '8px',
      padding: '15px',
      minWidth: '320px',
      maxWidth: '400px',
      maxHeight: '500px',
      overflow: 'hidden',
      boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
      zIndex: 1000
    }}>
      <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#333' }}>
        笔触预设选择
      </h3>

      {/* 搜索框 */}
      <div style={{ marginBottom: '15px' }}>
        <input
          type="text"
          placeholder="搜索笔触效果..."
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '14px'
          }}
        />
      </div>

      {/* 分类选择 */}
      <div style={{ marginBottom: '15px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: '全部', icon: '🎨' },
            { key: 'writing', label: '书写', icon: '✍️' },
            { key: 'art', label: '艺术', icon: '🖼️' },
            { key: 'drawing', label: '绘画', icon: '🖌️' }
          ].map(category => (
            <button
              key={category.key}
              onClick={() => setSelectedCategory(category.key as any)}
              style={{
                padding: '6px 12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                background: selectedCategory === category.key ? '#667eea' : 'white',
                color: selectedCategory === category.key ? 'white' : '#666',
                cursor: 'pointer',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <span>{category.icon}</span>
              <span>{category.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 预设列表 */}
      <div style={{ 
        maxHeight: '300px', 
        overflowY: 'auto',
        border: '1px solid #eee',
        borderRadius: '4px',
        padding: '8px'
      }}>
        {displayPresets.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            color: '#999', 
            padding: '20px',
            fontSize: '14px'
          }}>
            没有找到匹配的预设
          </div>
        ) : (
          displayPresets.map((preset) => {
            const isSelected = currentPreset === preset.name.toLowerCase().replace(/\s+/g, '_') as StrokePresetType;
            return (
              <div
                key={preset.name}
                onClick={() => handlePresetSelect(preset.name.toLowerCase().replace(/\s+/g, '_') as StrokePresetType)}
                style={{
                  padding: '12px',
                  border: '1px solid #eee',
                  borderRadius: '6px',
                  marginBottom: '8px',
                  cursor: 'pointer',
                  background: isSelected ? '#f0f8ff' : 'white',
                  borderColor: isSelected ? '#667eea' : '#eee',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = isSelected ? '#e6f3ff' : '#f8f9fa';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isSelected ? '#f0f8ff' : 'white';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '20px', marginRight: '10px' }}>
                    {preset.icon}
                  </span>
                  <div>
                    <h4 style={{ 
                      margin: '0 0 4px 0', 
                      fontSize: '14px', 
                      color: '#333',
                      fontWeight: isSelected ? '600' : '500'
                    }}>
                      {preset.name}
                    </h4>
                    <p style={{ 
                      margin: 0, 
                      fontSize: '12px', 
                      color: '#666',
                      lineHeight: '1.3'
                    }}>
                      {preset.description}
                    </p>
                  </div>
                </div>
                
                {/* 使用提示 */}
                <div style={{ marginTop: '8px' }}>
                  <div style={{ 
                    fontSize: '11px', 
                    color: '#888',
                    marginBottom: '4px'
                  }}>
                    使用提示:
                  </div>
                  <ul style={{ 
                    margin: 0, 
                    paddingLeft: '16px',
                    fontSize: '11px',
                    color: '#666',
                    lineHeight: '1.4'
                  }}>
                    {preset.tips.slice(0, 2).map((tip, index) => (
                      <li key={index}>{tip}</li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 当前选择提示 */}
      {currentPreset && (
        <div style={{ 
          marginTop: '15px', 
          padding: '10px', 
          background: '#f8f9ff', 
          borderRadius: '4px',
          border: '1px solid #e6f3ff'
        }}>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
            当前选择:
          </div>
          <div style={{ fontSize: '14px', color: '#333', fontWeight: '500' }}>
            {displayPresets.find(p => p.name.toLowerCase().replace(/\s+/g, '_') === currentPreset)?.name || currentPreset}
          </div>
        </div>
      )}
    </div>
  );
}; 