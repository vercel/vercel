import { ExecutionTime } from './types';

export async function measureExecTime<T>(
  fn: () => Promise<T>
): Promise<{ result: T; executionTime: ExecutionTime }> {
  const startedAt = Date.now();
  const result = await fn();
  const finishedAt = Date.now();

  return { result, executionTime: { startedAt, finishedAt } };
}
