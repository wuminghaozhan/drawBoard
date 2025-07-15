import { ProtocolParser } from './ProtocolParser';

/**
 * EDB格式分析器
 * 专门用于分析EDB文件的结构和格式
 */
export class EDBFormatAnalyzer {
  private parser: ProtocolParser;
  private analysis: string[] = [];

  constructor(buffer: ArrayBuffer) {
    this.parser = new ProtocolParser(buffer, false);
  }

  /**
   * 分析文件格式
   */
  analyze(): string {
    this.analysis = [];
    this.analysis.push('=== EDB文件格式分析 ===');
    this.analysis.push(`文件总大小: ${this.parser.getBuffer().byteLength} 字节`);
    this.analysis.push('');

    try {
      this.analyzeHeaderStructure();
      this.analyzeDataStructure();
    } catch (error) {
      this.analysis.push(`分析错误: ${error}`);
      this.analysis.push(`当前位置: ${this.parser.tell()}`);
      this.analysis.push(`剩余字节: ${this.parser.remaining()}`);
    }

    return this.analysis.join('\n');
  }

  /**
   * 分析文件头结构
   */
  private analyzeHeaderStructure(): void {
    this.analysis.push('--- 文件头结构分析 ---');
    
    // 显示前100字节的十六进制
    this.analysis.push('前100字节十六进制:');
    const currentPos = this.parser.tell();
    const firstBytes = this.parser.readBytes(Math.min(100, this.parser.remaining()));
    const hexLines = [];
    for (let i = 0; i < firstBytes.length; i += 16) {
      const line = Array.from(firstBytes.slice(i, i + 16))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ');
      const offset = (i + currentPos).toString(16).padStart(8, '0');
      hexLines.push(`${offset}: ${line}`);
    }
    this.analysis.push(hexLines.join('\n'));
    this.parser.seek(currentPos);

    // 尝试不同的解析方式
    this.analysis.push('');
    this.analysis.push('--- 尝试不同解析方式 ---');
    
    // 方式1: 标准解析
    this.tryStandardParsing();
    
    // 方式2: 跳过一些字段
    this.trySkipParsing();
    
    // 方式3: 不同的数据类型
    this.tryDifferentDataTypes();
  }

  /**
   * 尝试标准解析
   */
  private tryStandardParsing(): void {
    this.analysis.push('方式1: 标准解析');
    const startPos = this.parser.tell();
    
    try {
      const idLength = this.parser.readUint32();
      this.analysis.push(`  ID长度: ${idLength}`);
      
      if (idLength > 0 && idLength < 100) {
        const docId = this.parser.readString(idLength);
        this.analysis.push(`  文档ID: "${docId}"`);
        
        const version = this.parser.readUint16();
        this.analysis.push(`  版本号: ${version}`);
        
        if (version >= 50) {
          this.analysis.push('  格式: 新版本');
          this.tryNewVersionParsing();
        } else {
          this.analysis.push('  格式: 旧版本');
          this.tryOldVersionParsing();
        }
      } else {
        this.analysis.push(`  ID长度异常，停止解析`);
      }
    } catch (error) {
      this.analysis.push(`  标准解析失败: ${error}`);
    }
    
    this.parser.seek(startPos);
  }

  /**
   * 尝试新版本解析
   */
  private tryNewVersionParsing(): void {
    try {
      const zipped = this.parser.readUint8();
      const pageNum = this.parser.readUint16();
      const itemNum = this.parser.readUint32();
      const height = this.parser.readFloat32();
      const width = this.parser.readFloat32();
      const clientType = this.parser.readUint8();
      
      this.analysis.push(`  压缩: ${zipped}`);
      this.analysis.push(`  页数: ${pageNum}`);
      this.analysis.push(`  图元数: ${itemNum}`);
      this.analysis.push(`  尺寸: ${width} x ${height}`);
      this.analysis.push(`  客户端类型: ${clientType}`);
      
      // 尝试读取客户端版本长度
      const clientVersionLength = this.parser.readUint32();
      this.analysis.push(`  客户端版本长度: ${clientVersionLength}`);
      
      if (clientVersionLength > 0 && clientVersionLength < 1000) {
        const clientVersionStr = this.parser.readString(clientVersionLength);
        this.analysis.push(`  客户端版本: "${clientVersionStr}"`);
      } else {
        this.analysis.push(`  客户端版本长度异常: ${clientVersionLength}`);
      }
    } catch (error) {
      this.analysis.push(`  新版本解析失败: ${error}`);
    }
  }

  /**
   * 尝试旧版本解析
   */
  private tryOldVersionParsing(): void {
    try {
      const pageNum = this.parser.readUint16();
      const itemNum = this.parser.readUint32();
      const height = this.parser.readFloat64();
      const width = this.parser.readFloat64();
      const resourceNum = this.parser.readUint32();
      const clientType = this.parser.readUint8();
      
      this.analysis.push(`  页数: ${pageNum}`);
      this.analysis.push(`  图元数: ${itemNum}`);
      this.analysis.push(`  尺寸: ${width} x ${height}`);
      this.analysis.push(`  资源数: ${resourceNum}`);
      this.analysis.push(`  客户端类型: ${clientType}`);
      
      // 尝试读取客户端版本长度
      const clientVersionLength = this.parser.readUint32();
      this.analysis.push(`  客户端版本长度: ${clientVersionLength}`);
      
      if (clientVersionLength > 0 && clientVersionLength < 1000) {
        const clientVersionStr = this.parser.readString(clientVersionLength);
        this.analysis.push(`  客户端版本: "${clientVersionStr}"`);
      } else {
        this.analysis.push(`  客户端版本长度异常: ${clientVersionLength}`);
      }
    } catch (error) {
      this.analysis.push(`  旧版本解析失败: ${error}`);
    }
  }

  /**
   * 尝试跳过解析
   */
  private trySkipParsing(): void {
    this.analysis.push('');
    this.analysis.push('方式2: 跳过解析');
    const startPos = this.parser.tell();
    
    try {
      const idLength = this.parser.readUint32();
      this.analysis.push(`  ID长度: ${idLength}`);
      
      if (idLength > 0 && idLength < 100) {
        this.parser.skip(idLength);
        const version = this.parser.readUint16();
        this.analysis.push(`  版本号: ${version}`);
        
        if (version >= 50) {
          // 跳过新版本字段
          this.parser.skip(1 + 2 + 4 + 4 + 4 + 1); // zipped + pageNum + itemNum + height + width + clientType
          const clientVersionLength = this.parser.readUint32();
          this.analysis.push(`  跳过后客户端版本长度: ${clientVersionLength}`);
        } else {
          // 跳过旧版本字段
          this.parser.skip(2 + 4 + 8 + 8 + 4 + 1); // pageNum + itemNum + height + width + resourceNum + clientType
          const clientVersionLength = this.parser.readUint32();
          this.analysis.push(`  跳过后客户端版本长度: ${clientVersionLength}`);
        }
      }
    } catch (error) {
      this.analysis.push(`  跳过解析失败: ${error}`);
    }
    
    this.parser.seek(startPos);
  }

  /**
   * 尝试不同数据类型
   */
  private tryDifferentDataTypes(): void {
    this.analysis.push('');
    this.analysis.push('方式3: 不同数据类型');
    const startPos = this.parser.tell();
    
    try {
      const idLength = this.parser.readUint32();
      this.analysis.push(`  ID长度: ${idLength}`);
      
      if (idLength > 0 && idLength < 100) {
        this.parser.skip(idLength);
        const version = this.parser.readUint16();
        this.analysis.push(`  版本号: ${version}`);
        
        if (version >= 50) {
          // 新版本 - 尝试不同的数据类型
          this.parser.skip(1 + 2 + 4 + 4 + 4 + 1); // 跳过到客户端版本长度位置
          
          // 尝试读取为不同数据类型
          const asUint32 = this.parser.readUint32();
          this.parser.seek(this.parser.tell() - 4);
          
          const asUint16 = this.parser.readUint16();
          this.parser.seek(this.parser.tell() - 2);
          
          const asUint8 = this.parser.readUint8();
          this.parser.seek(this.parser.tell() - 1);
          
          const asFloat32 = this.parser.readFloat32();
          this.parser.seek(this.parser.tell() - 4);
          
          this.analysis.push(`  作为uint32: ${asUint32}`);
          this.analysis.push(`  作为uint16: ${asUint16}`);
          this.analysis.push(`  作为uint8: ${asUint8}`);
          this.analysis.push(`  作为float32: ${asFloat32}`);
        }
      }
    } catch (error) {
      this.analysis.push(`  数据类型测试失败: ${error}`);
    }
    
    this.parser.seek(startPos);
  }

  /**
   * 分析数据结构
   */
  private analyzeDataStructure(): void {
    this.analysis.push('');
    this.analysis.push('--- 数据结构分析 ---');
    
    // 显示文件末尾的一些字节
    const totalSize = this.parser.getBuffer().byteLength;
    const endBytes = Math.min(50, totalSize);
    this.parser.seek(totalSize - endBytes);
    
    const lastBytes = this.parser.readBytes(endBytes);
    this.analysis.push(`末尾${endBytes}字节十六进制:`);
    this.analysis.push(Array.from(lastBytes).map(b => b.toString(16).padStart(2, '0')).join(' '));
  }
} 