import React, { useState } from 'react';
import { ProtocolParser, ProtocolWriter } from '../../utils/ProtocolParser';
import './style.scss';

const ProtocolDemo: React.FC = () => {
  const [hexInput, setHexInput] = useState('01000000020000000300000048656c6c6f20576f726c64');
  const [parseResult, setParseResult] = useState<string>('');
  const [endianness, setEndianness] = useState<'big' | 'little'>('big');

  // 解析十六进制字符串
  const parseHexString = () => {
    try {
      const parser = ProtocolParser.fromHexString(hexInput, endianness === 'little');
      const results: string[] = [];

      // 读取各种数据类型
      while (parser.hasMore()) {
        const offset = parser.tell();
        
        if (parser.remaining() >= 4) {
          const uint8 = parser.readUint8();
          const uint16 = parser.readUint16();
          const uint32 = parser.readUint32();
          
          results.push(`位置 ${offset}: uint8=${uint8}, uint16=${uint16}, uint32=${uint32}`);
        } else if (parser.remaining() >= 2) {
          const uint8 = parser.readUint8();
          const uint16 = parser.readUint16();
          results.push(`位置 ${offset}: uint8=${uint8}, uint16=${uint16}`);
        } else if (parser.remaining() >= 1) {
          const uint8 = parser.readUint8();
          results.push(`位置 ${offset}: uint8=${uint8}`);
        }
      }

      setParseResult(results.join('\n'));
    } catch (error) {
      setParseResult(`解析错误: ${error}`);
    }
  };

  // 生成示例数据
  const generateExample = () => {
    const writer = new ProtocolWriter(1024, endianness === 'little');
    
    // 写入示例数据
    writer.writeUint8(1);           // 0x01
    writer.writeUint16(2);          // 0x0002 或 0x0200
    writer.writeUint32(3);          // 0x00000003 或 0x03000000
    writer.writeString('Hello World'); // 字符串
    
    const data = writer.getData();
    const hexString = Array.from(data).map(byte => byte.toString(16).padStart(2, '0')).join('');
    setHexInput(hexString);
  };

  // 解析字符串数据
  const parseStringData = () => {
    try {
      const parser = ProtocolParser.fromHexString(hexInput, endianness === 'little');
      const results: string[] = [];

      // 跳过前面的数字
      parser.skip(7); // 跳过 uint8 + uint16 + uint32
      
      // 读取字符串
      const remainingBytes = parser.remaining();
      const stringData = parser.readString(remainingBytes);
      results.push(`字符串数据: "${stringData}"`);
      results.push(`字符串长度: ${remainingBytes} 字节`);
      results.push(`十六进制: ${Array.from(new TextEncoder().encode(stringData)).map(b => b.toString(16).padStart(2, '0')).join('')}`);

      setParseResult(results.join('\n'));
    } catch (error) {
      setParseResult(`解析错误: ${error}`);
    }
  };

  // 演示字节序差异
  const demonstrateEndianness = () => {
    const writerBig = new ProtocolWriter(1024, false);
    const writerLittle = new ProtocolWriter(1024, true);
    
    writerBig.writeUint16(0x1234);
    writerLittle.writeUint16(0x1234);
    
    const bigData = writerBig.getData();
    const littleData = writerLittle.getData();
    
    const bigHex = Array.from(bigData).map(byte => byte.toString(16).padStart(2, '0')).join('');
    const littleHex = Array.from(littleData).map(byte => byte.toString(16).padStart(2, '0')).join('');
    
    setParseResult(`大端序 (Big Endian): ${bigHex}\n小端序 (Little Endian): ${littleHex}`);
  };

  // 演示浮点数解析
  const demonstrateFloat = () => {
    const writer = new ProtocolWriter(1024, endianness === 'little');
    writer.writeFloat32(3.14159);
    writer.writeFloat64(2.718281828);
    
    const data = writer.getData();
    const hexString = Array.from(data).map(byte => byte.toString(16).padStart(2, '0')).join('');
    
    const parser = ProtocolParser.fromHexString(hexString, endianness === 'little');
    const float32 = parser.readFloat32();
    const float64 = parser.readFloat64();
    
    setParseResult(`Float32: ${float32}\nFloat64: ${float64}\n十六进制: ${hexString}`);
  };

  return (
    <div className="protocol-demo">
      <h1>协议解析演示</h1>
      
      <div className="demo-section">
        <h2>字节序设置</h2>
        <div className="endianness-controls">
          <label>
            <input
              type="radio"
              value="big"
              checked={endianness === 'big'}
              onChange={(e) => setEndianness(e.target.value as 'big' | 'little')}
            />
            大端序 (Big Endian)
          </label>
          <label>
            <input
              type="radio"
              value="little"
              checked={endianness === 'little'}
              onChange={(e) => setEndianness(e.target.value as 'big' | 'little')}
            />
            小端序 (Little Endian)
          </label>
        </div>
      </div>

      <div className="demo-section">
        <h2>十六进制数据输入</h2>
        <textarea
          value={hexInput}
          onChange={(e) => setHexInput(e.target.value)}
          placeholder="输入十六进制数据，例如: 010000000200000003000000"
          rows={3}
        />
        <div className="button-group">
          <button onClick={generateExample}>生成示例数据</button>
          <button onClick={parseHexString}>解析数据</button>
          <button onClick={parseStringData}>解析字符串</button>
        </div>
      </div>

      <div className="demo-section">
        <h2>演示功能</h2>
        <div className="button-group">
          <button onClick={demonstrateEndianness}>演示字节序差异</button>
          <button onClick={demonstrateFloat}>演示浮点数解析</button>
        </div>
      </div>

      <div className="demo-section">
        <h2>解析结果</h2>
        <pre className="parse-result">{parseResult || '点击按钮开始解析...'}</pre>
      </div>

      <div className="demo-section">
        <h2>使用说明</h2>
        <div className="usage-info">
          <h3>支持的数据类型:</h3>
          <ul>
            <li><strong>uint8</strong>: 8位无符号整数 (0-255)</li>
            <li><strong>uint16</strong>: 16位无符号整数 (0-65535)</li>
            <li><strong>uint32</strong>: 32位无符号整数 (0-4294967295)</li>
            <li><strong>int8</strong>: 8位有符号整数 (-128-127)</li>
            <li><strong>int16</strong>: 16位有符号整数 (-32768-32767)</li>
            <li><strong>int32</strong>: 32位有符号整数 (-2147483648-2147483647)</li>
            <li><strong>float32</strong>: 32位浮点数</li>
            <li><strong>float64</strong>: 64位浮点数</li>
            <li><strong>string</strong>: UTF-8字符串</li>
          </ul>
          
          <h3>字节序说明:</h3>
          <ul>
            <li><strong>大端序</strong>: 最高有效字节存储在最低地址 (网络字节序)</li>
            <li><strong>小端序</strong>: 最低有效字节存储在最低地址 (Intel x86)</li>
          </ul>
          
          <h3>示例数据格式:</h3>
          <p>示例数据包含: uint8(1) + uint16(2) + uint32(3) + string("Hello World")</p>
        </div>
      </div>
    </div>
  );
};

export default ProtocolDemo; 