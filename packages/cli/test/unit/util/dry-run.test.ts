import { describe, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { outputDryRun } from '../../../src/util/dry-run';
import type { DryRunResult } from '../../../src/util/dry-run';
import type Client from '../../../src/util/client';

/**
 * Lightweight mock that satisfies the Client properties used by outputDryRun
 * without pulling in the full mock client.
 */
function createMockClient(
  overrides: { nonInteractive?: boolean; argv?: string[] } = {}
) {
  let buffer = '';
  return {
    nonInteractive: overrides.nonInteractive ?? false,
    argv: overrides.argv ?? ['node', 'vercel'],
    stdout: {
      write(chunk: string) {
        buffer += chunk;
        return true;
      },
    },
    getOutput() {
      return buffer;
    },
    reset() {
      buffer = '';
    },
  };
}

type MockClient = ReturnType<typeof createMockClient>;

const sampleResult: DryRunResult = {
  status: 'dry_run',
  reason: 'dry_run_ok',
  message: 'Login would initiate OAuth device code flow',
  actions: [
    {
      action: 'api_call',
      description: 'POST device authorization request to Vercel OAuth',
    },
    { action: 'browser_open', description: 'Open verification URL in browser' },
    { action: 'poll', description: 'Poll for token completion' },
    {
      action: 'file_write',
      description: 'Save credentials',
      details: { path: '~/.vercel/auth.json' },
    },
  ],
};

describe('outputDryRun', () => {
  describe('agent mode (nonInteractive)', () => {
    let mock: MockClient;

    beforeEach(() => {
      mock = createMockClient({ nonInteractive: true });
    });

    it('writes JSON to stdout', () => {
      const exitCode = outputDryRun(mock as unknown as Client, sampleResult);

      expect(exitCode).toBe(0);
      const parsed = JSON.parse(mock.getOutput());
      expect(parsed.status).toBe('dry_run');
      expect(parsed.reason).toBe('dry_run_ok');
      expect(parsed.message).toBe(
        'Login would initiate OAuth device code flow'
      );
    });

    it('includes actions in data field', () => {
      outputDryRun(mock as unknown as Client, sampleResult);

      const parsed = JSON.parse(mock.getOutput());
      expect(parsed.data.actions).toHaveLength(4);
      expect(parsed.data.actions[0].action).toBe('api_call');
      expect(parsed.data.actions[3].details).toEqual({
        path: '~/.vercel/auth.json',
      });
    });

    it('returns EXIT_CODE.SUCCESS (0)', () => {
      const exitCode = outputDryRun(mock as unknown as Client, sampleResult);
      expect(exitCode).toBe(0);
    });

    it('outputs well-formed JSON with trailing newline', () => {
      outputDryRun(mock as unknown as Client, sampleResult);

      const raw = mock.getOutput();
      expect(raw.endsWith('\n')).toBe(true);
      expect(() => JSON.parse(raw)).not.toThrow();
    });

    it('handles empty actions array', () => {
      const result: DryRunResult = {
        status: 'dry_run',
        reason: 'dry_run_ok',
        message: 'Nothing would happen',
        actions: [],
      };

      const exitCode = outputDryRun(mock as unknown as Client, result);

      expect(exitCode).toBe(0);
      const parsed = JSON.parse(mock.getOutput());
      expect(parsed.data.actions).toEqual([]);
    });

    it('preserves action details in JSON output', () => {
      const result: DryRunResult = {
        status: 'dry_run',
        reason: 'dry_run_ok',
        message: 'Would deploy',
        actions: [
          {
            action: 'api_call',
            description: 'Create deployment',
            details: {
              project: 'my-app',
              target: 'production',
              framework: 'next',
            },
          },
        ],
      };

      outputDryRun(mock as unknown as Client, result);

      const parsed = JSON.parse(mock.getOutput());
      expect(parsed.data.actions[0].details).toEqual({
        project: 'my-app',
        target: 'production',
        framework: 'next',
      });
    });
  });

  describe('human mode (interactive)', () => {
    let mock: MockClient;
    let logSpy: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      mock = createMockClient({ nonInteractive: false });
      // Spy on output.log (the output-manager singleton)
      const outputManager = await import('../../../src/output-manager');
      logSpy = vi
        .spyOn(outputManager.default, 'log')
        .mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('returns EXIT_CODE.SUCCESS (0)', () => {
      const exitCode = outputDryRun(mock as unknown as Client, sampleResult);
      expect(exitCode).toBe(0);
    });

    it('does not write to stdout', () => {
      outputDryRun(mock as unknown as Client, sampleResult);
      expect(mock.getOutput()).toBe('');
    });

    it('calls output.log with human-readable summary', () => {
      outputDryRun(mock as unknown as Client, sampleResult);

      expect(logSpy).toHaveBeenCalled();
      const allCalls = logSpy.mock.calls.map((c: unknown[]) => c[0]);
      expect(
        allCalls.some(
          (msg: string) =>
            typeof msg === 'string' &&
            msg.includes('Login would initiate OAuth device code flow')
        )
      ).toBe(true);
    });

    it('logs numbered action list', () => {
      outputDryRun(mock as unknown as Client, sampleResult);

      const allCalls = logSpy.mock.calls.map((c: unknown[]) => c[0]);
      expect(
        allCalls.some(
          (msg: string) =>
            typeof msg === 'string' &&
            msg.includes('1.') &&
            msg.includes('api_call')
        )
      ).toBe(true);
      expect(
        allCalls.some(
          (msg: string) =>
            typeof msg === 'string' &&
            msg.includes('4.') &&
            msg.includes('file_write')
        )
      ).toBe(true);
    });

    it('logs action details as key-value pairs', () => {
      outputDryRun(mock as unknown as Client, sampleResult);

      const allCalls = logSpy.mock.calls.map((c: unknown[]) => c[0]);
      expect(
        allCalls.some(
          (msg: string) =>
            typeof msg === 'string' &&
            msg.includes('path') &&
            msg.includes('~/.vercel/auth.json')
        )
      ).toBe(true);
    });
  });
});
