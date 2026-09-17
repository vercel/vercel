const { planTests, selectTasks, batchTests } = require('./plan-tests');

function task(packageName, directory, name, command = 'vitest run') {
  return {
    taskId: `${packageName}#${name}`,
    package: packageName,
    directory,
    task: name,
    command,
  };
}

const cliUnit = task('vercel', 'packages/cli', 'test-unit');
const cliE2E = task(
  'vercel',
  'packages/cli',
  'test-e2e-artifacts',
  'node scripts/test.mjs --run test/e2e-curl-deploy.test.ts'
);
const nativeUnit = task(
  'vercel_runtime',
  'crates/vercel_runtime',
  'test',
  'cargo test'
);

describe('test planning', () => {
  it('selects executable entrypoints without dependency builds or unrelated test scripts', () => {
    expect(
      selectTasks(
        {
          tasks: [
            cliUnit,
            nativeUnit,
            task('vercel', 'packages/cli', 'test'),
            task('vercel', 'packages/cli', 'build'),
            task(
              '@vercel/missing',
              'packages/missing',
              'test-unit',
              '<NONEXISTENT>'
            ),
          ],
        },
        ['test-unit', 'vercel_runtime#test']
      )
    ).toEqual([
      {
        package: 'vercel',
        directory: 'packages/cli',
        task: 'test-unit',
        command: 'vitest run',
      },
      {
        package: 'vercel_runtime',
        directory: 'crates/vercel_runtime',
        task: 'test',
        command: 'cargo test',
      },
    ]);
  });

  it('fails closed for malformed plans and executable tasks', () => {
    expect(() => selectTasks({}, ['test-unit'])).toThrow('task plan');
    expect(() =>
      selectTasks({ tasks: [{ ...cliUnit, directory: undefined }] }, [
        'test-unit',
      ])
    ).toThrow('Invalid executable task');
    expect(() =>
      selectTasks({ tasks: [{ ...cliUnit, command: null }] }, ['test-unit'])
    ).toThrow('Invalid executable task');
  });

  it('passes affected tasks to the existing chunker and preserves CLI runner coverage', async () => {
    const calls = [];
    const plan = await planTests({
      base: 'base',
      head: 'head',
      changedFiles: [],
      run: args => {
        calls.push(args);
        return {
          tasks: args.includes('--affected')
            ? [cliUnit, cliE2E]
            : [cliUnit, cliE2E, nativeUnit],
        };
      },
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]).not.toContain('--affected');
    expect(calls[1]).toContain('--affected');
    expect(plan.packages).toBe('vercel');
    expect(plan.total).toBe(2);
    expect(plan.strategy).toBe('affected-only');
    expect(
      plan.unitBatches.flatMap(batch => batch.tests).length
    ).toBeGreaterThan(0);
    expect(
      new Set(
        plan.unitBatches
          .flatMap(batch => batch.tests)
          .map(cell => `${cell.runner}/${cell.nodeVersion}`)
      )
    ).toEqual(
      new Set([
        'ubuntu-latest/20',
        'ubuntu-latest/22',
        'ubuntu-latest/24',
        'macos-14/20',
        'macos-14/22',
        'macos-14/24',
        'windows-latest/22',
        'windows-latest/24',
      ])
    );
    expect(
      plan.unitBatches
        .flatMap(batch => batch.tests)
        .every(cell => cell.scriptName === 'test-unit')
    ).toBe(true);
    expect(
      plan.e2eTests.every(cell => cell.scriptName === 'test-e2e-artifacts')
    ).toBe(true);
    expect(plan.e2eTests.flatMap(cell => cell.testPaths)).toContain(
      'test/e2e-curl-deploy.test.ts'
    );
  });

  it.each([
    '.github/workflows/test.yml',
    'utils/plan-tests.js',
    'pnpm-lock.yaml',
    'packages/build-utils/src/index.ts',
  ])('preserves full E2E coverage for infrastructure change %s', async file => {
    const plan = await planTests({
      base: 'base',
      head: 'head',
      changedFiles: [file],
      run: args => ({
        tasks: args.includes('--affected') ? [] : [cliUnit, cliE2E],
      }),
    });
    expect(plan.unitBatches).toEqual([]);
    expect(plan.e2eTests.length).toBeGreaterThan(0);
    expect(plan.strategy).toBe('all-e2e');
  });

  it('runs a native whole task without file filters in a full plan', async () => {
    const plan = await planTests({ run: () => ({ tasks: [nativeUnit] }) });
    expect(plan.strategy).toBe('test-all');
    expect(plan.unitBatches.flatMap(batch => batch.tests)).toMatchObject([
      { packageName: 'vercel_runtime', testScript: 'test', testPaths: [] },
    ]);
  });

  it('allows zero affected tasks only when the full workspace has executable tests', async () => {
    const plan = await planTests({
      base: 'base',
      head: 'head',
      changedFiles: [],
      run: args => ({ tasks: args.includes('--affected') ? [] : [cliUnit] }),
    });
    expect(plan.unitBatches.flatMap(batch => batch.tests)).toEqual([]);
    expect(plan.e2eTests).toEqual([]);
    expect(plan.strategy).toBe('no-tests');
    await expect(planTests({ run: () => ({ tasks: [] }) })).rejects.toThrow(
      'No executable tests'
    );
  });

  it('propagates Turbo failures and rejects incomplete comparison context', async () => {
    await expect(
      planTests({
        run: () => {
          throw new Error('cargo unavailable');
        },
      })
    ).rejects.toThrow('cargo unavailable');
    await expect(planTests({ base: 'base' })).rejects.toThrow(
      'both TURBO_SCM_BASE and TURBO_SCM_HEAD'
    );
  });
});

describe('unit test batches', () => {
  it.each([
    0, 1, 256, 257, 384, 512, 513,
  ])('preserves all %i cells within GitHub limits', count => {
    const tests = Array.from({ length: count }, (_, index) => ({
      label: `test-${index}`,
    }));
    const batches = batchTests(tests);
    expect(batches.every(batch => batch.tests.length <= 256)).toBe(true);
    expect(batches.flatMap(batch => batch.tests)).toEqual(tests);
    expect(batches).toHaveLength(Math.ceil(count / 256));
  });
});
