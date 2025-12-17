/**
 * DrawBoard 数据导出器
 * 
 * 支持导出画布数据为 JSON 格式，包含：
 * - 所有绘制动作 (actions)
 * - 虚拟图层配置 (layers)
 * - 画布配置 (config)
 * - 版本信息 (version)
 * 
 * 支持两种格式：
 * - v1: 原始 DrawAction 格式（向后兼容）
 * - v2: 标准化 Shape 格式（语义化）
 */

import type { DrawAction } from '../tools/DrawTool';
import type { VirtualLayer } from '../core/VirtualLayerManager';
import { logger } from '../infrastructure/logging/Logger';
import { ShapeConverter } from './ShapeConverter';
import type { 
  DrawBoardDocument, 
  Shape, 
  LayerInfo, 
  CanvasConfig,
  Metadata
} from '../types/ExportFormats';
import { FORMAT_VERSION, APP_VERSION } from '../types/ExportFormats';

// ============================================
// 导出数据格式定义
// ============================================

/**
 * 导出数据版本
 * 用于向后兼容性检查
 */
export const EXPORT_VERSION = '1.0.0';

/**
 * 导出的图层数据（剔除运行时属性）
 */
export interface ExportedLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  locked: boolean;
  zIndex: number;
  actionIds: string[];
}

/**
 * 基础样式上下文
 */
export interface ExportedContext {
  strokeStyle: string;
  fillStyle: string;
  lineWidth: number;
  lineCap?: string;
  lineJoin?: string;
  globalAlpha?: number;
}

/**
 * 点坐标
 */
export interface ExportedPoint {
  x: number;
  y: number;
  pressure?: number;
}

/**
 * 画笔动作 - 点数组
 */
export interface ExportedPenAction {
  id: string;
  type: 'pen';
  /** 画笔路径点 */
  points: ExportedPoint[];
  context: ExportedContext;
  timestamp: number;
  virtualLayerId?: string;
  rotation?: number;
}

/**
 * 圆形动作 - 圆心 + 半径
 */
export interface ExportedCircleAction {
  id: string;
  type: 'circle';
  /** 圆心坐标 */
  center: { x: number; y: number };
  /** 半径 */
  radius: number;
  context: ExportedContext;
  timestamp: number;
  virtualLayerId?: string;
  rotation?: number;
}

/**
 * 矩形动作 - 4顶点格式（支持旋转）
 * 顶点顺序：左上、右上、右下、左下（顺时针）
 */
export interface ExportedRectAction {
  id: string;
  type: 'rect';
  /** 4个顶点坐标（顺时针：左上、右上、右下、左下） */
  vertices: Array<{ x: number; y: number }>;
  context: ExportedContext;
  timestamp: number;
  virtualLayerId?: string;
  rotation?: number;
}

/**
 * 直线动作 - 起点 + 终点
 */
export interface ExportedLineAction {
  id: string;
  type: 'line';
  /** 起点 */
  start: { x: number; y: number };
  /** 终点 */
  end: { x: number; y: number };
  context: ExportedContext;
  timestamp: number;
  virtualLayerId?: string;
  rotation?: number;
}

/**
 * 多边形动作 - 支持两种格式
 * 1. center-radius: 中心 + 半径 + 边数（规则多边形）
 * 2. vertices: 顶点数组（变换后的多边形）
 */
export interface ExportedPolygonAction {
  id: string;
  type: 'polygon';
  /** 格式类型 */
  format: 'center-radius' | 'vertices';
  /** 多边形类型 */
  polygonType: string;
  /** 中心点（center-radius 格式） */
  center?: { x: number; y: number };
  /** 外接圆半径（center-radius 格式） */
  radius?: number;
  /** 边数 */
  sides?: number;
  /** 内半径（星形） */
  innerRadius?: number;
  /** 多边形顶点（vertices 格式） */
  vertices?: Array<{ x: number; y: number }>;
  /** 是否闭合 */
  closed?: boolean;
  context: ExportedContext;
  timestamp: number;
  virtualLayerId?: string;
  rotation?: number;
}

/**
 * 文本动作 - 位置 + 文本内容
 */
export interface ExportedTextAction {
  id: string;
  type: 'text';
  /** 文本位置 */
  position: { x: number; y: number };
  /** 文本内容 */
  text: string;
  /** 字体大小 */
  fontSize: number;
  /** 字体族 */
  fontFamily: string;
  /** 文本对齐 */
  textAlign?: string;
  /** 文本框宽度（多行时） */
  width?: number;
  /** 行高 */
  lineHeight?: number;
  context: ExportedContext;
  timestamp: number;
  virtualLayerId?: string;
  rotation?: number;
}

/**
 * 橡皮擦动作 - 擦除路径
 */
export interface ExportedEraserAction {
  id: string;
  type: 'eraser';
  /** 擦除路径点 */
  points: ExportedPoint[];
  /** 橡皮擦大小 */
  size: number;
  timestamp: number;
  virtualLayerId?: string;
}

/**
 * 导出的 Action 联合类型
 */
export type ExportedAction = 
  | ExportedPenAction 
  | ExportedCircleAction 
  | ExportedRectAction 
  | ExportedLineAction 
  | ExportedPolygonAction 
  | ExportedTextAction
  | ExportedEraserAction;

/**
 * 画布配置
 */
export interface ExportedConfig {
  width: number;
  height: number;
  backgroundColor?: string;
  virtualLayerMode?: 'grouped' | 'individual';
}

/**
 * 完整导出数据结构
 */
export interface DrawBoardExportData {
  /** 版本号 */
  version: string;
  /** 导出时间 */
  exportedAt: string;
  /** 画布配置 */
  config: ExportedConfig;
  /** 图层列表 */
  layers: ExportedLayer[];
  /** 动作列表 */
  actions: ExportedAction[];
  /** 元数据 */
  metadata?: {
    name?: string;
    description?: string;
    author?: string;
    tags?: string[];
  };
}

/**
 * 导出选项
 */
export interface ExportOptions {
  /** 是否包含图层信息 */
  includeLayers?: boolean;
  /** 是否压缩 JSON（移除空格） */
  minify?: boolean;
  /** 是否包含元数据 */
  includeMetadata?: boolean;
  /** 元数据 */
  metadata?: DrawBoardExportData['metadata'];
  /** 文件名 */
  filename?: string;
}

// ============================================
// 数据导出器
// ============================================

export class DataExporter {
  /**
   * 提取通用上下文
   */
  private static extractContext(action: DrawAction): ExportedContext {
    return {
      strokeStyle: String(action.context.strokeStyle || '#000000'),
      fillStyle: String(action.context.fillStyle || 'transparent'),
      lineWidth: action.context.lineWidth || 1,
      ...(action.context.lineCap && { lineCap: action.context.lineCap }),
      ...(action.context.lineJoin && { lineJoin: action.context.lineJoin }),
      ...(action.context.globalAlpha !== undefined && { globalAlpha: action.context.globalAlpha })
    };
  }

  /**
   * 将 DrawAction 转换为导出格式（语义化结构）
   */
  public static exportAction(action: DrawAction): ExportedAction {
    const context = this.extractContext(action);
    const actionAny = action as Record<string, unknown>;
    const rotation = actionAny.rotation as number | undefined;

    switch (action.type) {
      case 'pen': {
        // 画笔：点数组
        return {
          id: action.id,
          type: 'pen',
          points: action.points.map(p => ({
            x: p.x,
            y: p.y,
            ...(p.pressure !== undefined && { pressure: p.pressure })
          })),
          context,
          timestamp: action.timestamp,
          ...(action.virtualLayerId && { virtualLayerId: action.virtualLayerId }),
          ...(rotation !== undefined && { rotation })
        };
      }

      case 'circle': {
        // 圆形：圆心 + 半径
        // 绘制时使用 points[0] 作为圆心，points[length-1] 作为圆周上的点
        const center = action.points[0] || { x: 0, y: 0 };
        const edgePoint = action.points[action.points.length - 1] || center;
        const radius = Math.sqrt(
          Math.pow(edgePoint.x - center.x, 2) + 
          Math.pow(edgePoint.y - center.y, 2)
        );
        
        return {
          id: action.id,
          type: 'circle',
          center: { x: center.x, y: center.y },
          radius,
          context,
          timestamp: action.timestamp,
          ...(action.virtualLayerId && { virtualLayerId: action.virtualLayerId }),
          ...(rotation !== undefined && { rotation })
        };
      }

      case 'rect': {
        // 矩形：4顶点格式（支持旋转）
        // 顶点顺序：左上、右上、右下、左下
        const vertices = action.points.map(p => ({ x: p.x, y: p.y }));
        
        return {
          id: action.id,
          type: 'rect',
          vertices,
          context,
          timestamp: action.timestamp,
          ...(action.virtualLayerId && { virtualLayerId: action.virtualLayerId }),
          ...(rotation !== undefined && { rotation })
        };
      }

      case 'line': {
        // 直线：起点 + 终点
        // 绘制时使用 points[0] 作为起点，points[length-1] 作为终点
        const start = action.points[0] || { x: 0, y: 0 };
        const end = action.points[action.points.length - 1] || start;
        
        return {
          id: action.id,
          type: 'line',
          start: { x: start.x, y: start.y },
          end: { x: end.x, y: end.y },
          context,
          timestamp: action.timestamp,
          ...(action.virtualLayerId && { virtualLayerId: action.virtualLayerId }),
          ...(rotation !== undefined && { rotation })
        };
      }

      case 'polygon': {
        // 多边形统一使用顶点列表格式，支持旋转
        const polygonType = actionAny.polygonType as string || 'custom';
        
        return {
          id: action.id,
          type: 'polygon',
          vertices: action.points.map(p => ({ x: p.x, y: p.y })),
          polygonType,
          closed: true,
          context,
          timestamp: action.timestamp,
          ...(action.virtualLayerId && { virtualLayerId: action.virtualLayerId }),
          ...(rotation !== undefined && { rotation })
        };
      }

      case 'text': {
        // 文本：位置 + 内容
        const position = action.points[0] || { x: 0, y: 0 };
        
        return {
          id: action.id,
          type: 'text',
          position: { x: position.x, y: position.y },
          text: action.text || '',
          fontSize: (actionAny.fontSize as number) || 16,
          fontFamily: (actionAny.fontFamily as string) || 'sans-serif',
          ...(actionAny.textAlign && { textAlign: actionAny.textAlign as string }),
          ...(actionAny.width !== undefined && { width: actionAny.width as number }),
          ...(actionAny.lineHeight !== undefined && { lineHeight: actionAny.lineHeight as number }),
          context,
          timestamp: action.timestamp,
          ...(action.virtualLayerId && { virtualLayerId: action.virtualLayerId }),
          ...(rotation !== undefined && { rotation })
        };
      }

      case 'eraser': {
        // 橡皮擦：擦除路径
        return {
          id: action.id,
          type: 'eraser',
          points: action.points.map(p => ({ x: p.x, y: p.y })),
          size: action.context.lineWidth || 10,
          timestamp: action.timestamp,
          ...(action.virtualLayerId && { virtualLayerId: action.virtualLayerId })
        };
      }

      default: {
        // 未知类型：使用通用 pen 格式
        return {
          id: action.id,
          type: 'pen',
          points: action.points.map(p => ({
            x: p.x,
            y: p.y,
            ...(p.pressure !== undefined && { pressure: p.pressure })
          })),
          context,
          timestamp: action.timestamp,
          ...(action.virtualLayerId && { virtualLayerId: action.virtualLayerId }),
          ...(rotation !== undefined && { rotation })
        };
      }
    }
  }

  /**
   * 将 VirtualLayer 转换为导出格式
   */
  public static exportLayer(layer: VirtualLayer): ExportedLayer {
    return {
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      opacity: layer.opacity,
      locked: layer.locked,
      zIndex: layer.zIndex,
      actionIds: [...layer.actionIds]
    };
  }

  /**
   * 导出完整数据
   */
  public static exportData(
    actions: DrawAction[],
    layers: VirtualLayer[],
    config: ExportedConfig,
    options: ExportOptions = {}
  ): DrawBoardExportData {
    const data: DrawBoardExportData = {
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      config,
      layers: options.includeLayers !== false 
        ? layers.map(l => this.exportLayer(l)) 
        : [],
      actions: actions.map(a => this.exportAction(a))
    };

    if (options.includeMetadata && options.metadata) {
      data.metadata = options.metadata;
    }

    logger.info('数据导出完成', {
      version: EXPORT_VERSION,
      actionsCount: data.actions.length,
      layersCount: data.layers.length
    });

    return data;
  }

  /**
   * 导出为 JSON 字符串
   */
  public static exportToJSON(
    actions: DrawAction[],
    layers: VirtualLayer[],
    config: ExportedConfig,
    options: ExportOptions = {}
  ): string {
    const data = this.exportData(actions, layers, config, options);
    return options.minify 
      ? JSON.stringify(data) 
      : JSON.stringify(data, null, 2);
  }

  /**
   * 下载为 JSON 文件
   */
  public static downloadAsJSON(
    actions: DrawAction[],
    layers: VirtualLayer[],
    config: ExportedConfig,
    options: ExportOptions = {}
  ): void {
    const json = this.exportToJSON(actions, layers, config, options);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = options.filename || `drawboard-${Date.now()}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
    
    logger.info('JSON 文件下载完成', { filename: link.download });
  }

  /**
   * 复制 JSON 到剪贴板
   */
  public static async copyToClipboard(
    actions: DrawAction[],
    layers: VirtualLayer[],
    config: ExportedConfig,
    options: ExportOptions = {}
  ): Promise<boolean> {
    try {
      const json = this.exportToJSON(actions, layers, config, options);
      await navigator.clipboard.writeText(json);
      logger.info('JSON 已复制到剪贴板');
      return true;
    } catch (error) {
      logger.error('复制到剪贴板失败', { error });
      return false;
    }
  }

  // ============================================
  // 标准格式 v2（语义化 Shape 格式）
  // ============================================

  /**
   * 导出为标准 DrawBoardDocument 格式（v2）
   * 每种形状都有独立的语义化结构
   */
  public static exportAsDocument(
    actions: DrawAction[],
    layers: VirtualLayer[],
    canvasConfig: { width: number; height: number; backgroundColor?: string },
    metadata?: Metadata
  ): DrawBoardDocument {
    // 转换形状
    const shapes = ShapeConverter.toShapes(actions);

    // 转换图层
    const layerInfos: LayerInfo[] = layers.map(layer => ({
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      opacity: layer.opacity,
      locked: layer.locked,
      zIndex: layer.zIndex,
      shapeIds: [...layer.actionIds]
    }));

    const doc: DrawBoardDocument = {
      formatVersion: FORMAT_VERSION,
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      canvas: {
        width: canvasConfig.width,
        height: canvasConfig.height,
        backgroundColor: canvasConfig.backgroundColor
      },
      layers: layerInfos,
      shapes,
      metadata
    };

    logger.info('导出为标准文档格式', {
      formatVersion: FORMAT_VERSION,
      shapesCount: shapes.length,
      layersCount: layerInfos.length
    });

    return doc;
  }

  /**
   * 导出为标准格式 JSON 字符串
   */
  public static exportDocumentToJSON(
    actions: DrawAction[],
    layers: VirtualLayer[],
    canvasConfig: { width: number; height: number; backgroundColor?: string },
    metadata?: Metadata,
    minify: boolean = false
  ): string {
    const doc = this.exportAsDocument(actions, layers, canvasConfig, metadata);
    return minify ? JSON.stringify(doc) : JSON.stringify(doc, null, 2);
  }

  /**
   * 下载为标准格式文件
   */
  public static downloadAsDocument(
    actions: DrawAction[],
    layers: VirtualLayer[],
    canvasConfig: { width: number; height: number; backgroundColor?: string },
    filename: string = `drawboard-${Date.now()}.json`,
    metadata?: Metadata
  ): void {
    const json = this.exportDocumentToJSON(actions, layers, canvasConfig, metadata);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    
    URL.revokeObjectURL(url);
    
    logger.info('标准文档文件下载完成', { filename });
  }
}

