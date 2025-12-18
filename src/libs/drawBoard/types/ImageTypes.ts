/**
 * 图片相关类型定义
 * 
 * 独立文件以避免循环依赖
 */

import type { DrawAction } from '../tools/DrawTool';

/**
 * 图片存储方式
 */
export type ImageSourceType = 'url' | 'base64' | 'blob';

/**
 * 图片加载状态
 */
export type ImageLoadState = 'pending' | 'loading' | 'loaded' | 'error';

/**
 * 图片 Action 接口
 * 
 * 图片作为一种特殊的 action，具有以下特性：
 * - 位置：通过 points[0] 表示左上角坐标
 * - 尺寸：通过 imageWidth 和 imageHeight 表示显示尺寸
 * - 源数据：通过 imageUrl 存储图片 URL 或 base64
 * - 缓存：通过 imageElement 缓存已加载的图片元素（运行时使用，不序列化）
 */
export interface ImageAction extends DrawAction {
  /** 工具类型固定为 'image' */
  type: 'image';
  
  // ============================================
  // 图片源数据
  // ============================================
  /** 图片 URL 或 base64 字符串 */
  imageUrl: string;
  
  /** 图片源类型（可选，用于优化加载策略） */
  imageSourceType?: ImageSourceType;
  
  /** 图片原始宽度（像素，可选，用于保持宽高比） */
  originalWidth?: number;
  
  /** 图片原始高度（像素，可选，用于保持宽高比） */
  originalHeight?: number;
  
  // ============================================
  // 显示属性
  // ============================================
  /** 图片显示宽度（像素） */
  imageWidth: number;
  
  /** 图片显示高度（像素） */
  imageHeight: number;
  
  /** 是否保持宽高比（可选，默认 false） */
  maintainAspectRatio?: boolean;
  
  // ============================================
  // 运行时属性（不序列化）
  // ============================================
  /** 缓存的图片元素（运行时使用，导出时会被忽略） */
  imageElement?: HTMLImageElement | ImageBitmap;
  
  /** 图片加载状态（运行时使用） */
  loadState?: ImageLoadState;
  
  /** 图片加载错误信息（运行时使用） */
  loadError?: string;
  
  // ============================================
  // 变换属性（可选）
  // ============================================
  /** 旋转角度（度，可选） */
  rotation?: number;
  
  /** 水平缩放比例（可选，默认 1） */
  scaleX?: number;
  
  /** 垂直缩放比例（可选，默认 1） */
  scaleY?: number;
  
  /** 透明度（0-1，可选，默认 1） */
  opacity?: number;
  
  // ============================================
  // 裁剪属性（可选）
  // ============================================
  /** 裁剪区域 x 坐标（相对于原始图片，可选） */
  cropX?: number;
  
  /** 裁剪区域 y 坐标（相对于原始图片，可选） */
  cropY?: number;
  
  /** 裁剪区域宽度（可选） */
  cropWidth?: number;
  
  /** 裁剪区域高度（可选） */
  cropHeight?: number;
  
  // ============================================
  // 元数据（可选）
  // ============================================
  /** 图片文件名（可选） */
  fileName?: string;
  
  /** 图片 MIME 类型（可选，如 'image/png', 'image/jpeg'） */
  mimeType?: string;
  
  /** 图片文件大小（字节，可选） */
  fileSize?: number;
  
  /** 图片描述（可选） */
  description?: string;
  
  /** 图片标签（可选，用于分类和搜索） */
  tags?: string[];
}

/**
 * 图片工具事件类型
 */
export type ImageToolEventType = 
  | 'imageCreated'      // 图片创建
  | 'imageUpdated'      // 图片更新
  | 'imageLoaded'       // 图片加载完成
  | 'imageLoadError';   // 图片加载失败

/**
 * 图片工具事件处理器
 */
export type ImageToolEventHandler = (event: { 
  type: ImageToolEventType; 
  action?: ImageAction; 
  actionId?: string | null;
  error?: Error;
}) => void;

/**
 * 图片 Action 创建选项
 */
export interface CreateImageActionOptions {
  /** 图片 URL 或 base64 */
  imageUrl: string;
  
  /** 图片位置（左上角坐标） */
  position: { x: number; y: number };
  
  /** 显示宽度（可选，默认 200） */
  width?: number;
  
  /** 显示高度（可选，默认 200） */
  height?: number;
  
  /** 是否保持宽高比（可选，默认 false） */
  maintainAspectRatio?: boolean;
  
  /** 图片源类型（可选，自动检测） */
  sourceType?: ImageSourceType;
  
  /** 图片文件名（可选） */
  fileName?: string;
  
  /** 图片 MIME 类型（可选） */
  mimeType?: string;
  
  /** 图片文件大小（可选） */
  fileSize?: number;
  
  /** 图片描述（可选） */
  description?: string;
  
  /** 图片标签（可选） */
  tags?: string[];
}

/**
 * 图片 Action 更新选项
 */
export interface UpdateImageActionOptions {
  /** 更新位置（可选） */
  position?: { x: number; y: number };
  
  /** 更新显示宽度（可选） */
  width?: number;
  
  /** 更新显示高度（可选） */
  height?: number;
  
  /** 更新旋转角度（可选） */
  rotation?: number;
  
  /** 更新缩放比例（可选） */
  scale?: { x?: number; y?: number };
  
  /** 更新透明度（可选） */
  opacity?: number;
  
  /** 更新裁剪区域（可选） */
  crop?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
  
  /** 更新描述（可选） */
  description?: string;
  
  /** 更新标签（可选） */
  tags?: string[];
}

/**
 * 图片工具接口
 * 定义 ImageTool 对外暴露的所有方法
 */
export interface ImageToolInterface {
  /** 创建图片 Action */
  createImageAction(options: CreateImageActionOptions): ImageAction;
  
  /** 更新图片 Action */
  updateImageAction(action: ImageAction, options: UpdateImageActionOptions): ImageAction;
  
  /** 预加载图片 */
  preloadImage(url: string): Promise<void>;
  
  /** 清理图片缓存 */
  clearCache(): void;
  
  /** 获取图片缓存统计 */
  getCacheStats(): {
    cacheSize: number;
    cachedUrls: string[];
  };
  
  /** 订阅事件 */
  on(handler: ImageToolEventHandler): () => void;
  
  /** 销毁 */
  destroy(): void;
}

