const {
  getChunkedTests,
  getScriptTestPatterns,
  intoChunks,
  sortBySchedulePriority,
} = require('./chunk-tests');

describe('it should create chunks correctly', () => {
  it('should split chunks correctly less chunks than items', () => {
    const files = ['/first', '/second', '/third'];
    expect(intoChunks(1, 2, files)).toEqual([
      ['/first', '/second'],
      ['/third'],
    ]);
  });

  it('should split chunks correctly more chunks than items', () => {
    const files = ['/first', '/second', '/third'];
    expect(intoChunks(1, 5, files)).toEqual([
      ['/first'],
      ['/second'],
      ['/third'],
    ]);
  });

  it('should split chunks correctly equal chunks with items', () => {
    const files = ['/first', '/second', '/third'];
    expect(intoChunks(1, 3, files)).toEqual([
      ['/first'],
      ['/second'],
      ['/third'],
    ]);
  });
});

describe('getScriptTestPatterns', () => {
  it('reads filters from the CLI test wrapper', () => {
    const packageJson = {
      scripts: {
        'test-unit': 'node scripts/test.mjs --run test/unit/',
      },
    };

    expect(getScriptTestPatterns(packageJson, 'test-unit')).toEqual([
      'test/unit/',
    ]);
  });

  it('reads filters from direct vitest commands', () => {
    const packageJson = {
      scripts: {
        'test-unit': 'vitest run --config ../../vitest.config.mts test/unit/',
      },
    };

    expect(getScriptTestPatterns(packageJson, 'test-unit')).toEqual([
      'test/unit/',
    ]);
  });

  it('keeps exact E2E files and ignores excluded files', () => {
    const packageJson = {
      scripts: {
        'test-e2e':
          'vitest run --config ../../vitest.config.mts test/test.js --exclude test/excluded.test.js',
      },
    };

    expect(getScriptTestPatterns(packageJson, 'test-e2e')).toEqual([
      'test/test.js',
    ]);
  });

  it('uses default patterns for an unfiltered vitest command', () => {
    const packageJson = {
      scripts: {
        'test-unit': 'vitest run --config ../../vitest.config.mts',
      },
    };

    expect(getScriptTestPatterns(packageJson, 'test-unit')).toContain(
      'test/**/*.test.ts'
    );
  });

  it('reads filters from a Turbo task command', () => {
    expect(
      getScriptTestPatterns(
        { scripts: {} },
        'test-e2e-artifacts',
        'vitest run test/artifact.test.ts'
      )
    ).toEqual(['test/artifact.test.ts']);
  });

  it('resolves a package script referenced by a Turbo task command', () => {
    expect(
      getScriptTestPatterns(
        {
          scripts: {
            'test-e2e': 'vitest run test/integration/',
          },
        },
        'test-e2e-artifacts',
        'pnpm run test-e2e'
      )
    ).toEqual(['test/integration/']);
  });
});

describe('getChunkedTests', () => {
  it('invokes the build-utils E2E aggregate task in one runner cell', async () => {
    process.env.TURBO_TASKS = JSON.stringify([
      {
        package: '@vercel/build-utils',
        directory: 'packages/build-utils',
        task: 'test-e2e-artifacts',
        command: 'node -e process.exit(0)',
      },
    ]);

    try {
      const chunks = await getChunkedTests();

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toMatchObject({
        packageName: '@vercel/build-utils',
        testScript: 'test-e2e-artifacts',
        testPaths: [],
      });
    } finally {
      delete process.env.TURBO_TASKS;
    }
  });
});

describe('sortBySchedulePriority', () => {
  const cells = [
    {
      packageName: '@vercel/node',
      scriptName: 'test-unit',
      runner: 'ubuntu-latest',
      label: 'node',
    },
    {
      packageName: 'vercel',
      scriptName: 'test-e2e',
      runner: 'ubuntu-latest',
      label: 'cli-e2e',
    },
    {
      packageName: 'vercel',
      scriptName: 'test-unit',
      runner: 'ubuntu-latest',
      label: 'cli-linux',
    },
    {
      packageName: '@vercel/next',
      scriptName: 'test-unit',
      runner: 'windows-latest',
      label: 'next-windows',
    },
    {
      packageName: 'vercel',
      scriptName: 'test-unit',
      runner: 'windows-latest',
      label: 'cli-windows',
    },
  ];

  it('uses coarse task and runner priorities while preserving stable ties', () => {
    expect(sortBySchedulePriority(cells).map(cell => cell.label)).toEqual([
      'cli-windows',
      'cli-linux',
      'next-windows',
      'node',
      'cli-e2e',
    ]);
  });
});
