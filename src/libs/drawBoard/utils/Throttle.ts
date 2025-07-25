/**
 * 节流器
 * 
 * 节流器用于限制函数的执行频率，避免在短时间内多次触发相同的事件。
 * 
 * 节流器通常用于处理高频事件，如鼠标移动、触摸移动等。
 * 
 * 节流器通过设置一个延迟时间，在延迟时间内，如果再次触发相同的事件，则不执行函数，直到延迟时间结束后，再执行函数。
 * 
 * 节流器有以下几种实现方式：
 * 1. 时间戳实现
 * 2. 定时器实现
 * 3. 结合时间戳和定时器实现
*/
export class Throttle {
  private lastTime: number = 0;
  private timeoutId: number | null = null;
  private delay: number;

  constructor(delay: number = 16) { // 默认 60fps
    this.delay = delay;
  }

  public throttle(func: () => void): void {
    const now = Date.now();
    
    if (now - this.lastTime >= this.delay) {
      func();
      this.lastTime = now;
    } else {
      if (this.timeoutId) {
        clearTimeout(this.timeoutId);
      }
      
      this.timeoutId = window.setTimeout(() => {
        func();
        this.lastTime = Date.now();
        this.timeoutId = null;
      }, this.delay - (now - this.lastTime));
    }
  }

  public cancel(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
} 