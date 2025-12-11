/**
 * EventBus 单元测试
 */

import { EventBus } from '../../libs/drawBoard/infrastructure/events/EventBus';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  afterEach(() => {
    eventBus.clearAll();
  });

  describe('基本订阅和发布', () => {
    it('应该能订阅和接收事件', () => {
      const handler = jest.fn();
      eventBus.on('tool:changed', handler);

      eventBus.emit('tool:changed', { oldTool: 'pen', newTool: 'rect' });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ oldTool: 'pen', newTool: 'rect' });
    });

    it('应该支持多个订阅者', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      eventBus.on('layer:created', handler1);
      eventBus.on('layer:created', handler2);

      eventBus.emit('layer:created', { layerId: 'layer-1', name: 'Layer 1' });

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('应该正确传递事件负载', () => {
      const handler = jest.fn();
      const payload = { selectedIds: ['action-1', 'action-2'], previousIds: [] as string[] };
      
      eventBus.on('selection:changed', handler);
      eventBus.emit('selection:changed', payload);

      expect(handler).toHaveBeenCalledWith(payload);
    });
  });

  describe('取消订阅', () => {
    it('应该能通过返回的函数取消订阅', () => {
      const handler = jest.fn();
      const unsubscribe = eventBus.on('tool:changed', handler);

      eventBus.emit('tool:changed', { oldTool: 'pen', newTool: 'rect' });
      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();

      eventBus.emit('tool:changed', { oldTool: 'rect', newTool: 'circle' });
      expect(handler).toHaveBeenCalledTimes(1); // 仍然是1次
    });

    it('应该支持 off 方法取消订阅', () => {
      const handler = jest.fn();
      eventBus.on('tool:changed', handler);

      eventBus.emit('tool:changed', { oldTool: 'pen', newTool: 'rect' });
      expect(handler).toHaveBeenCalledTimes(1);

      eventBus.off('tool:changed', handler);

      eventBus.emit('tool:changed', { oldTool: 'rect', newTool: 'circle' });
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('once 订阅', () => {
    it('应该只触发一次', () => {
      const handler = jest.fn();
      eventBus.once('layer:deleted', handler);

      eventBus.emit('layer:deleted', { layerId: 'layer-1' });
      eventBus.emit('layer:deleted', { layerId: 'layer-2' });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ layerId: 'layer-1' });
    });

    it('应该支持 options.once', () => {
      const handler = jest.fn();
      eventBus.on('layer:deleted', handler, { once: true });

      eventBus.emit('layer:deleted', { layerId: 'layer-1' });
      eventBus.emit('layer:deleted', { layerId: 'layer-2' });

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('优先级', () => {
    it('应该按优先级顺序执行', () => {
      const order: number[] = [];
      
      eventBus.on('tool:changed', () => { order.push(1); }, { priority: 1 });
      eventBus.on('tool:changed', () => { order.push(3); }, { priority: 3 });
      eventBus.on('tool:changed', () => { order.push(2); }, { priority: 2 });

      eventBus.emit('tool:changed', { oldTool: 'pen', newTool: 'rect' });

      expect(order).toEqual([3, 2, 1]); // 高优先级先执行
    });
  });

  describe('clearAll 和 clearEvent', () => {
    it('clearAll 应该清除所有订阅', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      eventBus.on('tool:changed', handler1);
      eventBus.on('layer:created', handler2);

      eventBus.clearAll();

      eventBus.emit('tool:changed', { oldTool: 'pen', newTool: 'rect' });
      eventBus.emit('layer:created', { layerId: 'layer-1', name: 'Layer 1' });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });

    it('clearEvent 应该清除特定事件的订阅', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      eventBus.on('tool:changed', handler1);
      eventBus.on('layer:created', handler2);

      eventBus.clearEvent('tool:changed');

      eventBus.emit('tool:changed', { oldTool: 'pen', newTool: 'rect' });
      eventBus.emit('layer:created', { layerId: 'layer-1', name: 'Layer 1' });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  describe('getSubscriberCount', () => {
    it('应该返回正确的监听器数量', () => {
      expect(eventBus.getSubscriberCount('tool:changed')).toBe(0);

      eventBus.on('tool:changed', () => {});
      expect(eventBus.getSubscriberCount('tool:changed')).toBe(1);

      eventBus.on('tool:changed', () => {});
      expect(eventBus.getSubscriberCount('tool:changed')).toBe(2);
    });
  });

  describe('hasSubscribers', () => {
    it('应该正确检测是否有监听器', () => {
      expect(eventBus.hasSubscribers('tool:changed')).toBe(false);

      eventBus.on('tool:changed', () => {});
      expect(eventBus.hasSubscribers('tool:changed')).toBe(true);
    });
  });

  describe('异步处理器', () => {
    it('应该支持异步处理器', async () => {
      const results: string[] = [];
      
      eventBus.on('draw:started', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        results.push('async');
      });
      
      eventBus.on('draw:started', () => {
        results.push('sync');
      });

      await eventBus.emitAsync('draw:started', { actionId: 'action-1', toolType: 'pen' });

      expect(results).toContain('async');
      expect(results).toContain('sync');
    });
  });

  describe('错误处理', () => {
    it('应该捕获处理器错误而不影响其他处理器', () => {
      const handler1 = jest.fn(() => {
        throw new Error('Handler error');
      });
      const handler2 = jest.fn();
      
      eventBus.on('tool:changed', handler1);
      eventBus.on('tool:changed', handler2);

      // 不应该抛出错误
      expect(() => {
        eventBus.emit('tool:changed', { oldTool: 'pen', newTool: 'rect' });
      }).not.toThrow();

      // 第二个处理器应该仍然被调用
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe('enable 和 disable', () => {
    it('禁用后不应该发布事件', () => {
      const handler = jest.fn();
      eventBus.on('tool:changed', handler);

      eventBus.disable();
      eventBus.emit('tool:changed', { oldTool: 'pen', newTool: 'rect' });

      expect(handler).not.toHaveBeenCalled();
    });

    it('启用后应该恢复发布', () => {
      const handler = jest.fn();
      eventBus.on('tool:changed', handler);

      eventBus.disable();
      eventBus.emit('tool:changed', { oldTool: 'pen', newTool: 'rect' });
      expect(handler).not.toHaveBeenCalled();

      eventBus.enable();
      eventBus.emit('tool:changed', { oldTool: 'rect', newTool: 'circle' });
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('getStats', () => {
    it('应该返回正确的统计信息', () => {
      eventBus.on('tool:changed', () => {});
      eventBus.on('tool:changed', () => {});
      eventBus.on('layer:created', () => {});

      eventBus.emit('tool:changed', { oldTool: 'pen', newTool: 'rect' });

      const stats = eventBus.getStats();

      expect(stats.enabled).toBe(true);
      expect(stats.eventCount).toBe(2);
      expect(stats.totalSubscribers).toBe(3);
      expect(stats.emitCount).toBe(1);
    });
  });

  describe('destroy', () => {
    it('应该清理所有状态', () => {
      eventBus.on('tool:changed', () => {});
      eventBus.emit('tool:changed', { oldTool: 'pen', newTool: 'rect' });

      eventBus.destroy();

      const stats = eventBus.getStats();
      expect(stats.enabled).toBe(false);
      expect(stats.totalSubscribers).toBe(0);
      expect(stats.emitCount).toBe(0);
    });
  });
});
