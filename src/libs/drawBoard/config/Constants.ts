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
  },
  
  /**
   * 事件管理配置
   */
  EVENT: {
    /** 鼠标移动节流间隔（毫秒，约60fps） */
    MOUSE_MOVE_THROTTLE: 16,
    /** 触摸移动节流间隔（毫秒，约120fps） */
    TOUCH_MOVE_THROTTLE: 8,
    /** 最小事件间隔（毫秒） */
    MIN_EVENT_INTERVAL: 10,
    /** 重复事件距离阈值（像素） */
    DUPLICATE_DISTANCE_THRESHOLD: 2,
    /** 鼠标双击时间阈值（毫秒） */
    DOUBLE_CLICK_TIME_THRESHOLD: 300,
    /** 鼠标双击距离阈值（像素） */
    DOUBLE_CLICK_DISTANCE_THRESHOLD: 10,
    /** 触摸双击时间阈值（毫秒） */
    DOUBLE_TAP_TIME_THRESHOLD: 350,
    /** 触摸双击距离阈值（像素） */
    DOUBLE_TAP_DISTANCE_THRESHOLD: 20
  },
  
  /**
   * 选择框配置
   */
  SELECTION: {
    /** 选择框边框颜色 */
    STROKE_COLOR: '#007bff',
    /** 选择框边框宽度 */
    STROKE_WIDTH: 2,
    /** 手柄大小 */
    HANDLE_SIZE: 6,
    /** 手柄填充色 */
    HANDLE_FILL_COLOR: '#ffffff',
    /** 手柄边框颜色 */
    HANDLE_STROKE_COLOR: '#007bff'
  },
  
  /**
   * 性能管理配置
   */
  PERFORMANCE_MANAGER: {
    /** 内存监控间隔（毫秒） */
    MEMORY_MONITOR_INTERVAL: 10000,
    /** 缓存过期时间（毫秒，5分钟） */
    CACHE_EXPIRE_TIME: 5 * 60 * 1000,
    /** 默认最大缓存内存（MB） */
    DEFAULT_MAX_CACHE_MEMORY_MB: 200,
    /** 默认最大缓存项数 */
    DEFAULT_MAX_CACHE_ITEMS: 500,
    /** 默认复杂度阈值 */
    DEFAULT_COMPLEXITY_THRESHOLD: 30,
    /** 默认内存压力阈值 */
    DEFAULT_MEMORY_PRESSURE_THRESHOLD: 0.8
  },

  /**
   * 复杂度管理配置
   */
  COMPLEXITY: {
    /** 基础复杂度阈值 */
    BASE_THRESHOLD: 30,
    /** 复杂度缓存大小 */
    CACHE_SIZE: 1000,
    /** 历史动作重计算触发阈值 */
    HISTORY_COUNT_THRESHOLD: 20,
    /** 缓存命中率触发阈值 */
    CACHE_HIT_RATE_THRESHOLD: 0.3,
    /** 内存压力触发阈值 */
    MEMORY_PRESSURE_THRESHOLD: 0.8,
    /** 绘制调用次数阈值（用于判断命中率是否有意义） */
    MIN_DRAW_CALLS_FOR_HIT_RATE: 50,
    /** 复杂度分布阈值 */
    DISTRIBUTION: {
      LOW_MAX: 20,
      MEDIUM_MAX: 50
    },
    /** 工具类型复杂度 */
    TOOL_COMPLEXITY: {
      pen: 30,
      brush: 50,
      advancedPen: 35,
      rect: 5,
      circle: 5,
      line: 10,
      polyline: 12,
      polygon: 15,
      text: 25,
      image: 20,
      eraser: 10,
      select: 5,
      transform: 8,
      default: 20
    } as Record<string, number>,
    /** 上下文复杂度因子 */
    CONTEXT: {
      LINE_WIDTH_FACTOR: 2,
      NON_BLACK_COLOR_BONUS: 5
    },
    /** 特殊属性复杂度 */
    SPECIAL_ATTRIBUTES: {
      TEXT_BONUS: 10,
      SELECTED_BONUS: 5,
      NO_CACHE_BONUS: 3
    },
    /** 点数量复杂度因子 */
    POINTS_FACTOR: 0.5
  },

  /**
   * 虚拟图层管理配置
   */
  VIRTUAL_LAYER: {
    /** 最大虚拟图层数量 */
    MAX_LAYERS: 50,
    /** 每个图层最大动作数 */
    MAX_ACTIONS_PER_LAYER: 1000,
    /** 分组模式下的时间间隔阈值（毫秒） */
    TIME_THRESHOLD: 5000,
    /** 动态拆分阈值 */
    DYNAMIC_SPLIT_THRESHOLD: 100,
    /** 统计缓存过期时间（毫秒） */
    STATS_CACHE_EXPIRE_TIME: 2000,
    /** 复制元素时的偏移量（像素） */
    DUPLICATE_OFFSET: 20
  },

  /**
   * 绘制处理器配置
   */
  DRAWING_HANDLER: {
    /** 重绘节流时间（毫秒，约60fps） */
    REDRAW_THROTTLE_MS: 16,
    /** 每个动作最大点数 */
    MAX_POINTS_PER_ACTION: 1000,
    /** 图层初始化超时时间（毫秒） */
    LAYER_INITIALIZATION_TIMEOUT: 2000,
    /** 离屏缓存阈值（历史动作数量超过此值使用离屏缓存） */
    OFFSCREEN_CACHE_THRESHOLD: 100,
    /** 最大内存使用率阈值 */
    MAX_MEMORY_USAGE: 0.8,
    /** 选择工具UI绘制间隔（毫秒，约60fps） */
    DRAW_SELECT_TOOL_UI_INTERVAL: 16,
    /** 选择工具UI绘制最大持续时间（毫秒） */
    DRAW_SELECT_TOOL_UI_MAX_DURATION: 1000,
    /** 清除选择UI超时时间（毫秒） */
    CLEAR_SELECTION_UI_TIMEOUT: 100,
    /** 脏矩形管理器配置 */
    DIRTY_RECT: {
      MERGE_THRESHOLD: 30,
      MAX_DIRTY_RECTS: 40,
      PADDING: 4,
      FULL_REDRAW_THRESHOLD: 0.4
    },
    /** 折线预览点半径 */
    POLYLINE_POINT_RADIUS: 4,
    /** 折线预览线宽 */
    POLYLINE_PREVIEW_LINE_WIDTH: 2
  },

  /**
   * 光标处理器配置
   */
  CURSOR: {
    /** 最小光标大小（像素） */
    MIN_SIZE: 16,
    /** 最大光标大小（像素） */
    MAX_SIZE: 32,
    /** 光标缓存大小 */
    CACHE_SIZE: 50,
    /** 光标颜色 */
    COLORS: {
      PEN: '#000000',
      BRUSH: '#8B4513',
      ERASER: '#FF6B6B'
    }
  },

  /**
   * 状态处理器配置
   */
  STATE_HANDLER: {
    /** 回调函数最大错误次数（超过后自动移除） */
    MAX_CALLBACK_ERRORS: 3
  },

  /**
   * SelectTool 协调器配置
   */
  SELECT_TOOL_COORDINATOR: {
    /** 同步防抖时间（毫秒，约60fps） */
    SYNC_DEBOUNCE_MS: 16,
    /** 重绘节流时间（毫秒，约60fps） */
    REDRAW_THROTTLE_MS: 16,
    /** 位置变化容差（用于判断是否有实质变化） */
    POSITION_TOLERANCE: 0.01,
    /** 默认字体大小 */
    DEFAULT_FONT_SIZE: 16,
    /** 默认图片宽度 */
    DEFAULT_IMAGE_WIDTH: 200,
    /** 默认图片高度 */
    DEFAULT_IMAGE_HEIGHT: 200
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

