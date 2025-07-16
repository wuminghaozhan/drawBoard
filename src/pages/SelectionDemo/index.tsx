import React, { useRef, useEffect, useState } from 'react';
import { DrawBoard } from '../../libs/drawBoard';
import type { ToolType } from '../../libs/drawBoard';
import ToolPanel from '../../components/ToolPanel';
import './style.scss';

const SelectionDemo: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const drawBoardRef = useRef<DrawBoard | null>(null);
  
  const [currentTool, setCurrentTool] = useState<ToolType>('pen');
  const [currentColor, setCurrentColor] = useState('#000000');
  const [currentLineWidth, setCurrentLineWidth] = useState(2);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [historyCount, setHistoryCount] = useState(0);
  const [hasSelection, setHasSelection] = useState(false);
  const [selectedCount, setSelectedCount] = useState(0);

  useEffect(() => {
    if (containerRef.current && !drawBoardRef.current) {
      console.log('=== SelectionDemo 开始初始化画板 ===');
      console.log('容器元素:', containerRef.current);
      console.log('容器尺寸:', containerRef.current.offsetWidth, 'x', containerRef.current.offsetHeight);
      
      // 确保容器有尺寸
      if (containerRef.current.offsetWidth === 0 || containerRef.current.offsetHeight === 0) {
        console.warn('容器尺寸为0，设置默认尺寸');
        containerRef.current.style.width = '100%';
        containerRef.current.style.height = '100%';
        containerRef.current.style.minHeight = '400px';
      }

      try {
        drawBoardRef.current = new DrawBoard(containerRef.current, {
          maxHistorySize: 100,
          enableShortcuts: true
        });

        console.log('=== DrawBoard 创建成功 ===');
        console.log('DrawBoard 实例:', drawBoardRef.current);

        // 设置初始状态
        drawBoardRef.current.setTool(currentTool);
        drawBoardRef.current.setColor(currentColor);
        drawBoardRef.current.setLineWidth(currentLineWidth);

        updateState();

        // 延迟显示使用提示
        setTimeout(() => {
          showUsageTip();
        }, 1000);

        console.log('=== SelectionDemo 初始化完成 ===');
      } catch (error) {
        console.error('=== DrawBoard 初始化失败 ===', error);
      }
    }

    return () => {
      if (drawBoardRef.current) {
        console.log('=== 清理 DrawBoard ===');
        drawBoardRef.current.destroy();
        drawBoardRef.current = null;
      }
    };
  }, []);

  const updateState = () => {
    if (drawBoardRef.current) {
      const state = drawBoardRef.current.getState();
      setCanUndo(state.canUndo);
      setCanRedo(state.canRedo);
      setHistoryCount(state.historyCount);
      setHasSelection(drawBoardRef.current.hasSelection());
      setSelectedCount(state.selectedActionsCount || 0);
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
    drawBoardRef.current?.copySelection();
    updateState();
  };

  const handleSave = () => {
    drawBoardRef.current?.saveAsImage('选择功能演示');
  };

  // 显示使用提示
  const showUsageTip = () => {
    alert('欢迎使用选择功能演示！\n\n请按以下步骤操作：\n\n1. 🖊️ 先绘制内容：使用画笔、矩形、圆形等工具绘制一些图形\n2. 🎯 切换选择工具：点击选择工具按钮或按 S 键\n3. 📦 框选图形：拖拽鼠标框选要操作的图形\n4. ⚡ 执行操作：使用工具栏按钮复制、删除或取消选择\n\n现在就开始绘制你的第一个图形吧！');
  };

  // 添加示例提示
  const addSampleShapes = () => {
    showUsageTip();
  };

  return (
    <div className="selection-demo">
      <div className="demo-header">
        <h1>选择功能演示</h1>
        <p>体验优化后的选择工具，包括现代化选择框、分组操作和增强的交互体验</p>
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
          />
        </div>

        <div className="canvas-container">
          <div 
            ref={containerRef}
            className="draw-board"
          />
        </div>

        <div className="info-panel">
          <h3>选择功能特性</h3>
          
          <div className="feature-section">
            <h4>🎯 现代化选择框</h4>
            <ul>
              <li>动画虚线边框效果</li>
              <li>圆角设计与半透明背景</li>
              <li>四角指示器增强视觉反馈</li>
              <li>选中状态的高亮效果</li>
            </ul>
          </div>

          <div className="feature-section">
            <h4>⚡ 优化的交互</h4>
            <ul>
              <li>拖拽框选择内容</li>
              <li>专门的选择操作区域</li>
              <li>一键复制、删除、取消选择</li>
              <li>实时状态反馈</li>
            </ul>
          </div>

          <div className="feature-section">
            <h4>📱 移动端优化</h4>
            <ul>
              <li>触摸友好的按钮大小</li>
              <li>简化的操作流程</li>
              <li>响应式布局适配</li>
              <li>手势操作支持</li>
            </ul>
          </div>

          <div className="status-section">
            <h4>当前状态</h4>
            <div className="status-info">
              <div className="status-item">
                <span>当前工具：</span>
                <span className={`tool-indicator ${currentTool}`}>
                  {currentTool === 'pen' ? '🖊️ 画笔' : 
                   currentTool === 'select' ? '🎯 选择' :
                   currentTool === 'rect' ? '⬜ 矩形' :
                   currentTool === 'circle' ? '⭕ 圆形' :
                   currentTool === 'text' ? '📝 文字' : '🧽 橡皮擦'}
                </span>
              </div>
              <div className="status-item">
                <span>历史记录：</span>
                <span>{historyCount} 步</span>
              </div>
              <div className="status-item">
                <span>选择状态：</span>
                <span className={hasSelection ? 'has-selection' : 'no-selection'}>
                  {hasSelection ? `✓ 已选择 ${selectedCount} 项` : '❌ 未选择'}
                </span>
              </div>
            </div>
          </div>

          <div className="usage-tips">
            <h4>使用说明</h4>
            <div className="tip-item">
              <strong>🖊️ 第一步：</strong>
              <p>使用画笔、矩形、圆形等工具绘制一些图形</p>
            </div>
            <div className="tip-item">
              <strong>🎯 第二步：</strong>
              <p>切换到选择工具，拖拽框选择要操作的内容</p>
            </div>
            <div className="tip-item">
              <strong>⚡ 第三步：</strong>
              <p>选中后可以复制、删除或取消选择</p>
            </div>
            <div className="tip-item">
              <strong>⌨️ 快捷键：</strong>
              <p>S-选择 | Esc-取消选择 | Del-删除 | Ctrl+C-复制</p>
            </div>
          </div>

          <div className="demo-actions">
            <h4>快速操作</h4>
            <button 
              onClick={addSampleShapes}
              className="demo-button"
            >
              📖 查看使用教程
            </button>
            <button 
              onClick={() => handleToolChange('select')}
              className={`demo-button ${currentTool === 'select' ? 'active' : ''}`}
            >
              {currentTool === 'select' ? '✓ 选择工具已激活' : '切换到选择工具'}
            </button>
            <button 
              onClick={handleClear}
              className="demo-button clear"
            >
              清空画板
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SelectionDemo; 