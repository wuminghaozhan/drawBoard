import type { Point } from '../core/CanvasEngine';
import { Throttle } from '../utils/Throttle';

export interface DrawEvent {
  type: 'mousedown' | 'mousemove' | 'mouseup' | 'touchstart' | 'touchmove' | 'touchend';
  point: Point;
  timestamp: number;
}

export type EventHandler = (event: DrawEvent) => void;

export class EventManager {
  private canvas: HTMLCanvasElement;
  private handlers: Map<string, EventHandler[]> = new Map();
  private throttle: Throttle;
  
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
    this.throttle = new Throttle(16); // 60fps
    
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

  private bindEvents(): void {
    // 鼠标事件
    this.canvas.addEventListener('mousedown', this.boundHandlers.mouseDown);
    this.canvas.addEventListener('mousemove', this.boundHandlers.mouseMove);
    this.canvas.addEventListener('mouseup', this.boundHandlers.mouseUp);
    this.canvas.addEventListener('mouseout', this.boundHandlers.mouseUp);

    // 触摸事件
    this.canvas.addEventListener('touchstart', this.boundHandlers.touchStart);
    this.canvas.addEventListener('touchmove', this.boundHandlers.touchMove);
    this.canvas.addEventListener('touchend', this.boundHandlers.touchEnd);
  }

  private getCanvasPoint(clientX: number, clientY: number): Point {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  private handleMouseDown(e: MouseEvent): void {
    console.log('Mouse down event triggered');
    const event: DrawEvent = {
      type: 'mousedown',
      point: this.getCanvasPoint(e.clientX, e.clientY),
      timestamp: Date.now()
    };
    console.log('Mouse down point:', event.point);
    this.emit('mousedown', event);
  }

  private handleMouseMove(e: MouseEvent): void {
    
    // 使用节流优化性能
    this.throttle.throttle(() => {
      try {
        const event: DrawEvent = {
          type: 'mousemove',
          point: this.getCanvasPoint(e.clientX, e.clientY),
          timestamp: Date.now()
        };
        this.emit('mousemove', event);
      } catch (error) {
        console.error('鼠标移动事件处理失败:', error);
      }
    });
  }

  private handleMouseUp(e: MouseEvent): void {
    const event: DrawEvent = {
      type: 'mouseup',
      point: this.getCanvasPoint(e.clientX, e.clientY),
      timestamp: Date.now()
    };
    this.emit('mouseup', event);
  }

  private handleTouchStart(e: TouchEvent): void {
    e.preventDefault();
    const touch = e.touches[0];
    const event: DrawEvent = {
      type: 'touchstart',
      point: this.getCanvasPoint(touch.clientX, touch.clientY),
      timestamp: Date.now()
    };
    this.emit('touchstart', event);
  }

  private handleTouchMove(e: TouchEvent): void {
    e.preventDefault();
    
    // 使用节流优化性能
    this.throttle.throttle(() => {
      const touch = e.touches[0];
      const event: DrawEvent = {
        type: 'touchmove',
        point: this.getCanvasPoint(touch.clientX, touch.clientY),
        timestamp: Date.now()
      };
      this.emit('touchmove', event);
    });
  }

  private handleTouchEnd(e: TouchEvent): void {
    e.preventDefault();
    const touch = e.changedTouches[0];
    const event: DrawEvent = {
      type: 'touchend',
      point: this.getCanvasPoint(touch.clientX, touch.clientY),
      timestamp: Date.now()
    };
    this.emit('touchend', event);
  }

  public on(eventType: string, handler: EventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler);
  }

  public off(eventType: string, handler: EventHandler): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  private emit(eventType: string, event: DrawEvent): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      handlers.forEach(handler => handler(event));
    }
  }

  public destroy(): void {
    // 解绑所有DOM事件
    this.canvas.removeEventListener('mousedown', this.boundHandlers.mouseDown);
    this.canvas.removeEventListener('mousemove', this.boundHandlers.mouseMove);
    this.canvas.removeEventListener('mouseup', this.boundHandlers.mouseUp);
    this.canvas.removeEventListener('mouseout', this.boundHandlers.mouseUp);
    this.canvas.removeEventListener('touchstart', this.boundHandlers.touchStart);
    this.canvas.removeEventListener('touchmove', this.boundHandlers.touchMove);
    this.canvas.removeEventListener('touchend', this.boundHandlers.touchEnd);
    
    this.handlers.clear();
    this.throttle.cancel();
  }
} 