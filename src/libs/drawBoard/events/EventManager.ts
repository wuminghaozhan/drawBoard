import type { Point } from '../core/CanvasEngine';
import { Throttle } from '../utils/Throttle';
import { logger } from '../utils/Logger';

export interface DrawEvent {
  type: 'mousedown' | 'mousemove' | 'mouseup' | 'touchstart' | 'touchmove' | 'touchend';
  point: Point;
  timestamp: number;
}

export type EventType = 'mousedown' | 'mousemove' | 'mouseup' | 'touchstart' | 'touchmove' | 'touchend';
export type EventHandler = (event: DrawEvent) => void;

/**
 * 事件管理器 - 优化版本
 * 
 * 改进:
 * - 全面的节流保护
 * - 防重复点击机制
 * - 事件合并优化
 * - 更好的性能监控
 * - 修复重复事件检测的坐标计算
 * - 改进类型安全性
 */
export class EventManager {
  private canvas: HTMLCanvasElement;
  private handlers: Map<EventType, EventHandler[]> = new Map();
  
  // 节流控制
  private mouseMoveThrottle: Throttle;
  private touchMoveThrottle: Throttle;
  
  // 防重复点击
  private lastMouseDownTime: number = 0;
  private lastTouchStartTime: number = 0;
  private minEventInterval: number = 10; // 最小事件间隔10ms
  
  // 事件状态跟踪
  private isPointerDown: boolean = false;
  private lastProcessedEvent: DrawEvent | null = null;
  
  // 重复事件检测配置
  private duplicateDistanceThreshold: number = 2; // 2像素的欧几里得距离阈值
  
  // 保存事件处理函数的引用，用于解绑
  private boundHandlers: {
    mouseDown: (e: MouseEvent) => void;
    mouseMove: (e: MouseEvent) => void;
    mouseUp: (e: MouseEvent) => void;
    touchStart: (e: TouchEvent) => void;
    touchMove: (e: TouchEvent) => void;
    touchEnd: (e: TouchEvent) => void;
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    
    // 不同类型事件使用不同的节流设置
    this.mouseMoveThrottle = new Throttle(16); // 60fps for mouse move
    this.touchMoveThrottle = new Throttle(8);  // 120fps for touch move (更流畅)
    
    // 初始化事件处理函数引用
    this.boundHandlers = {
      mouseDown: this.handleMouseDown.bind(this),
      mouseMove: this.handleMouseMove.bind(this),
      mouseUp: this.handleMouseUp.bind(this),
      touchStart: this.handleTouchStart.bind(this),
      touchMove: this.handleTouchMove.bind(this),
      touchEnd: this.handleTouchEnd.bind(this)
    };
    
    this.bindEvents();
  }

  /**
   * 底层事件处理和分发
   * 🎯 DOM 事件绑定：直接监听 Canvas 的原生鼠标和触摸事件
   * ⚡ 性能优化：节流控制、防重复点击、事件合并
   * 🔄 事件转换：将 DOM 事件转换为 DrawBoard 内部事件格式
   * 📡 事件分发：使用观察者模式向上层分发事件
   * 🛡️ 事件过滤：防止重复事件、无效事件的处理
  */
  private bindEvents(): void {
    // 鼠标事件
    this.canvas.addEventListener('mousedown', this.boundHandlers.mouseDown);
    this.canvas.addEventListener('mousemove', (...args) => {this.boundHandlers.mouseMove(...args)});
    this.canvas.addEventListener('mouseup', this.boundHandlers.mouseUp);
    this.canvas.addEventListener('mouseout', this.boundHandlers.mouseUp);

    // 触摸事件
    this.canvas.addEventListener('touchstart', this.boundHandlers.touchStart, { passive: false });
    this.canvas.addEventListener('touchmove', this.boundHandlers.touchMove, { passive: false });
    this.canvas.addEventListener('touchend', this.boundHandlers.touchEnd, { passive: false });
  }

  /**
   * 检查是否为重复事件
   * 修复：使用欧几里得距离替代曼哈顿距离，提高检测精度
   */
  private isDuplicateEvent(event: DrawEvent): boolean {
    if (!this.lastProcessedEvent) return false;
    
    const timeDiff = event.timestamp - this.lastProcessedEvent.timestamp;
    
    // 使用欧几里得距离计算坐标差异，更精确
    const pointDiff = Math.sqrt(
      Math.pow(event.point.x - this.lastProcessedEvent.point.x, 2) + 
      Math.pow(event.point.y - this.lastProcessedEvent.point.y, 2)
    );
    
    // 如果时间间隔很短且位置几乎没变，认为是重复事件
    return timeDiff < this.minEventInterval && pointDiff < this.duplicateDistanceThreshold;
  }

  /**
   * 安全触发事件（防重复）
   */
  private safeEmitEvent(event: DrawEvent): void {
    if (!this.isDuplicateEvent(event)) {
      this.lastProcessedEvent = event;
      this.emit(event.type, event);
    } else {
      logger.debug('检测到重复事件，已过滤:', event.type, event.point);
    }
  }

  private handleMouseDown(e: MouseEvent): void {
    const now = Date.now();
    
    // 防止快速重复点击
    if (now - this.lastMouseDownTime < this.minEventInterval) {
      return;
    }
    
    this.lastMouseDownTime = now;
    
    this.isPointerDown = true;
    
    const event: DrawEvent = {
      type: 'mousedown',
      point: this.getMousePoint(e),
      timestamp: now
    };
    
    logger.debug('Mouse down point:', event.point);

    this.safeEmitEvent(event);
  }

  private handleMouseMove(e: MouseEvent): void {
    // 使用节流优化性能
    this.mouseMoveThrottle.throttle(() => {
      try {
        const event: DrawEvent = {
          type: 'mousemove',
          point: this.getMousePoint(e),
          timestamp: Date.now()
        };
        
        this.safeEmitEvent(event);
      } catch (error) {
        logger.error('鼠标移动事件处理失败:', error);
      }
    });
  }

  private handleMouseUp(e: MouseEvent): void {
    if (!this.isPointerDown) return; // 防止无效的mouseup事件
    
    this.isPointerDown = false;
    
    // 检查是否是mouseout事件，如果是则使用最后一个有效坐标
    let point: Point;
    if (e.type === 'mouseout') {
      // 使用最后一个处理的事件坐标，避免mouseout时的无效坐标
      point = this.lastProcessedEvent?.point || { x: 0, y: 0, timestamp: Date.now() };
    } else {
      point = this.getMousePoint(e);
    }
    
    const event: DrawEvent = {
      type: 'mouseup',
      point: point,
      timestamp: Date.now()
    };
    
    this.safeEmitEvent(event);
  }

  private handleTouchStart(e: TouchEvent): void {
    e.preventDefault();
    const now = Date.now();
    
    // 防止快速重复触摸
    if (now - this.lastTouchStartTime < this.minEventInterval) {
      return;
    }
    this.lastTouchStartTime = now;
    
    const touch = e.touches[0];
    if (!touch) {
      logger.warn('触摸事件中没有找到有效的触摸点');
      return;
    }
    
    this.isPointerDown = true;
    
    const event: DrawEvent = {
      type: 'touchstart',
      point: this.getTouchPoint(touch),
      timestamp: now
    };
    
    this.safeEmitEvent(event);
  }

  private handleTouchMove(e: TouchEvent): void {
    e.preventDefault();
    if (!this.isPointerDown) return;
    
    // 使用专门的触摸节流器
    this.touchMoveThrottle.throttle(() => {
      try {
        const touch = e.touches[0];
        if (!touch) {
          logger.warn('触摸移动事件中没有找到有效的触摸点');
          return;
        }
        
        const event: DrawEvent = {
          type: 'touchmove',
          point: this.getTouchPoint(touch),
          timestamp: Date.now()
        };
        
        this.safeEmitEvent(event);
      } catch (error) {
        logger.error('触摸移动事件处理失败:', error);
      }
    });
  }

  private handleTouchEnd(e: TouchEvent): void {
    e.preventDefault();
    if (!this.isPointerDown) return;
    
    this.isPointerDown = false;
    const touch = e.changedTouches[0];
    
    if (!touch) {
      logger.warn('触摸结束事件中没有找到有效的触摸点');
      return;
    }
    
    const event: DrawEvent = {
      type: 'touchend',
      point: this.getTouchPoint(touch),
      timestamp: Date.now()
    };
    
    this.safeEmitEvent(event);
  }

  /**
   * 获取鼠标坐标点
   * 改进：考虑Canvas缩放比例，提供更精确的坐标
   */
  private getMousePoint(e: MouseEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
      timestamp: Date.now()
    };
  }

  /**
   * 获取触摸坐标点
   * 改进：考虑Canvas缩放比例，提供更精确的坐标
   */
  private getTouchPoint(touch: Touch): Point {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    
    return {
      x: (touch.clientX - rect.left) * scaleX,
      y: (touch.clientY - rect.top) * scaleY,
      timestamp: Date.now()
    };
  }

  /**
   * 注册事件处理器
   * 改进：使用强类型的事件类型
   */
  public on(eventType: EventType, handler: EventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler);
  }

  /**
   * 移除事件处理器
   * 改进：使用强类型的事件类型
   */
  public off(eventType: EventType, handler: EventHandler): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * 触发事件
   * 改进：使用强类型的事件类型，提供更详细的错误信息
   */
  private emit(eventType: EventType, event: DrawEvent): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      handlers.forEach((handler, index) => {
        try {
          handler(event);
        } catch (error) {
          logger.error(`事件处理器执行失败 (${eventType}) [${index}]:`, error);
          // 可选：移除有问题的处理器以防止重复错误
          // handlers.splice(index, 1);
        }
      });
    }
  }

  /**
   * 调整节流间隔
   */
  public setThrottleInterval(mouseInterval: number, touchInterval?: number): void {
    this.mouseMoveThrottle = new Throttle(mouseInterval);
    this.touchMoveThrottle = new Throttle(touchInterval || mouseInterval / 2);
  }

  /**
   * 设置最小事件间隔
   */
  public setMinEventInterval(interval: number): void {
    this.minEventInterval = interval;
  }

  /**
   * 设置重复事件检测的距离阈值
   */
  public setDuplicateDistanceThreshold(threshold: number): void {
    this.duplicateDistanceThreshold = threshold;
  }

  /**
   * 获取当前事件状态
   */
  public getEventState(): {
    isPointerDown: boolean;
    lastProcessedEvent: DrawEvent | null;
    handlersCount: number;
  } {
    return {
      isPointerDown: this.isPointerDown,
      lastProcessedEvent: this.lastProcessedEvent,
      handlersCount: Array.from(this.handlers.values()).reduce((sum, handlers) => sum + handlers.length, 0)
    };
  }

  public destroy(): void {
    // 清理事件监听器
    this.canvas.removeEventListener('mousedown', this.boundHandlers.mouseDown);
    this.canvas.removeEventListener('mousemove', this.boundHandlers.mouseMove);
    this.canvas.removeEventListener('mouseup', this.boundHandlers.mouseUp);
    this.canvas.removeEventListener('mouseout', this.boundHandlers.mouseUp);
    this.canvas.removeEventListener('touchstart', this.boundHandlers.touchStart);
    this.canvas.removeEventListener('touchmove', this.boundHandlers.touchMove);
    this.canvas.removeEventListener('touchend', this.boundHandlers.touchEnd);
    
    // 清理处理器
    this.handlers.clear();
    
    // 重置状态
    this.isPointerDown = false;
    this.lastProcessedEvent = null;
    
    // 取消节流器
    this.mouseMoveThrottle.cancel();
    this.touchMoveThrottle.cancel();
  }
} 