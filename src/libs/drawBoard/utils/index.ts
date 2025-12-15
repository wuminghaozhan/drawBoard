/**
 * 业务工具模块
 * 
 * 提供与 DrawBoard 业务相关的工具函数：
 * - 锚点工具
 * - 边界验证
 * - 形状工具
 * - 资源管理
 * - 导出功能
 */

// 几何计算工具
export { AnchorUtils } from './AnchorUtils';
export { BoundsValidator, type Bounds } from './BoundsValidator';
export { ShapeUtils } from './ShapeUtils';
export { 
  GeometryUtils,
  type BoundingBox as GeoBoundingBox,
  type LineSegment,
  type BezierControlPoints
} from './GeometryUtils';

// 资源管理
export { 
  ResourceManager, 
  type DestroyableResource, 
  type ResourceStats 
} from './ResourceManager';
export { LightweightResourceManager } from './LightweightResourceManager';
export { WeakResourceManager } from './WeakResourceManager';
export { NoResourceManager } from './NoResourceManager';

// 导出功能
export { ExportManager } from './ExportManager';

// JSON 导入导出
export { 
  DataExporter,
  type DrawBoardExportData,
  type ExportedAction,
  type ExportedLayer,
  type ExportedConfig,
  type ExportOptions,
  EXPORT_VERSION
} from './DataExporter';
export {
  DataImporter,
  type ImportResult,
  type ImportOptions
} from './DataImporter';

// 标准化形状转换器
export { ShapeConverter } from './ShapeConverter';

// 调试工具
export { DebugUtils } from './DebugUtils';

