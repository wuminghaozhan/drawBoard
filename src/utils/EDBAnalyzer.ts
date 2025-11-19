/**
 * EDB数据分析工具
 * 用于分析解析出的图元数据，特别是styleValues字段
 */
export class EDBAnalyzer {
  
  /**
   * 分析styleValues数据
   */
  static analyzeStyleValues(styleValues: number[], itemType: number, itemId: string | number): void {
    
    if (styleValues.length === 0) {
      return;
    }
    
    // 1. 尝试作为UTF-8字符串解析
    try {
      const bytes = new Uint8Array(styleValues);
      const utf8String = new TextDecoder('utf-8').decode(bytes);
      
      // 检查是否包含可读文本
      const readableChars = utf8String.replace(/[^\x20-\x7E]/g, ''); // 只保留可打印ASCII字符
      if (readableChars.length > 0) {
      }
    } catch (error) {
    }
    
    // 2. 尝试作为ASCII字符串解析
    try {
      const asciiString = String.fromCharCode(...styleValues);
      
      // 检查是否包含可读文本
      const readableChars = asciiString.replace(/[^\x20-\x7E]/g, '');
      if (readableChars.length > 0) {
      }
    } catch (error) {
    }
    
    // 3. 尝试作为十六进制字符串
    const hexString = styleValues.map(b => b.toString(16).padStart(2, '0')).join('');
    
    // 4. 分析字节模式
    const uniqueBytes = new Set(styleValues);
    
    // 5. 检查是否为文件路径
    const asciiString = String.fromCharCode(...styleValues);
    if (asciiString.includes('\\') || asciiString.includes('/')) {
    }
    
    // 6. 检查是否为JSON数据
    try {
      const jsonString = String.fromCharCode(...styleValues);
      const jsonData = JSON.parse(jsonString);
    } catch (error) {
      // 不是有效的JSON，忽略
    }
    
    // 7. 检查是否为浮点数数组
    if (styleValues.length % 4 === 0) {
      try {
        const buffer = new ArrayBuffer(styleValues.length);
        const view = new DataView(buffer);
        for (let i = 0; i < styleValues.length; i++) {
          view.setUint8(i, styleValues[i]);
        }
        
        const floatArray: number[] = [];
        for (let i = 0; i < styleValues.length; i += 4) {
          const float = view.getFloat32(i, true); // 小端序
          floatArray.push(float);
        }
      } catch (error) {
      }
    }
    
    // 8. 检查是否为整数数组
    if (styleValues.length % 4 === 0) {
      try {
        const buffer = new ArrayBuffer(styleValues.length);
        const view = new DataView(buffer);
        for (let i = 0; i < styleValues.length; i++) {
          view.setUint8(i, styleValues[i]);
        }
        
        const intArray: number[] = [];
        for (let i = 0; i < styleValues.length; i += 4) {
          const int = view.getUint32(i, true); // 小端序
          intArray.push(int);
        }
      } catch (error) {
      }
    }
    
  }
  
  /**
   * 分析图元内容
   */
  static analyzeItem(item: any): void {
    
    if (item.content && item.content.styleValues) {
      this.analyzeStyleValues(item.content.styleValues, item.type, item.itemId);
    }
    
  }
  
  /**
   * 分析整个文档
   */
  static analyzeDocument(document: any): void {
    
    document.items.forEach((item: any, index: number) => {
      this.analyzeItem(item);
    });
    
  }
} 