import type { DrawAction } from '../DrawTool';
import type { Point } from '../../core/CanvasEngine';
import type { AnchorPoint, AnchorType, Bounds } from './AnchorTypes';
import { logger } from '../../infrastructure/logging/Logger';
import { BaseAnchorHandler } from './BaseAnchorHandler';
import { AnchorUtils } from '../../utils/AnchorUtils';

/**
 * 圆形锚点处理器
 * 实现圆形图形的锚点生成和拖拽处理
 */
export class CircleAnchorHandler extends BaseAnchorHandler {
  
  /**
   * 生成圆形锚点
   */
  public generateAnchors(action: DrawAction, bounds: Bounds): AnchorPoint[] {
    logger.debug('CircleAnchorHandler.generateAnchors: 开始生成锚点', {
      actionType: action.type,
      actionId: action.id,
      pointsCount: action.points.length,
      bounds
    });
    
    if (action.points.length < 2) {
      logger.warn('CircleAnchorHandler.generateAnchors: action.points.length < 2，返回空数组', {
        actionId: action.id,
        pointsCount: action.points.length,
        points: action.points
      });
      return [];
    }
    
    const center = action.points[0];
    const anchors: AnchorPoint[] = [];
    const halfSize = AnchorUtils.DEFAULT_ANCHOR_SIZE / 2;
    
    // 生成中心点（圆心位置）
    anchors.push({
      x: center.x - halfSize,
      y: center.y - halfSize,
      type: 'center',
      cursor: 'move',
      shapeType: 'circle',
      isCenter: true
    });
    
    // 生成4个边界锚点（上、下、左、右）- 根据文档要求
    // 对于圆形，需要基于圆心和半径计算锚点位置，而不是使用 bounds 的 x, y
    // 圆形边界框应该是以圆心为中心的正方形，但传入的 bounds 可能是基于两个点计算的矩形
    // 因此，我们直接基于圆心和半径计算锚点位置
    
    // 计算半径：优先使用圆心到边缘点的距离
    // 注意：CircleTool 使用 points[points.length - 1] 作为边缘点，而不是 points[1]
    let radius: number;
    if (action.points.length >= 2) {
      const edge = action.points[action.points.length - 1];
      const distance = Math.sqrt(
        Math.pow(edge.x - center.x, 2) + Math.pow(edge.y - center.y, 2)
      );
      
      // 优先使用实际计算的距离（最准确）
      if (distance > 0 && isFinite(distance)) {
        radius = distance;
      } else {
        // 如果距离无效，使用 bounds 计算（fallback）
        // 对于圆形，bounds 应该是以圆心为中心的正方形，所以 width 和 height 应该相等
        const boundsRadius = Math.max(bounds.width, bounds.height) / 2;
        radius = boundsRadius > 0 && isFinite(boundsRadius) ? boundsRadius : 10;
      }
    } else {
      // 如果没有边缘点，使用 bounds 计算
      const boundsRadius = Math.max(bounds.width, bounds.height) / 2;
      radius = boundsRadius > 0 && isFinite(boundsRadius) ? boundsRadius : 10;
    }
    
    // 确保半径有效（至少为锚点大小，避免锚点重叠）
    const MIN_VISIBLE_RADIUS = AnchorUtils.DEFAULT_ANCHOR_SIZE;
    if (!isFinite(radius) || radius < MIN_VISIBLE_RADIUS) {
      radius = Math.max(MIN_VISIBLE_RADIUS, 10); // 至少为锚点大小或10
    }
    
    // 上、下、左、右四个方向的锚点（基于圆心和半径）
    // 锚点的 x, y 是锚点左上角的位置，绘制时会加上 halfSize 得到中心点
    // 【修复】添加显式类型注解，避免 TypeScript 推断为 string
    const topAnchor: AnchorPoint = { x: center.x - halfSize, y: center.y - radius - halfSize, type: 'top', cursor: 'n-resize', shapeType: 'circle', isCenter: false };
    const bottomAnchor: AnchorPoint = { x: center.x - halfSize, y: center.y + radius - halfSize, type: 'bottom', cursor: 's-resize', shapeType: 'circle', isCenter: false };
    const leftAnchor: AnchorPoint = { x: center.x - radius - halfSize, y: center.y - halfSize, type: 'left', cursor: 'w-resize', shapeType: 'circle', isCenter: false };
    const rightAnchor: AnchorPoint = { x: center.x + radius - halfSize, y: center.y - halfSize, type: 'right', cursor: 'e-resize', shapeType: 'circle', isCenter: false };
    
    anchors.push(topAnchor, bottomAnchor, leftAnchor, rightAnchor);
    
    logger.info('CircleAnchorHandler.generateAnchors: 锚点生成完成', {
      actionId: action.id,
      totalAnchors: anchors.length,
      centerAnchor: anchors.find(a => a.isCenter) ? true : false,
      edgeAnchors: anchors.filter(a => !a.isCenter).length,
      radius,
      center: { x: center.x, y: center.y },
      bounds
    });
    
    return anchors;
  }
  
  /**
   * 处理圆形锚点拖拽
   * 中心点：移动整个圆（此情况应该由SelectTool的移动逻辑处理，这里保留作为备用）
   * 边缘锚点：直接计算鼠标到圆心的距离作为新半径，边缘点跟随鼠标方向
   */
  public handleAnchorDrag(
    action: DrawAction,
    anchorType: AnchorType,
    startPoint: Point,
    currentPoint: Point,
    _dragStartBounds: Bounds,
    _dragStartAction?: DrawAction
  ): DrawAction | null {
    if (action.points.length < 2) {
      return null;
    }
    
    const center = action.points[0];
    
    // 中心点拖拽：移动整个圆（此情况应该由SelectTool的移动逻辑处理）
    // 这里保留作为备用，但正常情况下不应该进入这里
    if (anchorType === 'center') {
      const deltaX = currentPoint.x - startPoint.x;
      const deltaY = currentPoint.y - startPoint.y;
      return this.handleMove(action, deltaX, deltaY);
    }
    
    // 边缘锚点拖拽：根据锚点类型（top/bottom/left/right）计算新半径
    // 拖拽任意一个边缘锚点，半径跟随鼠标到圆心的距离
    
    // 计算鼠标到圆心的距离（这就是新半径）
    const mouseToCenterDistance = Math.sqrt(
      Math.pow(currentPoint.x - center.x, 2) + 
      Math.pow(currentPoint.y - center.y, 2)
    );
    
    // 新半径 = 鼠标到圆心的距离（直接使用，精确控制）
    const newRadius = mouseToCenterDistance;
    
    // 限制半径范围
    const MIN_RADIUS = 5;
    const MAX_RADIUS = 10000; // 实际限制由画布尺寸决定
    const clampedRadius = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, newRadius));
    
    // 如果半径太小，返回null（无效操作）
    if (clampedRadius < MIN_RADIUS) {
      return null;
    }
    
    // 根据锚点类型计算边缘点位置
    // 优化：根据锚点类型限制边缘点的方向，提供更直观的拖拽体验
    let newEdgeX: number;
    let newEdgeY: number;
    
    if (anchorType === 'top' || anchorType === 'bottom' || anchorType === 'left' || anchorType === 'right') {
      // 计算鼠标方向的角度
      let angle = Math.atan2(currentPoint.y - center.y, currentPoint.x - center.x);
      
      // 根据锚点类型，将角度限制到对应方向（±45度范围内）
      // 这样拖拽时边缘点会更接近锚点方向，提供更直观的体验
      const angleRanges: Record<string, { min: number; max: number; preferred: number }> = {
        'top': { min: -Math.PI * 0.75, max: -Math.PI * 0.25, preferred: -Math.PI / 2 },      // 上：-135° 到 -45°，偏好 -90°
        'bottom': { min: Math.PI * 0.25, max: Math.PI * 0.75, preferred: Math.PI / 2 },         // 下：45° 到 135°，偏好 90°
        'left': { min: Math.PI * 0.75, max: -Math.PI * 0.75, preferred: Math.PI },              // 左：135° 到 -135°，偏好 180°
        'right': { min: -Math.PI * 0.25, max: Math.PI * 0.25, preferred: 0 }                     // 右：-45° 到 45°，偏好 0°
      };
      
      const range = angleRanges[anchorType];
      if (range) {
        // 标准化角度到 [-π, π] 范围
        while (angle > Math.PI) angle -= 2 * Math.PI;
        while (angle < -Math.PI) angle += 2 * Math.PI;
        
        // 检查角度是否在范围内（考虑跨0度的情况）
        let inRange = false;
        if (anchorType === 'left') {
          // 左：135° 到 -135°（跨0度）
          inRange = angle >= range.min || angle <= range.max;
        } else {
          inRange = angle >= range.min && angle <= range.max;
        }
        
        // 如果角度不在范围内，使用偏好角度（锚点方向）
        if (!inRange) {
          angle = range.preferred;
        }
      }
      
      newEdgeX = center.x + clampedRadius * Math.cos(angle);
      newEdgeY = center.y + clampedRadius * Math.sin(angle);
    } else {
      // 兼容其他锚点类型（向后兼容）：边缘点完全跟随鼠标方向
      const angle = Math.atan2(currentPoint.y - center.y, currentPoint.x - center.x);
      newEdgeX = center.x + clampedRadius * Math.cos(angle);
      newEdgeY = center.y + clampedRadius * Math.sin(angle);
    }
    
    // 创建新的action，更新边缘点
    // 保持原有的 points 数组结构，只更新最后一个点（边缘点）
    const newPoints = [...action.points];
    const newEdge: Point = { x: newEdgeX, y: newEdgeY };
    if (newPoints.length > 1) {
      newPoints[newPoints.length - 1] = newEdge;
    } else {
      newPoints.push(newEdge);
    }
    
    return {
      ...action,
      points: newPoints
    };
  }
  
  
  /**
   * 计算圆形中心点（圆心位置）
   */
  public calculateCenterPoint(action: DrawAction, _bounds?: Bounds): Point {
    if (action.points.length > 0) {
      return action.points[0]; // 圆心位置
    }
    return { x: 0, y: 0 };
  }
  
}

