import { SafeExecutor } from '../../libs/drawBoard/infrastructure/error/SafeExecutor';

describe('SafeExecutor', () => {
  describe('execute', () => {
    it('应该成功执行同步函数', () => {
      const result = SafeExecutor.execute(() => 42, 0);
      expect(result).toBe(42);
    });

    it('应该在失败时返回降级值', () => {
      const result = SafeExecutor.execute(() => {
        throw new Error('测试错误');
      }, 0);
      expect(result).toBe(0);
    });

    it('应该处理字符串返回值', () => {
      const result = SafeExecutor.execute(() => 'success', 'fallback');
      expect(result).toBe('success');
    });

    it('应该处理对象返回值', () => {
      const obj = { key: 'value' };
      const result = SafeExecutor.execute(() => obj, { key: 'default' });
      expect(result).toEqual(obj);
    });

    it('应该处理数组返回值', () => {
      const arr = [1, 2, 3];
      const result = SafeExecutor.execute(() => arr, []);
      expect(result).toEqual(arr);
    });
  });

  describe('executeAsync', () => {
    it('应该成功执行异步函数', async () => {
      const result = await SafeExecutor.executeAsync(async () => 42, 0);
      expect(result).toBe(42);
    });

    it('应该在失败时返回降级值', async () => {
      const result = await SafeExecutor.executeAsync(async () => {
        throw new Error('测试错误');
      }, 0);
      expect(result).toBe(0);
    });

    it('应该处理异步 Promise 返回值', async () => {
      const result = await SafeExecutor.executeAsync(
        () => Promise.resolve('success'),
        'fallback'
      );
      expect(result).toBe('success');
    });

    it('应该处理异步错误', async () => {
      const result = await SafeExecutor.executeAsync(
        () => Promise.reject(new Error('异步错误')),
        'fallback'
      );
      expect(result).toBe('fallback');
    });
  });

  describe('executeWithStatus', () => {
    it('应该返回成功状态', () => {
      const { result, success } = SafeExecutor.executeWithStatus(() => 42, 0);
      expect(success).toBe(true);
      expect(result).toBe(42);
    });

    it('应该返回失败状态和错误', () => {
      const error = new Error('测试错误');
      const { result, success, error: returnedError } = SafeExecutor.executeWithStatus(
        () => {
          throw error;
        },
        0
      );
      expect(success).toBe(false);
      expect(result).toBe(0);
      expect(returnedError).toBe(error);
    });

    it('应该处理非 Error 类型的异常', () => {
      const { result, success, error } = SafeExecutor.executeWithStatus(
        () => {
          throw '字符串错误';
        },
        0
      );
      expect(success).toBe(false);
      expect(result).toBe(0);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('executeAsyncWithStatus', () => {
    it('应该返回成功状态', async () => {
      const { result, success } = await SafeExecutor.executeAsyncWithStatus(
        async () => 42,
        0
      );
      expect(success).toBe(true);
      expect(result).toBe(42);
    });

    it('应该返回失败状态和错误', async () => {
      const error = new Error('异步错误');
      const { result, success, error: returnedError } = await SafeExecutor.executeAsyncWithStatus(
        async () => {
          throw error;
        },
        0
      );
      expect(success).toBe(false);
      expect(result).toBe(0);
      expect(returnedError).toBe(error);
    });
  });

  describe('retry', () => {
    it('应该成功执行不需要重试的函数', async () => {
      const result = await SafeExecutor.retry(async () => 42, 3, 100, 0);
      expect(result).toBe(42);
    });

    it('应该在失败后重试', async () => {
      let attempts = 0;
      const result = await SafeExecutor.retry(
        async () => {
          attempts++;
          if (attempts < 2) {
            throw new Error('重试错误');
          }
          return 42;
        },
        3,
        10, // 短延迟用于测试
        0
      );
      expect(result).toBe(42);
      expect(attempts).toBe(2);
    });

    it('应该在达到最大重试次数后返回降级值', async () => {
      let attempts = 0;
      const result = await SafeExecutor.retry(
        async () => {
          attempts++;
          throw new Error('总是失败');
        },
        3,
        10,
        0
      );
      expect(result).toBe(0);
      expect(attempts).toBe(4); // 初始尝试 + 3次重试
    });

    it('应该使用默认重试参数', async () => {
      const result = await SafeExecutor.retry(async () => 42, undefined, undefined, 0);
      expect(result).toBe(42);
    });
  });

  describe('executeBatch', () => {
    it('应该批量执行任务', () => {
      const tasks = [
        () => 1,
        () => 2,
        () => 3
      ];
      const results = SafeExecutor.executeBatch(tasks, 0);
      expect(results).toEqual([1, 2, 3]);
    });

    it('应该在遇到错误时继续执行（默认行为）', () => {
      const tasks = [
        () => 1,
        () => {
          throw new Error('错误');
        },
        () => 3
      ];
      const results = SafeExecutor.executeBatch(tasks, 0);
      expect(results).toEqual([1, 0, 3]); // 错误的任务返回降级值
    });

    it('应该在 stopOnError 为 true 时停止执行', () => {
      const tasks = [
        () => 1,
        () => {
          throw new Error('错误');
        },
        () => 3
      ];
      const results = SafeExecutor.executeBatch(tasks, 0, true);
      expect(results).toEqual([1, 0]); // 在错误后停止
    });

    it('应该处理空任务数组', () => {
      const results = SafeExecutor.executeBatch([], 0);
      expect(results).toEqual([]);
    });
  });

  describe('executeBatchAsync', () => {
    it('应该批量执行异步任务', async () => {
      const tasks = [
        async () => 1,
        async () => 2,
        async () => 3
      ];
      const results = await SafeExecutor.executeBatchAsync(tasks, 0);
      expect(results).toEqual([1, 2, 3]);
    });

    it('应该在遇到错误时继续执行（默认行为）', async () => {
      const tasks = [
        async () => 1,
        async () => {
          throw new Error('错误');
        },
        async () => 3
      ];
      const results = await SafeExecutor.executeBatchAsync(tasks, 0);
      expect(results).toEqual([1, 0, 3]);
    });

    it('应该在 stopOnError 为 true 时停止执行', async () => {
      const tasks = [
        async () => 1,
        async () => {
          throw new Error('错误');
        },
        async () => 3
      ];
      const results = await SafeExecutor.executeBatchAsync(tasks, 0, true);
      expect(results).toEqual([1, 0]);
    });

    it('应该按顺序执行任务', async () => {
      const executionOrder: number[] = [];
      const tasks = [
        async () => {
          executionOrder.push(1);
          return 1;
        },
        async () => {
          executionOrder.push(2);
          return 2;
        },
        async () => {
          executionOrder.push(3);
          return 3;
        }
      ];
      await SafeExecutor.executeBatchAsync(tasks, 0);
      expect(executionOrder).toEqual([1, 2, 3]);
    });
  });
});

