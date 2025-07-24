import type { DrawAction } from '../tools/DrawTool';

export interface SelectionBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SelectedAction {
  action: DrawAction;
  bounds: SelectionBox;
}

export class SelectionManager {
  private selectedActions: Map<string, SelectedAction> = new Map();
  private selectionBox: SelectionBox | null = null;
  private isDragging: boolean = false;
  private dragOffset: { x: number; y: number } = { x: 0, y: 0 };
  
  // 性能优化：缓存手柄位置
  private cachedHandles: Array<{x: number, y: number}> | null = null;
  private cachedSelectionBox: SelectionBox | null = null;
  private cachedHandleSize: number = 0;

  // 检测动作是否在选择框内
  public detectSelection(selectionBox: SelectionBox, actions: DrawAction[]): string[] {
    const selectedIds: string[] = [];
    
    actions.forEach(action => {
      if (this.isActionInSelectionBox(action, selectionBox)) {
        selectedIds.push(action.id);
        const bounds = this.calculateActionBounds(action);
        this.selectedActions.set(action.id, { action, bounds });
      }
    });
    
    return selectedIds;
  }

  // 计算动作的边界框
  private calculateActionBounds(action: DrawAction): SelectionBox {
    if (action.points.length === 0) {
      return { left: 0, top: 0, width: 0, height: 0 };
    }

    let minX = action.points[0].x;
    let maxX = action.points[0].x;
    let minY = action.points[0].y;
    let maxY = action.points[0].y;

    action.points.forEach(point => {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    });

    // 为线条添加线宽边距
    const lineWidth = action.context.lineWidth || 2;
    const margin = lineWidth / 2;

    return {
      left: minX - margin,
      top: minY - margin,
      width: maxX - minX + lineWidth,
      height: maxY - minY + lineWidth
    };
  }

  // 检测动作是否在选择框内
  private isActionInSelectionBox(action: DrawAction, selectionBox: SelectionBox): boolean {
    if (action.points.length === 0) return false;

    // 检查动作的边界框是否与选择框相交
    const actionBounds = this.calculateActionBounds(action);
    
    return !(
      actionBounds.left > selectionBox.left + selectionBox.width ||
      actionBounds.left + actionBounds.width < selectionBox.left ||
      actionBounds.top > selectionBox.top + selectionBox.height ||
      actionBounds.top + actionBounds.height < selectionBox.top
    );
  }

  // 设置选择框
  public setSelectionBox(box: SelectionBox | null): void {
    this.selectionBox = box;
  }

  // 获取选择框
  public getSelectionBox(): SelectionBox | null {
    return this.selectionBox;
  }

  // 获取选中的动作
  public getSelectedActions(): SelectedAction[] {
    return Array.from(this.selectedActions.values());
  }

  // 获取选中的动作ID
  public getSelectedActionIds(): string[] {
    return Array.from(this.selectedActions.keys());
  }

  // 清除选择
  public clearSelection(): void {
    this.selectedActions.clear();
    this.selectionBox = null;
    this.clearCache();
  }

  // 清除缓存
  private clearCache(): void {
    this.cachedHandles = null;
    this.cachedSelectionBox = null;
    this.cachedHandleSize = 0;
  }

  // 检查是否有选中内容
  public hasSelection(): boolean {
    return this.selectedActions.size > 0;
  }

  // 开始拖拽
  public startDrag(point: { x: number; y: number }): void {
    if (!this.hasSelection()) return;
    
    this.isDragging = true;
    const center = this.getSelectionCenter();
    this.dragOffset = {
      x: point.x - center.x,
      y: point.y - center.y
    };
  }

  // 更新拖拽
  public updateDrag(point: { x: number; y: number }): { x: number; y: number } {
    if (!this.isDragging) return { x: 0, y: 0 };
    
    const center = this.getSelectionCenter();
    const newCenter = {
      x: point.x - this.dragOffset.x,
      y: point.y - this.dragOffset.y
    };
    
    return {
      x: newCenter.x - center.x,
      y: newCenter.y - center.y
    };
  }

  // 结束拖拽
  public endDrag(): void {
    this.isDragging = false;
  }

  // 获取选择区域的中心点
  private getSelectionCenter(): { x: number; y: number } {
    if (!this.selectionBox) return { x: 0, y: 0 };
    
    return {
      x: this.selectionBox.left + this.selectionBox.width / 2,
      y: this.selectionBox.top + this.selectionBox.height / 2
    };
  }

  // 移动选中的动作
  public moveSelectedActions(offset: { x: number; y: number }): DrawAction[] {
    const movedActions: DrawAction[] = [];
    
    this.selectedActions.forEach(({ action }) => {
      const movedAction: DrawAction = {
        ...action,
        points: action.points.map(point => ({
          x: point.x + offset.x,
          y: point.y + offset.y
        }))
      };
      movedActions.push(movedAction);
    });
    
    return movedActions;
  }

  // 删除选中的动作
  public getSelectedActionIdsForDeletion(): string[] {
    return this.getSelectedActionIds();
  }

  // 复制选中的动作
  public copySelectedActions(): DrawAction[] {
    const copiedActions: DrawAction[] = [];
    
    this.selectedActions.forEach(({ action }) => {
      const copiedAction: DrawAction = {
        ...action,
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        timestamp: Date.now()
      };
      copiedActions.push(copiedAction);
    });
    
    return copiedActions;
  }

  // 获取选择框的边界
  public getSelectionBounds(): SelectionBox | null {
    if (!this.hasSelection()) return null;
    
    const actions = this.getSelectedActions();
    if (actions.length === 0) return null;
    
    let minX = actions[0].bounds.left;
    let maxX = actions[0].bounds.left + actions[0].bounds.width;
    let minY = actions[0].bounds.top;
    let maxY = actions[0].bounds.top + actions[0].bounds.height;
    
    actions.forEach(({ bounds }) => {
      minX = Math.min(minX, bounds.left);
      maxX = Math.max(maxX, bounds.left + bounds.width);
      minY = Math.min(minY, bounds.top);
      maxY = Math.max(maxY, bounds.top + bounds.height);
    });
    
    return {
      left: minX,
      top: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  // 绘制选择手柄
  public drawHandles(ctx: CanvasRenderingContext2D): void {
    if (!this.hasSelection()) return;
    
    const selectionBox = this.getSelectionBox();
    if (!selectionBox) return;

    const originalContext = this.saveContext(ctx);
    
    // 绘制选择框边框
    ctx.strokeStyle = '#007bff';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.strokeRect(selectionBox.left, selectionBox.top, selectionBox.width, selectionBox.height);
    
    // 绘制手柄
    const handleSize = 6;
    const handles = this.getHandlePositions(selectionBox, handleSize);
    
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#007bff';
    ctx.lineWidth = 1;
    
    handles.forEach(handle => {
      ctx.fillRect(handle.x - handleSize/2, handle.y - handleSize/2, handleSize, handleSize);
      ctx.strokeRect(handle.x - handleSize/2, handle.y - handleSize/2, handleSize, handleSize);
    });
    
    this.restoreContext(ctx, originalContext);
  }

  // 获取手柄位置（带边界检查和缓存）
  private getHandlePositions(selectionBox: SelectionBox, handleSize: number): Array<{x: number, y: number}> {
    // 检查缓存是否有效
    if (this.cachedHandles && 
        this.cachedSelectionBox &&
        this.cachedHandleSize === handleSize &&
        this.isSelectionBoxEqual(this.cachedSelectionBox, selectionBox)) {
      return this.cachedHandles;
    }
    
    const { left, top, width, height } = selectionBox;
    const halfHandle = handleSize / 2;
    
    // 使用合理的边界值（可以后续传入canvas参数进行优化）
    const maxX = 2000; // 假设最大宽度
    const maxY = 2000; // 假设最大高度
    
    const handles = [
      // 四个角
      { x: Math.max(0, left - halfHandle), y: Math.max(0, top - halfHandle) }, // 左上
      { x: Math.min(maxX, left + width + halfHandle), y: Math.max(0, top - halfHandle) }, // 右上
      { x: Math.min(maxX, left + width + halfHandle), y: Math.min(maxY, top + height + halfHandle) }, // 右下
      { x: Math.max(0, left - halfHandle), y: Math.min(maxY, top + height + halfHandle) }, // 左下
      
      // 四个边的中点
      { x: left + width/2, y: Math.max(0, top - halfHandle) }, // 上中
      { x: Math.min(maxX, left + width + halfHandle), y: top + height/2 }, // 右中
      { x: left + width/2, y: Math.min(maxY, top + height + halfHandle) }, // 下中
      { x: Math.max(0, left - halfHandle), y: top + height/2 } // 左中
    ];
    
    // 更新缓存
    this.cachedHandles = handles;
    this.cachedSelectionBox = { ...selectionBox };
    this.cachedHandleSize = handleSize;
    
    return handles;
  }

  // 检查两个选择框是否相等
  private isSelectionBoxEqual(box1: SelectionBox, box2: SelectionBox): boolean {
    return box1.left === box2.left &&
           box1.top === box2.top &&
           box1.width === box2.width &&
           box1.height === box2.height;
  }

  // 保存上下文状态
  private saveContext(ctx: CanvasRenderingContext2D) {
    return {
      strokeStyle: ctx.strokeStyle,
      lineWidth: ctx.lineWidth,
      fillStyle: ctx.fillStyle
    };
  }

  // 恢复上下文状态
  private restoreContext(ctx: CanvasRenderingContext2D, saved: ReturnType<typeof this.saveContext>): void {
    ctx.strokeStyle = saved.strokeStyle;
    ctx.lineWidth = saved.lineWidth;
    ctx.fillStyle = saved.fillStyle;
  }

  /**
   * 销毁选择管理器，清理所有资源
   */
  public destroy(): void {
    // 清空选择状态
    this.selectedActions.clear();
    this.selectionBox = null;
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };
    
    // 清理缓存
    this.cachedHandles = null;
    this.cachedSelectionBox = null;
    this.cachedHandleSize = 0;
    
    console.log('🗑️ SelectionManager destroyed');
  }
} 