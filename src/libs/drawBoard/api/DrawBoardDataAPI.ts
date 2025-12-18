/**
 * DrawBoard 数据 API
 * 
 * 封装所有数据导入导出相关的操作，包括：
 * - JSON 导入/导出
 * - 数据序列化/反序列化
 * - 文件操作
 */

import type { HistoryManager } from '../history/HistoryManager';
import type { VirtualLayerManager } from '../core/VirtualLayerManager';
import type { CanvasEngine } from '../core/CanvasEngine';
import { 
  DataExporter, 
  type ExportOptions, 
  type DrawBoardExportData,
  type ExportedConfig 
} from '../utils/DataExporter';
import { 
  DataImporter, 
  type ImportOptions, 
  type ImportResult 
} from '../utils/DataImporter';
import { logger } from '../infrastructure/logging/Logger';
import type { DataAPIConfig } from './APIConfig';

/**
 * DrawBoard 数据 API
 */
export class DrawBoardDataAPI {
  private historyManager: HistoryManager;
  private virtualLayerManager: VirtualLayerManager;
  private canvasEngine: CanvasEngine;
  private dataLoadCallback?: DataAPIConfig;

  constructor(
    historyManager: HistoryManager,
    virtualLayerManager: VirtualLayerManager,
    canvasEngine: CanvasEngine
  ) {
    this.historyManager = historyManager;
    this.virtualLayerManager = virtualLayerManager;
    this.canvasEngine = canvasEngine;
  }

  /**
   * 设置数据加载回调
   */
  public setDataLoadCallback(callback: DataAPIConfig): void {
    this.dataLoadCallback = callback;
  }

  // ============================================
  // 导出 API
  // ============================================

  /**
   * 获取当前配置
   */
  private getConfig(): ExportedConfig {
    const canvas = this.canvasEngine.getCanvas();
    const mode = this.virtualLayerManager.getMode();
    
    return {
      width: canvas.width,
      height: canvas.height,
      virtualLayerMode: mode
    };
  }

  /**
   * 导出为 JSON 对象
   */
  public exportData(options: ExportOptions = {}): DrawBoardExportData {
    const actions = this.historyManager.getHistory();
    const layers = this.virtualLayerManager.getAllVirtualLayers();
    const config = this.getConfig();

    return DataExporter.exportData(actions, layers, config, options);
  }

  /**
   * 导出为 JSON 字符串
   */
  public exportToJSON(options: ExportOptions = {}): string {
    const actions = this.historyManager.getHistory();
    const layers = this.virtualLayerManager.getAllVirtualLayers();
    const config = this.getConfig();

    return DataExporter.exportToJSON(actions, layers, config, options);
  }

  /**
   * 下载为 JSON 文件
   */
  public downloadAsJSON(options: ExportOptions = {}): void {
    const actions = this.historyManager.getHistory();
    const layers = this.virtualLayerManager.getAllVirtualLayers();
    const config = this.getConfig();

    DataExporter.downloadAsJSON(actions, layers, config, options);
  }

  /**
   * 复制 JSON 到剪贴板
   */
  public async copyToClipboard(options: ExportOptions = {}): Promise<boolean> {
    const actions = this.historyManager.getHistory();
    const layers = this.virtualLayerManager.getAllVirtualLayers();
    const config = this.getConfig();

    return DataExporter.copyToClipboard(actions, layers, config, options);
  }

  // ============================================
  // 导入 API
  // ============================================

  /**
   * 从 JSON 字符串导入数据
   */
  public async importFromJSON(
    jsonString: string, 
    options: ImportOptions = {}
  ): Promise<ImportResult> {
    const result = DataImporter.importFromJSON(jsonString, options);
    
    if (result.success && this.dataLoadCallback) {
      await this.applyImportResult(result, options);
    }

    return result;
  }

  /**
   * 从文件导入数据
   */
  public async importFromFile(
    file: File, 
    options: ImportOptions = {}
  ): Promise<ImportResult> {
    const result = await DataImporter.importFromFile(file, options);
    
    if (result.success && this.dataLoadCallback) {
      await this.applyImportResult(result, options);
    }

    return result;
  }

  /**
   * 从剪贴板导入数据
   */
  public async importFromClipboard(
    options: ImportOptions = {}
  ): Promise<ImportResult> {
    const result = await DataImporter.importFromClipboard(options);
    
    if (result.success && this.dataLoadCallback) {
      await this.applyImportResult(result, options);
    }

    return result;
  }

  /**
   * 打开文件选择器并导入
   */
  public async openFileDialog(
    options: ImportOptions = {}
  ): Promise<ImportResult> {
    const result = await DataImporter.openFileDialog(options);
    
    if (result.success && this.dataLoadCallback) {
      await this.applyImportResult(result, options);
    }

    return result;
  }

  /**
   * 应用导入结果
   */
  private async applyImportResult(
    result: ImportResult, 
    options: ImportOptions
  ): Promise<void> {
    if (!this.dataLoadCallback) {
      logger.warn('未设置数据加载回调，无法应用导入结果');
      return;
    }

    // 如果不是合并模式，先清空现有数据
    if (!options.merge) {
      this.historyManager.clear();
      // 清空虚拟图层
      const existingLayers = this.virtualLayerManager.getAllVirtualLayers();
      for (const layer of existingLayers) {
        this.virtualLayerManager.deleteVirtualLayer(layer.id);
      }
    }

    // 应用 actions
    this.dataLoadCallback.applyActions(result.actions);

    // 重建图层（如果有）
    if (result.layers.length > 0) {
      this.dataLoadCallback.rebuildLayers(result.layers);
    }

    // 重新渲染
    await this.dataLoadCallback.redraw();

    logger.info('导入数据已应用', {
      actionsCount: result.actions.length,
      layersCount: result.layers.length,
      merge: options.merge || false
    });
  }

  // ============================================
  // 便捷方法
  // ============================================

  /**
   * 获取当前数据统计
   */
  public getDataStats(): {
    actionsCount: number;
    layersCount: number;
    estimatedSize: number;
  } {
    const actions = this.historyManager.getHistory();
    const layers = this.virtualLayerManager.getAllVirtualLayers();
    
    // 估算 JSON 大小
    const json = this.exportToJSON({ minify: true });
    const estimatedSize = new Blob([json]).size;

    return {
      actionsCount: actions.length,
      layersCount: layers.length,
      estimatedSize
    };
  }

  /**
   * 验证 JSON 数据
   */
  public validateJSON(jsonString: string): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const result = DataImporter.importFromJSON(jsonString, { validate: true });
    return {
      valid: result.success,
      errors: result.errors,
      warnings: result.warnings
    };
  }
}

