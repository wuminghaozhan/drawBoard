import { logger } from '../infrastructure/logging/Logger';

/**
 * 导出管理器
 * 负责画布内容的导出（PNG/JPEG/Blob/剪贴板）
 */
export class ExportManager {
  private canvas: HTMLCanvasElement | null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  /**
   * 下载文件的通用方法
   */
  private downloadAsImage(filename: string, mimeType: string, quality?: number): void {
    if (!this.canvas) {
      logger.warn('ExportManager: Canvas 已销毁');
      return;
    }
    
    const link = document.createElement('a');
    link.download = filename;
    link.href = this.canvas.toDataURL(mimeType, quality);
    link.click();
  }

  /**
   * 保存为 PNG 图片
   */
  public saveAsImage(filename: string = 'drawboard.png'): void {
    this.downloadAsImage(filename, 'image/png');
  }

  /**
   * 保存为 JPEG 图片
   * @param filename 文件名
   * @param quality 质量 0-1，默认 0.8
   */
  public saveAsJPEG(filename: string = 'drawboard.jpg', quality: number = 0.8): void {
    const validQuality = Math.max(0, Math.min(1, quality));
    this.downloadAsImage(filename, 'image/jpeg', validQuality);
  }

  /**
   * 获取 DataURL
   */
  public getDataURL(type: string = 'image/png', quality?: number): string {
    if (!this.canvas) {
      logger.warn('ExportManager: Canvas 已销毁');
      return '';
    }
    
    const validQuality = quality !== undefined ? Math.max(0, Math.min(1, quality)) : undefined;
    return this.canvas.toDataURL(type, validQuality);
  }

  /**
   * 获取 Blob
   */
  public getBlob(type: string = 'image/png', quality?: number): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!this.canvas) {
        logger.warn('ExportManager: Canvas 已销毁');
        resolve(null);
        return;
      }
      
      const validQuality = quality !== undefined ? Math.max(0, Math.min(1, quality)) : undefined;
      this.canvas.toBlob((blob) => {
        if (!blob) {
          logger.warn('ExportManager: 无法创建 Blob（Canvas 可能被污染）');
        }
        resolve(blob);
      }, type, validQuality);
    });
  }

  /**
   * 复制到剪贴板
   */
  public copyToClipboard(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.canvas) {
        logger.warn('ExportManager: Canvas 已销毁');
        resolve(false);
        return;
      }
      
      this.canvas.toBlob((blob) => {
        if (!blob) {
          logger.warn('ExportManager: 无法创建 Blob');
          resolve(false);
          return;
        }
        
        navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ])
          .then(() => {
            logger.debug('ExportManager: 已复制到剪贴板');
            resolve(true);
          })
          .catch((error) => {
            logger.error('ExportManager: 复制到剪贴板失败', error);
            resolve(false);
          });
      });
    });
  }

  /**
   * 销毁导出管理器
   */
  public destroy(): void {
    this.canvas = null;
  }
}
