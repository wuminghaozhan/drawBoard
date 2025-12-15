/**
 * DrawBoard 标准化导出格式
 * 
 * 每种工具类型都有独立的标准格式，用于导入/导出
 * 设计原则：
 * - 语义化：使用图形的自然属性而非底层实现
 * - 最小化：只包含重建图形所需的最少信息
 * - 可读性：JSON 格式易于人工阅读和编辑
 */

// ============================================
// 通用基础类型
// ============================================

/** 2D 点 */
export interface Point2D {
  x: number;
  y: number;
}

/** 带压感的点 */
export interface PressurePoint extends Point2D {
  pressure?: number;  // 0-1，可选
}

/** 样式上下文 */
export interface StyleContext {
  strokeStyle: string;       // 线条颜色
  fillStyle?: string;        // 填充颜色
  lineWidth: number;         // 线宽
  lineCap?: 'butt' | 'round' | 'square';
  lineJoin?: 'miter' | 'round' | 'bevel';
  globalAlpha?: number;      // 0-1
}

/** 变换属性 */
export interface TransformProps {
  rotation?: number;         // 旋转角度（弧度）
  scaleX?: number;          // X 缩放
  scaleY?: number;          // Y 缩放
}

// ============================================
// 工具类型枚举
// ============================================

export type ShapeType = 'pen' | 'circle' | 'rect' | 'line' | 'text' | 'polygon' | 'eraser';

// ============================================
// 各工具的标准格式
// ============================================

/**
 * 画笔 (Pen) 标准格式
 * 自由曲线，由多个点组成
 */
export interface PenShape {
  type: 'pen';
  id: string;
  /** 路径点列表 */
  path: PressurePoint[];
  style: StyleContext;
  transform?: TransformProps;
  timestamp: number;
}

/**
 * 圆形 (Circle) 标准格式
 * 由圆心和半径定义
 */
export interface CircleShape {
  type: 'circle';
  id: string;
  /** 圆心 */
  center: Point2D;
  /** 半径 */
  radius: number;
  style: StyleContext;
  /** 是否填充 */
  filled?: boolean;
  transform?: TransformProps;
  timestamp: number;
}

/**
 * 矩形 (Rect) 标准格式
 * 由左上角坐标和宽高定义
 */
export interface RectShape {
  type: 'rect';
  id: string;
  /** 左上角 X */
  x: number;
  /** 左上角 Y */
  y: number;
  /** 宽度 */
  width: number;
  /** 高度 */
  height: number;
  style: StyleContext;
  /** 是否填充 */
  filled?: boolean;
  /** 圆角半径 */
  cornerRadius?: number;
  transform?: TransformProps;
  timestamp: number;
}

/**
 * 直线 (Line) 标准格式
 * 由起点和终点定义
 */
export interface LineShape {
  type: 'line';
  id: string;
  /** 起点 */
  start: Point2D;
  /** 终点 */
  end: Point2D;
  style: StyleContext;
  /** 线条类型 */
  lineType?: 'solid' | 'dashed' | 'arrow';
  /** 箭头样式 */
  arrowStyle?: 'none' | 'start' | 'end' | 'both';
  /** 虚线模式 */
  dashPattern?: number[];
  transform?: TransformProps;
  timestamp: number;
}

/**
 * 文字 (Text) 标准格式
 * 由位置和文本内容定义
 */
export interface TextShape {
  type: 'text';
  id: string;
  /** 文字位置 */
  position: Point2D;
  /** 文本内容 */
  content: string;
  /** 字体大小 */
  fontSize: number;
  /** 字体 */
  fontFamily: string;
  /** 文本颜色 */
  color: string;
  /** 文本对齐 */
  textAlign?: 'left' | 'center' | 'right';
  /** 文本框宽度（启用换行） */
  width?: number;
  /** 文本框高度 */
  height?: number;
  /** 行高倍数 */
  lineHeight?: number;
  transform?: TransformProps;
  timestamp: number;
}

/**
 * 多边形 (Polygon) 标准格式
 * 规则多边形由中心、半径和边数定义
 * 自定义多边形由顶点列表定义
 */
export interface PolygonShape {
  type: 'polygon';
  id: string;
  /** 多边形类型 */
  polygonType: 'triangle' | 'pentagon' | 'hexagon' | 'star' | 'custom';
  /** 中心点（规则多边形） */
  center?: Point2D;
  /** 外接圆半径（规则多边形） */
  radius?: number;
  /** 边数 */
  sides?: number;
  /** 顶点列表（自定义多边形） */
  vertices?: Point2D[];
  /** 内半径（星形） */
  innerRadius?: number;
  style: StyleContext;
  /** 是否填充 */
  filled?: boolean;
  transform?: TransformProps;
  timestamp: number;
}

// ============================================
// 联合类型
// ============================================

/** 所有形状的联合类型 */
export type Shape = 
  | PenShape 
  | CircleShape 
  | RectShape 
  | LineShape 
  | TextShape 
  | PolygonShape;

// ============================================
// 导出文件格式
// ============================================

/** 图层信息 */
export interface LayerInfo {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;      // 0-1
  locked: boolean;
  zIndex: number;
  shapeIds: string[];   // 该图层包含的形状 ID
}

/** 画布配置 */
export interface CanvasConfig {
  width: number;
  height: number;
  backgroundColor?: string;
}

/** 元数据 */
export interface Metadata {
  name?: string;
  description?: string;
  author?: string;
  createdAt?: string;
  modifiedAt?: string;
  tags?: string[];
  version?: string;
}

/**
 * DrawBoard 标准导出格式 v2
 * 使用语义化的形状定义
 */
export interface DrawBoardDocument {
  /** 文件格式版本 */
  formatVersion: '2.0.0';
  /** 应用版本 */
  appVersion: string;
  /** 导出时间 */
  exportedAt: string;
  /** 画布配置 */
  canvas: CanvasConfig;
  /** 图层列表 */
  layers: LayerInfo[];
  /** 形状列表 */
  shapes: Shape[];
  /** 元数据 */
  metadata?: Metadata;
}

// ============================================
// 版本常量
// ============================================

export const FORMAT_VERSION = '2.0.0';
export const APP_VERSION = '1.0.0';

