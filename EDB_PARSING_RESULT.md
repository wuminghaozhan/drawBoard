# EDB文件解析结果

## 概述

根据WhiteBoardProtocol.md中的格式描述，我已经创建了一个完整的EDB文件解析器，可以将EDB文件解析成标准的JSON格式。

## 解析器功能

### 1. 支持的文件格式
- **旧版本格式** (version < 50): 使用double类型和完整的itemId
- **新版本格式** (version >= 50): 使用float类型和简化的itemId

### 2. 支持的数据类型
- **基础图元**: Traceline, Rectangle, Circle, Text, Pixmap, Triangle, Ellipse, SimpleLine, Square
- **高级图元**: PressureLine, Polyline, MarkPen, CircleArc, ShapeGroup, TimePressureLine, ChalkLine
- **多媒体**: Audio, Video, AudioNew, VideoNew
- **特殊图元**: TaskGood, CoursewareLink, EraserLine, OddEvenLine

### 3. 解析功能
- **文件头解析**: 版本、页数、图元数量、画板尺寸、客户端信息等
- **图元解析**: 类型、位置、样式、内容等详细信息
- **资源解析**: 音频、视频、图片等附加资源
- **皮肤数据**: 背景图片、位置、旋转等信息

## JSON格式结构

```json
{
  "header": {
    "idLength": 3,
    "docId": "edb",
    "version": 50,
    "zipped": 0,
    "pageNum": 50,
    "itemNum": 10,
    "height": 590.0,
    "width": 1280.0,
    "clientType": 0,
    "clientVersionLength": 8,
    "clientVersionStr": "1.0.0.0",
    "lastModifyTime": 1640995200,
    "backgroundColor": 0x00000000
  },
  "items": [
    {
      "type": 0,
      "dataLength": 256,
      "version": 50,
      "itemId": 1,
      "zvalue": 0,
      "status": 0,
      "rotate": 0.0,
      "scaleX": 1.0,
      "scaleY": 1.0,
      "content": {
        "lineWidth": 2,
        "lineColor": 0xFF0000FF,
        "lineStyleCount": 1,
        "styleValues": [0],
        "pointNum": 5,
        "pointData": [
          {"x": 100.0, "y": 100.0},
          {"x": 200.0, "y": 150.0},
          {"x": 300.0, "y": 120.0},
          {"x": 400.0, "y": 200.0},
          {"x": 500.0, "y": 180.0}
        ]
      }
    }
  ],
  "resources": [
    {
      "type": 0,
      "resourceID": 1,
      "dataLength": 1024,
      "data": [/* 二进制数据 */]
    }
  ]
}
```

## 字段说明

### 文件头字段
- **idLength**: 文档ID长度
- **docId**: 文档ID (通常为"edb")
- **version**: 文件版本号
- **zipped**: 是否压缩 (新版本)
- **pageNum**: 总页数
- **itemNum**: 图元个数
- **height/width**: 画板尺寸
- **clientType**: 客户端类型 (0=PC, 1=iOS, 2=Android)
- **clientVersionStr**: 客户端版本
- **lastModifyTime**: 最后修改时间戳
- **backgroundColor**: 背景颜色 (新版本)

### 图元字段
- **type**: 图元类型 (见WhiteBoardProtocol.md)
- **dataLength**: 数据长度
- **version**: 图元版本
- **itemId**: 图元唯一标识
- **zvalue**: Z值 (绘制顺序)
- **status**: 状态标志
- **rotate**: 旋转角度
- **scaleX/scaleY**: 缩放参数
- **content**: 图元具体内容

### 图元内容字段 (以Traceline为例)
- **lineWidth**: 线宽
- **lineColor**: 线颜色 (RGBA格式)
- **lineStyleCount**: 线型数量
- **styleValues**: 线型参数数组
- **pointNum**: 点数
- **pointData**: 坐标点数组

## 使用方法

### 1. 访问解析页面
访问 `/edb` 路由可以查看完整的EDB文件解析结果。

### 2. 程序化使用
```javascript
import { EDBParser } from './utils/EDBParser';

// 加载EDB文件
const response = await fetch('/path/to/file.edb');
const arrayBuffer = await response.arrayBuffer();

// 解析文件
const parser = new EDBParser(arrayBuffer);
const document = parser.parse();

// 使用解析结果
console.log('文件版本:', document.header.version);
console.log('图元数量:', document.header.itemNum);
console.log('图元列表:', document.items);
```

## 解析结果展示

解析页面提供以下功能：
1. **文件头信息**: 显示文件的基本信息和元数据
2. **图元列表**: 列出所有图元及其属性
3. **资源列表**: 显示附加资源信息
4. **JSON格式**: 完整的JSON格式输出

## 技术特点

1. **完整支持**: 支持WhiteBoardProtocol.md中描述的所有图元类型
2. **版本兼容**: 支持新旧版本格式的自动识别和解析
3. **类型安全**: 使用TypeScript提供完整的类型定义
4. **错误处理**: 提供详细的错误信息和异常处理
5. **性能优化**: 使用高效的二进制解析算法

## 注意事项

1. **文件路径**: 确保EDB文件路径正确
2. **版本兼容**: 注意新旧版本格式的差异
3. **内存使用**: 大文件解析时注意内存使用
4. **编码格式**: 字符串使用UTF-8编码
5. **字节序**: 支持大端序和小端序

这个解析器为EDB文件提供了完整的解析能力，可以将二进制格式的EDB文件转换为易于处理的JSON格式，便于后续的数据分析和处理。 