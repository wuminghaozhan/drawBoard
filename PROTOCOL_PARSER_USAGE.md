# 协议解析器使用说明

## 概述

JavaScript网页内完全可以解析uint8、uint16、uint32等协议数据。我们提供了一个完整的协议解析工具类，支持各种数据类型的读写操作。

## 核心功能

### 1. 支持的数据类型

| 类型 | 大小 | 范围 | 说明 |
|------|------|------|------|
| uint8 | 1字节 | 0-255 | 8位无符号整数 |
| uint16 | 2字节 | 0-65535 | 16位无符号整数 |
| uint32 | 4字节 | 0-4294967295 | 32位无符号整数 |
| int8 | 1字节 | -128-127 | 8位有符号整数 |
| int16 | 2字节 | -32768-32767 | 16位有符号整数 |
| int32 | 4字节 | -2147483648-2147483647 | 32位有符号整数 |
| float32 | 4字节 | ±3.4E+38 | 32位浮点数 |
| float64 | 8字节 | ±1.8E+308 | 64位浮点数 |

### 2. 字节序支持

- **大端序 (Big Endian)**: 最高有效字节存储在最低地址
- **小端序 (Little Endian)**: 最低有效字节存储在最低地址

## 使用方法

### 基本解析

```javascript
import { ProtocolParser } from './utils/ProtocolParser';

// 从十六进制字符串创建解析器
const hexData = '010000000200000003000000';
const parser = ProtocolParser.fromHexString(hexData, false); // false = 大端序

// 读取数据
const uint8 = parser.readUint8();   // 1
const uint16 = parser.readUint16(); // 2
const uint32 = parser.readUint32(); // 3
```

### 协议写入

```javascript
import { ProtocolWriter } from './utils/ProtocolParser';

// 创建写入器
const writer = new ProtocolWriter(1024, false); // 1024字节初始大小，大端序

// 写入数据
writer.writeUint8(1);
writer.writeUint16(2);
writer.writeUint32(3);
writer.writeString('Hello World');

// 获取结果
const data = writer.getData();
const hexString = Array.from(data).map(byte => 
  byte.toString(16).padStart(2, '0')
).join('');
```

### 字符串处理

```javascript
// 读取指定长度的字符串
const str = parser.readString(11); // 读取11字节的字符串

// 读取以null结尾的字符串
const nullTerminatedStr = parser.readNullTerminatedString();

// 写入字符串
writer.writeString('Hello World');
writer.writeNullTerminatedString('Hello World'); // 自动添加null结尾
```

### 位置控制

```javascript
// 获取当前位置
const currentPos = parser.tell();

// 设置读取位置
parser.seek(10);

// 跳过指定字节数
parser.skip(5);

// 检查是否还有数据
if (parser.hasMore()) {
  // 继续读取
}

// 获取剩余字节数
const remaining = parser.remaining();
```

## 实际应用场景

### 1. 网络协议解析

```javascript
// 解析TCP包头部
function parseTCPHeader(data: Uint8Array) {
  const parser = ProtocolParser.fromUint8Array(data);
  
  const sourcePort = parser.readUint16();
  const destPort = parser.readUint16();
  const sequenceNumber = parser.readUint32();
  const acknowledgmentNumber = parser.readUint32();
  
  return {
    sourcePort,
    destPort,
    sequenceNumber,
    acknowledgmentNumber
  };
}
```

### 2. 文件格式解析

```javascript
// 解析PNG文件头
function parsePNGHeader(data: Uint8Array) {
  const parser = ProtocolParser.fromUint8Array(data);
  
  // PNG签名: 89 50 4E 47 0D 0A 1A 0A
  const signature = parser.readBytes(8);
  
  // 检查PNG签名
  const pngSignature = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const isValidPNG = signature.every((byte, index) => byte === pngSignature[index]);
  
  return { isValidPNG, signature };
}
```

### 3. 二进制数据交换

```javascript
// 序列化对象
function serializeObject(obj: any): Uint8Array {
  const writer = new ProtocolWriter();
  
  writer.writeUint8(obj.type);
  writer.writeUint16(obj.id);
  writer.writeUint32(obj.timestamp);
  writer.writeString(obj.name);
  
  return writer.getData();
}

// 反序列化对象
function deserializeObject(data: Uint8Array): any {
  const parser = ProtocolParser.fromUint8Array(data);
  
  return {
    type: parser.readUint8(),
    id: parser.readUint16(),
    timestamp: parser.readUint32(),
    name: parser.readNullTerminatedString()
  };
}
```

## 性能优化

### 1. 内存管理

```javascript
// 预分配足够大的缓冲区
const writer = new ProtocolWriter(4096); // 4KB初始大小

// 重用解析器对象
const parser = new ProtocolParser(buffer);
// ... 多次使用同一个parser对象
```

### 2. 批量操作

```javascript
// 批量读取多个值
const values = [];
while (parser.hasMore() && parser.remaining() >= 4) {
  values.push(parser.readUint32());
}
```

### 3. 错误处理

```javascript
try {
  const parser = ProtocolParser.fromHexString(hexData);
  
  if (parser.remaining() < 4) {
    throw new Error('数据不足');
  }
  
  const value = parser.readUint32();
} catch (error) {
  console.error('解析错误:', error);
}
```

## 浏览器兼容性

| 浏览器 | 版本要求 | 支持情况 |
|--------|----------|----------|
| Chrome | 7+ | ✅ 完全支持 |
| Firefox | 4+ | ✅ 完全支持 |
| Safari | 5.1+ | ✅ 完全支持 |
| Edge | 12+ | ✅ 完全支持 |
| IE | 10+ | ✅ 完全支持 |

## 注意事项

1. **字节序**: 确保使用正确的字节序，网络协议通常使用大端序
2. **边界检查**: 读取前检查剩余数据是否足够
3. **数值范围**: 注意数值类型的范围限制
4. **字符串编码**: 默认使用UTF-8编码
5. **内存使用**: 大文件解析时注意内存使用

## 演示页面

访问 `/protocol` 路由可以查看完整的协议解析演示，包括：
- 交互式数据解析
- 字节序差异演示
- 浮点数解析示例
- 实时结果展示

这个工具类为网页应用提供了完整的二进制协议处理能力，可以处理各种网络协议、文件格式和二进制数据交换需求。 