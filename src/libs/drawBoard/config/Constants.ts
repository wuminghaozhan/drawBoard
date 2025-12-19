/**
 * 配置常量
 * 统一管理所有配置常量，提高可维护性
 */
export const ConfigConstants = {
  /**
   * 锚点配置
   */
  ANCHOR: {
    /** 默认锚点大小 */
    DEFAULT_SIZE: 8,
    /** 最小锚点大小 */
    MIN_SIZE: 4,
    /** 最大锚点大小 */
    MAX_SIZE: 20,
    /** 默认锚点容差 */
    DEFAULT_TOLERANCE: 6,
    /** 最小锚点容差 */
    MIN_TOLERANCE: 2,
    /** 最大锚点容差 */
    MAX_TOLERANCE: 15,
    /** 锚点缓存TTL（毫秒） */
    CACHE_TTL: 100
  },
  
  /**
   * 拖拽配置
   */
  DRAG: {
    /** 默认拖拽敏感度 */
    DEFAULT_SENSITIVITY: 0.7,
    /** 最小敏感度 */
    MIN_SENSITIVITY: 0,
    /** 最大敏感度 */
    MAX_SENSITIVITY: 1,
    /** 默认最小拖拽距离 */
    DEFAULT_MIN_DISTANCE: 3,
    /** 最小拖拽距离 */
    MIN_DISTANCE: 1,
    /** 最大拖拽距离 */
    MAX_DISTANCE: 10,
    /** 是否默认启用圆形精确模式 */
    DEFAULT_ENABLE_CIRCLE_PRECISION: true
  },
  
  /**
   * 空间索引配置
   */
  SPATIAL_INDEX: {
    /** 点选阈值（超过此数量使用空间索引） */
    POINT_SELECT_THRESHOLD: 1000,
    /** 框选阈值（超过此数量使用空间索引） */
    BOX_SELECT_THRESHOLD: 500
  },
  
  /**
   * 内存配置
   */
  MEMORY: {
    /** 默认最大内存使用率 */
    DEFAULT_MAX_USAGE: 0.8,
    /** 内存检查间隔（毫秒） */
    CHECK_INTERVAL: 5000
  },
  
  /**
   * zIndex 配置
   */
  Z_INDEX: {
    /** 基础 zIndex */
    BASE: 100,
    /** 最大动态图层 zIndex */
    MAX_DYNAMIC_LAYER: 1000,
    /** zIndex 步长 */
    STEP: 2
  },
  
  /**
   * 性能配置
   */
  PERFORMANCE: {
    /** 离屏缓存阈值（历史动作数量） */
    OFFScreen_CACHE_THRESHOLD: 100,
    /** 节流延迟（毫秒） */
    THROTTLE_DELAY: 16, // 约60fps
    /** 防抖延迟（毫秒） */
    DEBOUNCE_DELAY: 300
  },
  
  /**
   * 图形配置
   */
  SHAPE: {
    /** 最小半径 */
    MIN_RADIUS: 5,
    /** 最大半径 */
    MAX_RADIUS: 10000,
    /** 最小尺寸 */
    MIN_SIZE: 5,
    /** 最大尺寸 */
    MAX_SIZE: 10000
  },
  
  /**
   * 历史记录配置
   */
  HISTORY: {
    /** 最大历史记录数量 */
    MAX_HISTORY_SIZE: 100,
    /** 最大重做栈大小 */
    MAX_UNDONE_SIZE: 50,
    /** 最大内存限制(MB) */
    MAX_MEMORY_MB: 50,
    /** 内存检查间隔（操作次数） */
    MEMORY_CHECK_INTERVAL: 10,
    /** 内存重新计算间隔（操作次数） */
    MEMORY_RECALCULATE_INTERVAL: 50,
    /** 最大批量操作数 */
    MAX_BATCH_OPERATIONS: 50,
    /** 最大变形历史数量 */
    MAX_TRANSFORM_HISTORY: 50,
    /** 内存计算：基础对象开销（字节） */
    MEMORY_BASE_OBJECT_SIZE: 64,
    /** 内存计算：每个点的大小（字节） */
    MEMORY_POINT_SIZE: 40,
    /** 内存计算：context对象开销（字节） */
    MEMORY_CONTEXT_SIZE: 128,
    /** 内存计算：选择项开销（字节） */
    MEMORY_SELECTION_ITEM_SIZE: 32
  }
} as const;

/**
 * 工具显示名称映射
 * 统一管理工具的中文显示名称
 */
export const ToolDisplayNames: Record<string, string> = {
  pen: '画笔',
  brush: '毛笔',
  advancedPen: '高级画笔',
  rect: '矩形',
  circle: '圆形',
  line: '直线',
  polyline: '折线',
  polygon: '多边形',
  text: '文字',
  image: '图片',
  eraser: '橡皮擦',
  select: '选择',
  transform: '变换'
} as const;

/**
 * 类型定义：配置常量类型
 */
export type ConfigConstantsType = typeof ConfigConstants;

