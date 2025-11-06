import { test, vi, expect, beforeEach } from 'vitest';
import { getRuntimeNodeVersion } from '../src/fs/run-user-scripts';
import { NodeVersion } from '../src';

beforeEach(() => {
  vi.clearAllMocks();
});

vi.mock('child_process', () => {
  return {
    __esModule: true,
    exec(
      command: string,
      { cwd }: { cwd: string },
      callback: (error: Error | null, result: { stdout: string }) => void
    ) {
      expect(command).toBe('node --version');
      switch (cwd) {
        case 'test':
          callback(null, { stdout: 'v22.18.2' });
          break;
        default:
          callback(new Error('Invalid cwd'), { stdout: '' });
      }
    },
  };
});

test('getRuntimeNodeVersion', async () => {
  const version = await getRuntimeNodeVersion('test');
  expect(version).toEqual(
    new NodeVersion({
      major: 22,
      minor: undefined,
      range: '22.x',
      runtime: 'nodejs22.x',
    })
  );
});
