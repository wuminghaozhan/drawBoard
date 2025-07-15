import { DrawTool } from './DrawTool';
import { PenTool } from './PenTool';
import { RectTool } from './RectTool';
import { CircleTool } from './CircleTool';
import { EraserTool } from './EraserTool';
import { TextTool } from './TextTool';
import { SelectTool } from './SelectTool';

export type ToolType = 'pen' | 'rect' | 'circle' | 'text' | 'eraser' | 'select';

export class ToolManager {
  private tools: Map<ToolType, DrawTool> = new Map();
  private currentTool: ToolType = 'pen';

  constructor() {
    this.registerTools();
  }

  private registerTools(): void {
    this.tools.set('pen', new PenTool());
    this.tools.set('rect', new RectTool());
    this.tools.set('circle', new CircleTool());
    this.tools.set('eraser', new EraserTool());
    this.tools.set('text', new TextTool());
    this.tools.set('select', new SelectTool());
  }

  public getTool(type: ToolType): DrawTool | undefined {
    return this.tools.get(type);
  }

  public getCurrentTool(): DrawTool | undefined {
    return this.tools.get(this.currentTool);
  }

  public setCurrentTool(type: ToolType): void {
    if (this.tools.has(type)) {
      this.currentTool = type;
    }
  }

  public getCurrentToolType(): ToolType {
    return this.currentTool;
  }

  public getAllTools(): Map<ToolType, DrawTool> {
    return new Map(this.tools);
  }

  public getToolNames(): Array<{ type: ToolType; name: string }> {
    return Array.from(this.tools.entries()).map(([type, tool]) => ({
      type,
      name: tool.getName()
    }));
  }
} 