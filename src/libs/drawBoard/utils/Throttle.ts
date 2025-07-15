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