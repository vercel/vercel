const { getChunkedTests } = require('./chunk-tests');
const {
  createTestPlan,
  needsFullSuite,
  selectTestTasks,
} = require('./plan-tests');

const cliUnit = {
  package: 'vercel',
  directory: 'packages/cli',
  task: 'test-unit',
  command: 'node scripts/test.mjs --run test/unit/',
};
const cliGeneric = {
  ...cliUnit,
  task: 'test',
  command: 'node scripts/test.mjs --run',
};
const cliE2E = {
  ...cliUnit,
  task: 'test-e2e-artifacts',
  command: 'node scripts/test.mjs --run test/e2e-curl-deploy.test.ts',
};
const root = {
  package: '//',
  directory: '',
  task: 'test',
  command: 'node -e process.exit(0)',
};
const native = {
  package: 'vercel_runtime',
  directory: 'crates/vercel_runtime',
  task: 'test',
  command: 'cargo test',
};

describe('test planning', () => {
  it('does not run generic tests when dedicated lanes exist but are unaffected', () => {
    expect(
      selectTestTasks({ tasks: [cliGeneric, root] }, [
        cliGeneric,
        cliUnit,
        cliE2E,
        root,
      ])
    ).toEqual([root]);
  });

  it('keeps root and native tasks and no-op E2E aggregates', async () => {
    const aggregate = {
      package: '@vercel/build-utils',
      directory: 'packages/build-utils',
      task: 'test-e2e-artifacts',
      command: 'node -e process.exit(0)',
    };
    const plan = await createTestPlan({ tasks: [root, native, aggregate] });
    expect(plan.unitTests.map(cell => cell.packageName)).toEqual([
      '//',
      'vercel_runtime',
    ]);
    expect(plan.unitTests[1]).toMatchObject({
      testScript: 'test',
      testPaths: [],
    });
    expect(plan.e2eTests).toHaveLength(1);
    expect(plan.e2eTests[0]).toMatchObject({
      packageName: '@vercel/build-utils',
      testScript: 'test-e2e-artifacts',
      testPaths: [],
    });
  });

  it('preserves Go unit files in its generic task alongside dedicated E2E tasks', async () => {
    const go = {
      package: '@vercel/go',
      directory: 'packages/go',
      task: 'test',
      command: 'vitest run --config ../../vitest.config.mts',
    };
    const plan = await createTestPlan({
      tasks: [
        go,
        { ...go, task: 'test-e2e', command: 'vitest run test/integration-' },
      ],
    });
    expect(plan.unitTests).toEqual([]);
    expect(plan.unitTestsNode24).toEqual([]);
    expect(
      plan.e2eTests.find(cell => cell.scriptName === 'test').testPaths
    ).toEqual(
      expect.arrayContaining([
        'test/go-helpers.test.ts',
        'test/diagnostics.test.ts',
        'test/pre-deploy-command.test.ts',
        'test/standalone-server.test.ts',
        'test/detect-entrypoint.test.ts',
      ])
    );
  });

  it('preserves every OS, Node version, and chunk when splitting unit matrices', async () => {
    const tasks = [cliUnit, cliE2E, root, native];
    const chunks = await getChunkedTests(tasks);
    const plan = await createTestPlan({ tasks });
    const cells = [
      ...plan.unitTests,
      ...plan.unitTestsNode24,
      ...plan.e2eTests,
    ];
    expect(cells).toHaveLength(chunks.length);
    expect(cells).toEqual(expect.arrayContaining(chunks));
    expect(plan.unitTests.every(cell => cell.nodeVersion !== '24')).toBe(true);
    expect(plan.unitTestsNode24.every(cell => cell.nodeVersion === '24')).toBe(
      true
    );
    expect(plan.unitTestsNode24.length).toBeGreaterThan(0);
    expect(plan.e2eTests.every(cell => cell.scriptName === cliE2E.task)).toBe(
      true
    );
  });

  it('runs the original E2E task when no individual test paths can be inferred', async () => {
    const plan = await createTestPlan({
      tasks: [{ ...cliE2E, command: 'node custom-runner.js' }],
    });
    expect(plan.e2eTests).toHaveLength(1);
    expect(plan.e2eTests[0]).toMatchObject({
      testScript: 'test-e2e-artifacts',
      testPaths: [],
    });
  });

  it('allows a valid empty affected graph and excludes nonexistent tasks', async () => {
    const all = { tasks: [cliUnit, { ...cliE2E, command: '<NONEXISTENT>' }] };
    const plan = await createTestPlan(all, { tasks: [] });
    expect(plan).toMatchObject({
      unitTests: [],
      unitTestsNode24: [],
      e2eTests: [],
      count: 0,
      total: 1,
    });
  });

  it('fails instead of reporting success for missing or empty full graphs', async () => {
    await expect(createTestPlan({})).rejects.toThrow('did not return tasks');
    await expect(createTestPlan({ tasks: [] })).rejects.toThrow(
      'any executable test tasks'
    );
  });

  it('fails before emitting a matrix that GitHub cannot schedule', async () => {
    const tasks = Array.from({ length: 257 }, (_, index) => ({
      ...native,
      package: `native-${index}`,
    }));
    await expect(createTestPlan({ tasks })).rejects.toThrow(
      '256-job matrix limit'
    );
  });
});

describe('global test coverage', () => {
  it.each([
    '.github/workflows/test.yml',
    'turbo.json',
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'utils/chunk-tests.js',
    'test/lib/client.ts',
    'packages/cli/scripts/start.js',
    'packages/build-utils/src/index.ts',
  ])('runs the full suite after changing %s', file => {
    expect(needsFullSuite([file])).toBe(true);
  });

  it('uses affected tasks for package changes and documentation', () => {
    expect(needsFullSuite(['packages/cli/src/index.ts', 'README.md'])).toBe(
      false
    );
  });
});
