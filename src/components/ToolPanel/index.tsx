import React, { useState } from 'react';
import type { ToolType } from '../../libs/drawBoard';
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

const tools = [
  { type: 'pen' as ToolType, name: '画笔', icon: '✏️' },
  { type: 'rect' as ToolType, name: '矩形', icon: '⬜' },
  { type: 'circle' as ToolType, name: '圆形', icon: '⭕' },
  { type: 'text' as ToolType, name: '文字', icon: 'T' },
  { type: 'eraser' as ToolType, name: '橡皮擦', icon: '🧽' },
  { type: 'select' as ToolType, name: '选择', icon: '👆' }
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
  onSave,
  onCopy
}) => {
  const [showColorPicker, setShowColorPicker] = useState(false);

  return (
    <div className="tool-panel">
      <div className="tool-section">
        <h4>工具</h4>
        <div className="tool-buttons">
          {tools.map(tool => (
            <button
              key={tool.type}
              className={`tool-button ${currentTool === tool.type ? 'active' : ''}`}
              onClick={() => onToolChange(tool.type)}
              title={`${tool.name} (${getShortcut(tool.type)})`}
            >
              <span className="tool-icon">{tool.icon}</span>
              <span className="tool-name">{tool.name}</span>
            </button>
          ))}
        </div>
      </div>

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
            className={!canUndo ? 'disabled' : ''}
          >
            ↩️ 撤销
          </button>
          <button 
            onClick={onRedo} 
            disabled={!canRedo}
            title="重做 (Y)"
            className={!canRedo ? 'disabled' : ''}
          >
            ↪️ 重做
          </button>
          <button onClick={onClear} title="清空画板">
            🗑️ 清空
          </button>
          {hasSelection && onClearSelection && (
            <button onClick={onClearSelection} title="取消选择 (Esc)">
              ❌ 取消选择
            </button>
          )}
          {hasSelection && onDeleteSelection && (
            <button onClick={onDeleteSelection} title="删除选中内容 (Delete)">
              🗑️ 删除选中
            </button>
          )}
          {hasSelection && onCopySelection && (
            <button onClick={onCopySelection} title="复制选中内容">
              📋 复制选中
            </button>
          )}
          {onSave && (
            <button onClick={onSave} title="保存图片">
              💾 保存
            </button>
          )}
          {onCopy && (
            <button onClick={onCopy} title="复制到剪贴板">
              📋 复制
            </button>
          )}
        </div>
        {historyCount > 0 && (
          <div className="history-info">
            历史记录: {historyCount} 步
          </div>
        )}
      </div>

      <div className="tool-section">
        <h4>快捷键</h4>
        <div className="shortcuts">
          <div>B - 画笔</div>
          <div>R - 矩形</div>
          <div>C - 圆形</div>
          <div>T - 文字</div>
          <div>E - 橡皮擦</div>
          <div>S - 选择</div>
          <div>Z - 撤销</div>
          <div>Y - 重做</div>
          <div>Delete - 删除选中</div>
          <div>Esc - 取消选择</div>
          <div>💾 保存 - 点击保存按钮</div>
        </div>
      </div>
    </div>
  );
};

const getShortcut = (tool: ToolType): string => {
  const shortcuts: Record<ToolType, string> = {
    pen: 'B',
    rect: 'R',
    circle: 'C',
    text: 'T',
    eraser: 'E',
    select: 'S'
  };
  return shortcuts[tool];
};

export default ToolPanel; 