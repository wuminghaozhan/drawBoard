import { logger } from '../logging/Logger';

/**
 * 事件处理器类型
 */
export type EventHandler<T = unknown> = (payload: T) => void | Promise<void>;

/**
 * 事件订阅选项
 */
export interface SubscribeOptions {
  /** 是否只触发一次 */
  once?: boolean;
  /** 优先级（数字越大越先执行） */
  priority?: number;
}

/**
 * 事件订阅者信息
 */
interface Subscriber<T = unknown> {
  handler: EventHandler<T>;
  once: boolean;
  priority: number;
}

/**
 * DrawBoard 内部事件类型定义
 */
export interface DrawBoardEvents {
  // 工具事件
  'tool:changed': { oldTool: string; newTool: string };
  'tool:configUpdated': { toolType: string; config: Record<string, unknown> };
  
  // 图层事件
  'layer:created': { layerId: string; name: string };
  'layer:deleted': { layerId: string };
  'layer:activated': { layerId: string; previousLayerId: string | null };
  'layer:visibilityChanged': { layerId: string; visible: boolean };
  'layer:opacityChanged': { layerId: string; opacity: number };
  'layer:locked': { layerId: string; locked: boolean };
  'layer:renamed': { layerId: string; oldName: string; newName: string };
  'layer:reordered': { layerId: string; oldIndex: number; newIndex: number };
  'layer:cacheDirty': { layerId: string };
  'layer:needsRedraw': { layerId: string; zIndex: number };
  
  // 选择事件
  'selection:changed': { selectedIds: string[]; previousIds: string[] };
  'selection:cleared': { previousIds: string[] };
  'selection:started': { point: { x: number; y: number } };
  'selection:ended': { bounds: { x: number; y: number; width: number; height: number } | null };
  
  // 绘制事件
  'draw:started': { actionId: string; toolType: string };
  'draw:moved': { actionId: string; pointCount: number };
  'draw:ended': { actionId: string; toolType: string };
  'draw:cancelled': { actionId: string };
  
  // Action 事件
  'action:created': { action: { id: string; type: string; virtualLayerId?: string } };
  'action:updated': { actionId: string; changes: Record<string, unknown> };
  'action:deleted': { actionId: string };
  
  // 历史事件
  'history:changed': { canUndo: boolean; canRedo: boolean; count: number };
  'history:undone': { actionId: string };
  'history:redone': { actionId: string };
  'history:cleared': { previousCount: number };
  'history:undo': Record<string, never>;  // 命令：执行撤销
  'history:redo': Record<string, never>;  // 命令：执行重做
  
  // 性能事件
  'performance:redrawStarted': { timestamp: number };
  'performance:redrawEnded': { timestamp: number; duration: number; usedDirtyRect: boolean };
  'performance:memoryWarning': { usage: number; threshold: number };
  'performance:cacheCleared': { reason: string };
  
  // 画布事件
  'canvas:resized': { width: number; height: number };
  'canvas:cleared': { timestamp: number };
  
  // 重绘事件
  'redraw:requested': { full: boolean; reason?: string };
  'layer:changed': { layerId?: string };
  
  // 生命周期事件
  'lifecycle:initialized': { timestamp: number };
  'lifecycle:destroying': { timestamp: number };
  'lifecycle:destroyed': { timestamp: number };
  
  // 错误事件
  'error:occurred': { 
    type: string; 
    message: string; 
    recoverable: boolean; 
    timestamp: number;
    details?: Record<string, unknown>;
  };
}

/**
 * 事件总线
 * 
 * 用于 DrawBoard 内部组件之间的解耦通信。
 * 
 * 特点：
 * - 类型安全的事件定义
 * - 支持优先级
 * - 支持一次性订阅
 * - 支持异步处理器
 * - 自动错误处理
 * 
 * @example
 * ```typescript
 * const bus = new EventBus();
 * 
 * // 订阅事件
 * const unsubscribe = bus.on('layer:activated', ({ layerId }) => {
 *   console.log('Layer activated:', layerId);
 * });
 * 
 * // 发布事件
 * bus.emit('layer:activated', { layerId: 'layer-1', previousLayerId: null });
 * 
 * // 取消订阅
 * unsubscribe();
 * ```
 */
export class EventBus {
  private subscribers: Map<string, Subscriber[]> = new Map();
  private emitCount: number = 0;
  private enabled: boolean = true;

  /**
   * 订阅事件
   * 
   * @param event 事件名称
   * @param handler 事件处理器
   * @param options 订阅选项
   * @returns 取消订阅的函数
   */
  on<K extends keyof DrawBoardEvents>(
    event: K,
    handler: EventHandler<DrawBoardEvents[K]>,
    options: SubscribeOptions = {}
  ): () => void {
    const { once = false, priority = 0 } = options;

    if (!this.subscribers.has(event)) {
      this.subscribers.set(event, []);
    }

    const subscriber: Subscriber<DrawBoardEvents[K]> = {
      handler,
      once,
      priority
    };

    const subscribers = this.subscribers.get(event)!;
    subscribers.push(subscriber as Subscriber);
    
    // 按优先级排序（高优先级在前）
    subscribers.sort((a, b) => b.priority - a.priority);

    logger.debug(`EventBus: 订阅事件 ${event}`, { priority, once });

    // 返回取消订阅函数
    return () => this.off(event, handler);
  }

  /**
   * 一次性订阅事件
   */
  once<K extends keyof DrawBoardEvents>(
    event: K,
    handler: EventHandler<DrawBoardEvents[K]>,
    priority: number = 0
  ): () => void {
    return this.on(event, handler, { once: true, priority });
  }

  /**
   * 取消订阅事件
   */
  off<K extends keyof DrawBoardEvents>(
    event: K,
    handler: EventHandler<DrawBoardEvents[K]>
  ): void {
    const subscribers = this.subscribers.get(event);
    
    if (!subscribers) {
      return;
    }

    const index = subscribers.findIndex(s => s.handler === handler);
    
    if (index !== -1) {
      subscribers.splice(index, 1);
      logger.debug(`EventBus: 取消订阅事件 ${event}`);
    }
  }

  /**
   * 发布事件
   * 
   * @param event 事件名称
   * @param payload 事件数据
   */
  emit<K extends keyof DrawBoardEvents>(
    event: K,
    payload: DrawBoardEvents[K]
  ): void {
    if (!this.enabled) {
      logger.debug(`EventBus: 已禁用，跳过事件 ${event}`);
      return;
    }

    const subscribers = this.subscribers.get(event);
    
    if (!subscribers || subscribers.length === 0) {
      return;
    }

    this.emitCount++;
    
    logger.debug(`EventBus: 发布事件 ${event}`, {
      subscriberCount: subscribers.length,
      emitCount: this.emitCount
    });

    // 收集需要移除的一次性订阅者
    const toRemove: Subscriber[] = [];

    for (const subscriber of subscribers) {
      try {
        const result = subscriber.handler(payload);
        
        // 处理异步处理器
        if (result instanceof Promise) {
          result.catch(error => {
            logger.error(`EventBus: 事件处理器错误 [${event}]`, error);
          });
        }

        if (subscriber.once) {
          toRemove.push(subscriber);
        }
      } catch (error) {
        logger.error(`EventBus: 事件处理器错误 [${event}]`, error);
      }
    }

    // 移除一次性订阅者
    for (const subscriber of toRemove) {
      const index = subscribers.indexOf(subscriber);
      if (index !== -1) {
        subscribers.splice(index, 1);
      }
    }
  }

  /**
   * 异步发布事件（等待所有处理器完成）
   */
  async emitAsync<K extends keyof DrawBoardEvents>(
    event: K,
    payload: DrawBoardEvents[K]
  ): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const subscribers = this.subscribers.get(event);
    
    if (!subscribers || subscribers.length === 0) {
      return;
    }

    this.emitCount++;
    
    const toRemove: Subscriber[] = [];
    const promises: Promise<void>[] = [];

    for (const subscriber of subscribers) {
      try {
        const result = subscriber.handler(payload);
        
        if (result instanceof Promise) {
          promises.push(result);
        }

        if (subscriber.once) {
          toRemove.push(subscriber);
        }
      } catch (error) {
        logger.error(`EventBus: 事件处理器错误 [${event}]`, error);
      }
    }

    // 等待所有异步处理器
    await Promise.all(promises);

    // 移除一次性订阅者
    for (const subscriber of toRemove) {
      const index = subscribers.indexOf(subscriber);
      if (index !== -1) {
        subscribers.splice(index, 1);
      }
    }
  }

  /**
   * 检查是否有订阅者
   */
  hasSubscribers<K extends keyof DrawBoardEvents>(event: K): boolean {
    const subscribers = this.subscribers.get(event);
    return !!subscribers && subscribers.length > 0;
  }

  /**
   * 获取订阅者数量
   */
  getSubscriberCount<K extends keyof DrawBoardEvents>(event: K): number {
    return this.subscribers.get(event)?.length ?? 0;
  }

  /**
   * 清除指定事件的所有订阅者
   */
  clearEvent<K extends keyof DrawBoardEvents>(event: K): void {
    this.subscribers.delete(event);
    logger.debug(`EventBus: 清除事件 ${event} 的所有订阅者`);
  }

  /**
   * 清除所有订阅者
   */
  clearAll(): void {
    this.subscribers.clear();
    logger.debug('EventBus: 清除所有订阅者');
  }

  /**
   * 启用事件总线
   */
  enable(): void {
    this.enabled = true;
    logger.debug('EventBus: 已启用');
  }

  /**
   * 禁用事件总线
   */
  disable(): void {
    this.enabled = false;
    logger.debug('EventBus: 已禁用');
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    enabled: boolean;
    eventCount: number;
    totalSubscribers: number;
    emitCount: number;
    events: Array<{ name: string; subscriberCount: number }>;
  } {
    let totalSubscribers = 0;
    const events: Array<{ name: string; subscriberCount: number }> = [];

    for (const [name, subscribers] of this.subscribers) {
      totalSubscribers += subscribers.length;
      events.push({ name, subscriberCount: subscribers.length });
    }

    return {
      enabled: this.enabled,
      eventCount: this.subscribers.size,
      totalSubscribers,
      emitCount: this.emitCount,
      events
    };
  }

  /**
   * 销毁事件总线
   */
  destroy(): void {
    this.clearAll();
    this.enabled = false;
    this.emitCount = 0;
    logger.debug('EventBus: 已销毁');
  }
}

/**
 * 创建全局事件总线实例
 */
export const globalEventBus = new EventBus();

