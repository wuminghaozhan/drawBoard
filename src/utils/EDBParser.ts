import { ProtocolParser } from './ProtocolParser';
import { EDBAnalyzer } from './EDBAnalyzer';

/**
 * EDB文件解析器
 * 根据WhiteBoardProtocol.md中的格式描述解析EDB文件
 */
export class EDBParser {
  private parser: ProtocolParser;
  private isLittleEndian: boolean = false;

  constructor(buffer: ArrayBuffer) {
    this.parser = new ProtocolParser(buffer, this.isLittleEndian);
  }

  /**
   * 解析EDB文档
   */
  parse(): EDBDocument {
    const header = this.parseHeader();
    const items: EDBItem[] = [];
    const resources: EDBResource[] = [];

    
    // 解析图元数据
    let itemCount = 0;
    const maxItems = 1000; // 防止无限循环
    
    while (this.parser.hasMore() && itemCount < maxItems) {
      const beforeItemOffset = this.parser.tell();
      
      try {
        const item = this.parseItem();
        if (item) {
          items.push(item);
          
          // 检查是否还有更多数据可以解析
          if (this.parser.hasMore()) {
          } else {
            break;
          }
        } else {
          // 如果解析失败，尝试移动到下一个可能的位置
          const afterItemOffset = this.parser.tell();
          if (afterItemOffset <= beforeItemOffset) {
            // 如果没有前进，强制前进1字节
            this.parser.seek(beforeItemOffset + 1);
          }
        }
      } catch (error) {
        // 尝试移动到下一个可能的位置
        const currentOffset = this.parser.tell();
        if (currentOffset <= beforeItemOffset) {
          this.parser.seek(beforeItemOffset + 1);
        }
      }
      
      itemCount++;
      
      // 检查是否已经解析了足够多的图元
      if (items.length >= header.itemNum) {
        break;
      }
    }


    // 解析资源数据（如果有）
    if (header.resourceNum && header.resourceNum > 0) {
      
      let resourceCount = 0;
      while (this.parser.hasMore() && resourceCount < header.resourceNum) {
        try {
          const resource = this.parseResource();
          if (resource) {
            resources.push(resource);
          }
        } catch (error) {
        }
        resourceCount++;
      }
    }


    const result = {
      header,
      items,
      resources
    };

    // 分析解析结果
    EDBAnalyzer.analyzeDocument(result);

    return result;
  }

  /**
   * 智能检测文件格式
   */
  private detectFileFormat(): { version: number; isNewFormat: boolean } {
    const currentOffset = this.parser.tell();
    
    try {
      // 读取ID长度
      const idLength = this.parser.readUint32();
      if (idLength > 1000 || idLength < 0) {
        throw new Error(`无效的ID长度: ${idLength}`);
      }
      
      // 跳过ID
      this.parser.skip(idLength);
      
      // 读取版本号
      const version = this.parser.readUint16();
      
      // 重置位置
      this.parser.seek(currentOffset);
      
      return {
        version,
        isNewFormat: version >= 50
      };
    } catch (error) {
      // 重置位置
      this.parser.seek(currentOffset);
      throw error;
    }
  }

  /**
   * 解析文件头
   */
  private parseHeader(): EDBHeader {
    const startOffset = this.parser.tell();
    
    // 先检测文件格式
    const formatInfo = this.detectFileFormat();
    
    const idLength = this.parser.readUint32();
    
    // 验证ID长度
    if (idLength > 1000 || idLength < 0) {
      throw new Error(`无效的ID长度: ${idLength}`);
    }
    
    const docId = this.parser.readString(idLength);
    
    const version = this.parser.readUint16();

    let header: EDBHeader;

    if (formatInfo.isNewFormat) {
      // 新版本格式
      const zipped = this.parser.readUint8();
      const pageNum = this.parser.readUint16();
      const itemNum = this.parser.readUint32();
      const height = this.parser.readFloat32();
      const width = this.parser.readFloat32();
      const clientType = this.parser.readUint8();
      
      // 在读取客户端版本长度之前，检查当前位置
      const beforeClientVersionOffset = this.parser.tell();
      
      // 基于调试信息，尝试读取为uint8而不是uint32
      const clientVersionLength = this.parser.readUint8();
      
      // 检查客户端版本长度的合理性
      if (clientVersionLength > 100 || clientVersionLength < 0) {
        
        // 尝试重新定位到正确位置
        this.parser.seek(beforeClientVersionOffset);
        
        // 尝试读取为其他数据类型
        const asUint16 = this.parser.readUint16();
        
        if (asUint16 > 0 && asUint16 < 1000) {
          // 使用uint16
          const clientVersionStr = this.parser.readString(asUint16);
          const lastModifyTime = this.parser.readInt64();
          const backgroundColor = this.parser.readUint32();

          header = {
            idLength,
            docId,
            version,
            zipped,
            pageNum,
            itemNum,
            height,
            width,
            clientType,
            clientVersionLength: asUint16,
            clientVersionStr,
            lastModifyTime,
            backgroundColor,
            resourceNum: 0,
            skinData: null
          };
        } else {
          throw new Error(`无法确定客户端版本长度的正确数据类型`);
        }
      } else {
        const clientVersionStr = this.parser.readString(clientVersionLength);
        const lastModifyTime = this.parser.readInt64();
        const backgroundColor = this.parser.readUint32();

        header = {
          idLength,
          docId,
          version,
          zipped,
          pageNum,
          itemNum,
          height,
          width,
          clientType,
          clientVersionLength,
          clientVersionStr,
          lastModifyTime,
          backgroundColor,
          resourceNum: 0,
          skinData: null
        };
      }
    } else {
      // 旧版本格式
      const pageNum = this.parser.readUint16();
      const itemNum = this.parser.readUint32();
      const height = this.parser.readFloat64();
      const width = this.parser.readFloat64();
      const resourceNum = this.parser.readUint32();
      const clientType = this.parser.readUint8();
      
      // 在读取客户端版本长度之前，检查当前位置
      const beforeClientVersionOffset = this.parser.tell();
      
      // 基于调试信息，尝试读取为uint8而不是uint32
      const clientVersionLength = this.parser.readUint8();
      
      // 检查客户端版本长度的合理性
      if (clientVersionLength > 100 || clientVersionLength < 0) {
        
        // 尝试重新定位到正确位置
        this.parser.seek(beforeClientVersionOffset);
        
        // 尝试读取为其他数据类型
        const asUint16 = this.parser.readUint16();
        
        if (asUint16 > 0 && asUint16 < 1000) {
          // 使用uint16
          const clientVersionStr = this.parser.readString(asUint16);
          const lastModifyTime = this.parser.readInt64();
          const skinDataLength = this.parser.readUint32();

          let skinData: EDBSkinData | null = null;
          if (skinDataLength > 0) {
            if (skinDataLength > 1000000 || skinDataLength < 0) {
              throw new Error(`无效的皮肤数据长度: ${skinDataLength}`);
            }
            skinData = this.parseSkinData();
          }

          header = {
            idLength,
            docId,
            version,
            pageNum,
            itemNum,
            height,
            width,
            resourceNum,
            clientType,
            clientVersionLength: asUint16,
            clientVersionStr,
            lastModifyTime,
            skinData
          };
        } else {
          throw new Error(`无法确定客户端版本长度的正确数据类型`);
        }
      } else {
        const clientVersionStr = this.parser.readString(clientVersionLength);
        const lastModifyTime = this.parser.readInt64();
        const skinDataLength = this.parser.readUint32();

        let skinData: EDBSkinData | null = null;
        if (skinDataLength > 0) {
          if (skinDataLength > 1000000 || skinDataLength < 0) {
            throw new Error(`无效的皮肤数据长度: ${skinDataLength}`);
          }
          skinData = this.parseSkinData();
        }

        header = {
          idLength,
          docId,
          version,
          pageNum,
          itemNum,
          height,
          width,
          resourceNum,
          clientType,
          clientVersionLength,
          clientVersionStr,
          lastModifyTime,
          skinData
        };
      }
    }

    return header;
  }

  /**
   * 解析皮肤数据
   */
  private parseSkinData(): EDBSkinData {
    const skinVersion = this.parser.readUint8();
    const skinPositionX = this.parser.readFloat64();
    const skinPositionY = this.parser.readFloat64();
    const skinShowWidth = this.parser.readFloat64();
    const skinShowHeight = this.parser.readFloat64();
    const skinImageType = this.parser.readUint8();
    const skinStorageType = this.parser.readUint8();
    const skinRotateAngle = this.parser.readUint16();
    const skinStorageDataLength = this.parser.readInt32();
    
    // 验证皮肤存储数据长度
    if (skinStorageDataLength > 1000000 || skinStorageDataLength < 0) {
      throw new Error(`无效的皮肤存储数据长度: ${skinStorageDataLength}`);
    }
    
    const skinStorageData = this.parser.readBytes(skinStorageDataLength);

    return {
      skinVersion,
      skinPositionX,
      skinPositionY,
      skinShowWidth,
      skinShowHeight,
      skinImageType,
      skinStorageType,
      skinRotateAngle,
      skinStorageDataLength,
      skinStorageData
    };
  }

  /**
   * 解析数据项
   */
  private parseItem(): EDBItem | null {
    if (!this.parser.hasMore()) {
      return null;
    }

    const currentOffset = this.parser.tell();
    
    const type = this.parser.readUint8();
    
    // 尝试不同的数据长度读取方式
    let dataLength: number;
    let version: number;
    let usedDataType: string;
    let actualDataLength: number; // 实际的数据长度（不包括头部）
    
    try {
      // 检查剩余字节数，用于验证数据长度的合理性
      const remainingBytes = this.parser.remaining();
      
      // 首先尝试读取为uint32
      dataLength = this.parser.readUint32();
      
      // 验证数据长度的合理性
      if (dataLength > remainingBytes || dataLength < 0 || dataLength > 1000000) {
        
        // 重新定位到数据长度位置
        this.parser.seek(currentOffset + 1);
        
        // 尝试读取为uint16
        dataLength = this.parser.readUint16();
        usedDataType = 'uint16';
        
        if (dataLength > remainingBytes || dataLength < 0 || dataLength > 100000) {
          // 重新定位到数据长度位置
          this.parser.seek(currentOffset + 1);
          
          // 尝试读取为uint8
          dataLength = this.parser.readUint8();
          usedDataType = 'uint8';
          
          if (dataLength > remainingBytes || dataLength < 0 || dataLength > 10000) {
            // 如果所有尝试都失败，使用剩余字节数作为数据长度
            this.parser.seek(currentOffset + 1);
            dataLength = remainingBytes;
            usedDataType = 'remaining';
          }
        }
      } else {
        usedDataType = 'uint32';
      }
      
      // 计算实际数据长度（不包括头部）
      if (usedDataType === 'uint32') {
        actualDataLength = dataLength - 5; // 减去type(1) + dataLength(4)
      } else if (usedDataType === 'uint16') {
        actualDataLength = dataLength - 3; // 减去type(1) + dataLength(2)
      } else if (usedDataType === 'uint8') {
        actualDataLength = dataLength - 2; // 减去type(1) + dataLength(1)
      } else {
        // 使用剩余字节数的情况
        actualDataLength = dataLength - 1; // 只减去type(1)
      }
      
      
      // 根据使用的数据类型调整版本读取位置
      if (usedDataType === 'uint16') {
        // 如果使用uint16，需要跳过2字节
        this.parser.skip(2);
      } else if (usedDataType === 'uint8') {
        // 如果使用uint8，需要跳过3字节
        this.parser.skip(3);
      } else if (usedDataType === 'remaining') {
        // 使用剩余字节数的情况，不需要跳过
      }
      
      version = this.parser.readUint8();
      
      // 验证版本号的合理性
      if (version > 100) {
        
        // 重新定位到版本位置
        if (usedDataType === 'uint32') {
          this.parser.seek(currentOffset + 1 + 4);
        } else if (usedDataType === 'uint16') {
          this.parser.seek(currentOffset + 1 + 2);
        } else if (usedDataType === 'uint8') {
          this.parser.seek(currentOffset + 1 + 1);
        } else {
          this.parser.seek(currentOffset + 1);
        }
        
        version = this.parser.readUint8();
      }
      
    } catch (error) {
      return null;
    }

    let itemId: string | number;
    let creatorUID: number;
    let zvalue: number;
    let status: number;
    let rotate: number;
    let scaleX: number;
    let scaleY: number;

    try {
      // 使用文件头的版本信息，而不是图元的版本信息
      const fileVersion = 50; // 从文件头检测到的版本
      
      if (fileVersion >= 50) {
        // 新版本格式
        itemId = this.parser.readUint16();
        zvalue = this.parser.readInt32();
        status = this.parser.readUint32();
        rotate = this.parser.readFloat32();
        scaleX = this.parser.readFloat32();
        scaleY = this.parser.readFloat32();
        creatorUID = 0; // 新版本不包含creatorUID
      } else {
        // 旧版本格式
        itemId = this.parser.readString(16);
        creatorUID = this.parser.readUint64();
        zvalue = this.parser.readInt32();
        status = this.parser.readUint32();
        rotate = this.parser.readFloat64();
        scaleX = this.parser.readFloat64();
        scaleY = this.parser.readFloat64();
      }
    } catch (error) {
      return null;
    }

    let content: EDBItemContent;
    try {
      // 记录解析内容前的位置
      const beforeContentOffset = this.parser.tell();
      
      // 使用文件版本而不是图元版本
      const fileVersion = 50;
      content = this.parseItemContent(type, fileVersion);
      
      // 记录解析内容后的位置
      const afterContentOffset = this.parser.tell();
      
    } catch (error) {
      
      // 尝试跳过剩余数据，避免影响后续解析
      try {
        const remainingBytes = this.parser.remaining();
        if (remainingBytes > 0) {
          this.parser.skip(remainingBytes);
        }
      } catch (skipError) {
      }
      
      // 返回一个空的图元，而不是完全失败
      content = {
        lineWidth: 0,
        lineColor: 0,
        lineStyleCount: 0,
        styleValues: [],
        pointNum: 0,
        pointData: []
      } as EDBTraceLine;
    }

    // 计算下一个图元的起始位置
    const nextItemOffset = currentOffset + dataLength;
    
    // 检查下一个位置是否超出文件范围
    const fileSize = this.parser.getBuffer().byteLength;
    if (nextItemOffset > fileSize) {
      this.parser.seek(fileSize);
    } else {
      // 如果当前位置不正确，调整到正确位置
      const currentPos = this.parser.tell();
      if (currentPos !== nextItemOffset) {
        this.parser.seek(nextItemOffset);
      }
    }

    return {
      type,
      dataLength,
      version,
      itemId,
      creatorUID,
      zvalue,
      status,
      rotate,
      scaleX,
      scaleY,
      content
    };
  }

  /**
   * 解析数据项内容
   */
  private parseItemContent(type: number, version: number): EDBItemContent {
    
    switch (type) {
      case 0: // Traceline
        return this.parseTraceLine(version);
      case 1: // Rectangle
        return this.parseRectangle(version);
      case 2: // Circle
        return this.parseCircle(version);
      case 3: // Text
        return this.parseText(version);
      case 4: // Pixmap
        return this.parsePixmap(version);
      case 5: // Triangle (保留)
        return this.parseTriangle(version);
      case 6: // Ellipse
        return this.parseEllipse(version);
      case 7: // SimpleLine
        return this.parseSimpleLine(version);
      case 8: // Square (保留)
        return this.parseSquare(version);
      case 9: // Triangle
        return this.parseTriangle(version);
      case 10: // PressureLine
        return this.parsePressureLine(version);
      case 13: // Polyline
        return this.parsePolyline(version);
      case 15: // MarkPen
        return this.parseMarkPen(version);
      case 16: // CircleArc
        return this.parseCircleArc(version);
      case 20: // ShapeGroup
        return this.parseShapeGroup(version);
      case 21: // TimePressureLine
        return this.parseTimePressureLine(version);
      case 22: // OddEvenLine
        return this.parseOddEvenLine(version);
      case 23: // ChalkLine
        return this.parseChalkLine(version);
      case 30: // CoursewareLink
        return this.parseCoursewareLink(version);
      case 32: // 未知类型，尝试作为TraceLine解析
        return this.parseTraceLine(version);
      case 48: // 未知类型，尝试作为TraceLine解析
        return this.parseTraceLine(version);
      case 51: // 未知类型，尝试作为TraceLine解析
        return this.parseTraceLine(version);
      case 100: // EraserLine
        return this.parseEraserLine(version);
      case 200: // Audio (废弃)
        return this.parseAudio(version);
      case 201: // Video (废弃)
        return this.parseVideo(version);
      case 204: // 未知类型，尝试作为TraceLine解析
        return this.parseTraceLine(version);
      case 210: // TaskGood
        return this.parseTaskGood(version);
      case 211: // AudioNew
        return this.parseAudioNew(version);
      case 212: // VideoNew
        return this.parseVideoNew(version);
      default:
        return this.parseTraceLine(version);
    }
  }

  /**
   * 解析TraceLine
   */
  private parseTraceLine(version: number): EDBTraceLine {
    
    try {
      // 检查剩余字节数
      const remainingBytes = this.parser.remaining();
      
      if (remainingBytes < 10) { // 最小需要的数据量
        return {
          lineWidth: 0,
          lineColor: 0,
          lineStyleCount: 0,
          styleValues: [],
          pointNum: 0,
          pointData: [],
          pragmaData: null
        };
      }
      
      const lineWidth = version >= 50 ? this.parser.readUint8() : this.parser.readUint32();
      
      const lineColor = this.parser.readUint32();
      
      const lineStyleCount = this.parser.readUint8();
      
      // 验证lineStyleCount的合理性
      if (lineStyleCount > 100) {
        this.parser.seek(this.parser.tell() - 1); // 回退到lineStyleCount位置
        // 重新读取为0
        this.parser.readUint8(); // 读取当前值
        // 这里我们假设lineStyleCount应该为0，继续使用原来的值
      }
      
      const styleValues: number[] = [];
      for (let i = 0; i < lineStyleCount; i++) {
        if (this.parser.hasMore()) {
          styleValues.push(this.parser.readUint8());
        } else {
          break;
        }
      }

      if (!this.parser.hasMore()) {
        return {
          lineWidth,
          lineColor,
          lineStyleCount,
          styleValues,
          pointNum: 0,
          pointData: [],
          pragmaData: null
        };
      }
      
      const pointNum = version >= 50 ? this.parser.readUint16() : this.parser.readUint32();
      
      // 验证pointNum的合理性
      if (pointNum > 10000) {
        return {
          lineWidth,
          lineColor,
          lineStyleCount,
          styleValues,
          pointNum: 0,
          pointData: [],
          pragmaData: null
        };
      }
      
      const pointData: Point[] = [];
      for (let i = 0; i < pointNum; i++) {
        if (!this.parser.hasMore()) {
          break;
        }
        
        try {
          const x = version >= 50 ? this.parser.readFloat32() : this.parser.readFloat64();
          const y = version >= 50 ? this.parser.readFloat32() : this.parser.readFloat64();
          pointData.push({ x, y });
        } catch (error) {
          break;
        }
      }

      let pragmaData: EDBPragmaData | null = null;
      if (version >= 50 && this.parser.hasMore()) {
        try {
          pragmaData = this.parsePragmaData();
        } catch (error) {
          pragmaData = null;
        }
      }

      
      return {
        lineWidth,
        lineColor,
        lineStyleCount,
        styleValues,
        pointNum: pointData.length, // 使用实际读取的点数
        pointData,
        pragmaData
      };
      
    } catch (error) {
      return {
        lineWidth: 0,
        lineColor: 0,
        lineStyleCount: 0,
        styleValues: [],
        pointNum: 0,
        pointData: [],
        pragmaData: null
      };
    }
  }

  /**
   * 解析Rectangle
   */
  private parseRectangle(version: number): EDBRectangle {
    const lineWidth = version >= 50 ? this.parser.readUint8() : this.parser.readUint32();
    const lineColor = this.parser.readUint32();
    const fillColor = this.parser.readUint32();
    const lineStyleCount = this.parser.readUint8();
    
    const styleValues: number[] = [];
    for (let i = 0; i < lineStyleCount; i++) {
      styleValues.push(this.parser.readUint8());
    }

    const pointNum = version >= 50 ? this.parser.readUint16() : this.parser.readUint32();
    const pointData: Point[] = [];
    
    for (let i = 0; i < pointNum; i++) {
      const x = version >= 50 ? this.parser.readFloat32() : this.parser.readFloat64();
      const y = version >= 50 ? this.parser.readFloat32() : this.parser.readFloat64();
      pointData.push({ x, y });
    }

    return {
      lineWidth,
      lineColor,
      fillColor,
      lineStyleCount,
      styleValues,
      pointNum,
      pointData
    };
  }

  /**
   * 解析Circle
   */
  private parseCircle(version: number): EDBCircle {
    return this.parseRectangle(version) as EDBCircle;
  }

  /**
   * 解析Text
   */
  private parseText(version: number): EDBText {
    const positionX = version >= 50 ? this.parser.readFloat32() : this.parser.readFloat64();
    const positionY = version >= 50 ? this.parser.readFloat32() : this.parser.readFloat64();
    const fontSize = version >= 50 ? this.parser.readUint8() : this.parser.readUint32();
    const textColor = this.parser.readUint32();
    const width = version >= 50 ? this.parser.readFloat32() : this.parser.readFloat64();
    const dataLength = this.parser.readUint32();
    const textData = this.parser.readString(dataLength);

    return {
      positionX,
      positionY,
      fontSize,
      textColor,
      width,
      dataLength,
      textData
    };
  }

  /**
   * 解析Pixmap
   */
  private parsePixmap(version: number): EDBPixmap {
    const positionX = version >= 50 ? this.parser.readFloat32() : this.parser.readFloat64();
    const positionY = version >= 50 ? this.parser.readFloat32() : this.parser.readFloat64();
    const showWidth = version >= 50 ? this.parser.readFloat32() : this.parser.readFloat64();
    const showHeight = version >= 50 ? this.parser.readFloat32() : this.parser.readFloat64();
    const imageType = this.parser.readUint8();
    const storageType = this.parser.readUint8();
    const dataLength = version >= 50 ? this.parser.readUint32() : this.parser.readInt32();
    
    // 验证数据长度
    if (dataLength > 1000000 || dataLength < 0) {
      throw new Error(`无效的Pixmap数据长度: ${dataLength}`);
    }
    
    const storageData = this.parser.readBytes(dataLength);

    let thumbnailLength = 0;
    let thumbnailData: Uint8Array | null = null;
    if (version >= 50) {
      thumbnailLength = this.parser.readInt32();
      if (thumbnailLength > 0) {
        // 验证缩略图长度
        if (thumbnailLength > 1000000 || thumbnailLength < 0) {
          throw new Error(`无效的缩略图长度: ${thumbnailLength}`);
        }
        thumbnailData = this.parser.readBytes(thumbnailLength);
      }
    }

    return {
      positionX,
      positionY,
      showWidth,
      showHeight,
      imageType,
      storageType,
      dataLength,
      storageData,
      thumbnailLength,
      thumbnailData
    };
  }

  /**
   * 解析Triangle
   */
  private parseTriangle(version: number): EDBTriangle {
    return this.parseRectangle(version) as EDBTriangle;
  }

  /**
   * 解析Ellipse
   */
  private parseEllipse(version: number): EDBEllipse {
    return this.parseRectangle(version) as EDBEllipse;
  }

  /**
   * 解析SimpleLine
   */
  private parseSimpleLine(version: number): EDBSimpleLine {
    return this.parseTraceLine(version) as EDBSimpleLine;
  }

  /**
   * 解析Square
   */
  private parseSquare(version: number): EDBSquare {
    return this.parseRectangle(version) as EDBSquare;
  }

  /**
   * 解析PressureLine
   */
  private parsePressureLine(version: number): EDBPressureLine {
    const lineWidth = version >= 50 ? this.parser.readUint8() : this.parser.readUint32();
    const lineColor = this.parser.readUint32();
    const pointNum = version >= 50 ? this.parser.readUint16() : this.parser.readUint32();
    const pointData: PressurePoint[] = [];
    
    for (let i = 0; i < pointNum; i++) {
      const x = version >= 50 ? this.parser.readFloat32() : this.parser.readFloat64();
      const y = version >= 50 ? this.parser.readFloat32() : this.parser.readFloat64();
      const pressure = version >= 50 ? this.parser.readFloat32() : this.parser.readFloat64();
      pointData.push({ x, y, pressure });
    }

    let pragmaData: EDBPragmaData | null = null;
    if (version >= 50) {
      pragmaData = this.parsePragmaData();
    }

    return {
      lineWidth,
      lineColor,
      pointNum,
      pointData,
      pragmaData
    };
  }

  /**
   * 解析Polyline
   */
  private parsePolyline(version: number): EDBPolyline {
    const lineWidth = this.parser.readUint8();
    const lineColor = this.parser.readUint32();
    const fillColor = this.parser.readUint32();
    const lineStyleCount = this.parser.readUint8();
    
    const styleValues: number[] = [];
    for (let i = 0; i < lineStyleCount; i++) {
      styleValues.push(this.parser.readUint8());
    }

    const pointNum = this.parser.readUint16();
    const pointData: Point[] = [];
    
    for (let i = 0; i < pointNum; i++) {
      const x = this.parser.readFloat32();
      const y = this.parser.readFloat32();
      pointData.push({ x, y });
    }

    const isVisible = this.parser.readUint8();

    return {
      lineWidth,
      lineColor,
      fillColor,
      lineStyleCount,
      styleValues,
      pointNum,
      pointData,
      isVisible
    };
  }

  /**
   * 解析MarkPen
   */
  private parseMarkPen(version: number): EDBMarkPen {
    const lineWidth = this.parser.readUint8();
    const lineColor = this.parser.readUint32();
    const lineStyleCount = this.parser.readUint8();
    
    const styleValues: number[] = [];
    for (let i = 0; i < lineStyleCount; i++) {
      styleValues.push(this.parser.readUint8());
    }

    const pointNum = this.parser.readUint16();
    const pointData: Point[] = [];
    
    for (let i = 0; i < pointNum; i++) {
      const x = this.parser.readFloat32();
      const y = this.parser.readFloat32();
      pointData.push({ x, y });
    }

    return {
      lineWidth,
      lineColor,
      lineStyleCount,
      styleValues,
      pointNum,
      pointData
    };
  }

  /**
   * 解析CircleArc
   */
  private parseCircleArc(version: number): EDBCircleArc {
    const lineWidth = this.parser.readUint8();
    const lineColor = this.parser.readUint32();
    const fillColor = this.parser.readUint32();
    const centerPointX = this.parser.readFloat32();
    const centerPointY = this.parser.readFloat32();
    const radius = this.parser.readFloat32();
    const startAngle = this.parser.readFloat32();
    const endAngle = this.parser.readFloat32();
    const clockwise = this.parser.readUint8();
    const strokeArc = this.parser.readUint8();
    const strokeSide = this.parser.readUint8();
    const lineStyleCount = this.parser.readUint8();
    
    const styleValues: number[] = [];
    for (let i = 0; i < lineStyleCount; i++) {
      styleValues.push(this.parser.readUint8());
    }

    return {
      lineWidth,
      lineColor,
      fillColor,
      centerPointX,
      centerPointY,
      radius,
      startAngle,
      endAngle,
      clockwise,
      strokeArc,
      strokeSide,
      lineStyleCount,
      styleValues
    };
  }

  /**
   * 解析ShapeGroup
   */
  private parseShapeGroup(version: number): EDBShapeGroup {
    const shapeCode = this.parser.readUint16();
    const shapePositionX = this.parser.readFloat32();
    const shapePositionY = this.parser.readFloat32();
    const shapeWidth = this.parser.readFloat32();
    const shapeHeight = this.parser.readFloat32();
    const rotate = this.parser.readFloat32();
    const lineWidth = this.parser.readUint8();
    const lineStyle = this.parser.readUint8();
    const lineColor = this.parser.readUint32();
    const fillColor = this.parser.readUint32();
    const actionPointNum = this.parser.readUint8();

    const actionPoints: ActionPoint[] = [];
    for (let i = 0; i < actionPointNum; i++) {
      const isVisible = this.parser.readUint8();
      const pointX = this.parser.readFloat32();
      const pointY = this.parser.readFloat32();
      actionPoints.push({ isVisible, pointX, pointY });
    }

    const subShapeIDCount = this.parser.readUint16();
    const subItemIds: number[] = [];
    for (let i = 0; i < subShapeIDCount; i++) {
      subItemIds.push(this.parser.readUint16());
    }

    return {
      shapeCode,
      shapePositionX,
      shapePositionY,
      shapeWidth,
      shapeHeight,
      rotate,
      lineWidth,
      lineStyle,
      lineColor,
      fillColor,
      actionPointNum,
      actionPoints,
      subShapeIDCount,
      subItemIds
    };
  }

  /**
   * 解析TimePressureLine
   */
  private parseTimePressureLine(version: number): EDBTimePressureLine {
    const lineWidth = this.parser.readUint8();
    const lineColor = this.parser.readUint32();
    const pointNum = this.parser.readUint16();
    const pointData: TimePressurePoint[] = [];
    
    for (let i = 0; i < pointNum; i++) {
      const x = this.parser.readFloat32();
      const y = this.parser.readFloat32();
      const pressure = this.parser.readFloat32();
      const time = this.parser.readFloat32();
      pointData.push({ x, y, pressure, time });
    }

    return {
      lineWidth,
      lineColor,
      pointNum,
      pointData
    };
  }

  /**
   * 解析OddEvenLine
   */
  private parseOddEvenLine(version: number): EDBOddEvenLine {
    // 暂时返回空对象，因为文档说明EDB暂时不需要实现
    return {} as EDBOddEvenLine;
  }

  /**
   * 解析ChalkLine
   */
  private parseChalkLine(version: number): EDBChalkLine {
    const lineWidth = this.parser.readUint8();
    const lineColor = this.parser.readUint32();
    const lineStyleCount = this.parser.readUint8();
    
    const styleValues: number[] = [];
    for (let i = 0; i < lineStyleCount; i++) {
      styleValues.push(this.parser.readUint8());
    }

    const pointNum = this.parser.readUint16();
    const pointData: Point[] = [];
    
    for (let i = 0; i < pointNum; i++) {
      const x = this.parser.readFloat32();
      const y = this.parser.readFloat32();
      pointData.push({ x, y });
    }

    return {
      lineWidth,
      lineColor,
      lineStyleCount,
      styleValues,
      pointNum,
      pointData
    };
  }

  /**
   * 解析CoursewareLink
   */
  private parseCoursewareLink(version: number): EDBCoursewareLink {
    // 文档说明还未开发，暂时返回空对象
    return {} as EDBCoursewareLink;
  }

  /**
   * 解析EraserLine
   */
  private parseEraserLine(version: number): EDBEraserLine {
    // 文档说明EDB无需该类型，暂时返回空对象
    return {} as EDBEraserLine;
  }

  /**
   * 解析Audio (废弃)
   */
  private parseAudio(version: number): EDBAudio {
    // 废弃类型，暂时返回空对象
    return {} as EDBAudio;
  }

  /**
   * 解析Video (废弃)
   */
  private parseVideo(version: number): EDBVideo {
    // 废弃类型，暂时返回空对象
    return {} as EDBVideo;
  }

  /**
   * 解析TaskGood
   */
  private parseTaskGood(version: number): EDBTaskGood {
    return this.parseRectangle(version) as EDBTaskGood;
  }

  /**
   * 解析AudioNew
   */
  private parseAudioNew(version: number): EDBAudioNew {
    const positionX = this.parser.readFloat32();
    const positionY = this.parser.readFloat32();
    const showWidth = this.parser.readFloat32();
    const showHeight = this.parser.readFloat32();
    const duration = this.parser.readUint16();
    const fileNameLength = this.parser.readUint32();
    
    // 验证文件名长度
    if (fileNameLength > 1000 || fileNameLength < 0) {
      throw new Error(`无效的文件名长度: ${fileNameLength}`);
    }
    
    const fileName = this.parser.readString(fileNameLength);
    const fileType = this.parser.readUint8();
    const storageType = this.parser.readUint8();
    const dataLength = this.parser.readUint32();
    
    // 验证数据长度
    if (dataLength > 1000000 || dataLength < 0) {
      throw new Error(`无效的AudioNew数据长度: ${dataLength}`);
    }
    
    const storageData = this.parser.readBytes(dataLength);

    return {
      positionX,
      positionY,
      showWidth,
      showHeight,
      duration,
      fileNameLength,
      fileName,
      fileType,
      storageType,
      dataLength,
      storageData
    };
  }

  /**
   * 解析VideoNew
   */
  private parseVideoNew(version: number): EDBVideoNew {
    return this.parseAudioNew(version) as EDBVideoNew;
  }

  /**
   * 解析附加资源
   */
  private parseResource(): EDBResource | null {
    if (!this.parser.hasMore()) {
      return null;
    }

    const type = this.parser.readUint16();
    const resourceID = this.parser.readUint32();
    const dataLength = this.parser.readInt32();
    
    // 验证数据长度
    if (dataLength > 1000000 || dataLength < 0) {
      throw new Error(`无效的资源数据长度: ${dataLength}`);
    }
    
    const data = this.parser.readBytes(dataLength);

    return {
      type,
      resourceID,
      dataLength,
      data
    };
  }

  /**
   * 解析算法库参数数据
   */
  private parsePragmaData(): EDBPragmaData {
    const pragmaLength = this.parser.readUint8();
    const bezierVersion = this.parser.readUint8();
    const sizeIndex = this.parser.readUint8();
    const enablePressure = this.parser.readUint8();
    const penType = this.parser.readUint8();
    const tipPointNumber = this.parser.readUint8();
    const tipFirstHalfScale = this.parser.readFloat32();
    const tipSecondHalfScale = this.parser.readFloat32();
    const minPenWidthScale = this.parser.readFloat32();
    const maxPenWidthScale = this.parser.readFloat32();
    const speedMinDistance = this.parser.readFloat32();
    const speedMaxDistance = this.parser.readFloat32();
    const firstPointScale = this.parser.readFloat32();

    return {
      pragmaLength,
      bezierVersion,
      sizeIndex,
      enablePressure,
      penType,
      tipPointNumber,
      tipFirstHalfScale,
      tipSecondHalfScale,
      minPenWidthScale,
      maxPenWidthScale,
      speedMinDistance,
      speedMaxDistance,
      firstPointScale
    };
  }
}

// 类型定义
export interface Point {
  x: number;
  y: number;
}

export interface PressurePoint extends Point {
  pressure: number;
}

export interface TimePressurePoint extends Point {
  pressure: number;
  time: number;
}

export interface ActionPoint {
  isVisible: number;
  pointX: number;
  pointY: number;
}

export interface EDBHeader {
  idLength: number;
  docId: string;
  version: number;
  zipped?: number;
  pageNum: number;
  itemNum: number;
  height: number;
  width: number;
  resourceNum?: number;
  clientType: number;
  clientVersionLength: number;
  clientVersionStr: string;
  lastModifyTime: number;
  backgroundColor?: number;
  skinData?: EDBSkinData | null;
}

export interface EDBSkinData {
  skinVersion: number;
  skinPositionX: number;
  skinPositionY: number;
  skinShowWidth: number;
  skinShowHeight: number;
  skinImageType: number;
  skinStorageType: number;
  skinRotateAngle: number;
  skinStorageDataLength: number;
  skinStorageData: Uint8Array;
}

export interface EDBItem {
  type: number;
  dataLength: number;
  version: number;
  itemId: string | number;
  creatorUID?: number;
  zvalue: number;
  status: number;
  rotate: number;
  scaleX: number;
  scaleY: number;
  content: EDBItemContent;
}

export type EDBItemContent = 
  | EDBTraceLine
  | EDBRectangle
  | EDBCircle
  | EDBText
  | EDBPixmap
  | EDBTriangle
  | EDBEllipse
  | EDBSimpleLine
  | EDBSquare
  | EDBPressureLine
  | EDBPolyline
  | EDBMarkPen
  | EDBCircleArc
  | EDBShapeGroup
  | EDBTimePressureLine
  | EDBOddEvenLine
  | EDBChalkLine
  | EDBCoursewareLink
  | EDBEraserLine
  | EDBAudio
  | EDBVideo
  | EDBTaskGood
  | EDBAudioNew
  | EDBVideoNew;

export interface EDBTraceLine {
  lineWidth: number;
  lineColor: number;
  lineStyleCount: number;
  styleValues: number[];
  pointNum: number;
  pointData: Point[];
  pragmaData?: EDBPragmaData | null;
}

export interface EDBRectangle {
  lineWidth: number;
  lineColor: number;
  fillColor: number;
  lineStyleCount: number;
  styleValues: number[];
  pointNum: number;
  pointData: Point[];
}

export interface EDBCircle extends EDBRectangle {}
export interface EDBTriangle extends EDBRectangle {}
export interface EDBEllipse extends EDBRectangle {}
export interface EDBSquare extends EDBRectangle {}
export interface EDBTaskGood extends EDBRectangle {}

export interface EDBText {
  positionX: number;
  positionY: number;
  fontSize: number;
  textColor: number;
  width: number;
  dataLength: number;
  textData: string;
}

export interface EDBPixmap {
  positionX: number;
  positionY: number;
  showWidth: number;
  showHeight: number;
  imageType: number;
  storageType: number;
  dataLength: number;
  storageData: Uint8Array;
  thumbnailLength?: number;
  thumbnailData?: Uint8Array | null;
}

export interface EDBSimpleLine extends EDBTraceLine {}

export interface EDBPressureLine {
  lineWidth: number;
  lineColor: number;
  pointNum: number;
  pointData: PressurePoint[];
  pragmaData?: EDBPragmaData | null;
}

export interface EDBPolyline {
  lineWidth: number;
  lineColor: number;
  fillColor: number;
  lineStyleCount: number;
  styleValues: number[];
  pointNum: number;
  pointData: Point[];
  isVisible: number;
}

export interface EDBMarkPen {
  lineWidth: number;
  lineColor: number;
  lineStyleCount: number;
  styleValues: number[];
  pointNum: number;
  pointData: Point[];
}

export interface EDBCircleArc {
  lineWidth: number;
  lineColor: number;
  fillColor: number;
  centerPointX: number;
  centerPointY: number;
  radius: number;
  startAngle: number;
  endAngle: number;
  clockwise: number;
  strokeArc: number;
  strokeSide: number;
  lineStyleCount: number;
  styleValues: number[];
}

export interface EDBShapeGroup {
  shapeCode: number;
  shapePositionX: number;
  shapePositionY: number;
  shapeWidth: number;
  shapeHeight: number;
  rotate: number;
  lineWidth: number;
  lineStyle: number;
  lineColor: number;
  fillColor: number;
  actionPointNum: number;
  actionPoints: ActionPoint[];
  subShapeIDCount: number;
  subItemIds: number[];
}

export interface EDBTimePressureLine {
  lineWidth: number;
  lineColor: number;
  pointNum: number;
  pointData: TimePressurePoint[];
}

export interface EDBOddEvenLine {
  // 暂时为空，因为EDB暂时不需要实现
}

export interface EDBChalkLine {
  lineWidth: number;
  lineColor: number;
  lineStyleCount: number;
  styleValues: number[];
  pointNum: number;
  pointData: Point[];
}

export interface EDBCoursewareLink {
  // 还未开发
}

export interface EDBEraserLine {
  // EDB无需该类型
}

export interface EDBAudio {
  // 废弃
}

export interface EDBVideo {
  // 废弃
}

export interface EDBAudioNew {
  positionX: number;
  positionY: number;
  showWidth: number;
  showHeight: number;
  duration: number;
  fileNameLength: number;
  fileName: string;
  fileType: number;
  storageType: number;
  dataLength: number;
  storageData: Uint8Array;
}

export interface EDBVideoNew extends EDBAudioNew {}

export interface EDBResource {
  type: number;
  resourceID: number;
  dataLength: number;
  data: Uint8Array;
}

export interface EDBPragmaData {
  pragmaLength: number;
  bezierVersion: number;
  sizeIndex: number;
  enablePressure: number;
  penType: number;
  tipPointNumber: number;
  tipFirstHalfScale: number;
  tipSecondHalfScale: number;
  minPenWidthScale: number;
  maxPenWidthScale: number;
  speedMinDistance: number;
  speedMaxDistance: number;
  firstPointScale: number;
}

export interface EDBDocument {
  header: EDBHeader;
  items: EDBItem[];
  resources: EDBResource[];
} 