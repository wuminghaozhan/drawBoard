import type { DrawAction } from '../tools/DrawTool';
import type { Point } from '../core/CanvasEngine';

/**
 * Action 校验器 - 统一的 DrawAction 校验工具
 * 
 * 提供统一的校验方法，减少重复的边界检查代码
 */
export class ActionValidator {
  /**
   * 检查 action 是否有效（有非空的 points 数组）
   */
  static isValidAction(action: DrawAction | null | undefined): action is DrawAction {
    return !!(action && action.points && action.points.length > 0);
  }

  /**
   * 检查 action 是否至少有指定数量的点
   */
  static hasMinPoints(action: DrawAction | null | undefined, minPoints: number): boolean {
    return this.isValidAction(action) && action.points.length >= minPoints;
  }

  /**
   * 检查 actions 数组是否有效且非空
   */
  static hasValidActions(actions: DrawAction[] | null | undefined): actions is DrawAction[] {
    return !!(actions && actions.length > 0);
  }

  /**
   * 过滤出有效的 actions
   */
  static filterValidActions(actions: DrawAction[]): DrawAction[] {
    return actions.filter(action => this.isValidAction(action));
  }

  /**
   * 检查点是否有效
   */
  static isValidPoint(point: Point | null | undefined): point is Point {
    return !!(point && typeof point.x === 'number' && typeof point.y === 'number' && 
              !isNaN(point.x) && !isNaN(point.y));
  }

  /**
   * 检查 points 数组是否有效
   */
  static hasValidPoints(points: Point[] | null | undefined): points is Point[] {
    return !!(points && points.length > 0 && points.every(p => this.isValidPoint(p)));
  }

  /**
   * 安全获取 action 的第一个点
   */
  static getFirstPoint(action: DrawAction | null | undefined): Point | null {
    if (!this.isValidAction(action)) return null;
    return action.points[0];
  }

  /**
   * 安全获取 action 的最后一个点
   */
  static getLastPoint(action: DrawAction | null | undefined): Point | null {
    if (!this.isValidAction(action)) return null;
    return action.points[action.points.length - 1];
  }

  /**
   * 检查 action 的 context 是否有效
   */
  static hasValidContext(action: DrawAction | null | undefined): boolean {
    return !!(action && action.context && 
              typeof action.context.lineWidth === 'number' &&
              typeof action.context.strokeStyle === 'string');
  }

  /**
   * 深拷贝 action（包含 points 和 context）
   */
  static deepClone(action: DrawAction): DrawAction {
    return {
      ...action,
      points: action.points.map(p => ({ ...p })),
      context: { ...action.context }
    };
  }

  /**
   * 深拷贝 actions 数组
   */
  static deepCloneActions(actions: DrawAction[]): DrawAction[] {
    return actions.map(action => this.deepClone(action));
  }
}

/**
 * 类型守卫：检查是否为有效的 DrawAction
 */
export function isDrawAction(value: unknown): value is DrawAction {
  if (!value || typeof value !== 'object') return false;
  const action = value as DrawAction;
  return !!(
    typeof action.id === 'string' &&
    typeof action.type === 'string' &&
    Array.isArray(action.points) &&
    action.context &&
    typeof action.context === 'object'
  );
}

