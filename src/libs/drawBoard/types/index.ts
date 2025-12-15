/**
 * 类型定义模块
 * 
 * 集中管理共享类型，避免循环依赖
 */

export type { 
  TextAction, 
  TextToolEventType, 
  TextToolEventHandler 
} from './TextTypes';

export type { 
  DrawBoardConfig, 
  OptimizationConfig
} from './ConfigTypes';

// 标准化导出格式
export type {
  Shape,
  PenShape,
  CircleShape,
  RectShape,
  LineShape,
  TextShape,
  PolygonShape,
  DrawBoardDocument,
  LayerInfo,
  CanvasConfig,
  Metadata,
  StyleContext,
  Point2D,
  PressurePoint,
  TransformProps,
  ShapeType
} from './ExportFormats';

export { FORMAT_VERSION, APP_VERSION } from './ExportFormats';

