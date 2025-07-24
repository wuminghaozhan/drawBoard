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
 * 轻量级资源管理器
 * 
 * 只保留核心功能：
 * - 资源注册和注销
 * - 批量销毁
 * - 基本状态检查
 */
export class LightweightResourceManager {
  private static instance: LightweightResourceManager;
  private resources: Set<DestroyableResource> = new Set();
  private isDestroying: boolean = false;

  private constructor() {}

  public static getInstance(): LightweightResourceManager {
    if (!LightweightResourceManager.instance) {
      LightweightResourceManager.instance = new LightweightResourceManager();
    }
    return LightweightResourceManager.instance;
  }

  /**
   * 注册资源
   */
  public register(resource: DestroyableResource): void {
    if (this.isDestroying) {
      logger.warn('资源管理器正在销毁中，跳过资源注册');
      return;
    }
    
    this.resources.add(resource);
    logger.debug(`注册资源: ${resource.name}`);
  }

  /**
   * 注销资源
   */
  public async unregister(resource: DestroyableResource): Promise<void> {
    if (this.resources.has(resource)) {
      try {
        await resource.destroy();
        this.resources.delete(resource);
        logger.debug(`资源注销成功: ${resource.name}`);
      } catch (error) {
        logger.error(`资源注销失败: ${resource.name}`, error);
      }
    }
  }

  /**
   * 销毁所有资源
   */
  public async destroy(): Promise<void> {
    if (this.isDestroying) {
      return;
    }

    this.isDestroying = true;
    logger.info(`开始销毁 ${this.resources.size} 个资源`);

    const destroyPromises = Array.from(this.resources).map(async (resource) => {
      try {
        await resource.destroy();
        logger.debug(`资源销毁成功: ${resource.name}`);
      } catch (error) {
        logger.error(`资源销毁失败: ${resource.name}`, error);
      }
    });

    await Promise.allSettled(destroyPromises);
    this.resources.clear();
    this.isDestroying = false;
    
    // 重置单例实例
    LightweightResourceManager.instance = undefined as unknown as LightweightResourceManager;
    
    logger.info('所有资源销毁完成');
  }

  /**
   * 获取资源数量
   */
  public getResourceCount(): number {
    return this.resources.size;
  }

  /**
   * 检查是否有资源
   */
  public hasResources(): boolean {
    return this.resources.size > 0;
  }

  /**
   * 重置管理器
   */
  public reset(): void {
    this.resources.clear();
    this.isDestroying = false;
    LightweightResourceManager.instance = undefined as unknown as LightweightResourceManager;
    logger.info('轻量级资源管理器已重置');
  }
}

/**
 * 资源自动管理装饰器
 */
export function withLightweightResourceManager<T extends { new (...args: any[]): any }>(constructor: T) {
  return class extends constructor {
    private resources: DestroyableResource[] = [];

    protected registerResource(resource: DestroyableResource): void {
      LightweightResourceManager.getInstance().register(resource);
      this.resources.push(resource);
    }

    async destroy(): Promise<void> {
      // 先调用父类的destroy方法
      if (super.destroy) {
        await super.destroy();
      }

      // 然后销毁所有注册的资源
      await Promise.all(
        this.resources.map(resource => 
          LightweightResourceManager.getInstance().unregister(resource)
        )
      );
      
      this.resources = [];
    }
  };
} 