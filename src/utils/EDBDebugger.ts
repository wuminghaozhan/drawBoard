import { ProtocolParser } from './ProtocolParser';

/**
 * EDB文件调试工具
 * 用于分析EDB文件结构和定位解析问题
 */
export class EDBDebugger {
  private parser: ProtocolParser;
  private debugInfo: string[] = [];

  constructor(buffer: ArrayBuffer) {
    this.parser = new ProtocolParser(buffer, false);
  }

  /**
   * 调试分析EDB文件
   */
  debug(): string {
    this.debugInfo = [];
    this.debugInfo.push('=== EDB文件调试分析 ===');
    this.debugInfo.push(`文件总大小: ${this.parser.getBuffer().byteLength} 字节`);
    this.debugInfo.push('');

    try {
      this.debugHeader();
      this.debugItems();
      this.debugResources();
    } catch (error) {
      this.debugInfo.push(`解析错误: ${error}`);
      this.debugInfo.push(`当前位置: ${this.parser.tell()}`);
      this.debugInfo.push(`剩余字节: ${this.parser.remaining()}`);
    }

    return this.debugInfo.join('\n');
  }

  /**
   * 调试文件头
   */
  private debugHeader(): void {
    this.debugInfo.push('--- 文件头分析 ---');
    const startOffset = this.parser.tell();

    try {
      const idLength = this.parser.readUint32();
      this.debugInfo.push(`ID长度: ${idLength} (偏移: ${startOffset})`);
      
      if (idLength > 1000 || idLength < 0) {
        this.debugInfo.push(`⚠️  警告: ID长度异常: ${idLength}`);
        this.debugInfo.push(`尝试继续解析...`);
      }

      const docId = this.parser.readString(idLength);
      this.debugInfo.push(`文档ID: "${docId}"`);
      
      const version = this.parser.readUint16();
      this.debugInfo.push(`版本号: ${version}`);
      
      // 检查版本号的合理性
      if (version > 1000) {
        this.debugInfo.push(`⚠️  警告: 版本号异常: ${version}`);
        this.debugInfo.push(`可能文件格式不匹配或解析位置错误`);
        return;
      }
      
      if (version >= 50) {
        this.debugNewVersionHeader();
      } else {
        this.debugOldVersionHeader();
      }
    } catch (error) {
      this.debugInfo.push(`文件头解析错误: ${error}`);
      this.debugInfo.push(`当前位置: ${this.parser.tell()}`);
      this.debugInfo.push(`剩余字节: ${this.parser.remaining()}`);
      
      // 尝试显示前几个字节的十六进制
      this.debugInfo.push('--- 前32字节十六进制 ---');
      const currentPos = this.parser.tell();
      this.parser.seek(0);
      const firstBytes = this.parser.readBytes(Math.min(32, this.parser.remaining()));
      this.debugInfo.push(Array.from(firstBytes).map(b => b.toString(16).padStart(2, '0')).join(' '));
      this.parser.seek(currentPos);
    }
  }

  /**
   * 调试新版本文件头
   */
  private debugNewVersionHeader(): void {
    this.debugInfo.push('格式: 新版本 (version >= 50)');
    
    const zipped = this.parser.readUint8();
    this.debugInfo.push(`压缩标志: ${zipped}`);
    
    const pageNum = this.parser.readUint16();
    this.debugInfo.push(`页数: ${pageNum}`);
    
    const itemNum = this.parser.readUint32();
    this.debugInfo.push(`图元数量: ${itemNum}`);
    
    const height = this.parser.readFloat32();
    const width = this.parser.readFloat32();
    this.debugInfo.push(`画板尺寸: ${width} x ${height}`);
    
    const clientType = this.parser.readUint8();
    this.debugInfo.push(`客户端类型: ${clientType} (${this.getClientTypeName(clientType)})`);
    
    const clientVersionLength = this.parser.readUint32();
    this.debugInfo.push(`客户端版本长度: ${clientVersionLength}`);
    
    if (clientVersionLength > 10000 || clientVersionLength < 0) {
      this.debugInfo.push(`⚠️  警告: 客户端版本长度异常: ${clientVersionLength}`);
      this.debugInfo.push(`尝试跳过此字段...`);
      // 尝试跳过这个字段，继续解析
      this.parser.skip(Math.min(clientVersionLength, 1000));
      return;
    }
    
    const clientVersionStr = this.parser.readString(clientVersionLength);
    this.debugInfo.push(`客户端版本: "${clientVersionStr}"`);
    
    const lastModifyTime = this.parser.readInt64();
    this.debugInfo.push(`最后修改时间: ${new Date(lastModifyTime * 1000).toLocaleString()}`);
    
    const backgroundColor = this.parser.readUint32();
    this.debugInfo.push(`背景颜色: 0x${backgroundColor.toString(16).padStart(8, '0')}`);
  }

  /**
   * 调试旧版本文件头
   */
  private debugOldVersionHeader(): void {
    this.debugInfo.push('格式: 旧版本 (version < 50)');
    
    const pageNum = this.parser.readUint16();
    this.debugInfo.push(`页数: ${pageNum}`);
    
    const itemNum = this.parser.readUint32();
    this.debugInfo.push(`图元数量: ${itemNum}`);
    
    const height = this.parser.readFloat64();
    const width = this.parser.readFloat64();
    this.debugInfo.push(`画板尺寸: ${width} x ${height}`);
    
    const resourceNum = this.parser.readUint32();
    this.debugInfo.push(`资源数量: ${resourceNum}`);
    
    const clientType = this.parser.readUint8();
    this.debugInfo.push(`客户端类型: ${clientType} (${this.getClientTypeName(clientType)})`);
    
    const clientVersionLength = this.parser.readUint32();
    this.debugInfo.push(`客户端版本长度: ${clientVersionLength}`);
    
    if (clientVersionLength > 10000 || clientVersionLength < 0) {
      this.debugInfo.push(`⚠️  警告: 客户端版本长度异常: ${clientVersionLength}`);
      this.debugInfo.push(`尝试跳过此字段...`);
      // 尝试跳过这个字段，继续解析
      this.parser.skip(Math.min(clientVersionLength, 1000));
      return;
    }
    
    const clientVersionStr = this.parser.readString(clientVersionLength);
    this.debugInfo.push(`客户端版本: "${clientVersionStr}"`);
    
    const lastModifyTime = this.parser.readInt64();
    this.debugInfo.push(`最后修改时间: ${new Date(lastModifyTime * 1000).toLocaleString()}`);
    
    const skinDataLength = this.parser.readUint32();
    this.debugInfo.push(`皮肤数据长度: ${skinDataLength}`);
    
    if (skinDataLength > 0) {
      if (skinDataLength > 1000000 || skinDataLength < 0) {
        this.debugInfo.push(`⚠️  警告: 皮肤数据长度异常: ${skinDataLength}`);
        this.debugInfo.push(`尝试跳过皮肤数据...`);
        this.parser.skip(Math.min(skinDataLength, 10000));
        return;
      }
      this.debugSkinData();
    }
  }

  /**
   * 调试皮肤数据
   */
  private debugSkinData(): void {
    this.debugInfo.push('--- 皮肤数据 ---');
    
    const skinVersion = this.parser.readUint8();
    this.debugInfo.push(`皮肤版本: ${skinVersion}`);
    
    const skinPositionX = this.parser.readFloat64();
    const skinPositionY = this.parser.readFloat64();
    this.debugInfo.push(`皮肤位置: (${skinPositionX}, ${skinPositionY})`);
    
    const skinShowWidth = this.parser.readFloat64();
    const skinShowHeight = this.parser.readFloat64();
    this.debugInfo.push(`皮肤显示尺寸: ${skinShowWidth} x ${skinShowHeight}`);
    
    const skinImageType = this.parser.readUint8();
    this.debugInfo.push(`皮肤图片类型: ${skinImageType}`);
    
    const skinStorageType = this.parser.readUint8();
    this.debugInfo.push(`皮肤存储类型: ${skinStorageType}`);
    
    const skinRotateAngle = this.parser.readUint16();
    this.debugInfo.push(`皮肤旋转角度: ${skinRotateAngle}°`);
    
    const skinStorageDataLength = this.parser.readInt32();
    this.debugInfo.push(`皮肤存储数据长度: ${skinStorageDataLength}`);
    
    if (skinStorageDataLength > 1000000 || skinStorageDataLength < 0) {
      this.debugInfo.push(`⚠️  警告: 皮肤存储数据长度异常: ${skinStorageDataLength}`);
      return;
    }
    
    this.parser.skip(skinStorageDataLength);
    this.debugInfo.push(`已跳过皮肤存储数据: ${skinStorageDataLength} 字节`);
  }

  /**
   * 调试图元数据
   */
  private debugItems(): void {
    this.debugInfo.push('');
    this.debugInfo.push('--- 图元数据 ---');
    
    let itemCount = 0;
    const maxItems = 10; // 最多显示前10个图元
    
    while (this.parser.hasMore() && itemCount < maxItems) {
      const startOffset = this.parser.tell();
      
      try {
        const type = this.parser.readUint8();
        const dataLength = this.parser.readUint32();
        
        this.debugInfo.push(`图元 #${itemCount + 1}:`);
        this.debugInfo.push(`  类型: ${type} (${this.getShapeTypeName(type)})`);
        this.debugInfo.push(`  数据长度: ${dataLength}`);
        this.debugInfo.push(`  起始偏移: ${startOffset}`);
        
        if (dataLength > 1000000 || dataLength < 0) {
          this.debugInfo.push(`  ⚠️  警告: 数据长度异常: ${dataLength}`);
          break;
        }
        
        // 跳过图元数据
        this.parser.skip(dataLength - 5); // 减去已读取的type(1) + dataLength(4)
        
        itemCount++;
      } catch (error) {
        this.debugInfo.push(`  解析错误: ${error}`);
        break;
      }
    }
    
    if (this.parser.hasMore()) {
      this.debugInfo.push(`... 还有更多图元数据 (已显示前 ${itemCount} 个)`);
    }
  }

  /**
   * 调试资源数据
   */
  private debugResources(): void {
    this.debugInfo.push('');
    this.debugInfo.push('--- 资源数据 ---');
    
    let resourceCount = 0;
    const maxResources = 5; // 最多显示前5个资源
    
    while (this.parser.hasMore() && resourceCount < maxResources) {
      const startOffset = this.parser.tell();
      
      try {
        const type = this.parser.readUint16();
        const resourceID = this.parser.readUint32();
        const dataLength = this.parser.readInt32();
        
        this.debugInfo.push(`资源 #${resourceCount + 1}:`);
        this.debugInfo.push(`  类型: ${type} (${this.getResourceTypeName(type)})`);
        this.debugInfo.push(`  资源ID: ${resourceID}`);
        this.debugInfo.push(`  数据长度: ${dataLength}`);
        this.debugInfo.push(`  起始偏移: ${startOffset}`);
        
        if (dataLength > 1000000 || dataLength < 0) {
          this.debugInfo.push(`  ⚠️  警告: 数据长度异常: ${dataLength}`);
          break;
        }
        
        // 跳过资源数据
        this.parser.skip(dataLength);
        
        resourceCount++;
      } catch (error) {
        this.debugInfo.push(`  解析错误: ${error}`);
        break;
      }
    }
    
    if (this.parser.hasMore()) {
      this.debugInfo.push(`... 还有更多资源数据 (已显示前 ${resourceCount} 个)`);
    }
  }

  /**
   * 获取客户端类型名称
   */
  private getClientTypeName(type: number): string {
    switch (type) {
      case 0: return 'PC';
      case 1: return 'iOS';
      case 2: return 'Android';
      default: return '未知';
    }
  }

  /**
   * 获取图元类型名称
   */
  private getShapeTypeName(type: number): string {
    const shapeTypes: { [key: number]: string } = {
      0: 'Traceline',
      1: 'Rectangle',
      2: 'Circle',
      3: 'Text',
      4: 'Pixmap',
      5: 'Triangle',
      6: 'Ellipse',
      7: 'SimpleLine',
      8: 'Square',
      9: 'Triangle',
      10: 'PressureLine',
      13: 'Polyline',
      15: 'MarkPen',
      16: 'CircleArc',
      20: 'ShapeGroup',
      21: 'TimePressureLine',
      22: 'OddEvenLine',
      23: 'ChalkLine',
      30: 'CoursewareLink',
      100: 'EraserLine',
      200: 'Audio',
      201: 'Video',
      210: 'TaskGood',
      211: 'AudioNew',
      212: 'VideoNew'
    };
    return shapeTypes[type] || '未知';
  }

  /**
   * 获取资源类型名称
   */
  private getResourceTypeName(type: number): string {
    switch (type) {
      case 0: return '音频';
      case 1: return '视频';
      case 2: return '图片';
      default: return '未知';
    }
  }
} 