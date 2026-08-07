const { getScriptTestPatterns, intoChunks } = require('./chunk-tests');

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
        'test-unit': 'node scripts/vitest-run.mjs --run test/unit/',
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
});
