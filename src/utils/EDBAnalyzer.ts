/**
 * EDB数据分析工具
 * 用于分析解析出的图元数据，特别是styleValues字段
 */
export class EDBAnalyzer {
  
  /**
   * 分析styleValues数据
   */
  static analyzeStyleValues(styleValues: number[], itemType: number, itemId: string | number): void {
    console.log(`\n=== 分析图元 ${itemId} (类型: ${itemType}) 的styleValues ===`);
    console.log(`原始字节数组: [${styleValues.join(', ')}]`);
    console.log(`字节数量: ${styleValues.length}`);
    
    if (styleValues.length === 0) {
      console.log('styleValues为空');
      return;
    }
    
    // 1. 尝试作为UTF-8字符串解析
    try {
      const bytes = new Uint8Array(styleValues);
      const utf8String = new TextDecoder('utf-8').decode(bytes);
      console.log(`\n1. UTF-8字符串解析:`);
      console.log(`结果: "${utf8String}"`);
      console.log(`长度: ${utf8String.length}`);
      
      // 检查是否包含可读文本
      const readableChars = utf8String.replace(/[^\x20-\x7E]/g, ''); // 只保留可打印ASCII字符
      if (readableChars.length > 0) {
        console.log(`可读字符: "${readableChars}"`);
      }
    } catch (error) {
      console.log(`UTF-8解析失败: ${error}`);
    }
    
    // 2. 尝试作为ASCII字符串解析
    try {
      const asciiString = String.fromCharCode(...styleValues);
      console.log(`\n2. ASCII字符串解析:`);
      console.log(`结果: "${asciiString}"`);
      console.log(`长度: ${asciiString.length}`);
      
      // 检查是否包含可读文本
      const readableChars = asciiString.replace(/[^\x20-\x7E]/g, '');
      if (readableChars.length > 0) {
        console.log(`可读字符: "${readableChars}"`);
      }
    } catch (error) {
      console.log(`ASCII解析失败: ${error}`);
    }
    
    // 3. 尝试作为十六进制字符串
    const hexString = styleValues.map(b => b.toString(16).padStart(2, '0')).join('');
    console.log(`\n3. 十六进制表示:`);
    console.log(`结果: "${hexString}"`);
    console.log(`长度: ${hexString.length} 字符`);
    
    // 4. 分析字节模式
    console.log(`\n4. 字节模式分析:`);
    const uniqueBytes = new Set(styleValues);
    console.log(`唯一字节值: ${uniqueBytes.size} 个`);
    console.log(`字节值范围: ${Math.min(...styleValues)} - ${Math.max(...styleValues)}`);
    
    // 5. 检查是否为文件路径
    const asciiString = String.fromCharCode(...styleValues);
    if (asciiString.includes('\\') || asciiString.includes('/')) {
      console.log(`\n5. 可能的文件路径:`);
      console.log(`检测到路径分隔符: ${asciiString}`);
    }
    
    // 6. 检查是否为JSON数据
    try {
      const jsonString = String.fromCharCode(...styleValues);
      const jsonData = JSON.parse(jsonString);
      console.log(`\n6. JSON数据解析:`);
      console.log(`结果:`, jsonData);
    } catch (error) {
      // 不是有效的JSON，忽略
    }
    
    // 7. 检查是否为浮点数数组
    if (styleValues.length % 4 === 0) {
      console.log(`\n7. 可能的浮点数数组 (4字节对齐):`);
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
        console.log(`浮点数数组: [${floatArray.map(f => f.toFixed(6)).join(', ')}]`);
      } catch (error) {
        console.log(`浮点数解析失败: ${error}`);
      }
    }
    
    // 8. 检查是否为整数数组
    if (styleValues.length % 4 === 0) {
      console.log(`\n8. 可能的整数数组 (4字节对齐):`);
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
        console.log(`整数数组: [${intArray.join(', ')}]`);
      } catch (error) {
        console.log(`整数解析失败: ${error}`);
      }
    }
    
    console.log(`\n=== 分析完成 ===\n`);
  }
  
  /**
   * 分析图元内容
   */
  static analyzeItem(item: any): void {
    console.log(`\n=== 分析图元 ${item.itemId} (类型: ${item.type}) ===`);
    console.log(`图元类型: ${item.type}`);
    console.log(`数据长度: ${item.dataLength}`);
    console.log(`版本: ${item.version}`);
    console.log(`itemId: ${item.itemId}`);
    console.log(`zvalue: ${item.zvalue}`);
    console.log(`status: ${item.status}`);
    console.log(`rotate: ${item.rotate}`);
    console.log(`scaleX: ${item.scaleX}`);
    console.log(`scaleY: ${item.scaleY}`);
    
    if (item.content && item.content.styleValues) {
      this.analyzeStyleValues(item.content.styleValues, item.type, item.itemId);
    }
    
    console.log(`\n=== 图元分析完成 ===\n`);
  }
  
  /**
   * 分析整个文档
   */
  static analyzeDocument(document: any): void {
    console.log(`\n=== 开始分析EDB文档 ===`);
    console.log(`文档ID: ${document.header.docId}`);
    console.log(`版本: ${document.header.version}`);
    console.log(`图元数量: ${document.items.length}`);
    console.log(`资源数量: ${document.resources.length}`);
    
    document.items.forEach((item: any, index: number) => {
      console.log(`\n--- 图元 ${index + 1}/${document.items.length} ---`);
      this.analyzeItem(item);
    });
    
    console.log(`\n=== EDB文档分析完成 ===`);
  }
} 