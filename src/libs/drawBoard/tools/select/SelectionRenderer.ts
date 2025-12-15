/**
 * 选择框渲染器
 * 负责绘制选择框、锚点、边界框等视觉元素
 * 
 * 从 SelectTool 中提取，提高代码可维护性和可测试性
 */

import type { AnchorPoint } from '../anchor/AnchorTypes';
import { logger } from '../../infrastructure/logging/Logger';

/**
 * 选择框样式配置
 */
export interface SelectionStyle {
  fillOpacity: number;
  strokeColor: string;
  strokeWidth: number;
  strokeDashArray: number[];
  cornerRadius: number;
  shadowColor: string;
  shadowBlur: number;
}

/**
 * 默认现代选择框样式
 */
export const modernSelectionStyle: SelectionStyle = {
  fillOpacity: 0.08,
  strokeColor: '#007AFF',
  strokeWidth: 1.5,
  strokeDashArray: [6, 3],
  cornerRadius: 4,
  shadowColor: 'rgba(0, 122, 255, 0.3)',
  shadowBlur: 8
};

/**
 * 锚点 hover 信息
 */
export interface HoverAnchorInfo {
  index: number;
  isCenter: boolean;
}

/**
 * 边界框类型
 */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 选择框渲染器
 */
export class SelectionRenderer {
  private animationOffset: number = 0;
  private lastAnimationTime: number = 0;
  private anchorSize: number = 8;

  constructor(anchorSize: number = 8) {
    this.anchorSize = anchorSize;
  }

  /**
   * 设置锚点大小
   */
  public setAnchorSize(size: number): void {
    this.anchorSize = size;
  }

  /**
   * 绘制选择边界框
   */
  public drawSelectionBounds(ctx: CanvasRenderingContext2D, bounds: Bounds): void {
    ctx.save();
    
    // 绘制半透明背景
    ctx.fillStyle = 'rgba(0, 122, 255, 0.05)';
    ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    
    // 绘制边界框
    ctx.strokeStyle = '#007AFF';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
    
    ctx.restore();
  }

  /**
   * 绘制锚点（包括边锚点、旋转锚点和中心点）
   */
  public drawResizeAnchorPoints(
    ctx: CanvasRenderingContext2D,
    anchorPoints: AnchorPoint[],
    centerAnchorPoint: AnchorPoint | null,
    selectedActionsCount: number,
    hoverAnchorInfo: HoverAnchorInfo | null,
    draggedAnchorIndex: number,
    isDraggingCenter: boolean,
    bounds?: Bounds | null
  ): void {
    logger.debug('SelectionRenderer.drawResizeAnchorPoints: 开始绘制锚点', {
      anchorPointsCount: anchorPoints.length,
      centerAnchorPoint: !!centerAnchorPoint,
      selectedActionsCount
    });
    
    ctx.save();
    
    // 绘制边锚点
    if (anchorPoints.length > 0) {
      for (let i = 0; i < anchorPoints.length; i++) {
        const anchor = anchorPoints[i];
        const isHovered = hoverAnchorInfo && 
                          !hoverAnchorInfo.isCenter && 
                          hoverAnchorInfo.index === i;
        const isDragging = i === draggedAnchorIndex;
        
        // 旋转锚点使用特殊样式
        if (anchor.type === 'rotate') {
          this.drawRotateAnchor(ctx, anchor, isHovered ?? false, isDragging, bounds);
          continue;
        }
        
        const isCircle = anchor.shapeType === 'circle';
        
        // 计算锚点大小
        let anchorSize = this.anchorSize;
        if (isHovered) {
          anchorSize = 10;
        } else if (isDragging) {
          anchorSize = 12;
        }
        
        const halfSize = anchorSize / 2;
        const centerX = anchor.x + halfSize;
        const centerY = anchor.y + halfSize;
        
        // 设置样式
        ctx.fillStyle = '#FFFFFF';
        if (isDragging) {
          ctx.strokeStyle = '#FF9500';
        } else {
          ctx.strokeStyle = '#007AFF';
        }
        ctx.lineWidth = isHovered || isDragging ? 3 : 2;
        
        if (isCircle) {
          ctx.beginPath();
          ctx.arc(centerX, centerY, halfSize, 0, 2 * Math.PI);
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.rect(centerX - halfSize, centerY - halfSize, anchorSize, anchorSize);
          ctx.fill();
          ctx.stroke();
        }
      }
    }
    
    // 绘制中心点（仅在单选时显示）
    if (centerAnchorPoint && selectedActionsCount === 1) {
      const isHovered = hoverAnchorInfo && hoverAnchorInfo.isCenter;
      const isDragging = isDraggingCenter;
      
      let anchorSize = this.anchorSize;
      if (isHovered) {
        anchorSize = 10;
      } else if (isDragging) {
        anchorSize = 12;
      }
      
      const halfSize = anchorSize / 2;
      const centerX = centerAnchorPoint.x + halfSize;
      const centerY = centerAnchorPoint.y + halfSize;
      const radius = halfSize;
      
      ctx.fillStyle = '#FFFFFF';
      if (isDragging) {
        ctx.strokeStyle = '#34C759';
      } else {
        ctx.strokeStyle = '#007AFF';
      }
      ctx.lineWidth = isHovered || isDragging ? 3 : 2;
      
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    }
    
    ctx.restore();
    logger.debug('SelectionRenderer.drawResizeAnchorPoints: 完成绘制锚点');
  }

  /**
   * 绘制旋转锚点
   * 包括连接线和圆形旋转手柄
   */
  private drawRotateAnchor(
    ctx: CanvasRenderingContext2D,
    anchor: AnchorPoint,
    isHovered: boolean,
    isDragging: boolean,
    bounds?: Bounds | null
  ): void {
    const halfSize = this.anchorSize / 2;
    const anchorCenterX = anchor.x;
    const anchorCenterY = anchor.y;
    
    // 绘制连接线（从边界框顶部中心到旋转锚点）
    if (bounds) {
      const topCenterX = bounds.x + bounds.width / 2;
      const topCenterY = bounds.y;
      
      ctx.save();
      ctx.strokeStyle = '#007AFF';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(topCenterX, topCenterY);
      ctx.lineTo(anchorCenterX, anchorCenterY);
      ctx.stroke();
      ctx.restore();
    }
    
    // 绘制旋转锚点（圆形，带旋转图标）
    let anchorSize = this.anchorSize;
    if (isHovered) {
      anchorSize = 10;
    } else if (isDragging) {
      anchorSize = 12;
    }
    
    const radius = anchorSize / 2;
    
    // 外圈
    ctx.fillStyle = '#FFFFFF';
    if (isDragging) {
      ctx.strokeStyle = '#FF9500';
    } else if (isHovered) {
      ctx.strokeStyle = '#34C759';
    } else {
      ctx.strokeStyle = '#007AFF';
    }
    ctx.lineWidth = isHovered || isDragging ? 3 : 2;
    
    ctx.beginPath();
    ctx.arc(anchorCenterX, anchorCenterY, radius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    
    // 绘制旋转图标（一个弧形箭头）
    const iconRadius = radius * 0.6;
    ctx.save();
    ctx.strokeStyle = ctx.strokeStyle;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(anchorCenterX, anchorCenterY, iconRadius, -Math.PI * 0.7, Math.PI * 0.3);
    ctx.stroke();
    
    // 箭头头部
    const arrowAngle = Math.PI * 0.3;
    const arrowX = anchorCenterX + iconRadius * Math.cos(arrowAngle);
    const arrowY = anchorCenterY + iconRadius * Math.sin(arrowAngle);
    const arrowSize = 3;
    
    ctx.beginPath();
    ctx.moveTo(arrowX - arrowSize, arrowY - arrowSize);
    ctx.lineTo(arrowX, arrowY);
    ctx.lineTo(arrowX + arrowSize, arrowY - arrowSize);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * 绘制选择框背景
   */
  public drawSelectionBackground(
    ctx: CanvasRenderingContext2D, 
    left: number, 
    top: number, 
    width: number, 
    height: number,
    hasSelectedActions: boolean
  ): void {
    if (hasSelectedActions) {
      ctx.fillStyle = `rgba(0, 122, 255, ${modernSelectionStyle.fillOpacity * 1.5})`;
    } else {
      ctx.fillStyle = `rgba(0, 122, 255, ${modernSelectionStyle.fillOpacity})`;
    }
    
    this.drawRoundedRect(ctx, left, top, width, height, modernSelectionStyle.cornerRadius, true);
  }

  /**
   * 绘制选择框边框
   */
  public drawSelectionBorder(
    ctx: CanvasRenderingContext2D, 
    left: number, 
    top: number, 
    width: number, 
    height: number,
    hasSelectedActions: boolean
  ): void {
    ctx.strokeStyle = modernSelectionStyle.strokeColor;
    ctx.lineWidth = modernSelectionStyle.strokeWidth;
    
    // 动画虚线效果
    const currentTime = Date.now();
    if (currentTime - this.lastAnimationTime > 50) {
      this.animationOffset += 1;
      this.lastAnimationTime = currentTime;
    }
    
    const dashArray = [...modernSelectionStyle.strokeDashArray];
    ctx.setLineDash(dashArray);
    ctx.lineDashOffset = -this.animationOffset;

    this.drawRoundedRect(ctx, left, top, width, height, modernSelectionStyle.cornerRadius, false);
    
    // 选中内容时绘制额外的强调边框
    if (hasSelectedActions) {
      ctx.strokeStyle = '#FF6B35';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 2]);
      ctx.lineDashOffset = this.animationOffset;
      this.drawRoundedRect(ctx, left - 1, top - 1, width + 2, height + 2, modernSelectionStyle.cornerRadius + 1, false);
    }
    
    ctx.setLineDash([]);
  }

  /**
   * 绘制选择框角标
   */
  public drawCornerIndicators(
    ctx: CanvasRenderingContext2D, 
    left: number, 
    top: number, 
    width: number, 
    height: number
  ): void {
    const cornerLength = 16;
    
    ctx.strokeStyle = modernSelectionStyle.strokeColor;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    
    const corners = [
      { x: left, y: top },
      { x: left + width, y: top },
      { x: left + width, y: top + height },
      { x: left, y: top + height },
    ];
    
    corners.forEach((corner, index) => {
      ctx.beginPath();
      
      switch (index) {
        case 0:
          ctx.moveTo(corner.x, corner.y + cornerLength);
          ctx.lineTo(corner.x, corner.y);
          ctx.lineTo(corner.x + cornerLength, corner.y);
          break;
        case 1:
          ctx.moveTo(corner.x - cornerLength, corner.y);
          ctx.lineTo(corner.x, corner.y);
          ctx.lineTo(corner.x, corner.y + cornerLength);
          break;
        case 2:
          ctx.moveTo(corner.x, corner.y - cornerLength);
          ctx.lineTo(corner.x, corner.y);
          ctx.lineTo(corner.x - cornerLength, corner.y);
          break;
        case 3:
          ctx.moveTo(corner.x + cornerLength, corner.y);
          ctx.lineTo(corner.x, corner.y);
          ctx.lineTo(corner.x, corner.y - cornerLength);
          break;
      }
      
      ctx.stroke();
    });
  }

  /**
   * 绘制圆角矩形
   */
  public drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    fill: boolean = false
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    
    if (fill) {
      ctx.fill();
    } else {
      ctx.stroke();
    }
  }
}

