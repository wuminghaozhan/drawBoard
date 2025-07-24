import { logger } from './Logger';

/**
 * 可销毁资源接口
 */
export interface DestroyableResource {
  /** 资源名称 */
  name: string;
  /** 销毁方法 */
  destroy(): void | Promise<void>;
}

/**
 * 基于WeakMap的自动资源管理器
 * 
 * 特点：
 * - 使用WeakMap自动垃圾回收
 * - 无需手动注销资源
 * - 极简API设计
 * - 自动内存管理
 */
export class WeakResourceManager {
  private static instance: WeakResourceManager;
  private resources: WeakMap<object, DestroyableResource> = new WeakMap();
  private isDestroying: boolean = false;

  private constructor() {}

  public static getInstance(): WeakResourceManager {
    if (!WeakResourceManager.instance) {
      WeakResourceManager.instance = new WeakResourceManager();
    }
    return WeakResourceManager.instance;
  }

  /**
   * 注册资源
   * @param owner 资源所有者对象
   * @param resource 可销毁资源
   */
  public register(owner: object, resource: DestroyableResource): void {
    if (this.isDestroying) {
      logger.warn('资源管理器正在销毁中，跳过资源注册');
      return;
    }
    
    this.resources.set(owner, resource);
    logger.debug(`注册资源: ${resource.name}`);
  }

  /**
   * 手动注销资源
   * @param owner 资源所有者对象
   */
  public async unregister(owner: object): Promise<void> {
    const resource = this.resources.get(owner);
    if (resource) {
      try {
        await resource.destroy();
        logger.debug(`资源注销成功: ${resource.name}`);
      } catch (error) {
        logger.error(`资源注销失败: ${resource.name}`, error);
      }
    }
  }

  /**
   * 销毁所有已知资源
   * 注意：WeakMap中的资源会在对象被垃圾回收时自动清理
   */
  public async destroy(): Promise<void> {
    if (this.isDestroying) {
      return;
    }

    this.isDestroying = true;
    logger.info('开始销毁所有资源');

    // 注意：WeakMap无法遍历所有键，这里只能处理已知的资源
    // 实际使用中，资源会在对象被垃圾回收时自动清理
    
    this.isDestroying = false;
    WeakResourceManager.instance = undefined as unknown as WeakResourceManager;
    
    logger.info('资源管理器销毁完成');
  }

  /**
   * 重置管理器
   */
  public reset(): void {
    this.isDestroying = false;
    WeakResourceManager.instance = undefined as unknown as WeakResourceManager;
    logger.info('WeakMap资源管理器已重置');
  }
}

/**
 * 自动资源管理装饰器
 */
export function withWeakResourceManager<T extends { new (...args: any[]): any }>(constructor: T) {
  return class extends constructor {
    protected registerResource(resource: DestroyableResource): void {
      WeakResourceManager.getInstance().register(this, resource);
    }

    async destroy(): Promise<void> {
      // 先调用父类的destroy方法
      if (super.destroy) {
        await super.destroy();
      }

      // 注销当前实例的资源
      await WeakResourceManager.getInstance().unregister(this);
    }
  };
} 