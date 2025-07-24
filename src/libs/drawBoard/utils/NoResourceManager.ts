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
 * 无资源管理器方案
 * 
 * 直接在DrawBoard中管理资源，不使用全局资源管理器
 * 优点：简单、直接、无额外开销
 * 缺点：需要手动管理资源生命周期
 */
export class DrawBoardResourceManager {
  private resources: DestroyableResource[] = [];
  private isDestroying: boolean = false;

  /**
   * 注册资源
   */
  public register(resource: DestroyableResource): void {
    if (this.isDestroying) {
      logger.warn('正在销毁中，跳过资源注册');
      return;
    }
    
    this.resources.push(resource);
    logger.debug(`注册资源: ${resource.name}`);
  }

  /**
   * 注销资源
   */
  public async unregister(resource: DestroyableResource): Promise<void> {
    const index = this.resources.indexOf(resource);
    if (index > -1) {
      try {
        await resource.destroy();
        this.resources.splice(index, 1);
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
    logger.info(`开始销毁 ${this.resources.length} 个资源`);

    const destroyPromises = this.resources.map(async (resource) => {
      try {
        await resource.destroy();
        logger.debug(`资源销毁成功: ${resource.name}`);
      } catch (error) {
        logger.error(`资源销毁失败: ${resource.name}`, error);
      }
    });

    await Promise.allSettled(destroyPromises);
    this.resources = [];
    this.isDestroying = false;
    
    logger.info('所有资源销毁完成');
  }

  /**
   * 获取资源数量
   */
  public getResourceCount(): number {
    return this.resources.length;
  }

  /**
   * 检查是否有资源
   */
  public hasResources(): boolean {
    return this.resources.length > 0;
  }

  /**
   * 清空资源列表
   */
  public clear(): void {
    this.resources = [];
    this.isDestroying = false;
    logger.info('资源列表已清空');
  }
} 