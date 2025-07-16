import React, { useEffect, useRef, useState } from 'react';
import { DrawBoard } from '../../libs/drawBoard';
import type { DrawBoardState } from '../../libs/drawBoard/handlers/StateHandler';
import type { ControlPoint } from '../../libs/drawBoard/tools/transform/TransformTypes';
import './style.scss';

interface TransformDemoProps {}

const TransformDemo: React.FC<TransformDemoProps> = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawBoardRef = useRef<DrawBoard | null>(null);
  
  // 状态管理
  const [boardState, setBoardState] = useState<DrawBoardState | null>(null);
  const [isTransformMode, setIsTransformMode] = useState(false);
  const [controlPoints, setControlPoints] = useState<ControlPoint[]>([]);
  const [selectedShapeInfo, setSelectedShapeInfo] = useState<{
    type: string;
    pointCount: number;
    bounds?: { x: number; y: number; width: number; height: number };
  } | null>(null);

  // 初始化画板
  useEffect(() => {
    if (canvasRef.current && !drawBoardRef.current) {
      try {
        drawBoardRef.current = new DrawBoard(canvasRef.current, {
          backgroundColor: '#fafafa',
          enableTouch: true,
          maxHistorySize: 50
        });

        // 监听状态变化
        const updateState = () => {
          if (drawBoardRef.current) {
            const state = drawBoardRef.current.getState();
            setBoardState(state);
            
            // 检查是否在变换模式
            const selectTool = drawBoardRef.current.getCurrentTool();
            if (selectTool && typeof (selectTool as any).isInTransformMode === 'function') {
              const inTransformMode = (selectTool as any).isInTransformMode();
              setIsTransformMode(inTransformMode);
              
              if (inTransformMode) {
                // 获取控制点信息
                const points = (selectTool as any).getControlPoints() || [];
                setControlPoints(points);
                
                // 获取选中图形信息
                const selectedAction = (selectTool as any).getSelectedTransformAction();
                if (selectedAction) {
                  setSelectedShapeInfo({
                    type: selectedAction.type,
                    pointCount: selectedAction.points.length,
                    bounds: calculateBounds(selectedAction.points)
                  });
                }
              } else {
                setControlPoints([]);
                setSelectedShapeInfo(null);
              }
            }
          }
        };

        drawBoardRef.current.onStateChange(updateState);
        updateState();

        // 添加键盘事件监听
        const handleKeyDown = (event: KeyboardEvent) => {
          if (drawBoardRef.current) {
            const handled = (drawBoardRef.current as any).handleKeyboardEvent?.(event);
            if (handled) {
              updateState();
            }
          }
        };

        document.addEventListener('keydown', handleKeyDown);

        return () => {
          document.removeEventListener('keydown', handleKeyDown);
        };
      } catch (error) {
        console.error('画板初始化失败:', error);
      }
    }
  }, []);

  // 计算边界框
  const calculateBounds = (points: Array<{ x: number; y: number }>) => {
    if (points.length === 0) return undefined;
    
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys)
    };
  };

  // 切换工具
  const switchTool = async (toolType: string) => {
    try {
      await drawBoardRef.current?.setCurrentTool(toolType as any);
    } catch (error) {
      console.error('切换工具失败:', error);
    }
  };

  // 清空画板
  const clearBoard = () => {
    drawBoardRef.current?.clear();
    setIsTransformMode(false);
    setControlPoints([]);
    setSelectedShapeInfo(null);
  };

  // 撤销/重做
  const undo = () => drawBoardRef.current?.undo();
  const redo = () => drawBoardRef.current?.redo();

  // 退出变换模式
  const exitTransformMode = () => {
    const selectTool = drawBoardRef.current?.getCurrentTool();
    if (selectTool && typeof (selectTool as any).exitTransformMode === 'function') {
      (selectTool as any).exitTransformMode();
      setIsTransformMode(false);
      setControlPoints([]);
      setSelectedShapeInfo(null);
    }
  };

  return (
    <div className="transform-demo">
      {/* 标题和说明 */}
      <div className="demo-header">
        <h1>🎯 图形变换功能演示</h1>
        <div className="demo-description">
          <h3>功能特性：</h3>
          <ul>
            <li><strong>控制点显示</strong>：选中图形后显示可拖拽的控制点</li>
            <li><strong>尺寸调整</strong>：拖拽控制点改变图形大小</li>
            <li><strong>位置移动</strong>：在图形内拖拽或使用方向键移动</li>
            <li><strong>双击进入</strong>：双击图形进入变换模式</li>
            <li><strong>ESC退出</strong>：按ESC键退出变换模式</li>
          </ul>
        </div>
      </div>

      <div className="demo-content">
        {/* 工具栏 */}
        <div className="demo-toolbar">
          <div className="tool-group">
            <h4>绘制工具</h4>
            <button 
              className={boardState?.currentTool === 'pen' ? 'active' : ''}
              onClick={() => switchTool('pen')}
            >
              🖊️ 画笔
            </button>
            <button 
              className={boardState?.currentTool === 'rect' ? 'active' : ''}
              onClick={() => switchTool('rect')}
            >
              ⬜ 矩形
            </button>
            <button 
              className={boardState?.currentTool === 'circle' ? 'active' : ''}
              onClick={() => switchTool('circle')}
            >
              ⭕ 圆形
            </button>
          </div>

          <div className="tool-group">
            <h4>编辑工具</h4>
            <button 
              className={boardState?.currentTool === 'select' ? 'active' : ''}
              onClick={() => switchTool('select')}
            >
              🎯 选择
            </button>
            {isTransformMode && (
              <button 
                className="exit-transform"
                onClick={exitTransformMode}
              >
                ❌ 退出变换
              </button>
            )}
          </div>

          <div className="tool-group">
            <h4>操作</h4>
            <button 
              onClick={undo}
              disabled={!boardState?.canUndo}
            >
              ↶ 撤销
            </button>
            <button 
              onClick={redo}
              disabled={!boardState?.canRedo}
            >
              ↷ 重做
            </button>
            <button onClick={clearBoard}>
              🗑️ 清空
            </button>
          </div>
        </div>

        {/* 画板区域 */}
        <div className="demo-canvas-container">
          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            className="demo-canvas"
          />
          
          {/* 状态覆盖层 */}
          {isTransformMode && (
            <div className="transform-overlay">
              <div className="transform-indicator">
                <span className="transform-badge">🎯 变换模式</span>
                <span className="transform-hint">ESC退出</span>
              </div>
            </div>
          )}
        </div>

        {/* 状态信息面板 */}
        <div className="demo-info-panel">
          <div className="info-section">
            <h4>🎛️ 画板状态</h4>
            <div className="info-grid">
              <div>当前工具：<span className="value">{boardState?.currentTool || 'none'}</span></div>
              <div>绘制中：<span className="value">{boardState?.drawingState.isDrawing ? '是' : '否'}</span></div>
              <div>选择中：<span className="value">{boardState?.drawingState.isSelecting ? '是' : '否'}</span></div>
              <div>变换中：<span className="value">{(boardState?.drawingState as any)?.isTransforming ? '是' : '否'}</span></div>
              <div>历史记录：<span className="value">{boardState?.historyCount || 0}</span></div>
              <div>选中数量：<span className="value">{boardState?.selectedActionsCount || 0}</span></div>
            </div>
          </div>

          {isTransformMode && selectedShapeInfo && (
            <div className="info-section">
              <h4>📐 选中图形</h4>
              <div className="info-grid">
                <div>类型：<span className="value">{selectedShapeInfo.type}</span></div>
                <div>点数：<span className="value">{selectedShapeInfo.pointCount}</span></div>
                {selectedShapeInfo.bounds && (
                  <>
                    <div>位置：<span className="value">
                      ({selectedShapeInfo.bounds.x.toFixed(0)}, {selectedShapeInfo.bounds.y.toFixed(0)})
                    </span></div>
                    <div>尺寸：<span className="value">
                      {selectedShapeInfo.bounds.width.toFixed(0)} × {selectedShapeInfo.bounds.height.toFixed(0)}
                    </span></div>
                  </>
                )}
              </div>
            </div>
          )}

          {isTransformMode && controlPoints.length > 0 && (
            <div className="info-section">
              <h4>🎮 控制点信息</h4>
              <div className="control-points-list">
                {controlPoints.slice(0, 8).map((point, index) => (
                  <div key={point.id} className="control-point-item">
                    <span className="point-type">{point.type}</span>
                    <span className="point-pos">
                      ({point.x.toFixed(0)}, {point.y.toFixed(0)})
                    </span>
                  </div>
                ))}
                {controlPoints.length > 8 && (
                  <div className="control-point-item">
                    <span className="point-more">...还有{controlPoints.length - 8}个控制点</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="info-section">
            <h4>📖 使用指南</h4>
            <div className="usage-guide">
              <h5>绘制图形：</h5>
              <p>1. 选择画笔🖊️、矩形⬜或圆形⭕工具</p>
              <p>2. 在画板上拖拽绘制图形</p>
              
              <h5>选择图形：</h5>
              <p>1. 选择选择工具🎯</p>
              <p>2. 拖拽框选择图形</p>
              <p>3. 双击图形进入变换模式</p>
              
              <h5>变换图形：</h5>
              <p>1. 拖拽控制点调整尺寸</p>
              <p>2. 在图形内拖拽移动位置</p>
              <p>3. 使用方向键↑↓←→微调位置</p>
              <p>4. 按住Shift加速移动</p>
              <p>5. 按ESC退出变换模式</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TransformDemo; 