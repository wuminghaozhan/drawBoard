/**
 * DrawBoard 数据导入器
 * 
 * 支持从 JSON 格式导入画布数据，包含：
 * - 版本兼容性检查
 * - 数据验证
 * - 动作和图层恢复
 */

import type { DrawAction, DrawContext } from '../tools/DrawTool';
import type { Point } from '../core/CanvasEngine';
import { logger } from '../infrastructure/logging/Logger';
import type { 
  DrawBoardExportData, 
  ExportedAction, 
  ExportedLayer,
  EXPORT_VERSION 
} from './DataExporter';

// ============================================
// 导入结果
// ============================================

/**
 * 导入结果
 */
export interface ImportResult {
  success: boolean;
  actions: DrawAction[];
  layers: ExportedLayer[];
  config: DrawBoardExportData['config'];
  errors: string[];
  warnings: string[];
  metadata?: DrawBoardExportData['metadata'];
}

/**
 * 导入选项
 */
export interface ImportOptions {
  /** 是否验证数据 */
  validate?: boolean;
  /** 是否生成新 ID（避免冲突） */
  generateNewIds?: boolean;
  /** 是否合并到现有数据 */
  merge?: boolean;
  /** 版本兼容性检查 */
  strictVersionCheck?: boolean;
}

/**
 * 版本比较结果
 */
type VersionCompareResult = 'equal' | 'older' | 'newer' | 'invalid';

// ============================================
// 数据导入器
// ============================================

export class DataImporter {
  private static readonly SUPPORTED_VERSIONS = ['1.0.0'];
  private static readonly CURRENT_VERSION = '1.0.0';

  /**
   * 比较版本号
   */
  private static compareVersion(version: string): VersionCompareResult {
    if (!version || typeof version !== 'string') {
      return 'invalid';
    }

    const parts = version.split('.').map(Number);
    const currentParts = this.CURRENT_VERSION.split('.').map(Number);

    if (parts.some(isNaN) || parts.length !== 3) {
      return 'invalid';
    }

    for (let i = 0; i < 3; i++) {
      if (parts[i] > currentParts[i]) return 'newer';
      if (parts[i] < currentParts[i]) return 'older';
    }

    return 'equal';
  }

  /**
   * 验证导出数据结构
   */
  private static validateData(data: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!data || typeof data !== 'object') {
      errors.push('数据必须是一个对象');
      return { valid: false, errors };
    }

    const exportData = data as Partial<DrawBoardExportData>;

    // 检查必需字段
    if (!exportData.version) {
      errors.push('缺少版本号 (version)');
    }

    if (!exportData.actions || !Array.isArray(exportData.actions)) {
      errors.push('缺少动作列表 (actions) 或格式不正确');
    }

    if (!exportData.config || typeof exportData.config !== 'object') {
      errors.push('缺少配置 (config) 或格式不正确');
    }

    // 验证每个 action - 根据类型验证不同字段
    if (exportData.actions) {
      exportData.actions.forEach((action, index) => {
        if (!action.id) errors.push(`actions[${index}]: 缺少 id`);
        if (!action.type) errors.push(`actions[${index}]: 缺少 type`);
        if (!action.context || typeof action.context !== 'object') {
          errors.push(`actions[${index}]: 缺少 context 或格式不正确`);
        }
        
        // 根据类型验证必需字段
        const actionAny = action as Record<string, unknown>;
        switch (action.type) {
          case 'pen':
          case 'eraser':
            if (!actionAny.points || !Array.isArray(actionAny.points)) {
              errors.push(`actions[${index}]: pen/eraser 类型需要 points 数组`);
            }
            break;
          case 'circle':
            if (!actionAny.center || actionAny.radius === undefined) {
              errors.push(`actions[${index}]: circle 类型需要 center 和 radius`);
            }
            break;
          case 'rect':
            // 支持新格式（vertices）和旧格式（position + width + height）
            if (!actionAny.vertices && (!actionAny.position || actionAny.width === undefined || actionAny.height === undefined)) {
              errors.push(`actions[${index}]: rect 类型需要 vertices 数组 或 (position, width, height)`);
            }
            break;
          case 'line':
            if (!actionAny.start || !actionAny.end) {
              errors.push(`actions[${index}]: line 类型需要 start 和 end`);
            }
            break;
          case 'polygon':
            // 支持新格式（vertices）和旧格式（center + radius）
            if (!actionAny.vertices && (!actionAny.center || actionAny.radius === undefined)) {
              errors.push(`actions[${index}]: polygon 类型需要 vertices 数组 或 (center, radius)`);
            }
            break;
          case 'text':
            if (!actionAny.position) {
              errors.push(`actions[${index}]: text 类型需要 position`);
            }
            break;
        }
      });
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 将导出的 Action 转换回 DrawAction
   * 支持新的语义化格式和旧的 points 格式
   */
  private static importAction(
    exported: ExportedAction, 
    generateNewId: boolean = false
  ): DrawAction {
    const id = generateNewId 
      ? `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      : exported.id;

    const context: DrawContext = {
      strokeStyle: exported.context.strokeStyle || '#000000',
      fillStyle: exported.context.fillStyle || 'transparent',
      lineWidth: exported.context.lineWidth || 1,
      lineCap: (exported.context.lineCap as CanvasLineCap) || 'round',
      lineJoin: (exported.context.lineJoin as CanvasLineJoin) || 'round',
      globalAlpha: exported.context.globalAlpha ?? 1,
      globalCompositeOperation: 
        (exported.context.globalCompositeOperation as GlobalCompositeOperation) || 'source-over'
    };

    // 将语义化格式转换回 points 数组
    const points: Point[] = this.extractPoints(exported);

    const action: DrawAction = {
      id,
      type: exported.type as DrawAction['type'],
      points,
      context,
      timestamp: exported.timestamp || Date.now()
    };

    // 可选属性
    const exportedAny = exported as Record<string, unknown>;
    if (exportedAny.text) action.text = exportedAny.text as string;
    if (exported.virtualLayerId && !generateNewId) {
      action.virtualLayerId = exported.virtualLayerId;
    }

    // 文本属性
    const actionAny = action as Record<string, unknown>;
    if (exportedAny.width !== undefined) actionAny.width = exportedAny.width;
    if (exportedAny.height !== undefined) actionAny.height = exportedAny.height;
    if (exportedAny.lineHeight !== undefined) actionAny.lineHeight = exportedAny.lineHeight;
    if (exportedAny.fontSize !== undefined) actionAny.fontSize = exportedAny.fontSize;
    if (exportedAny.fontFamily !== undefined) actionAny.fontFamily = exportedAny.fontFamily;
    if (exportedAny.textAlign !== undefined) actionAny.textAlign = exportedAny.textAlign;

    // 图片属性
    if (exported.type === 'image') {
      if (exportedAny.imageUrl !== undefined) actionAny.imageUrl = exportedAny.imageUrl;
      if (exportedAny.imageWidth !== undefined) actionAny.imageWidth = exportedAny.imageWidth;
      if (exportedAny.imageHeight !== undefined) actionAny.imageHeight = exportedAny.imageHeight;
      if (exportedAny.originalWidth !== undefined) actionAny.originalWidth = exportedAny.originalWidth;
      if (exportedAny.originalHeight !== undefined) actionAny.originalHeight = exportedAny.originalHeight;
      if (exportedAny.maintainAspectRatio !== undefined) actionAny.maintainAspectRatio = exportedAny.maintainAspectRatio;
      if (exportedAny.rotation !== undefined) actionAny.rotation = exportedAny.rotation;
      if (exportedAny.scaleX !== undefined) actionAny.scaleX = exportedAny.scaleX;
      if (exportedAny.scaleY !== undefined) actionAny.scaleY = exportedAny.scaleY;
      if (exportedAny.opacity !== undefined) actionAny.opacity = exportedAny.opacity;
      if (exportedAny.crop) {
        actionAny.cropX = exportedAny.crop.x;
        actionAny.cropY = exportedAny.crop.y;
        actionAny.cropWidth = exportedAny.crop.width;
        actionAny.cropHeight = exportedAny.crop.height;
      }
      if (exportedAny.fileName !== undefined) actionAny.fileName = exportedAny.fileName;
      if (exportedAny.mimeType !== undefined) actionAny.mimeType = exportedAny.mimeType;
      if (exportedAny.fileSize !== undefined) actionAny.fileSize = exportedAny.fileSize;
      if (exportedAny.description !== undefined) actionAny.description = exportedAny.description;
      if (exportedAny.tags !== undefined) actionAny.tags = exportedAny.tags;
    }

    // 多边形属性
    if (exported.type === 'polygon') {
      const polygonExport = exportedAny;
      if (polygonExport.polygonType) actionAny.polygonType = polygonExport.polygonType;
      // 不再需要 isVertexList 标记，统一使用顶点列表格式
    }

    // 变换属性
    if (exportedAny.rotation !== undefined) actionAny.rotation = exportedAny.rotation;
    if (exportedAny.scaleX !== undefined) actionAny.scaleX = exportedAny.scaleX;
    if (exportedAny.scaleY !== undefined) actionAny.scaleY = exportedAny.scaleY;

    return action;
  }

  /**
   * 从导出格式提取 points 数组
   * 将语义化格式转换回内部的 points 表示
   */
  private static extractPoints(exported: ExportedAction): Point[] {
    const exportedAny = exported as Record<string, unknown>;

    switch (exported.type) {
      case 'pen':
      case 'eraser':
        // pen/eraser 直接使用 points 数组
        if (Array.isArray(exportedAny.points)) {
          return (exportedAny.points as Array<{ x: number; y: number; pressure?: number }>).map(p => ({
            x: p.x,
            y: p.y,
            pressure: p.pressure
          }));
        }
        return [];

      case 'circle': {
        // circle: center + 边上的点（center.x + radius, center.y）
        const center = exportedAny.center as { x: number; y: number };
        const radius = exportedAny.radius as number;
        if (center && radius !== undefined) {
          return [
            { x: center.x, y: center.y },
            { x: center.x + radius, y: center.y }
          ];
        }
        return [];
      }

      case 'rect': {
        // 新格式：vertices 数组（4顶点）
        if (Array.isArray(exportedAny.vertices)) {
          return (exportedAny.vertices as Array<{ x: number; y: number }>).map(v => ({
            x: v.x,
            y: v.y
          }));
        }
        // 兼容旧格式：position + width + height → 转换为4顶点
        const position = exportedAny.position as { x: number; y: number };
        const width = exportedAny.width as number;
        const height = exportedAny.height as number;
        if (position && width !== undefined && height !== undefined) {
          return [
            { x: position.x, y: position.y },                            // 左上
            { x: position.x + width, y: position.y },                    // 右上
            { x: position.x + width, y: position.y + height },           // 右下
            { x: position.x, y: position.y + height }                    // 左下
          ];
        }
        return [];
      }

      case 'line': {
        // line: start + end
        const start = exportedAny.start as { x: number; y: number };
        const end = exportedAny.end as { x: number; y: number };
        if (start && end) {
          return [
            { x: start.x, y: start.y },
            { x: end.x, y: end.y }
          ];
        }
        return [];
      }

      case 'polygon': {
        // 新格式：vertices 数组（顶点列表）
        if (Array.isArray(exportedAny.vertices)) {
          return (exportedAny.vertices as Array<{ x: number; y: number }>).map(v => ({
            x: v.x,
            y: v.y
          }));
        }
        // 兼容旧格式：center + radius → 生成顶点
        const center = exportedAny.center as { x: number; y: number };
        const radius = exportedAny.radius as number;
        const polygonType = (exportedAny.polygonType as string) || 'hexagon';
        const sides = (exportedAny.sides as number) || this.getDefaultSides(polygonType);
        
        if (center && radius !== undefined && radius > 0) {
          // 根据多边形类型生成顶点
          if (polygonType === 'star') {
            return this.generateStarVertices(center, radius);
          }
          return this.generateRegularPolygonVertices(center, radius, sides);
        }
        return [];
      }

      case 'text': {
        // text: position
        const position = exportedAny.position as { x: number; y: number };
        if (position) {
          return [{ x: position.x, y: position.y }];
        }
        return [];
      }

      case 'image': {
        // image: position
        const position = exportedAny.position as { x: number; y: number };
        if (position) {
          return [{ x: position.x, y: position.y }];
        }
        return [];
      }

      default:
        // 未知类型，尝试使用 points
        if (Array.isArray(exportedAny.points)) {
          return (exportedAny.points as Array<{ x: number; y: number }>).map(p => ({
            x: p.x,
            y: p.y
          }));
        }
        return [];
    }
  }

  /**
   * 从 JSON 字符串导入数据
   */
  public static importFromJSON(
    jsonString: string,
    options: ImportOptions = {}
  ): ImportResult {
    const result: ImportResult = {
      success: false,
      actions: [],
      layers: [],
      config: { width: 800, height: 600 },
      errors: [],
      warnings: []
    };

    // 解析 JSON
    let data: unknown;
    try {
      data = JSON.parse(jsonString);
    } catch (error) {
      result.errors.push(`JSON 解析失败: ${error instanceof Error ? error.message : '未知错误'}`);
      return result;
    }

    // 验证数据
    if (options.validate !== false) {
      const validation = this.validateData(data);
      if (!validation.valid) {
        result.errors.push(...validation.errors);
        return result;
      }
    }

    const exportData = data as DrawBoardExportData;

    // 版本检查
    const versionResult = this.compareVersion(exportData.version);
    if (versionResult === 'invalid') {
      result.errors.push(`无效的版本号: ${exportData.version}`);
      return result;
    }
    if (versionResult === 'newer') {
      if (options.strictVersionCheck) {
        result.errors.push(`数据版本 (${exportData.version}) 高于当前支持的版本 (${this.CURRENT_VERSION})`);
        return result;
      } else {
        result.warnings.push(`数据版本 (${exportData.version}) 较新，部分功能可能不兼容`);
      }
    }

    // 导入配置
    result.config = exportData.config;

    // 导入图层
    result.layers = exportData.layers || [];

    // 导入动作
    result.actions = exportData.actions.map(action => 
      this.importAction(action, options.generateNewIds)
    );

    // 导入元数据
    if (exportData.metadata) {
      result.metadata = exportData.metadata;
    }

    result.success = true;

    logger.info('数据导入完成', {
      version: exportData.version,
      actionsCount: result.actions.length,
      layersCount: result.layers.length,
      warnings: result.warnings.length
    });

    return result;
  }

  /**
   * 从文件导入数据
   */
  public static async importFromFile(
    file: File,
    options: ImportOptions = {}
  ): Promise<ImportResult> {
    return new Promise((resolve) => {
      const reader = new FileReader();

      reader.onload = (event) => {
        const jsonString = event.target?.result as string;
        if (!jsonString) {
          resolve({
            success: false,
            actions: [],
            layers: [],
            config: { width: 800, height: 600 },
            errors: ['文件读取失败'],
            warnings: []
          });
          return;
        }

        resolve(this.importFromJSON(jsonString, options));
      };

      reader.onerror = () => {
        resolve({
          success: false,
          actions: [],
          layers: [],
          config: { width: 800, height: 600 },
          errors: ['文件读取错误'],
          warnings: []
        });
      };

      reader.readAsText(file);
    });
  }

  /**
   * 从剪贴板导入数据
   */
  public static async importFromClipboard(
    options: ImportOptions = {}
  ): Promise<ImportResult> {
    try {
      const text = await navigator.clipboard.readText();
      return this.importFromJSON(text, options);
    } catch (error) {
      return {
        success: false,
        actions: [],
        layers: [],
        config: { width: 800, height: 600 },
        errors: [`从剪贴板读取失败: ${error instanceof Error ? error.message : '未知错误'}`],
        warnings: []
      };
    }
  }

  /**
   * 创建文件选择器并导入
   */
  public static async openFileDialog(
    options: ImportOptions = {}
  ): Promise<ImportResult> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';

      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) {
          resolve({
            success: false,
            actions: [],
            layers: [],
            config: { width: 800, height: 600 },
            errors: ['未选择文件'],
            warnings: []
          });
          return;
        }

        resolve(await this.importFromFile(file, options));
      };

      input.click();
    });
  }

  /**
   * 根据多边形类型获取默认边数
   */
  private static getDefaultSides(polygonType: string): number {
    switch (polygonType) {
      case 'triangle': return 3;
      case 'pentagon': return 5;
      case 'hexagon': return 6;
      case 'star': return 10;
      case 'custom': return 6;
      default: return 6;
    }
  }

  /**
   * 生成正多边形顶点
   */
  private static generateRegularPolygonVertices(
    center: { x: number; y: number },
    radius: number,
    sides: number
  ): Point[] {
    const vertices: Point[] = [];
    const angleStep = (2 * Math.PI) / sides;

    for (let i = 0; i < sides; i++) {
      const angle = i * angleStep - Math.PI / 2; // 从顶部开始
      vertices.push({
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle)
      });
    }

    return vertices;
  }

  /**
   * 生成星形顶点
   */
  private static generateStarVertices(
    center: { x: number; y: number },
    outerRadius: number,
    innerRadiusRatio: number = 0.5
  ): Point[] {
    const vertices: Point[] = [];
    const points = 5;
    const innerRadius = outerRadius * innerRadiusRatio;
    const angleStep = Math.PI / points;

    for (let i = 0; i < points * 2; i++) {
      const angle = i * angleStep - Math.PI / 2;
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      vertices.push({
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle)
      });
    }

    return vertices;
  }
}

