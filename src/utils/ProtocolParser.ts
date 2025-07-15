/**
 * 协议解析工具类
 * 支持解析uint8、uint16、uint32等数据类型
 */
export class ProtocolParser {
  private buffer: ArrayBuffer;
  private view: DataView;
  private offset: number = 0;
  private littleEndian: boolean = false;

  constructor(buffer: ArrayBuffer, littleEndian: boolean = false) {
    this.buffer = buffer;
    this.view = new DataView(buffer);
    this.littleEndian = littleEndian;
  }

  /**
   * 从现有数据创建解析器
   */
  static fromUint8Array(data: Uint8Array, littleEndian: boolean = false): ProtocolParser {
    return new ProtocolParser(data.buffer, littleEndian);
  }

  /**
   * 从字符串创建解析器（十六进制格式）
   */
  static fromHexString(hexString: string, littleEndian: boolean = false): ProtocolParser {
    const bytes = new Uint8Array(hexString.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
    return new ProtocolParser(bytes.buffer, littleEndian);
  }

  /**
   * 读取uint8
   */
  readUint8(): number {
    const value = this.view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  /**
   * 读取uint16
   */
  readUint16(): number {
    const value = this.view.getUint16(this.offset, this.littleEndian);
    this.offset += 2;
    return value;
  }

  /**
   * 读取uint32
   */
  readUint32(): number {
    const value = this.view.getUint32(this.offset, this.littleEndian);
    this.offset += 4;
    return value;
  }

  /**
   * 读取int8
   */
  readInt8(): number {
    const value = this.view.getInt8(this.offset);
    this.offset += 1;
    return value;
  }

  /**
   * 读取int16
   */
  readInt16(): number {
    const value = this.view.getInt16(this.offset, this.littleEndian);
    this.offset += 2;
    return value;
  }

  /**
   * 读取int32
   */
  readInt32(): number {
    const value = this.view.getInt32(this.offset, this.littleEndian);
    this.offset += 4;
    return value;
  }

  /**
   * 读取int64 (BigInt)
   */
  readInt64(): number {
    // JavaScript没有64位整数，使用BigInt，但返回number以保持兼容性
    const value = this.view.getBigInt64(this.offset, this.littleEndian);
    this.offset += 8;
    return Number(value);
  }

  /**
   * 读取uint64 (BigInt)
   */
  readUint64(): number {
    // JavaScript没有64位无符号整数，使用BigUint64Array，但返回number以保持兼容性
    const value = this.view.getBigUint64(this.offset, this.littleEndian);
    this.offset += 8;
    return Number(value);
  }

  /**
   * 读取float32
   */
  readFloat32(): number {
    const value = this.view.getFloat32(this.offset, this.littleEndian);
    this.offset += 4;
    return value;
  }

  /**
   * 读取float64
   */
  readFloat64(): number {
    const value = this.view.getFloat64(this.offset, this.littleEndian);
    this.offset += 8;
    return value;
  }

  /**
   * 读取指定长度的字符串
   */
  readString(length: number): string {
    // 验证长度
    if (length < 0 || length > 10000) {
      throw new Error(`无效的字符串长度: ${length}`);
    }
    
    // 检查是否有足够的数据
    if (this.offset + length > this.buffer.byteLength) {
      throw new Error(`数据不足: 需要 ${length} 字节，但只有 ${this.buffer.byteLength - this.offset} 字节可用`);
    }
    
    const bytes = new Uint8Array(this.buffer, this.offset, length);
    this.offset += length;
    return new TextDecoder().decode(bytes);
  }

  /**
   * 读取以null结尾的字符串
   */
  readNullTerminatedString(): string {
    const startOffset = this.offset;
    while (this.offset < this.buffer.byteLength && this.view.getUint8(this.offset) !== 0) {
      this.offset++;
    }
    const length = this.offset - startOffset;
    const bytes = new Uint8Array(this.buffer, startOffset, length);
    this.offset++; // 跳过null字节
    return new TextDecoder().decode(bytes);
  }

  /**
   * 读取指定长度的字节数组
   */
  readBytes(length: number): Uint8Array {
    // 验证长度
    if (length < 0 || length > 1000000) {
      throw new Error(`无效的字节长度: ${length}`);
    }
    
    // 检查是否有足够的数据
    if (this.offset + length > this.buffer.byteLength) {
      throw new Error(`数据不足: 需要 ${length} 字节，但只有 ${this.buffer.byteLength - this.offset} 字节可用`);
    }
    
    const bytes = new Uint8Array(this.buffer, this.offset, length);
    this.offset += length;
    return bytes;
  }

  /**
   * 跳过指定字节数
   */
  skip(bytes: number): void {
    this.offset += bytes;
  }

  /**
   * 设置读取位置
   */
  seek(offset: number): void {
    this.offset = offset;
  }

  /**
   * 获取当前读取位置
   */
  tell(): number {
    return this.offset;
  }

  /**
   * 检查是否还有数据可读
   */
  hasMore(): boolean {
    return this.offset < this.buffer.byteLength;
  }

  /**
   * 获取剩余字节数
   */
  remaining(): number {
    return this.buffer.byteLength - this.offset;
  }

  /**
   * 获取整个buffer
   */
  getBuffer(): ArrayBuffer {
    return this.buffer;
  }

  /**
   * 获取从当前位置到末尾的数据
   */
  getRemainingData(): Uint8Array {
    return new Uint8Array(this.buffer, this.offset);
  }
}

/**
 * 协议写入工具类
 */
export class ProtocolWriter {
  private buffer: ArrayBuffer;
  private view: DataView;
  private offset: number = 0;
  private littleEndian: boolean = false;

  constructor(initialSize: number = 1024, littleEndian: boolean = false) {
    this.buffer = new ArrayBuffer(initialSize);
    this.view = new DataView(this.buffer);
    this.littleEndian = littleEndian;
  }

  /**
   * 确保有足够空间
   */
  private ensureSpace(bytes: number): void {
    if (this.offset + bytes > this.buffer.byteLength) {
      const newBuffer = new ArrayBuffer(this.buffer.byteLength * 2);
      const newView = new DataView(newBuffer);
      new Uint8Array(newBuffer).set(new Uint8Array(this.buffer));
      this.buffer = newBuffer;
      this.view = newView;
    }
  }

  /**
   * 写入uint8
   */
  writeUint8(value: number): void {
    this.ensureSpace(1);
    this.view.setUint8(this.offset, value);
    this.offset += 1;
  }

  /**
   * 写入uint16
   */
  writeUint16(value: number): void {
    this.ensureSpace(2);
    this.view.setUint16(this.offset, value, this.littleEndian);
    this.offset += 2;
  }

  /**
   * 写入uint32
   */
  writeUint32(value: number): void {
    this.ensureSpace(4);
    this.view.setUint32(this.offset, value, this.littleEndian);
    this.offset += 4;
  }

  /**
   * 写入int8
   */
  writeInt8(value: number): void {
    this.ensureSpace(1);
    this.view.setInt8(this.offset, value);
    this.offset += 1;
  }

  /**
   * 写入int16
   */
  writeInt16(value: number): void {
    this.ensureSpace(2);
    this.view.setInt16(this.offset, value, this.littleEndian);
    this.offset += 2;
  }

  /**
   * 写入int32
   */
  writeInt32(value: number): void {
    this.ensureSpace(4);
    this.view.setInt32(this.offset, value, this.littleEndian);
    this.offset += 4;
  }

  /**
   * 写入float32
   */
  writeFloat32(value: number): void {
    this.ensureSpace(4);
    this.view.setFloat32(this.offset, value, this.littleEndian);
    this.offset += 4;
  }

  /**
   * 写入float64
   */
  writeFloat64(value: number): void {
    this.ensureSpace(8);
    this.view.setFloat64(this.offset, value, this.littleEndian);
    this.offset += 8;
  }

  /**
   * 写入字符串
   */
  writeString(value: string): void {
    const bytes = new TextEncoder().encode(value);
    this.ensureSpace(bytes.length);
    new Uint8Array(this.buffer, this.offset, bytes.length).set(bytes);
    this.offset += bytes.length;
  }

  /**
   * 写入以null结尾的字符串
   */
  writeNullTerminatedString(value: string): void {
    this.writeString(value);
    this.writeUint8(0);
  }

  /**
   * 写入字节数组
   */
  writeBytes(bytes: Uint8Array): void {
    this.ensureSpace(bytes.length);
    new Uint8Array(this.buffer, this.offset, bytes.length).set(bytes);
    this.offset += bytes.length;
  }

  /**
   * 获取写入的数据
   */
  getData(): Uint8Array {
    return new Uint8Array(this.buffer, 0, this.offset);
  }

  /**
   * 获取ArrayBuffer
   */
  getBuffer(): ArrayBuffer {
    return this.buffer.slice(0, this.offset);
  }

  /**
   * 重置写入位置
   */
  reset(): void {
    this.offset = 0;
  }
}

/**
 * 协议工具函数
 */
export class ProtocolUtils {
  /**
   * 将数字转换为十六进制字符串
   */
  static toHex(value: number, bytes: number = 1): string {
    return value.toString(16).padStart(bytes * 2, '0');
  }

  /**
   * 将十六进制字符串转换为数字
   */
  static fromHex(hex: string): number {
    return parseInt(hex, 16);
  }

  /**
   * 检查字节序
   */
  static isLittleEndian(): boolean {
    const buffer = new ArrayBuffer(2);
    new DataView(buffer).setUint16(0, 1);
    return new Uint8Array(buffer)[0] === 1;
  }

  /**
   * 交换字节序
   */
  static swapEndian(value: number, bytes: number): number {
    let result = 0;
    for (let i = 0; i < bytes; i++) {
      result = (result << 8) | ((value >> (i * 8)) & 0xFF);
    }
    return result;
  }
} 