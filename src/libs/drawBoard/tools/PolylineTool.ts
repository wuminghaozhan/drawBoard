import { DrawTool } from './DrawTool';
import type { DrawAction } from './DrawTool';
import type { Point } from '../core/CanvasEngine';

export interface PolylineAction extends DrawAction {
  type: 'polyline';
  // points: Point[] - 继承自 DrawAction，至少需要 2 个点
}

/**
 * 折线工具类 - 绘制开放的折线
 * 
 * 交互方式：
 * - 点击添加点：每次点击添加一个新顶点
 * - 实时预览：显示从最后一个点到鼠标位置的虚线预览
 * - 双击完成：双击最后一个点完成绘制
 * - Enter 完成：按 Enter 键完成绘制
 * - ESC 取消：按 ESC 键取消绘制
 * - Backspace 删除：删除最后一个添加的点
 * 
 * 数据格式：
 * - points: 所有顶点坐标数组，至少需要 2 个点（起点和终点）
 */
export class PolylineTool extends DrawTool {
  constructor() {
    super('折线', 'polyline');
  }

  public draw(ctx: CanvasRenderingContext2D, action: PolylineAction): void {
    if (action.points.length < 2) return;

    const originalContext = this.saveContext(ctx);
    this.setContext(ctx, action.context);

    // 设置复杂度评分和缓存支持
    if (!action.complexityScore) {
      action.complexityScore = this.calculateComplexity(action);
    }
    if (action.supportsCaching === undefined) {
      action.supportsCaching = false; // 折线绘制简单，不需要缓存
    }

    // 绘制折线（不闭合）
    ctx.beginPath();
    ctx.moveTo(action.points[0].x, action.points[0].y);
    
    for (let i = 1; i < action.points.length; i++) {
      ctx.lineTo(action.points[i].x, action.points[i].y);
    }
    
    ctx.stroke();

    this.restoreContext(ctx, originalContext);
  }

  /**
   * 计算折线工具的复杂度评分
   */
  private calculateComplexity(action: PolylineAction): number {
    // 基础复杂度：线宽影响
    let complexity = Math.round(action.context.lineWidth * 0.3 + 1);
    
    // 点数越多越复杂
    complexity += Math.floor(action.points.length / 5);
    
    return complexity;
  }

  public getActionType(): string {
    return 'polyline';
  }
}

