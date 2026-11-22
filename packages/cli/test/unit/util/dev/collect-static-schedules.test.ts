import { describe, expect, it } from 'vitest';
import { collectStaticSchedules } from '../../../../src/util/dev/static-schedules';
import type { DevFunctionRegistry } from '../../../../src/util/dev/function-registry';

const registry = {
  functions: new Map([
    [
      'index',
      {
        outputPath: 'index',
        invocation: { type: 'entrypoint', entrypoint: 'index.ts' },
        experimentalTriggers: [{ type: 'schedule/v1beta' }],
      },
    ],
  ]),
  schedules: [],
  unmatchedPatterns: [],
} as unknown as DevFunctionRegistry;

describe('collectStaticSchedules', () => {
  it('collects a root function schedule', () => {
    expect(
      collectStaticSchedules(
        [{ name: 'nightly', schedule: '0 3 * * *', function: 'index' }],
        registry
      )
    ).toMatchObject([
      { name: 'nightly', target: { type: 'function', function: 'index' } },
    ]);
  });

  it('rejects a function schedule in a service', () => {
    expect(() =>
      collectStaticSchedules(
        [
          {
            name: 'nightly',
            schedule: '0 3 * * *',
            function: 'index',
            service: 'worker',
          },
        ],
        registry
      )
    ).toThrow(
      expect.objectContaining({
        code: 'DEV_SCHEDULE_SERVICE_FUNCTION_UNSUPPORTED',
      })
    );
  });
});
