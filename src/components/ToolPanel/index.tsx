import React, { useState } from 'react';
import type { ToolType } from '@/libs/drawBoard';
import './style.scss';

interface ToolPanelProps {
  currentTool: ToolType;
  currentColor: string;
  currentLineWidth: number;
  canUndo?: boolean;
  canRedo?: boolean;
  historyCount?: number;
  hasSelection?: boolean;
  onToolChange: (tool: ToolType) => void;
  onColorChange: (color: string) => void;
  onLineWidthChange: (width: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onClearSelection?: () => void;
  onDeleteSelection?: () => void;
  onCopySelection?: () => void;
  onSave?: () => void;
  onCopy?: () => void;
}

// 优化后的工具分组配置
const toolGroups = [
  {
    name: '绘制工具',
    id: 'drawing',
    tools: [
      { type: 'pen' as ToolType, name: '画笔', icon: '🖊️', hotkey: 'B' },
      { type: 'rect' as ToolType, name: '矩形', icon: '⬜', hotkey: 'R' },
      { type: 'circle' as ToolType, name: '圆形', icon: '⭕', hotkey: 'C' },
      { type: 'line' as ToolType, name: '直线', icon: '📏', hotkey: 'L' },
      { type: 'polygon' as ToolType, name: '多边形', icon: '🔷', hotkey: 'P' },
    ]
  },
  {
    name: '编辑工具', 
    id: 'editing',
    tools: [
      { type: 'select' as ToolType, name: '选择', icon: '🎯', hotkey: 'S' },
      { type: 'text' as ToolType, name: '文字', icon: '📝', hotkey: 'T' },
      { type: 'eraser' as ToolType, name: '橡皮擦', icon: '🧽', hotkey: 'E' },
    ]
  }
];

const colors = [
  '#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00',
  '#FF00FF', '#00FFFF', '#FFA500', '#800080', '#008000',
  '#FFC0CB', '#A52A2A', '#808080', '#FFFFFF'
];

const lineWidths = [1, 2, 4, 6, 8, 12, 16];

const ToolPanel: React.FC<ToolPanelProps> = ({
  currentTool,
  currentColor,
  currentLineWidth,
  canUndo = false,
  canRedo = false,
  historyCount = 0,
  hasSelection = false,
  onToolChange,
  onColorChange,
  onLineWidthChange,
  onUndo,
  onRedo,
  onClear,
  onClearSelection,
  onDeleteSelection,
  onCopySelection,
  onSave
}) => {
  const [showColorPicker, setShowColorPicker] = useState(false);

  return (
    <div className="tool-panel">
      {/* 工具分组区域 */}
      {toolGroups.map(group => (
        <div key={group.id} className="tool-section">
          <h4>{group.name}</h4>
          <div className="tool-buttons">
            {group.tools.map(tool => (
              <button
                key={tool.type}
                className={`tool-button ${currentTool === tool.type ? 'active' : ''}`}
                onClick={() => onToolChange(tool.type)}
                title={`${tool.name} (${tool.hotkey})`}
              >
                <span className="tool-icon">{tool.icon}</span>
                <span className="tool-name">{tool.name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="tool-section">
        <h4>颜色</h4>
        <div className="color-picker">
          <div className="color-grid">
            {colors.map(color => (
              <button
                key={color}
                className={`color-button ${currentColor === color ? 'active' : ''}`}
                style={{ backgroundColor: color }}
                onClick={() => onColorChange(color)}
                title={color}
              />
            ))}
          </div>
          <button
            className="custom-color-button"
            onClick={() => setShowColorPicker(!showColorPicker)}
          >
            自定义
          </button>
          {showColorPicker && (
            <input
              type="color"
              value={currentColor}
              onChange={(e) => onColorChange(e.target.value)}
              className="color-input"
            />
          )}
        </div>
      </div>

      <div className="tool-section">
        <h4>线宽</h4>
        <div className="line-width-picker">
          {lineWidths.map(width => (
            <button
              key={width}
              className={`line-width-button ${currentLineWidth === width ? 'active' : ''}`}
              onClick={() => onLineWidthChange(width)}
              title={`${width}px`}
            >
              <div 
                className="line-width-preview"
                style={{ height: `${width}px` }}
              />
            </button>
          ))}
        </div>
      </div>

      <div className="tool-section">
        <h4>操作</h4>
        <div className="action-buttons">
          <button 
            onClick={onUndo} 
            disabled={!canUndo}
            title="撤销 (Z)"
            className={`action-button ${!canUndo ? 'disabled' : ''}`}
          >
            ↩️ 撤销
          </button>
          <button 
            onClick={onRedo} 
            disabled={!canRedo}
            title="重做 (Y)"
            className={`action-button ${!canRedo ? 'disabled' : ''}`}
          >
            ↪️ 重做
          </button>
          <button onClick={onClear} title="清空画板" className="action-button">
            🗑️ 清空
          </button>
          {onSave && (
            <button onClick={onSave} title="保存图片" className="action-button">
              💾 保存
            </button>
          )}
        </div>
      </div>

      {/* 选择工具专用操作区域 */}
      {hasSelection && (
        <div className="tool-section selection-section">
          <h4>选择操作</h4>
          <div className="selection-buttons">
            {onCopySelection && (
              <button 
                onClick={onCopySelection} 
                title="复制选中内容 (Ctrl+C)"
                className="selection-button"
              >
                📋 复制
              </button>
            )}
            {onDeleteSelection && (
              <button 
                onClick={onDeleteSelection} 
                title="删除选中内容 (Delete)"
                className="selection-button delete"
              >
                🗑️ 删除
              </button>
            )}
            {onClearSelection && (
              <button 
                onClick={onClearSelection} 
                title="取消选择 (Esc)"
                className="selection-button"
              >
                ❌ 取消
              </button>
            )}
          </div>
        </div>
      )}

      {/* 状态信息 */}
      <div className="tool-section">
        <div className="status-info">
          <div className="history-info">
            <small>历史记录: {historyCount}</small>
          </div>
          {hasSelection && (
            <div className="selection-info">
              <small>✓ 已选择内容</small>
            </div>
          )}
        </div>
      </div>

      {/* 快捷键提示 */}
      <div className="tool-section shortcuts-section">
        <h4>快捷键</h4>
        <div className="shortcuts">
          <div>B - 画笔 | R - 矩形 | C - 圆形</div>
          <div>L - 直线 | P - 多边形</div>
          <div>S - 选择 | T - 文字 | E - 橡皮擦</div>
          <div>Z - 撤销 | Y - 重做</div>
          <div>Esc - 取消选择 | Del - 删除</div>
        </div>
      </div>
    </div>
  );
};

export default ToolPanel; 