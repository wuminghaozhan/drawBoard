import { DrawTool } from './DrawTool';
import type { DrawAction } from './DrawTool';
import type { SelectionBox } from '../core/SelectionManager';

export interface SelectAction extends DrawAction {
  selected?: boolean;
  selectedActions?: string[]; // 选中的动作ID列表
  selectionBox?: SelectionBox; // 选择框
}

export class SelectTool extends DrawTool {
  constructor() {
    super('选择', 'select');
  }

  public draw(ctx: CanvasRenderingContext2D, action: SelectAction): void {
    if (action.points.length < 2) return;

    const originalContext = this.saveContext(ctx);
    
    // 绘制选择框
    ctx.strokeStyle = '#007bff';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);

    const start = action.points[0];
    const end = action.points[action.points.length - 1];
    
    // 确保选择框的坐标正确（支持反向选择）
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);

    // 绘制选择框
    ctx.strokeRect(left, top, width, height);
    
    // 如果有选中内容，绘制半透明背景
    if (action.selectedActions && action.selectedActions.length > 0) {
      ctx.fillStyle = 'rgba(0, 123, 255, 0.1)';
      ctx.fillRect(left, top, width, height);
    }
    
    // 恢复原始样式
    ctx.setLineDash([]);
    this.restoreContext(ctx, originalContext);
  }

  // 移除手柄绘制方法，现在由SelectionManager负责

  public getActionType(): string {
    return 'select';
  }

  // 移除重复的上下文管理方法，使用基类的方法
} 