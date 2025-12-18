import { DrawTool } from './DrawTool';
import type { DrawAction } from './DrawTool';
import type { ImageAction, CreateImageActionOptions, UpdateImageActionOptions, ImageToolEventHandler, ImageToolEventType } from '../types/ImageTypes';
import { logger } from '../infrastructure/logging/Logger';

/**
 * 图片工具
 * 
 * 功能：
 * - 在画布上插入图片
 * - 支持 URL、base64 和 blob 格式
 * - 默认大小：200x200 像素
 * - 支持图片缓存以提高性能
 * - 支持图片变换（旋转、缩放、透明度）
 * - 支持图片裁剪
 */
export class ImageTool extends DrawTool {
  // 默认图片大小
  private static readonly DEFAULT_WIDTH = 200;
  private static readonly DEFAULT_HEIGHT = 200;

  // 图片缓存（避免重复加载）
  private imageCache: Map<string, HTMLImageElement | ImageBitmap> = new Map();
  
  // 事件处理器
  private eventHandlers: Set<ImageToolEventHandler> = new Set();

  constructor() {
    super('图片', 'image');
  }

  /**
   * 绘制图片
   */
  public draw(ctx: CanvasRenderingContext2D, action: DrawAction): void {
    if (action.type !== 'image') {
      logger.warn('ImageTool: action 类型不匹配', { expected: 'image', actual: action.type });
      return;
    }

    const imageAction = action as ImageAction;

    // 检查必要属性
    if (!imageAction.imageUrl || imageAction.points.length === 0) {
      logger.warn('ImageTool: 缺少必要属性', { 
        hasUrl: !!imageAction.imageUrl, 
        hasPoints: imageAction.points.length > 0 
      });
      return;
    }

    const point = imageAction.points[0];
    const width = imageAction.imageWidth || ImageTool.DEFAULT_WIDTH;
    const height = imageAction.imageHeight || ImageTool.DEFAULT_HEIGHT;

    // 保存上下文状态
    ctx.save();

    // 应用透明度
    if (imageAction.opacity !== undefined && imageAction.opacity !== 1) {
      ctx.globalAlpha = imageAction.opacity;
    }

    // 应用变换（旋转、缩放）
    if (imageAction.rotation || imageAction.scaleX || imageAction.scaleY) {
      const centerX = point.x + width / 2;
      const centerY = point.y + height / 2;
      
      ctx.translate(centerX, centerY);
      
      if (imageAction.rotation) {
        ctx.rotate((imageAction.rotation * Math.PI) / 180);
      }
      
      const scaleX = imageAction.scaleX ?? 1;
      const scaleY = imageAction.scaleY ?? 1;
      if (scaleX !== 1 || scaleY !== 1) {
        ctx.scale(scaleX, scaleY);
      }
      
      ctx.translate(-centerX, -centerY);
    }

    // 如果有缓存的图片元素，直接绘制
    if (imageAction.imageElement && this.isValidImage(imageAction.imageElement)) {
      this.drawImageElement(ctx, imageAction.imageElement, point.x, point.y, width, height, imageAction);
      ctx.restore();
      return;
    }

    // 尝试从缓存获取
    const cachedImage = this.imageCache.get(imageAction.imageUrl);
    if (cachedImage && this.isValidImage(cachedImage)) {
      this.drawImageElement(ctx, cachedImage, point.x, point.y, width, height, imageAction);
      // 更新 action 的缓存引用
      imageAction.imageElement = cachedImage;
      imageAction.loadState = 'loaded';
      ctx.restore();
      return;
    }
    
    // 如果缓存中的图片无效，清除缓存
    if (cachedImage && !this.isValidImage(cachedImage)) {
      this.imageCache.delete(imageAction.imageUrl);
      logger.warn('ImageTool: 缓存中的图片无效，已清除', { url: imageAction.imageUrl });
    }

    // 异步加载图片（首次绘制时）
    this.loadAndDrawImage(ctx, imageAction, point.x, point.y, width, height);
    ctx.restore();
  }

  /**
   * 检查图片是否有效
   */
  public isValidImage(image: HTMLImageElement | ImageBitmap | undefined): boolean {
    if (!image) return false;
    
    // 检查 HTMLImageElement
    if (image instanceof HTMLImageElement) {
      return image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
    }
    
    // 检查 ImageBitmap
    if (image instanceof ImageBitmap) {
      return image.width > 0 && image.height > 0;
    }
    
    return false;
  }

  /**
   * 绘制图片元素
   */
  private drawImageElement(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement | ImageBitmap,
    x: number,
    y: number,
    width: number,
    height: number,
    action?: ImageAction
  ): void {
    try {
      // 再次验证图片有效性
      if (!this.isValidImage(image)) {
        logger.warn('ImageTool: 尝试绘制无效的图片', { 
          imageType: image instanceof HTMLImageElement ? 'HTMLImageElement' : 'ImageBitmap',
          url: action?.imageUrl 
        });
        // 绘制占位符
        this.drawPlaceholder(ctx, x, y, width, height);
        return;
      }
      
      // 如果有裁剪区域，使用裁剪绘制
      if (action?.cropX !== undefined && action?.cropY !== undefined && 
          action?.cropWidth !== undefined && action?.cropHeight !== undefined) {
        ctx.drawImage(
          image,
          action.cropX, action.cropY, action.cropWidth, action.cropHeight,  // 源裁剪区域
          x, y, width, height  // 目标区域
        );
      } else {
        // 正常绘制
        ctx.drawImage(image, x, y, width, height);
      }
    } catch (error) {
      logger.error('ImageTool: 绘制图片失败', { 
        error, 
        url: action?.imageUrl,
        imageType: image instanceof HTMLImageElement ? 'HTMLImageElement' : 'ImageBitmap',
        imageWidth: image instanceof HTMLImageElement ? image.naturalWidth : image.width,
        imageHeight: image instanceof HTMLImageElement ? image.naturalHeight : image.height
      });
      // 绘制占位符
      this.drawPlaceholder(ctx, x, y, width, height);
    }
  }

  /**
   * 异步加载并绘制图片
   */
  private async loadAndDrawImage(
    ctx: CanvasRenderingContext2D,
    action: ImageAction,
    x: number,
    y: number,
    width: number,
    height: number
  ): Promise<void> {
    try {
      const image = await this.loadImage(action.imageUrl);
      
      // 验证图片是否有效
      if (!this.isValidImage(image)) {
        throw new Error('图片加载完成但无效');
      }
      
      // 缓存图片
      this.imageCache.set(action.imageUrl, image);
      action.imageElement = image;
      action.loadState = 'loaded';
      
      // 如果图片有原始尺寸信息，更新它
      if (!action.originalWidth || !action.originalHeight) {
        if (image instanceof HTMLImageElement) {
          action.originalWidth = image.naturalWidth;
          action.originalHeight = image.naturalHeight;
        } else {
          action.originalWidth = image.width;
          action.originalHeight = image.height;
        }
      }

      // 触发加载完成事件
      this.emit({ type: 'imageLoaded', action });

      // ⚠️ 注意：这里不绘制，因为 ctx 可能已经无效
      // 图片加载完成后，应该通过事件触发重绘
      // 这里绘制到传入的 ctx 可能已经无效（重绘已完成）
    } catch (error) {
      logger.error('ImageTool: 加载图片失败', { url: action.imageUrl, error });
      
      action.loadState = 'error';
      action.loadError = error instanceof Error ? error.message : String(error);
      
      // 触发加载失败事件
      this.emit({ 
        type: 'imageLoadError', 
        action, 
        error: error instanceof Error ? error : new Error(String(error))
      });
      
      // 绘制占位符
      this.drawPlaceholder(ctx, x, y, width, height);
    }
  }

  /**
   * 加载图片
   */
  private async loadImage(url: string): Promise<HTMLImageElement | ImageBitmap> {
    return new Promise((resolve, reject) => {
      // 如果是 base64，直接创建 Image 对象
      if (url.startsWith('data:')) {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
        return;
      }

      // 如果是 URL，尝试使用 createImageBitmap（性能更好）
      if (typeof createImageBitmap !== 'undefined') {
        fetch(url)
          .then(response => response.blob())
          .then(blob => createImageBitmap(blob))
          .then(bitmap => resolve(bitmap))
          .catch(() => {
            // 降级到 Image 对象
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = url;
          });
      } else {
        // 降级到 Image 对象
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      }
    });
  }

  /**
   * 绘制占位符（图片加载失败时）
   */
  private drawPlaceholder(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    const originalFillStyle = ctx.fillStyle;
    const originalStrokeStyle = ctx.strokeStyle;
    const originalLineWidth = ctx.lineWidth;

    // 绘制灰色背景
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(x, y, width, height);

    // 绘制边框
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);

    // 绘制占位符文本
    ctx.fillStyle = '#999999';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('图片加载失败', x + width / 2, y + height / 2);

    // 恢复上下文
    ctx.fillStyle = originalFillStyle;
    ctx.strokeStyle = originalStrokeStyle;
    ctx.lineWidth = originalLineWidth;
  }

  /**
   * 获取工具类型
   */
  public getActionType(): string {
    return 'image';
  }

  /**
   * 创建图片 Action
   */
  public createImageAction(options: CreateImageActionOptions): ImageAction {
    const id = `image-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // 检测图片源类型
    const sourceType = options.sourceType || this.detectSourceType(options.imageUrl);
    
    const action: ImageAction = {
      id,
      type: 'image',
      points: [options.position],
      context: {
        strokeStyle: 'transparent',
        lineWidth: 0,
        fillStyle: 'transparent'
      },
      timestamp: Date.now(),
      imageUrl: options.imageUrl,
      imageSourceType: sourceType,
      imageWidth: options.width || ImageTool.DEFAULT_WIDTH,
      imageHeight: options.height || ImageTool.DEFAULT_HEIGHT,
      maintainAspectRatio: options.maintainAspectRatio || false,
      supportsCaching: true,
      complexityScore: 10,
      loadState: 'pending',
      opacity: 1,
      scaleX: 1,
      scaleY: 1
    };
    
    // 可选属性
    if (options.fileName) action.fileName = options.fileName;
    if (options.mimeType) action.mimeType = options.mimeType;
    if (options.fileSize) action.fileSize = options.fileSize;
    if (options.description) action.description = options.description;
    if (options.tags) action.tags = options.tags;
    
    // 触发事件
    this.emit({ type: 'imageCreated', action });
    
    return action;
  }
  
  /**
   * 更新图片 Action
   */
  public updateImageAction(action: ImageAction, options: UpdateImageActionOptions): ImageAction {
    const updated = { ...action };
    
    if (options.position) {
      updated.points = [options.position];
    }
    
    if (options.width !== undefined) updated.imageWidth = options.width;
    if (options.height !== undefined) updated.imageHeight = options.height;
    if (options.rotation !== undefined) updated.rotation = options.rotation;
    if (options.opacity !== undefined) updated.opacity = options.opacity;
    
    if (options.scale) {
      if (options.scale.x !== undefined) updated.scaleX = options.scale.x;
      if (options.scale.y !== undefined) updated.scaleY = options.scale.y;
    }
    
    if (options.crop) {
      if (options.crop.x !== undefined) updated.cropX = options.crop.x;
      if (options.crop.y !== undefined) updated.cropY = options.crop.y;
      if (options.crop.width !== undefined) updated.cropWidth = options.crop.width;
      if (options.crop.height !== undefined) updated.cropHeight = options.crop.height;
    }
    
    if (options.description !== undefined) updated.description = options.description;
    if (options.tags !== undefined) updated.tags = options.tags;
    
    // 触发事件
    this.emit({ type: 'imageUpdated', action: updated });
    
    return updated;
  }
  
  /**
   * 检测图片源类型
   */
  private detectSourceType(url: string): 'url' | 'base64' | 'blob' {
    if (url.startsWith('data:')) {
      return 'base64';
    }
    if (url.startsWith('blob:')) {
      return 'blob';
    }
    return 'url';
  }
  
  /**
   * 触发事件
   */
  private emit(event: { type: ImageToolEventType; action?: ImageAction; actionId?: string | null; error?: Error }): void {
    this.eventHandlers.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        logger.error('ImageTool: 事件处理器执行失败', error);
      }
    });
  }
  
  /**
   * 订阅事件
   */
  public on(handler: ImageToolEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }
  
  /**
   * 获取缓存统计
   */
  public getCacheStats(): { cacheSize: number; cachedUrls: string[] } {
    return {
      cacheSize: this.imageCache.size,
      cachedUrls: Array.from(this.imageCache.keys())
    };
  }
  
  /**
   * 获取缓存的图片（用于预加载后设置到 action）
   */
  public getCachedImage(url: string): HTMLImageElement | ImageBitmap | undefined {
    return this.imageCache.get(url);
  }
  
  /**
   * 销毁工具
   */
  public destroy(): void {
    this.clearCache();
    this.eventHandlers.clear();
    logger.debug('ImageTool: 工具已销毁');
  }

  /**
   * 清理图片缓存
   */
  public clearCache(): void {
    this.imageCache.clear();
    logger.debug('ImageTool: 图片缓存已清理');
  }

  /**
   * 预加载图片（可选，用于提前加载）
   */
  public async preloadImage(url: string): Promise<void> {
    if (this.imageCache.has(url)) {
      return;  // 已缓存
    }

    try {
      const image = await this.loadImage(url);
      this.imageCache.set(url, image);
      logger.debug('ImageTool: 图片预加载成功', { url });
    } catch (error) {
      logger.warn('ImageTool: 图片预加载失败', { url, error });
      throw error;
    }
  }
  
  /**
   * 静态方法：创建图片 Action（向后兼容）
   * @deprecated 使用 createImageAction 方法代替
   */
  public static createImageAction(
    imageUrl: string,
    x: number,
    y: number,
    width: number = ImageTool.DEFAULT_WIDTH,
    height: number = ImageTool.DEFAULT_HEIGHT
  ): ImageAction {
    const tool = new ImageTool();
    return tool.createImageAction({
      imageUrl,
      position: { x, y },
      width,
      height
    });
  }
}

