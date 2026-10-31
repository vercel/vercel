import assert from 'assert';
import { describe, expect, test } from 'vitest';
import {
  type ScheduleEntrypointUse,
  assertNoScheduleEntrypointSourceConflict,
  planScheduleEntrypoints,
  planScheduleFunctions,
  resolveScheduleEntrypointTargets,
  validateScheduleEntrypointRuntimes,
  resolveScheduleEntrypoint,
} from '../src/schedule-entrypoint';

describe('resolveScheduleEntrypoint', () => {
  test('reports an unparseable entrypoint', () => {
    expect(resolveScheduleEntrypoint('jobs/nightly', [])).toMatchObject({
      ok: false,
      code: 'INVALID_SCHEDULE_ENTRYPOINT',
    });
  });

  test('reports a Node.js entrypoint as unsupported until its runtime lands', () => {
    expect(
      resolveScheduleEntrypoint('jobs/nightly.ts', ['jobs/nightly.ts'])
    ).toMatchObject({
      ok: false,
      code: 'UNSUPPORTED_SCHEDULE_ENTRYPOINT_RUNTIME',
    });
  });

  test('resolves a Python script to a shared function keyed by its config', () => {
    expect(
      resolveScheduleEntrypoint('jobs/nightly.py', ['jobs/nightly.py'])
    ).toEqual({
      ok: true,
      resolved: {
        entrypoint: 'jobs/nightly.py',
        use: '@vercel/python',
        sourceFiles: ['jobs/nightly.py'],
        packing: { mode: 'shared', configKey: '{}' },
      },
    });
  });

  test('keys a Python script by its matching functions config', () => {
    const files = ['jobs/a.py', 'jobs/b.py', 'jobs/c.py', 'jobs/d.py'];
    const functions = {
      'jobs/a.py': { maxDuration: 60, memory: 1024 },
      'jobs/b.py': { memory: 1024, maxDuration: 60 },
      'jobs/c.py': {
        experimentalTriggers: [{ type: 'schedule/v1beta' as const }],
      },
      'jobs/d': { memory: 2048 },
    };
    const packing = (entrypoint: string) => {
      const resolution = resolveScheduleEntrypoint(
        entrypoint,
        files,
        null,
        functions
      );
      assert(resolution.ok);
      return resolution.resolved.packing;
    };

    // Key order does not matter.
    expect(packing('jobs/a.py')).toEqual({
      mode: 'shared',
      configKey: '{"maxDuration":60,"memory":1024}',
      pattern: 'jobs/a.py',
    });
    expect(packing('jobs/b.py')).toEqual({
      mode: 'shared',
      configKey: '{"maxDuration":60,"memory":1024}',
      pattern: 'jobs/b.py',
    });
    // The schedule trigger is forced, so it never separates entrypoints,
    // and an entry without other config is the same as no entry.
    expect(packing('jobs/c.py')).toEqual({ mode: 'shared', configKey: '{}' });
    // Keys match the full path, so a key without `.py` does not apply.
    expect(packing('jobs/d.py')).toEqual({ mode: 'shared', configKey: '{}' });
  });

  test.each([
    ['a queue trigger', [{ type: 'queue/v2beta' as const, topic: 'orders' }]],
    [
      'a schedule trigger next to a queue trigger',
      [
        { type: 'schedule/v1beta' as const },
        { type: 'queue/v2beta' as const, topic: 'orders' },
      ],
    ],
    ['no triggers', []],
  ])('rejects a Python script whose functions config has %s', (_, experimentalTriggers) => {
    expect(
      resolveScheduleEntrypoint('jobs/b.py', ['jobs/b.py'], null, {
        'jobs/*.py': { experimentalTriggers },
      })
    ).toEqual({
      ok: false,
      code: 'SCHEDULE_ENTRYPOINT_TRIGGER_CONFLICT',
      message:
        'entrypoint "jobs/b.py" matches "functions" pattern "jobs/*.py", ' +
        'whose "experimentalTriggers" conflict with the schedule trigger. ' +
        'Remove "experimentalTriggers" or set it to ' +
        '[{ "type": "schedule/v1beta" }].',
    });
  });

  test('rejects conflicting triggers whatever the schedule order', () => {
    // `b.py` would share a function with `a.py`, whose config the builder
    // reads when `a.py` comes first, so this must not depend on the order.
    const files = ['a.py', 'b.py'];
    const functions = {
      'b.py': {
        experimentalTriggers: [
          { type: 'queue/v2beta' as const, topic: 'orders' },
        ],
      },
    };
    const firstError = (entrypoints: string[]) =>
      entrypoints
        .map(e => resolveScheduleEntrypoint(e, files, null, functions))
        .find(resolution => !resolution.ok);

    for (const order of [
      ['a.py', 'b.py'],
      ['b.py', 'a.py'],
    ]) {
      expect(firstError(order)).toMatchObject({
        code: 'SCHEDULE_ENTRYPOINT_TRIGGER_CONFLICT',
        message: expect.stringContaining('entrypoint "b.py"'),
      });
    }
  });

  test('reports a missing Python script', () => {
    expect(resolveScheduleEntrypoint('jobs/nightly.py', [])).toEqual({
      ok: false,
      code: 'SCHEDULE_ENTRYPOINT_NOT_FOUND',
      message:
        'entrypoint "jobs/nightly.py" resolves to missing file "jobs/nightly.py".',
    });
  });

  test.each([
    ['nextjs', 'jobs/nightly.py', 'python', 'node'],
    ['express', 'jobs/nightly.py', 'python', 'node'],
    ['fastapi', 'jobs/nightly.ts', 'node', 'python'],
  ])('rejects a cross-runtime entrypoint with framework %s', (framework, entrypoint, entrypointRuntime, frameworkRuntime) => {
    expect(resolveScheduleEntrypoint(entrypoint, [], framework)).toEqual({
      ok: false,
      code: 'SCHEDULE_ENTRYPOINT_RUNTIME_MISMATCH',
      message:
        `entrypoint "${entrypoint}" uses the ${entrypointRuntime} runtime, but ` +
        `framework "${framework}" uses the ${frameworkRuntime} runtime. ` +
        'Schedule entrypoints must use the same runtime as the framework.',
    });
  });

  test.each([
    'vite',
    'astro',
    null,
    undefined,
  ])('does not restrict the runtime for framework %s', framework => {
    // Runtime-agnostic frameworks fall through to the runtime switch.
    expect(
      resolveScheduleEntrypoint('jobs/nightly.py', [], framework)
    ).toMatchObject({ code: 'SCHEDULE_ENTRYPOINT_NOT_FOUND' });
    expect(
      resolveScheduleEntrypoint('jobs/nightly.ts', [], framework)
    ).toMatchObject({ code: 'UNSUPPORTED_SCHEDULE_ENTRYPOINT_RUNTIME' });
  });
});

describe('planScheduleFunctions', () => {
  const pythonUse = (
    entrypoint: string,
    scheduleNames: string[],
    functions?: Parameters<typeof resolveScheduleEntrypoint>[3]
  ): ScheduleEntrypointUse => {
    const resolution = resolveScheduleEntrypoint(
      entrypoint,
      [entrypoint],
      null,
      functions
    );
    assert(resolution.ok);
    return { resolved: resolution.resolved, scheduleNames };
  };
  const plan = (uses: ScheduleEntrypointUse[]) => {
    const result = planScheduleFunctions(uses);
    assert(result.ok);
    return result.functions.map(({ use, config }) => ({
      use,
      outputPath: config.outputPath,
      entrypoints: config.entrypoints.map(e => [e.entrypoint, e.scheduleNames]),
    }));
  };

  test('packs Python entrypoints without functions config into one function', () => {
    expect(
      plan([
        pythonUse('jobs/a.py', ['a']),
        pythonUse('jobs/b.py', ['b', 'b-again']),
      ])
    ).toEqual([
      {
        use: '@vercel/python',
        outputPath: '_vercel/schedules/default',
        entrypoints: [
          ['jobs/a.py', ['a']],
          ['jobs/b.py', ['b', 'b-again']],
        ],
      },
    ]);
  });

  test('splits Python entrypoints only where their functions config differs', () => {
    const functions = {
      'jobs/big.py': { memory: 3009 },
      'jobs/also-big.py': { memory: 3009 },
      'jobs/empty.py': {},
    };
    const functionsPlan = plan([
      pythonUse('jobs/a.py', ['a'], functions),
      pythonUse('jobs/big.py', ['big'], functions),
      pythonUse('jobs/empty.py', ['empty'], functions),
      pythonUse('jobs/also-big.py', ['also-big'], functions),
    ]);

    expect(functionsPlan).toEqual([
      {
        use: '@vercel/python',
        outputPath: '_vercel/schedules/default',
        entrypoints: [
          ['jobs/a.py', ['a']],
          ['jobs/empty.py', ['empty']],
        ],
      },
      {
        use: '@vercel/python',
        outputPath: '_vercel/schedules/jobs/big+also-big',
        entrypoints: [
          ['jobs/big.py', ['big']],
          ['jobs/also-big.py', ['also-big']],
        ],
      },
    ]);
  });

  test.each([
    ['one pattern', ['jobs/report.py'], '_vercel/schedules/jobs/report'],
    ['a glob', ['jobs/heavy/*.py'], '_vercel/schedules/jobs/heavy/_'],
    [
      'several patterns in one directory',
      ['jobs/report.py', 'jobs/cleanup.py'],
      '_vercel/schedules/jobs/report+cleanup',
    ],
    [
      'several patterns without a shared directory',
      ['reports/daily.py', 'exports/daily.py'],
      '_vercel/schedules/reports_daily+exports_daily',
    ],
    [
      'more than three patterns',
      ['jobs/a.py', 'jobs/b.py', 'jobs/c.py', 'jobs/d.py', 'jobs/e.py'],
      '_vercel/schedules/jobs/a+b+c+2-more',
    ],
  ])('names a shared function after %s', (_, patterns, outputPath) => {
    const functions = Object.fromEntries(
      patterns.map(pattern => [pattern, { memory: 3009 }])
    );
    const entrypoints = patterns.map(pattern => pattern.replace('*', 'job'));
    expect(
      plan(entrypoints.map(e => pythonUse(e, [e], functions))).map(
        f => f.outputPath
      )
    ).toEqual([outputPath]);
  });

  test('cuts a long shared function name and keeps it unique', () => {
    const long = (n: number) =>
      `jobs/${'quarterly_regional_revenue_report_'.repeat(2)}${n}.py`;
    const functions = {
      [long(1)]: { memory: 3009 },
      [long(2)]: { memory: 2048 },
    };
    const [first, second] = plan([
      pythonUse(long(1), ['one'], functions),
      pythonUse(long(2), ['two'], functions),
    ]).map(f => f.outputPath.split('/').pop() ?? '');

    expect(first).toHaveLength(64);
    expect(first).toMatch(/^quarterly_regional_revenue_report_.+-[0-9a-f]{6}$/);
    expect(second).toHaveLength(64);
    expect(second).not.toBe(first);
  });

  test.each([
    // `jobs/ab.py` matches `jobs/a?.py` first; `jobs/abc.py` only `jobs/a*.py`.
    [
      'sanitize to the same name',
      ['jobs/a?.py', 'jobs/a*.py'],
      ['jobs/ab.py', 'jobs/abc.py'],
    ],
    [
      'differ only in case',
      ['jobs/Report.py', 'jobs/report.py'],
      ['jobs/Report.py', 'jobs/report.py'],
    ],
  ])('rejects different configs whose patterns %s', (_, [
    a,
    b,
  ], entrypoints) => {
    const functions = { [a]: { memory: 3009 }, [b]: { memory: 2048 } };
    expect(
      planScheduleFunctions(entrypoints.map(e => pythonUse(e, [e], functions)))
    ).toMatchObject({
      ok: false,
      code: 'SCHEDULE_FUNCTION_NAME_COLLISION',
    });
  });

  test('rejects a schedule name served by two entrypoints in one function', () => {
    expect(
      planScheduleFunctions([
        pythonUse('jobs/a.py', ['nightly']),
        pythonUse('jobs/b.py', ['nightly']),
      ])
    ).toEqual({
      ok: false,
      code: 'SCHEDULE_NAME_COLLISION',
      message:
        'Schedule name "nightly" is used by entrypoints "jobs/a.py" and ' +
        '"jobs/b.py", which build into the same function ' +
        '"_vercel/schedules/default". Schedule names must be unique.',
    });
  });

  test('keeps dedicated entrypoints in their own functions', () => {
    const dedicated = (
      entrypoint: string,
      outputPath: string
    ): ScheduleEntrypointUse => ({
      resolved: {
        entrypoint,
        use: '@vercel/backends',
        sourceFiles: [entrypoint],
        packing: { mode: 'dedicated', outputPath },
      },
      scheduleNames: [entrypoint],
    });

    expect(
      plan([
        dedicated('jobs/a.ts', '_vercel/schedules/jobs/a'),
        dedicated('jobs/b.ts', '_vercel/schedules/jobs/b'),
      ]).map(f => f.outputPath)
    ).toEqual(['_vercel/schedules/jobs/a', '_vercel/schedules/jobs/b']);
    expect(
      planScheduleFunctions([
        dedicated('jobs/a.ts', '_vercel/schedules/jobs/a'),
        dedicated('jobs/a.js', '_vercel/schedules/jobs/a'),
      ])
    ).toMatchObject({
      ok: false,
      code: 'SCHEDULE_ENTRYPOINT_OUTPUT_COLLISION',
    });
  });
});

describe('validateScheduleEntrypointRuntimes', () => {
  test('rejects mixed runtimes with the schedule and entrypoint names', () => {
    expect(
      validateScheduleEntrypointRuntimes([
        { name: 'nightly', entrypoint: 'jobs/nightly.py' },
        { name: 'hourly', entrypoint: 'jobs/hourly.ts' },
      ])
    ).toEqual({
      ok: false,
      code: 'MIXED_SCHEDULE_ENTRYPOINT_RUNTIMES',
      message:
        'Schedule "nightly" entrypoint "jobs/nightly.py" uses the python runtime, ' +
        'but schedule "hourly" entrypoint "jobs/hourly.ts" uses the node runtime. ' +
        'Schedule entrypoints must all use the same runtime.',
    });
  });

  test('allows one runtime across multiple entrypoints', () => {
    expect(
      validateScheduleEntrypointRuntimes([
        { name: 'nightly', entrypoint: 'jobs/nightly.ts' },
        { name: 'hourly', entrypoint: 'jobs/hourly.js' },
      ])
    ).toEqual({ ok: true });
  });

  test('leaves invalid and single entrypoints to the resolver', () => {
    expect(
      validateScheduleEntrypointRuntimes([
        { name: 'invalid', entrypoint: 'jobs/nightly' },
        { name: 'nightly', entrypoint: 'jobs/nightly.py' },
      ])
    ).toEqual({ ok: true });
    expect(
      validateScheduleEntrypointRuntimes([
        { name: 'nightly', entrypoint: 'jobs/nightly.ts' },
      ])
    ).toEqual({ ok: true });
  });
});

describe('planScheduleEntrypoints', () => {
  const schedule = '0 * * * *';
  const schedules = [
    { name: 'hourly', schedule, entrypoint: 'jobs/tick.py' },
    { name: 'daily', schedule, entrypoint: 'jobs/tick.py' },
    { name: 'report', schedule, entrypoint: 'jobs/report.py' },
    { name: 'queued', schedule, topic: 'jobs' },
  ];
  const functions = { 'jobs/report.py': { maxDuration: 60 } };
  const files = ['jobs/tick.py', 'jobs/report.py'];

  test('plans one build per function and maps targets to it', () => {
    const plan = planScheduleEntrypoints({ schedules, files, functions });
    expect(plan.builds).toEqual([
      {
        src: 'jobs/tick.py',
        use: '@vercel/python',
        config: {
          zeroConfig: true,
          functions,
          scheduleFunction: {
            outputPath: '_vercel/schedules/default',
            entrypoints: [
              {
                entrypoint: 'jobs/tick.py',
                sourceFile: 'jobs/tick.py',
                scheduleNames: ['hourly', 'daily'],
              },
            ],
          },
        },
      },
      {
        src: 'jobs/report.py',
        use: '@vercel/python',
        config: {
          zeroConfig: true,
          functions,
          scheduleFunction: {
            outputPath: '_vercel/schedules/jobs/report',
            entrypoints: [
              {
                entrypoint: 'jobs/report.py',
                sourceFile: 'jobs/report.py',
                scheduleNames: ['report'],
              },
            ],
          },
        },
      },
    ]);
    expect(plan.reservedFunctionFiles).toEqual(files);
    expect(resolveScheduleEntrypointTargets(schedules, plan)).toEqual([
      { name: 'hourly', schedule, function: '_vercel/schedules/default' },
      { name: 'daily', schedule, function: '_vercel/schedules/default' },
      { name: 'report', schedule, function: '_vercel/schedules/jobs/report' },
      { name: 'queued', schedule, topic: 'jobs' },
    ]);
  });

  test('names the schedule in resolution errors', () => {
    expect(() =>
      planScheduleEntrypoints({ schedules, files: ['jobs/tick.py'] })
    ).toThrow(
      expect.objectContaining({
        code: 'SCHEDULE_ENTRYPOINT_NOT_FOUND',
        message: expect.stringMatching(/^Schedule "report" entrypoint/),
      })
    );
  });

  test('rejects another build that claims an entrypoint source file', () => {
    const plan = planScheduleEntrypoints({ schedules, files });
    expect(() =>
      assertNoScheduleEntrypointSourceConflict(
        [{ src: './jobs/tick.py', use: '@vercel/python' }],
        plan
      )
    ).toThrow(
      expect.objectContaining({ code: 'SCHEDULE_ENTRYPOINT_SOURCE_CONFLICT' })
    );
  });
});
