import React, { useState, useRef, useEffect } from 'react';
import { DrawBoard } from '@/libs/drawBoard';
import type { ToolType } from '@/libs/drawBoard';
import './style.scss';

const Test: React.FC = () => {
  const [activeTab, setActiveTab] = useState('canvas');
  const [drawData, setDrawData] = useState({
    color: '#000000',
    lineWidth: 2,
    tool: 'pen' as ToolType
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const drawBoardRef = useRef<DrawBoard | null>(null);
  const mutationObserverRef = useRef<MutationObserver | null>(null);
  const initCountRef = useRef(0);
  const monitorIntervalRef = useRef<number | null>(null);

  // 检测React严格模式
  useEffect(() => {
    initCountRef.current += 1;
    console.log(`🔄 useEffect called ${initCountRef.current} times (Strict Mode detection)`);
  }, []);

  // 监控容器变化
  const startContainerMonitoring = (container: HTMLDivElement) => {
    // 停止之前的监控
    if (mutationObserverRef.current) {
      mutationObserverRef.current.disconnect();
    }

    mutationObserverRef.current = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          console.log('🔍 Container children changed:', {
            addedNodes: mutation.addedNodes.length,
            removedNodes: mutation.removedNodes.length,
            totalChildren: container.childElementCount,
            canvasCount: container.querySelectorAll('canvas').length,
            removedCanvases: Array.from(mutation.removedNodes).filter(node => 
              node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'CANVAS'
            ).length
          });
          
          if (mutation.removedNodes.length > 0) {
            console.warn('⚠️ Nodes removed from container!', Array.from(mutation.removedNodes).map(node => ({
              nodeType: node.nodeType,
              nodeName: node.nodeName,
              textContent: node.textContent?.substring(0, 50)
            })));
          }
        }
      });
    });

    mutationObserverRef.current.observe(container, {
      childList: true,
      subtree: true
    });

    console.log('📡 Started monitoring container changes');
  };

  // 开始自动监控canvas状态
  const startAutoMonitoring = () => {
    // 清除之前的监控
    if (monitorIntervalRef.current) {
      clearInterval(monitorIntervalRef.current);
    }

    monitorIntervalRef.current = setInterval(() => {
      const container = containerRef.current;
      if (container && drawBoardRef.current) {
        const canvasCount = container.querySelectorAll('canvas').length;
        if (canvasCount === 0) {
          console.warn('🚨 Auto-monitor detected missing canvas! Attempting to fix...');
          checkCanvasStatus(); // 这会尝试修复问题
        }
      }
    }, 2000); // 每2秒检查一次

    console.log('🔄 Started auto-monitoring canvas status');
  };

  // 停止自动监控
  const stopAutoMonitoring = () => {
    if (monitorIntervalRef.current) {
      clearInterval(monitorIntervalRef.current);
      monitorIntervalRef.current = null;
      console.log('⏹️ Stopped auto-monitoring');
    }
  };

  // 初始化DrawBoard
  useEffect(() => {
    console.log('🔄 useEffect called, initCount:', initCountRef.current);
    
    const initDrawBoard = () => {
      console.log('🚀 initDrawBoard function called');
      
      const container = containerRef.current;
      if (!container) {
        console.log('Container element not found');
        return;
      }

      // 检查容器尺寸
      const containerRect = container.getBoundingClientRect();
      console.log('Container info:', {
        offsetWidth: container.offsetWidth,
        offsetHeight: container.offsetHeight,
        clientWidth: container.clientWidth,
        clientHeight: container.clientHeight,
        getBoundingClientRect: containerRect,
        computedStyle: {
          width: getComputedStyle(container).width,
          height: getComputedStyle(container).height,
          display: getComputedStyle(container).display,
          position: getComputedStyle(container).position
        }
      });

      // 等待容器渲染完成
      if (container.offsetWidth === 0 || container.offsetHeight === 0) {
        console.log('Container not ready, retrying...');
        setTimeout(initDrawBoard, 100);
        return;
      }

      // 检查容器内是否已有内容
      console.log('Container children before DrawBoard init:', {
        childElementCount: container.childElementCount,
        innerHTML: container.innerHTML.substring(0, 200)
      });

      // 开始监控容器变化
      startContainerMonitoring(container);

      try {
        // 🔍 检查重复初始化
        console.log('🔄 Attempting DrawBoard initialization #' + (initCountRef.current));
        console.log('Existing DrawBoard instance:', !!drawBoardRef.current);
        console.log('Container canvas count before init:', container.querySelectorAll('canvas').length);
        
        console.log('Initializing DrawBoard with container:', {
          width: container.offsetWidth,
          height: container.offsetHeight
        });

        // 使用单例模式创建DrawBoard实例（自动处理重复实例）
        drawBoardRef.current = DrawBoard.getInstance(container, {
          maxHistorySize: 100,
          enableShortcuts: true
        });

        console.log('DrawBoard initialized successfully');
        
        // 立即检查容器内容
        console.log('Container children after DrawBoard init:', {
          childElementCount: container.childElementCount,
          innerHTML: container.innerHTML.substring(0, 300)
        });
        
        // 立即初始化默认工具
        drawBoardRef.current.initializeDefaultTools().then(() => {
          console.log('Default tools loaded');
          
          // 再次检查容器内容
          console.log('Container children after tools loaded:', {
            childElementCount: container.childElementCount,
            canvasCount: container.querySelectorAll('canvas').length
          });
          
          // 设置初始工具和颜色
          drawBoardRef.current!.setTool(drawData.tool);
          drawBoardRef.current!.setColor(drawData.color);
          drawBoardRef.current!.setLineWidth(drawData.lineWidth);
          
          console.log('Initial tool settings applied');
          
          // 启动自动监控
          startAutoMonitoring();
          
          // 添加绘制事件监听器进行调试
          const interactionCanvas = container.querySelector('canvas[style*="pointer-events: auto"]');
          if (interactionCanvas) {
            console.log('Found interaction canvas, adding debug listeners');
            
            interactionCanvas.addEventListener('mousedown', (e) => {
              const mouseEvent = e as MouseEvent;
              console.log('🖱️ Mouse down on interaction canvas:', {
                x: mouseEvent.offsetX,
                y: mouseEvent.offsetY,
                currentTool: drawBoardRef.current?.getCurrentTool()
              });
            });
            
            interactionCanvas.addEventListener('mousemove', (e) => {
              const mouseEvent = e as MouseEvent;
              if (mouseEvent.buttons === 1) { // 只在拖拽时记录
                console.log('🖱️ Mouse drag:', {
                  x: mouseEvent.offsetX,
                  y: mouseEvent.offsetY
                });
              }
            });
            
            interactionCanvas.addEventListener('mouseup', (e) => {
              const mouseEvent = e as MouseEvent;
              console.log('🖱️ Mouse up:', {
                x: mouseEvent.offsetX,
                y: mouseEvent.offsetY
              });
            });
          } else {
            console.warn('⚠️ No interaction canvas found with pointer-events: auto');
            console.log('Available canvases:', Array.from(container.querySelectorAll('canvas')).map(c => c.style.cssText));
          }
          
        }).catch(error => {
          console.error('Failed to initialize default tools:', error);
        });
        
        // 检查canvas是否被创建
        setTimeout(() => {
          const canvases = container.querySelectorAll('canvas');
          console.log('Canvas elements found:', canvases.length);
          canvases.forEach((canvas, index) => {
            console.log(`Canvas ${index}:`, {
              width: canvas.width,
              height: canvas.height,
              style: canvas.style.cssText,
              zIndex: canvas.style.zIndex
            });
          });
        }, 100);

      } catch (error) {
        console.error('DrawBoard initialization failed:', error);
      }
    };

    // 延迟初始化
    console.log('📅 Scheduling DrawBoard initialization with 50ms delay');
    setTimeout(initDrawBoard, 50);

    // 清理函数
    return () => {
      console.log('🧹 Cleaning up DrawBoard and monitors');
      
      // 停止自动监控
      stopAutoMonitoring();
      
      // 停止容器监控
      if (mutationObserverRef.current) {
        mutationObserverRef.current.disconnect();
        mutationObserverRef.current = null;
        console.log('📡 Stopped container monitoring');
      }
      
      if (drawBoardRef.current) {
        console.log('🗑️ Destroying DrawBoard instance');
        const container = containerRef.current;
        if (container) {
          DrawBoard.destroyInstance(container);
        } else {
          // 备用方案：如果容器引用丢失，直接调用实例的destroy
          drawBoardRef.current.destroy();
        }
        drawBoardRef.current = null;
      }
    };
  }, []);

  // 更新工具设置
  useEffect(() => {
    if (drawBoardRef.current) {
      // 使用异步方式设置工具，确保工具实例已加载
      drawBoardRef.current.setToolAsync(drawData.tool).then(() => {
        console.log(`Tool changed to: ${drawData.tool}`);
      }).catch(error => {
        console.error(`Failed to change tool to ${drawData.tool}:`, error);
        // 如果异步失败，尝试同步方式（向后兼容）
        drawBoardRef.current!.setTool(drawData.tool);
      });
      
      // 颜色和线宽可以立即设置
      drawBoardRef.current.setColor(drawData.color);
      drawBoardRef.current.setLineWidth(drawData.lineWidth);
    }
  }, [drawData]);

  // 清空画布
  const clearCanvas = () => {
    if (drawBoardRef.current) {
      drawBoardRef.current.clear();
      console.log('DrawBoard cleared');
    }
  };

  // 重新初始化
  const reinitDrawBoard = () => {
    const container = containerRef.current;
    if (!container) return;

    // 销毁旧实例
    if (drawBoardRef.current) {
      drawBoardRef.current.destroy();
    }

    // 创建新实例
    try {
      drawBoardRef.current = DrawBoard.getInstance(container, {
        maxHistorySize: 100,
        enableShortcuts: true
      });
      
      console.log('DrawBoard reinitialized');
      
      // 重新初始化默认工具
      drawBoardRef.current.initializeDefaultTools().then(() => {
        console.log('Default tools reloaded');
        
        // 恢复设置
        drawBoardRef.current!.setTool(drawData.tool);
        drawBoardRef.current!.setColor(drawData.color);
        drawBoardRef.current!.setLineWidth(drawData.lineWidth);
        
        console.log('Settings restored after reinit');
      }).catch(error => {
        console.error('Failed to initialize tools after reinit:', error);
      });
      
    } catch (error) {
      console.error('DrawBoard reinitialization failed:', error);
    }
  };

  // 检查canvas状态
  const checkCanvasStatus = () => {
    const container = containerRef.current;
    if (!container) {
      console.log('No container found');
      return;
    }

    const canvases = container.querySelectorAll('canvas');
    console.log('=== Canvas Status Check ===');
    console.log('Container:', {
      offsetWidth: container.offsetWidth,
      offsetHeight: container.offsetHeight,
      children: container.children.length
    });
    console.log('Canvas count:', canvases.length);
    
    // 🔍 检查容器引用一致性
    if (drawBoardRef.current) {
      const canvasEngine = (drawBoardRef.current as any).canvasEngine;
      if (canvasEngine && canvasEngine.container) {
        const engineContainer = canvasEngine.container;
        const isSameContainer = container === engineContainer;
        
        console.log('🔍 Container Reference Check:', {
          testPageContainer: {
            offsetWidth: container.offsetWidth,
            offsetHeight: container.offsetHeight,
            tagName: container.tagName,
            id: container.id || 'no-id',
            className: container.className
          },
          canvasEngineContainer: {
            offsetWidth: engineContainer.offsetWidth,
            offsetHeight: engineContainer.offsetHeight,
            tagName: engineContainer.tagName,
            id: engineContainer.id || 'no-id',
            className: engineContainer.className
          },
          areSameElement: isSameContainer
        });
        
        if (!isSameContainer) {
          console.error('🚨 CRITICAL: Test page and CanvasEngine have different container references!');
          console.log('📍 Test page container:', container);
          console.log('📍 CanvasEngine container:', engineContainer);
        } else {
          console.log('✅ Container references are consistent');
        }
      }
    }
    
    canvases.forEach((canvas, index) => {
      console.log(`Canvas ${index}:`, {
        width: canvas.width,
        height: canvas.height,
        offsetWidth: canvas.offsetWidth,
        offsetHeight: canvas.offsetHeight,
        style: canvas.style.cssText,
        zIndex: canvas.style.zIndex,
        visible: canvas.offsetParent !== null
      });
    });

    console.log('DrawBoard instance:', drawBoardRef.current);
    
    // 如果canvas数量为0且DrawBoard实例存在，尝试修复
    if (canvases.length === 0 && drawBoardRef.current) {
      console.warn('⚠️ Canvas missing but DrawBoard exists! Attempting to fix...');
      
      // 尝试重新调用resize来重新创建canvas
      try {
        drawBoardRef.current.resize();
        console.log('✅ Called DrawBoard.resize() to recreate canvas');
        
        // 检查是否修复成功
        setTimeout(() => {
          const newCanvases = container.querySelectorAll('canvas');
          console.log(`🔍 After resize: found ${newCanvases.length} canvases`);
        }, 100);
      } catch (error) {
        console.error('❌ Failed to resize DrawBoard:', error);
        console.log('🔄 Will try full reinit...');
        reinitDrawBoard();
      }
    }
  };

  // 检查CanvasEngine内部状态
  const checkCanvasEngineStatus = () => {
    const container = containerRef.current;
    if (!container || !drawBoardRef.current) {
      console.log('No container or DrawBoard found');
      return;
    }

    console.log('=== CanvasEngine Internal Status ===');
    
    // 检查容器状态
    console.log('Test page container:', {
      offsetWidth: container.offsetWidth,
      offsetHeight: container.offsetHeight,
      children: container.children.length,
      canvases: container.querySelectorAll('canvas').length
    });

    // 尝试获取CanvasEngine内部信息
    try {
      interface DrawBoardInternal {
        canvasEngine?: {
          container: HTMLElement;
          layers: Map<string, unknown>;
          createLayers?: () => void;
        };
      }
      const canvasEngine = (drawBoardRef.current as unknown as DrawBoardInternal).canvasEngine;
      if (canvasEngine) {
        const internalContainer = canvasEngine.container;
        console.log('CanvasEngine internal container:', {
          offsetWidth: internalContainer?.offsetWidth || 'undefined',
          offsetHeight: internalContainer?.offsetHeight || 'undefined',
          children: internalContainer?.children?.length || 'undefined',
          canvases: internalContainer?.querySelectorAll('canvas')?.length || 'undefined',
          isConnected: internalContainer?.isConnected || 'undefined',
          parentNode: (internalContainer?.parentNode as Element)?.tagName || 'undefined'
        });
        
        // 检查layers
        const layers = canvasEngine.layers;
        console.log('CanvasEngine layers:', {
          size: layers?.size || 'undefined',
          keys: layers ? Array.from(layers.keys()) : 'undefined'
        });
        
        // 手动强制重建layers
        console.log('🔧 Attempting manual CanvasEngine fix...');
        
        // 确保容器引用正确
        if (internalContainer !== container) {
          console.warn('⚠️ Container mismatch! Fixing...');
          canvasEngine.container = container;
        }
        
        // 强制重新创建layers
        if (canvasEngine.createLayers) {
          canvasEngine.createLayers();
        } else {
          console.log('🔄 Creating layers manually...');
          
          // 手动创建layers
          const layerNames = ['background', 'draw', 'interaction'];
          const zIndexes = [0, 1, 2];
          
          layerNames.forEach((name, index) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            if (ctx) {
              canvas.style.position = 'absolute';
              canvas.style.top = '0';
              canvas.style.left = '0';
              canvas.style.width = '100%';
              canvas.style.height = '100%';
              canvas.style.pointerEvents = name === 'interaction' ? 'auto' : 'none';
              canvas.style.zIndex = zIndexes[index].toString();
              canvas.style.backgroundColor = 'transparent';
              
              canvas.width = container.offsetWidth;
              canvas.height = container.offsetHeight;
              
              container.appendChild(canvas);
              
              console.log(`✅ Manually created ${name} layer`);
            }
          });
        }
        
        // 重新调用resize
        drawBoardRef.current.resize();
        
      } else {
        console.error('❌ CanvasEngine not found in DrawBoard instance');
      }
    } catch (error) {
      console.error('❌ Error checking CanvasEngine status:', error);
    }
  };

  // 测试直接绘制到canvas
  const testDirectDraw = () => {
    const container = containerRef.current;
    if (!container) return;

    const canvases = container.querySelectorAll('canvas');
    console.log('=== 测试直接绘制 ===');
    console.log('找到canvas数量:', canvases.length);
    
    canvases.forEach((canvas, index) => {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        console.log(`在Canvas ${index} 上绘制测试图形`);
        
        // 清除之前的测试内容
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // 绘制测试图形
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(50 + index * 60, 50, 20, 0, 2 * Math.PI);
        ctx.stroke();
        
        // 绘制文字标识
        ctx.fillStyle = '#000000';
        ctx.font = '12px Arial';
        ctx.fillText(`Canvas ${index}`, 30 + index * 60, 90);
      }
    });
  };

  // 测试绘制流程
  const testDrawingFlow = () => {
    const container = containerRef.current;
    if (!container || !drawBoardRef.current) {
      console.log('No container or DrawBoard found');
      return;
    }

    console.log('=== Testing Drawing Flow ===');
    
    // 1. 检查当前工具
    const currentTool = drawBoardRef.current.getCurrentTool();
    console.log('Current tool:', currentTool);
    
    // 2. 检查工具实例
    try {
      const toolManager = (drawBoardRef.current as unknown as { toolManager?: { getCurrentToolInstance: () => any } }).toolManager;
      if (toolManager) {
        const toolInstance = toolManager.getCurrentToolInstance();
        console.log('Tool instance:', {
          exists: !!toolInstance,
          name: toolInstance?.name,
          type: toolInstance?.type,
          drawMethod: typeof toolInstance?.draw
        });
        
        // 3. 手动测试工具绘制
        if (toolInstance && toolInstance.draw) {
          console.log('🎨 Testing manual draw...');
          
          const canvases = container.querySelectorAll('canvas');
          canvases.forEach((canvas, index) => {
            const ctx = canvas.getContext('2d');
            if (ctx) {
              // 创建测试绘制动作
              const testAction = {
                id: 'test-' + Date.now(),
                type: currentTool,
                points: [
                  { x: 100, y: 100 },
                  { x: 150, y: 150 }
                ],
                context: {
                  strokeStyle: '#ff0000',
                  lineWidth: 3,
                  fillStyle: '#ff0000'
                },
                timestamp: Date.now()
              };
              
              console.log(`Testing draw on canvas ${index}:`, testAction);
              
              try {
                toolInstance.draw(ctx, testAction);
                console.log(`✅ Draw completed on canvas ${index}`);
              } catch (error) {
                console.error(`❌ Draw failed on canvas ${index}:`, error);
              }
            }
          });
        }
      }
    } catch (error) {
      console.error('Error checking tool instance:', error);
    }
    
    // 4. 检查历史记录
    try {
      const historyManager = (drawBoardRef.current as unknown as { historyManager?: any }).historyManager;
      if (historyManager) {
        const actions = historyManager.getAllActions?.() || [];
        console.log('History actions:', {
          count: actions.length,
          lastAction: actions[actions.length - 1]
        });
      }
    } catch (error) {
      console.error('Error checking history:', error);
    }
    
    // 5. 模拟绘制事件
    console.log('🖱️ Simulating draw events...');
    const interactionCanvas = container.querySelector('canvas[style*="pointer-events: auto"]');
    if (interactionCanvas) {
      // 模拟鼠标按下
      const mouseDownEvent = new MouseEvent('mousedown', {
        clientX: interactionCanvas.getBoundingClientRect().left + 200,
        clientY: interactionCanvas.getBoundingClientRect().top + 200,
        button: 0,
        buttons: 1
      });
      
      // 模拟鼠标移动
      const mouseMoveEvent = new MouseEvent('mousemove', {
        clientX: interactionCanvas.getBoundingClientRect().left + 250,
        clientY: interactionCanvas.getBoundingClientRect().top + 250,
        button: 0,
        buttons: 1
      });
      
      // 模拟鼠标释放
      const mouseUpEvent = new MouseEvent('mouseup', {
        clientX: interactionCanvas.getBoundingClientRect().left + 250,
        clientY: interactionCanvas.getBoundingClientRect().top + 250,
        button: 0,
        buttons: 0
      });
      
      console.log('Dispatching simulated mouse events...');
      interactionCanvas.dispatchEvent(mouseDownEvent);
      setTimeout(() => {
        interactionCanvas.dispatchEvent(mouseMoveEvent);
        setTimeout(() => {
          interactionCanvas.dispatchEvent(mouseUpEvent);
          console.log('✅ Simulated draw events completed');
        }, 50);
      }, 50);
    } else {
      console.error('❌ No interaction canvas found');
    }
  };

  // 检查DrawingHandler状态
  const checkDrawingHandlerStatus = () => {
    const container = containerRef.current;
    if (!container || !drawBoardRef.current) {
      console.log('No container or DrawBoard found');
      return;
    }

    console.log('=== DrawingHandler Status ===');
    
    try {
      const drawingHandler = (drawBoardRef.current as unknown as { drawingHandler?: any }).drawingHandler;
      if (drawingHandler) {
        console.log('DrawingHandler exists:', !!drawingHandler);
        
        // 检查是否有getIsDrawing方法
        console.log('DrawingHandler methods:', {
          getIsDrawing: typeof drawingHandler.getIsDrawing,
          handleDrawStart: typeof drawingHandler.handleDrawStart,
          handleDrawMove: typeof drawingHandler.handleDrawMove,
          handleDrawEnd: typeof drawingHandler.handleDrawEnd,
          forceRedraw: typeof drawingHandler.forceRedraw
        });
        
        // 检查内部状态
        if (drawingHandler.getIsDrawing) {
          console.log('Is currently drawing:', drawingHandler.getIsDrawing());
        }
        
        // 获取所有属性（调试用）
        const props = Object.getOwnPropertyNames(drawingHandler);
        console.log('DrawingHandler properties:', props);
        
      } else {
        console.error('❌ DrawingHandler not found');
      }
      
      // 检查事件管理器
      const eventManager = (drawBoardRef.current as unknown as { eventManager?: any }).eventManager;
      if (eventManager) {
        console.log('EventManager exists:', !!eventManager);
        console.log('EventManager handlers:', eventManager.handlers?.size || 'undefined');
      } else {
        console.error('❌ EventManager not found');
      }
      
    } catch (error) {
      console.error('Error checking DrawingHandler:', error);
    }
  };

  // 手动触发绘制流程
  const manualDrawFlow = () => {
    const container = containerRef.current;
    if (!container || !drawBoardRef.current) {
      console.log('No container or DrawBoard found');
      return;
    }

    console.log('=== Manual Draw Flow ===');
    
    try {
      const drawingHandler = (drawBoardRef.current as unknown as { drawingHandler?: any }).drawingHandler;
      if (drawingHandler) {
        
        // 手动创建绘制事件
        const startEvent = {
          type: 'mousedown' as const,
          point: { x: 300, y: 300 },
          timestamp: Date.now()
        };
        
        const moveEvent = {
          type: 'mousemove' as const,
          point: { x: 350, y: 350 },
          timestamp: Date.now()
        };
        
        const endEvent = {
          type: 'mouseup' as const,
          point: { x: 350, y: 350 },
          timestamp: Date.now()
        };
        
        console.log('📝 Manually calling DrawingHandler methods...');
        
        // 手动调用绘制处理器方法
        console.log('Calling handleDrawStart...');
        drawingHandler.handleDrawStart(startEvent);
        
        console.log('Calling handleDrawMove...');
        drawingHandler.handleDrawMove(moveEvent);
        
        console.log('Calling handleDrawEnd...');
        drawingHandler.handleDrawEnd(endEvent);
        
        console.log('✅ Manual draw flow completed');
        
        // 检查历史记录是否更新
        setTimeout(() => {
          const historyManager = (drawBoardRef.current as unknown as { historyManager?: any }).historyManager;
          if (historyManager) {
            const actions = historyManager.getAllActions?.() || [];
            console.log('History after manual draw:', {
              count: actions.length,
              lastAction: actions[actions.length - 1]
            });
          }
        }, 100);
        
      } else {
        console.error('❌ DrawingHandler not found');
      }
      
    } catch (error) {
      console.error('Error in manual draw flow:', error);
    }
  };

  // 调试事件传递链
  const debugEventChain = () => {
    const container = containerRef.current;
    if (!container || !drawBoardRef.current) {
      console.log('No container or DrawBoard found');
      return;
    }

    console.log('=== Event Chain Debug ===');
    
    try {
      // 1. 检查DrawBoard的事件处理方法
      const drawBoard = drawBoardRef.current as unknown as {
        handleDrawStart?: any;
        handleDrawMove?: any; 
        handleDrawEnd?: any;
        eventManager?: any;
      };
      
      console.log('DrawBoard event handlers:', {
        handleDrawStart: typeof drawBoard.handleDrawStart,
        handleDrawMove: typeof drawBoard.handleDrawMove,
        handleDrawEnd: typeof drawBoard.handleDrawEnd
      });
      
      // 2. 检查EventManager的事件绑定
      const eventManager = drawBoard.eventManager;
      if (eventManager && eventManager.handlers) {
        console.log('EventManager registered events:', Array.from(eventManager.handlers.keys()));
        
        // 检查每个事件的处理器数量
        eventManager.handlers.forEach((handlers: any[], eventType: string) => {
          console.log(`Event "${eventType}" has ${handlers.length} handlers`);
        });
      }
      
      // 3. 临时替换DrawBoard的事件处理方法来追踪调用
      const originalHandleDrawStart = drawBoard.handleDrawStart;
      const originalHandleDrawMove = drawBoard.handleDrawMove;
      const originalHandleDrawEnd = drawBoard.handleDrawEnd;
      
      drawBoard.handleDrawStart = function(event: any) {
        console.log('🎯 DrawBoard.handleDrawStart called with:', event);
        if (originalHandleDrawStart) {
          return originalHandleDrawStart.call(this, event);
        }
      };
      
      drawBoard.handleDrawMove = function(event: any) {
        console.log('🎯 DrawBoard.handleDrawMove called with:', event);
        if (originalHandleDrawMove) {
          return originalHandleDrawMove.call(this, event);
        }
      };
      
      drawBoard.handleDrawEnd = function(event: any) {
        console.log('🎯 DrawBoard.handleDrawEnd called with:', event);
        if (originalHandleDrawEnd) {
          return originalHandleDrawEnd.call(this, event);
        }
      };
      
      console.log('✅ Event handlers patched for debugging');
      console.log('👆 Now try drawing on the canvas and watch for 🎯 messages');
      
      // 5秒后恢复原始处理器
      setTimeout(() => {
        drawBoard.handleDrawStart = originalHandleDrawStart;
        drawBoard.handleDrawMove = originalHandleDrawMove;
        drawBoard.handleDrawEnd = originalHandleDrawEnd;
        console.log('🔄 Original event handlers restored');
      }, 5000);
      
    } catch (error) {
      console.error('Error debugging event chain:', error);
    }
  };

  // 测试EventManager直接触发
  const testEventManagerDirect = () => {
    const container = containerRef.current;
    if (!container || !drawBoardRef.current) {
      console.log('No container or DrawBoard found');
      return;
    }

    console.log('=== Testing EventManager Direct ===');
    
    try {
      const eventManager = (drawBoardRef.current as unknown as { eventManager?: any }).eventManager;
      if (eventManager && eventManager.emit) {
        
        // 创建测试事件
        const testEvent = {
          type: 'mousedown' as const,
          point: { x: 400, y: 400 },
          timestamp: Date.now()
        };
        
        console.log('📡 Directly calling eventManager.emit...');
        console.log('Test event:', testEvent);
        
        // 直接调用EventManager的emit方法
        eventManager.emit('mousedown', testEvent);
        
        // 测试完整序列
        setTimeout(() => {
          const moveEvent = { ...testEvent, type: 'mousemove' as const, point: { x: 450, y: 450 } };
          eventManager.emit('mousemove', moveEvent);
          
          setTimeout(() => {
            const endEvent = { ...testEvent, type: 'mouseup' as const, point: { x: 450, y: 450 } };
            eventManager.emit('mouseup', endEvent);
            
            // 检查历史记录
            setTimeout(() => {
              const historyManager = (drawBoardRef.current as unknown as { historyManager?: any }).historyManager;
              if (historyManager) {
                const actions = historyManager.getAllActions?.() || [];
                console.log('History after EventManager direct call:', {
                  count: actions.length,
                  lastAction: actions[actions.length - 1]
                });
              }
            }, 100);
          }, 50);
        }, 50);
        
      } else {
        console.error('❌ EventManager.emit not found');
      }
      
    } catch (error) {
      console.error('Error testing EventManager direct:', error);
    }
  };

  // 检查EventManager的canvas绑定
  const checkEventManagerBinding = () => {
    const container = containerRef.current;
    if (!container || !drawBoardRef.current) {
      console.log('No container or DrawBoard found');
      return;
    }

    console.log('=== EventManager Canvas Binding ===');
    
    try {
      const eventManager = (drawBoardRef.current as unknown as { eventManager?: any }).eventManager;
      if (eventManager) {
        console.log('EventManager exists:', !!eventManager);
        
        // 获取EventManager绑定的canvas
        const boundCanvas = eventManager.canvas;
        console.log('EventManager bound canvas:', {
          exists: !!boundCanvas,
          width: boundCanvas?.width || 'undefined',
          height: boundCanvas?.height || 'undefined',
          style: boundCanvas?.style?.cssText || 'undefined',
          id: boundCanvas?.id || 'undefined',
          className: boundCanvas?.className || 'undefined'
        });
        
        // 获取容器中的所有canvas
        const allCanvases = Array.from(container.querySelectorAll('canvas'));
        console.log(`Container has ${allCanvases.length} canvas elements:`);
        
        allCanvases.forEach((canvas, index) => {
          const isEventManagerCanvas = canvas === boundCanvas;
          const hasPointerEvents = canvas.style.pointerEvents === 'auto';
          
          console.log(`Canvas ${index}:`, {
            isEventManagerCanvas,
            hasPointerEvents,
            width: canvas.width,
            height: canvas.height,
            style: canvas.style.cssText.substring(0, 100) + '...',
            zIndex: canvas.style.zIndex,
            isConnected: canvas.isConnected
          });
          
          if (isEventManagerCanvas) {
            console.log(`🎯 EventManager is bound to Canvas ${index}`);
          }
          if (hasPointerEvents) {
            console.log(`👆 Canvas ${index} has pointer-events: auto`);
          }
        });
        
        // 检查是否是同一个canvas
        const interactionCanvas = container.querySelector('canvas[style*="pointer-events: auto"]');
        if (boundCanvas && interactionCanvas) {
          const isSameCanvas = boundCanvas === interactionCanvas;
          console.log('Canvas binding match:', {
            eventManagerCanvas: !!boundCanvas,
            interactionCanvas: !!interactionCanvas,
            areSame: isSameCanvas
          });
          
          if (!isSameCanvas) {
            console.warn('⚠️ PROBLEM FOUND: EventManager bound to wrong canvas!');
            console.log('🔧 Attempting to fix canvas binding...');
            
            // 尝试修复：重新绑定EventManager到正确的canvas
            try {
              // 解绑旧的事件监听器
              if (eventManager.boundHandlers) {
                boundCanvas?.removeEventListener('mousedown', eventManager.boundHandlers.mouseDown);
                boundCanvas?.removeEventListener('mousemove', eventManager.boundHandlers.mouseMove);
                boundCanvas?.removeEventListener('mouseup', eventManager.boundHandlers.mouseUp);
                boundCanvas?.removeEventListener('touchstart', eventManager.boundHandlers.touchStart);
                boundCanvas?.removeEventListener('touchmove', eventManager.boundHandlers.touchMove);
                boundCanvas?.removeEventListener('touchend', eventManager.boundHandlers.touchEnd);
                console.log('🗑️ Removed old event listeners');
              }
              
              // 更新EventManager的canvas引用
              eventManager.canvas = interactionCanvas;
              
              // 重新绑定事件监听器
              if (eventManager.boundHandlers) {
                interactionCanvas.addEventListener('mousedown', eventManager.boundHandlers.mouseDown);
                interactionCanvas.addEventListener('mousemove', eventManager.boundHandlers.mouseMove);
                interactionCanvas.addEventListener('mouseup', eventManager.boundHandlers.mouseUp);
                interactionCanvas.addEventListener('touchstart', eventManager.boundHandlers.touchStart, { passive: false });
                interactionCanvas.addEventListener('touchmove', eventManager.boundHandlers.touchMove, { passive: false });
                interactionCanvas.addEventListener('touchend', eventManager.boundHandlers.touchEnd, { passive: false });
                console.log('✅ Rebound event listeners to correct canvas');
              }
              
            } catch (error) {
              console.error('❌ Failed to rebind EventManager:', error);
            }
          } else {
            console.log('✅ EventManager correctly bound to interaction canvas');
          }
        }
      }
    } catch (error) {
      console.error('Error checking EventManager binding:', error);
    }
  };

  // 测试EventManager的DOM事件监听器
  const testEventManagerListeners = () => {
    const container = containerRef.current;
    if (!container || !drawBoardRef.current) {
      console.log('No container or DrawBoard found');
      return;
    }

    console.log('=== Testing EventManager DOM Listeners ===');
    
    try {
      const eventManager = (drawBoardRef.current as unknown as { eventManager?: any }).eventManager;
      if (eventManager && eventManager.canvas) {
        const canvas = eventManager.canvas;
        
        console.log('EventManager canvas:', canvas);
        
        // 临时替换EventManager的处理函数来观察是否被调用
        const originalHandlers = {
          mouseDown: eventManager.boundHandlers?.mouseDown,
          mouseMove: eventManager.boundHandlers?.mouseMove,
          mouseUp: eventManager.boundHandlers?.mouseUp
        };
        
        if (eventManager.boundHandlers) {
          // 包装EventManager的处理函数
          eventManager.boundHandlers.mouseDown = function(e: MouseEvent) {
            console.log('🔥 EventManager.mouseDown triggered!', {
              offsetX: e.offsetX,
              offsetY: e.offsetY,
              target: e.target,
              currentTarget: e.currentTarget
            });
            if (originalHandlers.mouseDown) {
              return originalHandlers.mouseDown.call(this, e);
            }
          };
          
          eventManager.boundHandlers.mouseMove = function(e: MouseEvent) {
            console.log('🔥 EventManager.mouseMove triggered!', {
              offsetX: e.offsetX,
              offsetY: e.offsetY,
              buttons: e.buttons
            });
            if (originalHandlers.mouseMove) {
              return originalHandlers.mouseMove.call(this, e);
            }
          };
          
          eventManager.boundHandlers.mouseUp = function(e: MouseEvent) {
            console.log('🔥 EventManager.mouseUp triggered!', {
              offsetX: e.offsetX,
              offsetY: e.offsetY
            });
            if (originalHandlers.mouseUp) {
              return originalHandlers.mouseUp.call(this, e);
            }
          };
          
          console.log('✅ EventManager handlers patched for debugging');
          console.log('👆 Now try drawing on the canvas and watch for 🔥 messages');
          
          // 5秒后恢复
          setTimeout(() => {
            if (eventManager.boundHandlers) {
              eventManager.boundHandlers.mouseDown = originalHandlers.mouseDown;
              eventManager.boundHandlers.mouseMove = originalHandlers.mouseMove;
              eventManager.boundHandlers.mouseUp = originalHandlers.mouseUp;
            }
            console.log('🔄 EventManager handlers restored');
          }, 5000);
          
        } else {
          console.error('❌ EventManager.boundHandlers not found');
          
          // 尝试手动检查监听器
          console.log('🔍 Checking manually attached listeners...');
          
          // 测试是否有监听器
          const testHandler = (e: MouseEvent) => {
            console.log('🧪 Manual test handler triggered:', {
              type: e.type,
              offsetX: e.offsetX,
              offsetY: e.offsetY
            });
          };
          
          // 临时添加测试监听器
          canvas.addEventListener('mousedown', testHandler);
          canvas.addEventListener('mousemove', testHandler);
          canvas.addEventListener('mouseup', testHandler);
          
          console.log('✅ Manual test handlers added');
          console.log('👆 Try drawing to see if ANY listeners work');
          
          // 5秒后移除
          setTimeout(() => {
            canvas.removeEventListener('mousedown', testHandler);
            canvas.removeEventListener('mousemove', testHandler); 
            canvas.removeEventListener('mouseup', testHandler);
            console.log('🔄 Manual test handlers removed');
          }, 5000);
        }
        
        // 检查canvas的事件监听器（如果支持）
        if ((canvas as any).getEventListeners) {
          console.log('Canvas event listeners:', (canvas as any).getEventListeners());
        }
        
        // 检查是否有其他代码在干扰
        console.log('Canvas properties:', {
          style: canvas.style.cssText,
          parentElement: canvas.parentElement?.tagName,
          isConnected: canvas.isConnected,
          tabIndex: canvas.tabIndex
        });
        
      } else {
        console.error('❌ EventManager or canvas not found');
      }
      
    } catch (error) {
      console.error('Error testing EventManager listeners:', error);
    }
  };

  // 检查DOM事件监听器冲突
  const checkEventListenerConflicts = () => {
    const container = containerRef.current;
    if (!container || !drawBoardRef.current) {
      console.log('No container or DrawBoard found');
      return;
    }

    console.log('=== Checking Event Listener Conflicts ===');
    
    try {
      const eventManager = (drawBoardRef.current as unknown as { eventManager?: any }).eventManager;
      const interactionCanvas = container.querySelector('canvas[style*="pointer-events: auto"]');
      
      if (eventManager && interactionCanvas) {
        console.log('Found EventManager and interaction canvas');
        
        // 临时移除测试页面的事件监听器
        const testPageListeners: any[] = [];
        
        // 获取当前绑定的所有监听器的引用（如果可以的话）
        console.log('🧹 Temporarily removing test page listeners...');
        
        // 创建一个完全新的监听器来测试
        let eventTriggered = false;
        const cleanTestListener = (e: MouseEvent) => {
          console.log('🎯 CLEAN test listener triggered:', {
            type: e.type,
            offsetX: e.offsetX,
            offsetY: e.offsetY,
            timestamp: Date.now()
          });
          eventTriggered = true;
        };
        
        // 添加新的干净监听器
        interactionCanvas.addEventListener('mousedown', cleanTestListener);
        
        console.log('✅ Clean test listener added');
        console.log('👆 Click on the canvas to test if DOM events work at all');
        
        // 检查EventManager的绑定情况
        setTimeout(() => {
          if (eventTriggered) {
            console.log('✅ DOM events are working - problem is with EventManager binding');
            
            // 重新检查EventManager的绑定
            console.log('🔧 Re-checking EventManager binding...');
            const boundCanvas = eventManager.canvas;
            const isSameCanvas = boundCanvas === interactionCanvas;
            
            console.log('Canvas comparison:', {
              eventManagerCanvas: boundCanvas,
              interactionCanvas: interactionCanvas,
              areSame: isSameCanvas,
              boundCanvasExists: !!boundCanvas,
              boundCanvasConnected: boundCanvas?.isConnected,
              boundCanvasParent: boundCanvas?.parentElement?.tagName
            });
            
            if (!isSameCanvas) {
              console.log('🔴 FOUND THE PROBLEM: EventManager bound to wrong canvas!');
              console.log('🔧 Fixing EventManager canvas binding...');
              
              // 强制重新绑定EventManager
              try {
                // 销毁旧的EventManager
                if (eventManager.destroy) {
                  eventManager.destroy();
                }
                
                // 创建新的EventManager并绑定到正确的canvas
                const EventManagerClass = eventManager.constructor;
                const newEventManager = new EventManagerClass(interactionCanvas as HTMLCanvasElement);
                
                // 替换DrawBoard中的EventManager引用
                (drawBoardRef.current as any).eventManager = newEventManager;
                
                // 重新绑定DrawBoard的事件处理器
                const drawBoard = drawBoardRef.current as any;
                if (drawBoard.bindEvents) {
                  drawBoard.bindEvents();
                }
                
                console.log('✅ EventManager rebound to correct canvas');
                
              } catch (error) {
                console.error('❌ Failed to rebind EventManager:', error);
              }
            }
            
          } else {
            console.log('❌ DOM events not working - deeper canvas problem');
          }
          
          // 清理测试监听器
          interactionCanvas.removeEventListener('mousedown', cleanTestListener);
          console.log('🧹 Clean test listener removed');
          
        }, 3000);
        
      } else {
        console.error('❌ EventManager or interaction canvas not found');
      }
      
    } catch (error) {
      console.error('Error checking event listener conflicts:', error);
    }
  };

  // 完全重建EventManager绑定
  const rebuildEventManagerBinding = () => {
    const container = containerRef.current;
    if (!container || !drawBoardRef.current) {
      console.log('No container or DrawBoard found');
      return;
    }

    console.log('=== Rebuilding EventManager Binding ===');
    
    try {
      const drawBoard = drawBoardRef.current as any;
      const interactionCanvas = container.querySelector('canvas[style*="pointer-events: auto"]');
      
      if (!interactionCanvas) {
        console.error('❌ No interaction canvas found');
        return;
      }
      
      console.log('🗑️ Destroying old EventManager...');
      
      // 销毁旧的EventManager
      if (drawBoard.eventManager && drawBoard.eventManager.destroy) {
        drawBoard.eventManager.destroy();
      }
      
      console.log('🔧 Creating new EventManager...');
      
      // 动态导入EventManager类
      import('@/libs/drawBoard/events/EventManager').then(({ EventManager }) => {
        
        // 创建新的EventManager实例
        const newEventManager = new EventManager(interactionCanvas as HTMLCanvasElement);
        
        // 替换DrawBoard中的EventManager
        drawBoard.eventManager = newEventManager;
        
        console.log('✅ New EventManager created');
        
        // 重新绑定DrawBoard的事件处理器
        console.log('🔗 Rebinding DrawBoard event handlers...');
        
        const handleDrawStart = drawBoard.handleDrawStart?.bind(drawBoard);
        const handleDrawMove = drawBoard.handleDrawMove?.bind(drawBoard);
        const handleDrawEnd = drawBoard.handleDrawEnd?.bind(drawBoard);
        
        if (handleDrawStart && handleDrawMove && handleDrawEnd) {
          newEventManager.on('mousedown', handleDrawStart);
          newEventManager.on('mousemove', handleDrawMove);
          newEventManager.on('mouseup', handleDrawEnd);
          newEventManager.on('touchstart', handleDrawStart);
          newEventManager.on('touchmove', handleDrawMove);
          newEventManager.on('touchend', handleDrawEnd);
          
          console.log('✅ Event handlers rebound to new EventManager');
          console.log('👆 Try drawing now - it should work!');
          
        } else {
          console.error('❌ DrawBoard event handlers not found');
        }
        
      }).catch(error => {
        console.error('❌ Failed to import EventManager:', error);
      });
      
    } catch (error) {
      console.error('Error rebuilding EventManager binding:', error);
    }
  };

  // 测试功能组件
  const TestFeatures = () => (
    <div className="test-features">
      <div className="feature-section">
        <h3>🎨 绘图测试 (DrawBoard + Div)</h3>
        <div className="canvas-controls">
          <div className="control-group">
            <label>颜色:</label>
            <input
              type="color"
              value={drawData.color}
              onChange={(e) => setDrawData(prev => ({ ...prev, color: e.target.value }))}
            />
          </div>
          <div className="control-group">
            <label>画笔大小:</label>
            <input
              type="range"
              min="1"
              max="20"
              value={drawData.lineWidth}
              onChange={(e) => setDrawData(prev => ({ ...prev, lineWidth: parseInt(e.target.value) }))}
            />
            <span>{drawData.lineWidth}px</span>
          </div>
          <div className="control-group">
            <label>工具:</label>
            <select
              value={drawData.tool}
              onChange={(e) => setDrawData(prev => ({ ...prev, tool: e.target.value as ToolType }))}
            >
              <option value="pen">画笔</option>
              <option value="eraser">橡皮擦</option>
              <option value="rect">矩形</option>
              <option value="circle">圆形</option>
              <option value="line">直线</option>
            </select>
          </div>
          <button onClick={clearCanvas} className="clear-btn">清空画布</button>
          <button onClick={reinitDrawBoard} className="reinit-btn">重新初始化</button>
          <button onClick={checkCanvasStatus} className="debug-btn">检查Canvas状态</button>
          <button onClick={testDirectDraw} className="debug-btn">测试直接绘制</button>
          <button onClick={testDrawingFlow} className="debug-btn">测试绘制流程</button>
          <button onClick={checkCanvasEngineStatus} className="debug-btn">检查引擎状态</button>
          <button onClick={checkDrawingHandlerStatus} className="debug-btn">检查DrawingHandler状态</button>
          <button onClick={manualDrawFlow} className="debug-btn">手动触发绘制流程</button>
          <button onClick={debugEventChain} className="debug-btn">调试事件传递链</button>
          <button onClick={testEventManagerDirect} className="debug-btn">测试EventManager直接触发</button>
          <button onClick={checkEventManagerBinding} className="debug-btn">检查EventManager绑定</button>
          <button onClick={testEventManagerListeners} className="debug-btn">测试EventManager DOM监听器</button>
          <button onClick={checkEventListenerConflicts} className="debug-btn">检查DOM事件监听器冲突</button>
          <button onClick={rebuildEventManagerBinding} className="debug-btn">完全重建EventManager绑定</button>
          <button onClick={stopAutoMonitoring} className="debug-btn emergency-stop">🚨 停止自动监控</button>
        </div>
        
        <div className="canvas-container">
          {/* DrawBoard容器 - 使用div */}
          <div
            ref={containerRef}
            className="drawing-container"
          />
          
          {/* 调试信息 */}
          <div className="canvas-debug">
            <div>绘图方式: 🎨 DrawBoard + Div</div>
            <div>DrawBoard状态: {drawBoardRef.current ? '✅ 已初始化' : '❌ 未初始化'}</div>
            <div>容器尺寸: {containerRef.current ? `${containerRef.current.offsetWidth}x${containerRef.current.offsetHeight}` : '未知'}</div>
            <div>Canvas数量: {containerRef.current ? containerRef.current.querySelectorAll('canvas').length : 0}</div>
            <div>当前工具: {drawData.tool}</div>
            <div>颜色: <span style={{color: drawData.color}}>●</span> {drawData.color}</div>
            <div>画笔大小: {drawData.lineWidth}px</div>
          </div>
        </div>
      </div>

      <div className="feature-section">
        <h3>🧪 其他测试功能</h3>
        <div className="test-buttons">
          <button onClick={() => alert('弹窗测试成功!')}>弹窗测试</button>
          <button onClick={() => console.log('控制台测试')}>控制台测试</button>
          <button onClick={() => window.open('https://www.google.com', '_blank')}>打开链接测试</button>
        </div>
      </div>

      <div className="feature-section">
        <h3>📊 系统信息</h3>
        <div className="system-info">
          <div className="info-item">
            <span>用户代理:</span>
            <span>{navigator.userAgent}</span>
          </div>
          <div className="info-item">
            <span>屏幕分辨率:</span>
            <span>{window.screen.width} x {window.screen.height}</span>
          </div>
          <div className="info-item">
            <span>窗口尺寸:</span>
            <span>{window.innerWidth} x {window.innerHeight}</span>
          </div>
          <div className="info-item">
            <span>时间戳:</span>
            <span>{new Date().toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );

  // API测试组件
  const ApiTests = () => {
    const [apiResult, setApiResult] = useState<string>('');
    const [loading, setLoading] = useState(false);

    const testFetch = async () => {
      setLoading(true);
      try {
        const response = await fetch('https://jsonplaceholder.typicode.com/posts/1');
        const data = await response.json();
        setApiResult(JSON.stringify(data, null, 2));
      } catch (error) {
        setApiResult(`错误: ${error}`);
      } finally {
        setLoading(false);
      }
    };

    return (
      <div className="api-tests">
        <div className="feature-section">
          <h3>🌐 API测试</h3>
          <button onClick={testFetch} disabled={loading} className="api-btn">
            {loading ? '测试中...' : '测试API请求'}
          </button>
          {apiResult && (
            <pre className="api-result">{apiResult}</pre>
          )}
        </div>

        <div className="feature-section">
          <h3>💾 本地存储测试</h3>
          <div className="storage-controls">
            <button onClick={() => {
              localStorage.setItem('test', 'Hello World');
              alert('数据已保存到localStorage');
            }}>
              保存到localStorage
            </button>
            <button onClick={() => {
              const data = localStorage.getItem('test');
              alert(`从localStorage读取: ${data}`);
            }}>
              从localStorage读取
            </button>
            <button onClick={() => {
              localStorage.removeItem('test');
              alert('已清除localStorage数据');
            }}>
              清除localStorage
            </button>
          </div>
        </div>
      </div>
    );
  };

  // 组件测试
  const ComponentTests = () => (
    <div className="component-tests">
      <div className="feature-section">
        <h3>🧩 组件测试</h3>
        <div className="component-grid">
          <div className="test-card">
            <h4>按钮组件</h4>
            <button className="primary-btn">主要按钮</button>
            <button className="secondary-btn">次要按钮</button>
            <button className="danger-btn">危险按钮</button>
          </div>

          <div className="test-card">
            <h4>输入组件</h4>
            <input type="text" placeholder="文本输入" />
            <input type="number" placeholder="数字输入" />
            <textarea placeholder="多行文本"></textarea>
          </div>

          <div className="test-card">
            <h4>选择组件</h4>
            <select>
              <option>选项1</option>
              <option>选项2</option>
              <option>选项3</option>
            </select>
            <div className="checkbox-group">
              <label>
                <input type="checkbox" />
                复选框1
              </label>
              <label>
                <input type="checkbox" />
                复选框2
              </label>
            </div>
          </div>

          <div className="test-card">
            <h4>进度组件</h4>
            <progress value="32" max="100">32%</progress>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: '65%' }}></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="test-page">
      <div className="test-header">
        <h1>🧪 测试页面</h1>
        <p>这是一个功能完整的测试页面，使用DrawBoard + div容器进行绘图</p>
      </div>

      <div className="test-tabs">
        <button 
          className={activeTab === 'canvas' ? 'active' : ''}
          onClick={() => setActiveTab('canvas')}
        >
          🎨 绘图测试
        </button>
        <button 
          className={activeTab === 'api' ? 'active' : ''}
          onClick={() => setActiveTab('api')}
        >
          🌐 API测试
        </button>
        <button 
          className={activeTab === 'component' ? 'active' : ''}
          onClick={() => setActiveTab('component')}
        >
          🧩 组件测试
        </button>
      </div>

      <div className="test-content">
        {activeTab === 'canvas' && <TestFeatures />}
        {activeTab === 'api' && <ApiTests />}
        {activeTab === 'component' && <ComponentTests />}
      </div>
    </div>
  );
};

export default Test; 