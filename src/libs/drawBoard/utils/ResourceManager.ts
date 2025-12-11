import { logger } from '../infrastructure/logging/Logger';
import { ErrorHandler, DrawBoardError, DrawBoardErrorCode } from '../infrastructure/error/ErrorHandler';

/**
 * 可销毁资源接口
 */
export interface DestroyableResource {
  /** 资源名称，用于调试 */
  name: string;
  /** 资源类型 */
  type: string;
  /** 销毁方法 */
  destroy(): void | Promise<void>;
  /** 是否已销毁 */
  isDestroyed?: boolean;
}

/**
 * 资源统计信息
 */
export interface ResourceStats {
  /** 总资源数量 */
  total: number;
  /** 按类型分组的资源数量 */
  byType: Record<string, number>;
  /** 已销毁的资源数量 */
  destroyed: number;
  /** 活跃的资源数量 */
  active: number;
  /** 内存使用估算（字节） */
  estimatedMemoryUsage: number;
}

/**
 * 资源管理器
 * 
 * 负责管理DrawBoard中所有可销毁的资源，确保在组件销毁时正确清理所有资源，
 * 防止内存泄漏和资源占用。
 */
export class ResourceManager {
  private static instance: ResourceManager;
  private resources: Map<string, DestroyableResource> = new Map();
  private resourceIds: Set<string> = new Set();
  private nextId: number = 1;
  private isDestroying: boolean = false;
  private errorHandler: ErrorHandler;

  private constructor() {
    this.errorHandler = ErrorHandler.getInstance();
  }

  public static getInstance(): ResourceManager {
    if (!ResourceManager.instance) {
      ResourceManager.instance = new ResourceManager();
      logger.debug('创建新的ResourceManager实例');
    }
    return ResourceManager.instance;
  }

  /**
   * 注册资源
   * @param resource 可销毁的资源
   * @param name 资源名称（可选，用于调试）
   * @returns 资源ID
   */
  public register(resource: DestroyableResource, name?: string): string {
    if (this.isDestroying) {
      throw new Error('资源管理器正在销毁中，无法注册新资源');
    }

    const id = this.generateId();
    const resourceName = name || resource.name || `resource_${id}`;
    
    // 创建资源包装器
    const wrappedResource: DestroyableResource = {
      name: resourceName,
      type: resource.type,
      isDestroyed: false,
      destroy: async () => {
        if (wrappedResource.isDestroyed) {
          return;
        }
        
        try {
          await resource.destroy();
          wrappedResource.isDestroyed = true;
          logger.debug(`资源销毁成功: ${resourceName} (${id})`);
        } catch (error) {
          const drawBoardError = DrawBoardError.fromError(
            error as Error,
            DrawBoardErrorCode.RESOURCE_DESTROY_FAILED,
            { resourceId: id, resourceName, resourceType: resource.type }
          );
          await this.errorHandler.handle(drawBoardError);
        }
      }
    };

    this.resources.set(id, wrappedResource);
    this.resourceIds.add(id);
    
    logger.debug(`注册资源: ${resourceName} (${id}) [${resource.type}]`);
    
    return id;
  }

  /**
   * 注销资源
   * @param id 资源ID
   */
  public async unregister(id: string): Promise<void> {
    const resource = this.resources.get(id);
    if (!resource) {
      logger.warn(`尝试注销不存在的资源: ${id}`);
      return;
    }

    try {
      await resource.destroy();
      this.resources.delete(id);
      this.resourceIds.delete(id);
      logger.debug(`资源注销成功: ${resource.name} (${id})`);
    } catch (error) {
      const drawBoardError = DrawBoardError.fromError(
        error as Error,
        DrawBoardErrorCode.RESOURCE_DESTROY_FAILED,
        { resourceId: id, resourceName: resource.name }
      );
      await this.errorHandler.handle(drawBoardError);
    }
  }

  /**
   * 获取资源
   * @param id 资源ID
   */
  public getResource(id: string): DestroyableResource | undefined {
    return this.resources.get(id);
  }

  /**
   * 检查资源是否存在
   * @param id 资源ID
   */
  public hasResource(id: string): boolean {
    return this.resources.has(id);
  }

  /**
   * 获取所有资源
   */
  public getAllResources(): Map<string, DestroyableResource> {
    return new Map(this.resources);
  }

  /**
   * 按类型获取资源
   * @param type 资源类型
   */
  public getResourcesByType(type: string): DestroyableResource[] {
    return Array.from(this.resources.values()).filter(r => r.type === type);
  }

  /**
   * 获取资源统计信息
   */
  public getStats(): ResourceStats {
    const byType: Record<string, number> = {};
    let destroyed = 0;
    let estimatedMemoryUsage = 0;

    this.resources.forEach(resource => {
      // 统计按类型分组
      byType[resource.type] = (byType[resource.type] || 0) + 1;
      
      // 统计已销毁的资源
      if (resource.isDestroyed) {
        destroyed++;
      }
      
      // 估算内存使用（简单估算）
      estimatedMemoryUsage += this.estimateResourceMemory(resource);
    });

    return {
      total: this.resources.size,
      byType,
      destroyed,
      active: this.resources.size - destroyed,
      estimatedMemoryUsage
    };
  }

  /**
   * 清理已销毁的资源
   */
  public cleanupDestroyedResources(): void {
    const destroyedIds: string[] = [];
    
    this.resources.forEach((resource, id) => {
      if (resource.isDestroyed) {
        destroyedIds.push(id);
      }
    });

    destroyedIds.forEach(id => {
      this.resources.delete(id);
      this.resourceIds.delete(id);
    });

    if (destroyedIds.length > 0) {
      logger.debug(`清理了 ${destroyedIds.length} 个已销毁的资源`);
    }
  }

  /**
   * 销毁所有资源
   */
  public async destroy(): Promise<void> {
    if (this.isDestroying) {
      logger.warn('资源管理器已经在销毁中');
      return;
    }

    this.isDestroying = true;
    logger.info(`开始销毁 ${this.resources.size} 个资源`);

    try {
      // 按类型分组销毁，确保依赖关系正确
      const resourcesByType = this.groupResourcesByType();
      const destroyOrder = this.getDestroyOrder();
      
      for (const type of destroyOrder) {
        const resources = resourcesByType.get(type) || [];
        logger.debug(`销毁类型 ${type} 的资源 (${resources.length} 个)`);
        
        // 并行销毁同类型的资源
        await Promise.allSettled(
          resources.map(async (resource) => {
            try {
              await resource.destroy();
            } catch (error) {
              const drawBoardError = DrawBoardError.fromError(
                error as Error,
                DrawBoardErrorCode.RESOURCE_DESTROY_FAILED,
                { resourceName: resource.name, resourceType: type }
              );
              await this.errorHandler.handle(drawBoardError);
            }
          })
        );
      }

      // 清理资源映射
      this.resources.clear();
      this.resourceIds.clear();
      
      logger.info('所有资源销毁完成');
      
    } catch (error) {
      const drawBoardError = DrawBoardError.fromError(
        error as Error,
        DrawBoardErrorCode.RESOURCE_DESTROY_FAILED
      );
      await this.errorHandler.handle(drawBoardError);
    } finally {
      this.isDestroying = false;
      // 重置单例实例，允许重新创建
      ResourceManager.instance = undefined as unknown as ResourceManager;
    }
  }

  /**
   * 生成唯一资源ID
   */
  private generateId(): string {
    let id: string;
    do {
      id = `resource_${this.nextId++}_${Date.now()}`;
    } while (this.resourceIds.has(id));
    
    return id;
  }

  /**
   * 按类型分组资源
   */
  private groupResourcesByType(): Map<string, DestroyableResource[]> {
    const grouped = new Map<string, DestroyableResource[]>();
    
    this.resources.forEach(resource => {
      if (!grouped.has(resource.type)) {
        grouped.set(resource.type, []);
      }
      grouped.get(resource.type)!.push(resource);
    });
    
    return grouped;
  }

  /**
   * 获取资源销毁顺序
   * 确保依赖关系正确，先销毁依赖的资源
   */
  private getDestroyOrder(): string[] {
    // 定义资源类型的依赖关系
    const dependencies: Record<string, string[]> = {
      'canvas': ['drawing', 'event', 'tool'],
      'drawing': ['tool', 'history'],
      'event': ['drawing'],
      'tool': ['factory'],
      'history': [],
      'factory': [],
      'performance': ['cache'],
      'cache': [],
      'selection': ['drawing'],
      'shortcut': ['event'],
      'export': ['canvas'],
      'virtualLayer': ['drawing']
    };

    // 简单的拓扑排序
    const visited = new Set<string>();
    const order: string[] = [];

    const visit = (type: string) => {
      if (visited.has(type)) return;
      visited.add(type);
      
      const deps = dependencies[type] || [];
      deps.forEach(dep => visit(dep));
      
      order.push(type);
    };

    // 获取所有资源类型
    const allTypes = new Set<string>();
    this.resources.forEach(resource => {
      allTypes.add(resource.type);
    });

    allTypes.forEach(type => visit(type));

    return order;
  }

  /**
   * 估算资源内存使用
   */
  private estimateResourceMemory(resource: DestroyableResource): number {
    // 简单的内存估算，实际项目中可能需要更复杂的算法
    const baseMemory = 1024; // 1KB 基础内存
    
    switch (resource.type) {
      case 'canvas':
        return baseMemory * 10; // 10KB
      case 'cache':
        return baseMemory * 5;  // 5KB
      case 'tool':
        return baseMemory * 2;  // 2KB
      case 'history':
        return baseMemory * 3;  // 3KB
      default:
        return baseMemory;
    }
  }

  /**
   * 检查资源泄漏
   */
  public checkResourceLeaks(): {
    hasLeaks: boolean;
    leakedResources: DestroyableResource[];
    recommendations: string[];
  } {
    const leakedResources: DestroyableResource[] = [];
    const recommendations: string[] = [];

    this.resources.forEach(resource => {
      if (!resource.isDestroyed) {
        leakedResources.push(resource);
      }
    });

    if (leakedResources.length > 0) {
      recommendations.push(`发现 ${leakedResources.length} 个未销毁的资源`);
      recommendations.push('建议在组件销毁时调用 destroy() 方法');
      
      // 按类型分组显示泄漏的资源
      const byType: Record<string, number> = {};
      leakedResources.forEach(resource => {
        byType[resource.type] = (byType[resource.type] || 0) + 1;
      });
      
      Object.entries(byType).forEach(([type, count]) => {
        recommendations.push(`- ${type}: ${count} 个`);
      });
    }

    return {
      hasLeaks: leakedResources.length > 0,
      leakedResources,
      recommendations
    };
  }

  /**
   * 重置资源管理器（用于测试）
   */
  public reset(): void {
    this.resources.clear();
    this.resourceIds.clear();
    this.nextId = 1;
    this.isDestroying = false;
    // 重置单例实例，允许重新创建
    ResourceManager.instance = undefined as unknown as ResourceManager;
    logger.info('资源管理器已重置');
  }
}

/**
 * 资源管理器装饰器
 * 自动注册和注销资源
 */
export function withResourceManager<T extends { new (...args: any[]): any }>(constructor: T) {
  return class extends constructor {
    private resourceIds: string[] = [];

    protected registerResource(resource: DestroyableResource, name?: string): string {
      const id = ResourceManager.getInstance().register(resource, name);
      this.resourceIds.push(id);
      return id;
    }

    protected unregisterResource(id: string): void {
      ResourceManager.getInstance().unregister(id);
      const index = this.resourceIds.indexOf(id);
      if (index > -1) {
        this.resourceIds.splice(index, 1);
      }
    }

    async destroy(): Promise<void> {
      // 先调用父类的destroy方法
      if (super.destroy) {
        await super.destroy();
      }

      // 然后销毁所有注册的资源
      await Promise.all(
        this.resourceIds.map(id => ResourceManager.getInstance().unregister(id))
      );
      
      this.resourceIds = [];
    }
  };
} 