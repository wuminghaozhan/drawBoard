export class ExportManager {
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  public saveAsImage(filename: string = 'drawboard.png'): void {
    const link = document.createElement('a');
    link.download = filename;
    link.href = this.canvas.toDataURL('image/png');
    link.click();
  }

  public saveAsJPEG(filename: string = 'drawboard.jpg', quality: number = 0.8): void {
    const link = document.createElement('a');
    link.download = filename;
    link.href = this.canvas.toDataURL('image/jpeg', quality);
    link.click();
  }

  public getDataURL(type: string = 'image/png', quality?: number): string {
    return this.canvas.toDataURL(type, quality);
  }

  public getBlob(type: string = 'image/png', quality?: number): Promise<Blob> {
    return new Promise((resolve) => {
      this.canvas.toBlob((blob) => {
        resolve(blob!);
      }, type, quality);
    });
  }

  public copyToClipboard(): Promise<boolean> {
    return new Promise((resolve) => {
      this.canvas.toBlob((blob) => {
        if (blob) {
          navigator.clipboard.write([
            new ClipboardItem({
              'image/png': blob
            })
          ]).then(() => resolve(true))
            .catch(() => resolve(false));
        } else {
          resolve(false);
        }
      });
    });
  }

  /**
   * 销毁导出管理器，清理所有资源
   */
  public destroy(): void {
    // ExportManager主要持有Canvas引用，不需要强制清理
    // Canvas的生命周期由CanvasEngine管理
    console.log('🗑️ ExportManager destroyed');
  }
} 