/**
 * 事件基础设施模块
 * 
 * 提供事件处理能力：
 * - EventBus: 类型安全的事件总线
 * - EventManager: DOM 事件管理
 */

export { 
  EventBus,
  globalEventBus,
  type DrawBoardEvents,
  type EventHandler,
  type SubscribeOptions
} from './EventBus';

export { 
  EventManager,
  type DrawEvent
} from './EventManager';

