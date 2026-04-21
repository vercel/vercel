import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type MockInstance,
} from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { tmpdir } from 'os';

const tmpPythonDir = path.join(
  tmpdir(),
  `vc-test-python-${Math.floor(Math.random() * 1e6)}`
);

// For tests that exercise the build pipeline, we don't care about the actual
// vendored dependencies, only that the build completes and the handler exists.
// Mock out mirroring of site-packages so tests don't depend on a real venv.
vi.mock('../src/utils', async () => {
  const real =
    await vi.importActual<typeof import('../src/utils')>('../src/utils');
  return {
    ...real,
    ensureVenv: vi.fn(async () => {}),
  };
});

vi.mock('../src/install', async () => {
  const real =
    await vi.importActual<typeof import('../src/install')>('../src/install');
  return {
    ...real,
    getVenvSitePackagesDirs: vi.fn(async () => []),
  };
});

vi.mock('../src/django', () => ({
  getDjangoSettings: vi.fn(async () => null),
  runDjangoCollectStatic: vi.fn(async () => null),
}));

vi.mock('execa', () => ({
  default: vi.fn(),
}));

// Imports after mocks are set up (vitest hoists vi.mock calls)
import {
  resolvePythonVersion,
  DEFAULT_PYTHON_VERSION_STRING,
  resetInstalledPythonsCache,
  getInstalledPythonsFromFilesystem,
} from '../src/version';
import type { PythonConstraint, PythonPackage } from '@vercel/python-analysis';
import { build, prepareCache } from '../src/index';
import type { BuildResultV3, BuildResultV2 } from '@vercel/build-utils';
import { createVenvEnv, getVenvBinDir } from '../src/utils';
import {
  UV_PYTHON_DOWNLOADS_MODE,
  getProtectedUvEnv,
  getUvCacheDir,
  findUvOnBuildImage,
} from '../src/uv';
import { VERCEL_WORKERS_VERSION } from '../src/package-versions';
import { createPyprojectToml } from '../src/install';
import { getDjangoSettings, runDjangoCollectStatic } from '../src/django';
import { FileBlob, download } from '@vercel/build-utils';
import { getServiceCrons } from '../src/crons';
import execa from 'execa';

function getBuildOutputV2(result: Awaited<ReturnType<typeof build>>) {
  expect(result.resultVersion).toBe(2);
  return (result as any).result as BuildResultV2;
}

function getBuildOutputV2Lambda(result: Awaited<ReturnType<typeof build>>) {
  const v2 = getBuildOutputV2(result) as any;
  const lambdas = Object.values(v2.output).filter((o: any) => 'handler' in o);
  expect(lambdas).toHaveLength(1);
  return lambdas[0] as BuildResultV3['output'];
}

function getBuildOutputV3(result: Awaited<ReturnType<typeof build>>) {
  expect(result.resultVersion).toBe(3);
  return (result as any).result.output as BuildResultV3['output'];
}

/**
 * Build a PythonConstraint from a PEP 440 version specifier string.
 * Handles exact versions ("3.9"), specifiers (">=3.10,<3.12"), and
 * compatible releases ("~=3.10.0").
 */
function makeConstraint(version: string, source: string): PythonConstraint {
  const specs = version
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const constraint = specs.map(spec => {
    const match = spec.match(/^(<=|>=|==|!=|~=|===|<|>)?\s*(.+)$/);
    return {
      operator: match?.[1] || '==',
      version: match?.[2] || spec,
      prefix: '',
    };
  });
  return {
    request: [
      {
        implementation: 'cpython' as const,
        version: {
          constraint,
          variant: 'default' as const,
        },
      },
    ],
    source,
    prettySource: source,
  };
}

function makePackage(constraints?: PythonConstraint[]): PythonPackage {
  return { requiresPython: constraints };
}

function selectVersion(opts: {
  constraints?: PythonConstraint[];
  isDev?: boolean;
}) {
  return resolvePythonVersion({
    isDev: opts.isDev,
    pythonPackage: makePackage(opts.constraints),
    rootDir: '/tmp',
  });
}

let warningMessages: string[];
const originalConsoleWarn = console.warn;
const realDateNow = Date.now.bind(global.Date);
const origPath = process.env.PATH;

/** Tracks mock Python versions for uv python list output */
let mockInstalledVersions: string[] = [];

/** Creates a mock UvRunner class for tests */
function createMockUvRunner(options?: {
  onSync?: () => void;
  onPip?: () => void;
  onLock?: () => void;
}) {
  return class MockUvRunner {
    getPath() {
      return '/mock/uv';
    }
    async sync() {
      options?.onSync?.();
    }
    async pip() {
      options?.onPip?.();
    }
    async lock() {
      options?.onLock?.();
    }
  };
}

vi.setConfig({ testTimeout: 30 * 1000 });

beforeEach(() => {
  warningMessages = [];
  mockInstalledVersions = [];
  // Reset the installed Python versions cache before each test
  resetInstalledPythonsCache();
  console.warn = m => {
    warningMessages.push(m);
  };
  // Isolate PATH so discovery relies only on mocked binaries
  fs.mkdirSync(tmpPythonDir, { recursive: true });
  process.env.PATH = tmpPythonDir;
});

afterEach(() => {
  console.warn = originalConsoleWarn;
  global.Date.now = realDateNow;
  process.env.PATH = origPath;
  if (fs.existsSync(tmpPythonDir)) {
    fs.removeSync(tmpPythonDir);
  }
});

describe('prepareCache()', () => {
  const origPrepareCacheEnv = process.env.VERCEL_PYTHON_PREPARE_CACHE;

  afterEach(() => {
    if (origPrepareCacheEnv === undefined) {
      delete process.env.VERCEL_PYTHON_PREPARE_CACHE;
    } else {
      process.env.VERCEL_PYTHON_PREPARE_CACHE = origPrepareCacheEnv;
    }
  });

  it('returns empty object when VERCEL_PYTHON_PREPARE_CACHE is not set', async () => {
    delete process.env.VERCEL_PYTHON_PREPARE_CACHE;
    const workPath = path.join(
      tmpdir(),
      `vc-python-cache-${Math.floor(Math.random() * 1e6)}`
    );

    await fs.outputFile(
      path.join(workPath, '.vercel/python/cache/uv/wheels/example.whl'),
      ''
    );

    try {
      const files = await prepareCache({
        files: {},
        entrypoint: 'app.py',
        config: {},
        workPath,
        repoRootPath: workPath,
      });

      expect(Object.keys(files)).toHaveLength(0);
    } finally {
      await fs.remove(workPath);
    }
  });

  it('caches uv cache and the venv, excludes bytecode and user source when enabled', async () => {
    process.env.VERCEL_PYTHON_PREPARE_CACHE = '1';
    const workPath = path.join(
      tmpdir(),
      `vc-python-cache-${Math.floor(Math.random() * 1e6)}`
    );

    // Create a fake uv cache with some files
    await fs.outputFile(
      path.join(workPath, '.vercel/python/cache/uv/wheels/example.whl'),
      ''
    );
    await fs.outputFile(
      path.join(workPath, '.vercel/python/cache/uv/archive/foo.tar.gz'),
      ''
    );
    // Create a .pyc file that should be excluded
    await fs.outputFile(
      path.join(workPath, '.vercel/python/cache/uv/archive/foo.pyc'),
      ''
    );
    // Create venv files that should be included
    await fs.outputFile(
      path.join(workPath, '.vercel/python/.venv/pyvenv.cfg'),
      'home = /usr/bin\n'
    );
    await fs.outputFile(
      path.join(workPath, '.vercel/python/.venv/lib/site-packages/pkg/mod.py'),
      ''
    );
    // Create a user source file that should NOT be included
    await fs.outputFile(path.join(workPath, 'app.py'), 'print("hello")\n');

    try {
      const files = await prepareCache({
        files: {},
        entrypoint: 'app.py',
        config: {},
        workPath,
        repoRootPath: workPath,
      });

      // uv cache files should be present (minus .pyc)
      expect(files['.vercel/python/cache/uv/wheels/example.whl']).toBeDefined();
      expect(files['.vercel/python/cache/uv/archive/foo.tar.gz']).toBeDefined();

      // .pyc in uv cache should be excluded
      expect(files['.vercel/python/cache/uv/archive/foo.pyc']).toBeUndefined();

      // venv files should be cached (uv sync prunes stale packages)
      expect(files['.vercel/python/.venv/pyvenv.cfg']).toBeDefined();
      expect(
        files['.vercel/python/.venv/lib/site-packages/pkg/mod.py']
      ).toBeDefined();

      // user source files should NOT be cached
      expect(files['app.py']).toBeUndefined();
    } finally {
      await fs.remove(workPath);
    }
  });
});

it('should only match supported versions, otherwise throw an error', () => {
  makeMockPython('3.9');
  const { pythonVersion: result } = selectVersion({
    constraints: [makeConstraint('3.9', 'Pipfile.lock')],
  });
  expect(result).toHaveProperty('runtime', 'python3.9');
});

it('defers to system python3 in vercel dev, regardless of declared version', () => {
  for (const constraint of ['3.9', '3.6', '999']) {
    const { pythonVersion } = selectVersion({
      constraints: [makeConstraint(constraint, 'Pipfile.lock')],
      isDev: true,
    });
    expect(pythonVersion).toMatchObject({
      runtime: 'python3',
      pythonPath: 'python3',
      pipPath: 'pip3',
    });
    // Dev mode must leave `major` and `minor` undefined so every
    // downstream `!= null` guard (ensureVenv, ensureUvProject, cached-
    // venv invalidation) correctly skips version-sensitive logic.
    expect(pythonVersion.major).toBeUndefined();
    expect(pythonVersion.minor).toBeUndefined();
  }
  expect(warningMessages).toStrictEqual([]);
});

describe('requires-python range parsing', () => {
  it('selects latest installed within range ">=3.10,<3.12"', () => {
    makeMockPython('3.10');
    makeMockPython('3.11');
    const { pythonVersion: result } = selectVersion({
      constraints: [makeConstraint('>=3.10,<3.12', 'pyproject.toml')],
    });
    expect(result).toHaveProperty('runtime', 'python3.11');
  });

  it('selects highest allowed when upper bound inclusive (>=3.10,<=3.12)', () => {
    makeMockPython('3.11');
    makeMockPython('3.12');
    const { pythonVersion: result } = selectVersion({
      constraints: [makeConstraint('>=3.10,<=3.12', 'pyproject.toml')],
    });
    expect(result).toHaveProperty('runtime', 'python3.12');
  });

  it('respects compatible release "~=3.10.0" (>=3.10.0,<3.11.0)', () => {
    makeMockPython('3.10');
    makeMockPython('3.11');
    const { pythonVersion: result } = selectVersion({
      constraints: [makeConstraint('~=3.10.0', 'pyproject.toml')],
    });
    expect(result).toHaveProperty('runtime', 'python3.10');
  });
});

describe('Python 3.13 and 3.14 support', () => {
  it('selects Python 3.13 when specified in requires-python', () => {
    makeMockPython('3.12');
    makeMockPython('3.13');
    const { pythonVersion: result } = selectVersion({
      constraints: [makeConstraint('>=3.13', 'pyproject.toml')],
    });
    expect(result).toHaveProperty('runtime', 'python3.13');
  });

  it('selects Python 3.14 when specified in requires-python', () => {
    makeMockPython('3.13');
    makeMockPython('3.14');
    const { pythonVersion: result } = selectVersion({
      constraints: [makeConstraint('>=3.14', 'pyproject.toml')],
    });
    expect(result).toHaveProperty('runtime', 'python3.14');
  });

  it('prefers DEFAULT_PYTHON_VERSION_STRING (3.12) when range allows it', () => {
    // Even though 3.13 and 3.14 are installed and match >=3.12,
    // we prefer 3.12 to make 3.13+ opt-in only
    makeMockPython('3.12');
    makeMockPython('3.13');
    makeMockPython('3.14');
    const { pythonVersion: result } = selectVersion({
      constraints: [makeConstraint('>=3.12', 'pyproject.toml')],
    });
    expect(result).toHaveProperty('runtime', 'python3.12');
  });

  it('prefers 3.12 when upper bound excludes 3.14 but includes 3.12', () => {
    // >=3.12,<3.14 allows 3.12 and 3.13, but we prefer 3.12
    makeMockPython('3.12');
    makeMockPython('3.13');
    makeMockPython('3.14');
    const { pythonVersion: result } = selectVersion({
      constraints: [makeConstraint('>=3.12,<3.14', 'pyproject.toml')],
    });
    expect(result).toHaveProperty('runtime', 'python3.12');
  });

  it('respects compatible release "~=3.13.0" (>=3.13.0,<3.14.0)', () => {
    makeMockPython('3.13');
    makeMockPython('3.14');
    const { pythonVersion: result } = selectVersion({
      constraints: [makeConstraint('~=3.13.0', 'pyproject.toml')],
    });
    expect(result).toHaveProperty('runtime', 'python3.13');
  });

  it('respects compatible release "~=3.14.0" (>=3.14.0,<3.15.0)', () => {
    makeMockPython('3.13');
    makeMockPython('3.14');
    const { pythonVersion: result } = selectVersion({
      constraints: [makeConstraint('~=3.14.0', 'pyproject.toml')],
    });
    expect(result).toHaveProperty('runtime', 'python3.14');
  });

  it('prefers 3.12 for broad range like >=3.9', () => {
    // >=3.9 allows many versions, but we prefer 3.12 to make 3.13+ opt-in
    makeMockPython('3.9');
    makeMockPython('3.10');
    makeMockPython('3.11');
    makeMockPython('3.12');
    makeMockPython('3.13');
    const { pythonVersion: result } = selectVersion({
      constraints: [makeConstraint('>=3.9', 'pyproject.toml')],
    });
    expect(result).toHaveProperty('runtime', 'python3.12');
  });

  it('prefers 3.12 for range >=3.11,<=3.13', () => {
    // This range includes 3.11, 3.12, and 3.13, but we prefer 3.12
    makeMockPython('3.11');
    makeMockPython('3.12');
    makeMockPython('3.13');
    const { pythonVersion: result } = selectVersion({
      constraints: [makeConstraint('>=3.11,<=3.13', 'pyproject.toml')],
    });
    expect(result).toHaveProperty('runtime', 'python3.12');
  });

  it('falls back to latest when 3.12 is not installed but matches', () => {
    // If 3.12 matches but is not installed, fall back to latest installed
    makeMockPython('3.13');
    makeMockPython('3.14');
    // Note: NOT installing 3.12
    const { pythonVersion: result } = selectVersion({
      constraints: [makeConstraint('>=3.12', 'pyproject.toml')],
    });
    // Should fall back to 3.14 (latest installed that matches)
    expect(result).toHaveProperty('runtime', 'python3.14');
  });
});

describe('.python-version file support', () => {
  it('selects Python version from .python-version source', () => {
    makeMockPython('3.11');
    makeMockPython('3.12');
    const { pythonVersion: result } = selectVersion({
      constraints: [makeConstraint('3.11', '.python-version')],
    });
    expect(result).toHaveProperty('runtime', 'python3.11');
  });

  it('uses exact match for .python-version (like Pipfile.lock)', () => {
    makeMockPython('3.10');
    makeMockPython('3.11');
    makeMockPython('3.12');
    const { pythonVersion: result } = selectVersion({
      constraints: [makeConstraint('3.10', '.python-version')],
    });
    // Should match exactly 3.10, not pick the latest
    expect(result).toHaveProperty('runtime', 'python3.10');
  });

  it('warns and falls back when .python-version specifies unavailable version', () => {
    makeMockPython('3.12');
    makeMockPython('3.13');
    // Request 3.9 which is not installed
    const { pythonVersion: result } = selectVersion({
      constraints: [makeConstraint('3.9', '.python-version')],
    });
    // Should fall back to default
    expect(result).toHaveProperty('runtime', 'python3.12');
    expect(warningMessages[0]).toContain('not installed and will be ignored');
  });

  it('warns and falls back when .python-version specifies unrecognized version', () => {
    makeMockPython('3.12');
    const { pythonVersion: result } = selectVersion({
      constraints: [makeConstraint('999', '.python-version')],
    });
    // Should fall back to default
    expect(result).toHaveProperty('runtime', 'python3.12');
    expect(warningMessages[0]).toContain('invalid and will be ignored');
  });

  it('logs correct source name when using .python-version', () => {
    makeMockPython('3.11');
    // Spy on console.log to verify the message
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      selectVersion({
        constraints: [makeConstraint('3.11', '.python-version')],
      });
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Using Python 3.11 from .python-version')
      );
    } finally {
      logSpy.mockRestore();
    }
  });
});

describe('default Python version behavior', () => {
  it('uses DEFAULT_PYTHON_VERSION_STRING when no version specified and default is installed', () => {
    makeMockPython('3.13');
    makeMockPython('3.14');
    makeMockPython(DEFAULT_PYTHON_VERSION_STRING);
    const { pythonVersion: result } = selectVersion({
      constraints: undefined,
    });
    expect(result).toHaveProperty(
      'runtime',
      `python${DEFAULT_PYTHON_VERSION_STRING}`
    );
  });

  it('falls back to latest installed when default is not installed', () => {
    makeMockPython('3.13');
    makeMockPython('3.14');
    // Note: NOT installing DEFAULT_PYTHON_VERSION_STRING (3.12)
    const { pythonVersion: result } = selectVersion({
      constraints: undefined,
    });
    // Should pick 3.14 as the latest installed
    expect(result).toHaveProperty('runtime', 'python3.14');
  });

  it('respects explicit version even when default is installed', () => {
    makeMockPython(DEFAULT_PYTHON_VERSION_STRING);
    makeMockPython('3.13');
    makeMockPython('3.14');
    const { pythonVersion: result } = selectVersion({
      constraints: [makeConstraint('>=3.14', 'pyproject.toml')],
    });
    // Should pick 3.14 because it was explicitly requested
    expect(result).toHaveProperty('runtime', 'python3.14');
  });

  it('DEFAULT_PYTHON_VERSION_STRING constant is exported and has expected value', () => {
    expect(DEFAULT_PYTHON_VERSION_STRING).toBe('3.12');
  });
});

describe('getInstalledPythonsFromFilesystem', () => {
  it('detects installed Pythons from filesystem bin directory', () => {
    const basePath = path.join(tmpPythonDir, 'uv-python');
    const binDir = path.join(basePath, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(path.join(binDir, 'python3.12'), '');
    fs.writeFileSync(path.join(binDir, 'python3.13'), '');

    const result = getInstalledPythonsFromFilesystem(basePath);
    expect(result).toEqual(new Set(['3.12', '3.13']));
  });

  it('returns empty set when no Pythons are installed', () => {
    const basePath = path.join(tmpPythonDir, 'uv-python-empty');
    const binDir = path.join(basePath, 'bin');
    fs.mkdirSync(binDir, { recursive: true });

    const result = getInstalledPythonsFromFilesystem(basePath);
    expect(result).toEqual(new Set());
  });

  it('ignores Python versions not in allOptions', () => {
    const basePath = path.join(tmpPythonDir, 'uv-python-extra');
    const binDir = path.join(basePath, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(path.join(binDir, 'python3.12'), '');
    // 3.99 does not exist in allOptions
    fs.writeFileSync(path.join(binDir, 'python3.99'), '');

    const result = getInstalledPythonsFromFilesystem(basePath);
    expect(result).toEqual(new Set(['3.12']));
  });

  it('uses filesystem fast path when VERCEL_BUILD_IMAGE is set', () => {
    const basePath = path.join(tmpPythonDir, 'uv-python-integration');
    const binDir = path.join(basePath, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(path.join(binDir, 'python3.12'), '');
    fs.writeFileSync(path.join(binDir, 'python3.13'), '');
    fs.writeFileSync(path.join(binDir, 'python3.14'), '');

    const origBuildImage = process.env.VERCEL_BUILD_IMAGE;
    process.env.VERCEL_BUILD_IMAGE = '1';
    try {
      resetInstalledPythonsCache();
      const result = getInstalledPythonsFromFilesystem(basePath);
      expect(result).toEqual(new Set(['3.12', '3.13', '3.14']));
    } finally {
      if (origBuildImage === undefined) {
        delete process.env.VERCEL_BUILD_IMAGE;
      } else {
        process.env.VERCEL_BUILD_IMAGE = origBuildImage;
      }
    }
  });
});

describe('findUvOnBuildImage', () => {
  const origBuildImage = process.env.VERCEL_BUILD_IMAGE;

  afterEach(() => {
    if (origBuildImage === undefined) {
      delete process.env.VERCEL_BUILD_IMAGE;
    } else {
      process.env.VERCEL_BUILD_IMAGE = origBuildImage;
    }
  });

  it('returns null when VERCEL_BUILD_IMAGE is not set', () => {
    delete process.env.VERCEL_BUILD_IMAGE;
    expect(findUvOnBuildImage()).toBeNull();
  });

  it('returns the known path when VERCEL_BUILD_IMAGE is set and file exists', () => {
    process.env.VERCEL_BUILD_IMAGE = '1';
    const mockUvPath = path.join(tmpPythonDir, 'mock-uv');
    fs.mkdirSync(tmpPythonDir, { recursive: true });
    fs.writeFileSync(mockUvPath, '');

    expect(findUvOnBuildImage(mockUvPath)).toBe(mockUvPath);
  });

  it('returns null when VERCEL_BUILD_IMAGE is set but file does not exist', () => {
    process.env.VERCEL_BUILD_IMAGE = '1';
    expect(findUvOnBuildImage('/nonexistent/path/uv')).toBeNull();
  });
});

describe('fallback behavior when requested version is not installed', () => {
  it('falls back to DEFAULT_PYTHON_VERSION_STRING when Pipfile.lock requests unavailable version', () => {
    // Setup: 3.14, 3.13, 3.12 are installed, but NOT 3.9
    makeMockPython('3.14');
    makeMockPython('3.13');
    makeMockPython(DEFAULT_PYTHON_VERSION_STRING); // 3.12

    const { pythonVersion: result } = selectVersion({
      constraints: [makeConstraint('3.9', 'Pipfile.lock')],
    });

    // Should fall back to 3.12 (the default), NOT 3.14 (the latest)
    expect(result).toHaveProperty(
      'runtime',
      `python${DEFAULT_PYTHON_VERSION_STRING}`
    );
    expect(warningMessages[0]).toContain('not installed and will be ignored');
  });

  it('falls back to latest installed when requested AND default are both unavailable', () => {
    // Setup: 3.14, 3.13 are installed, but NOT 3.9 or 3.12
    makeMockPython('3.14');
    makeMockPython('3.13');
    // Note: NOT installing 3.12 (default) or 3.9 (requested)

    const { pythonVersion: result } = selectVersion({
      constraints: [makeConstraint('3.9', 'Pipfile.lock')],
    });

    // Should fall back to 3.14 (latest installed) since 3.12 is also unavailable
    expect(result).toHaveProperty('runtime', 'python3.14');
    expect(warningMessages[0]).toContain('not installed and will be ignored');
  });

  it('falls back to DEFAULT_PYTHON_VERSION_STRING when pyproject.toml requests unavailable version', () => {
    // Setup: 3.14, 3.13, 3.12 are installed, but NOT 3.9
    makeMockPython('3.14');
    makeMockPython('3.13');
    makeMockPython(DEFAULT_PYTHON_VERSION_STRING); // 3.12

    const { pythonVersion: result } = selectVersion({
      constraints: [makeConstraint('==3.9', 'pyproject.toml')],
    });

    // Should fall back to 3.12 (the default), NOT 3.14 (the latest)
    expect(result).toHaveProperty(
      'runtime',
      `python${DEFAULT_PYTHON_VERSION_STRING}`
    );
    expect(warningMessages[0]).toContain('not installed and will be ignored');
  });
});

describe('createPyprojectToml', () => {
  it('sets requires-python to compatible release of DEFAULT_PYTHON_VERSION_STRING when no pythonVersion provided', async () => {
    const tempDir = path.join(tmpdir(), `pyproject-test-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const pyprojectPath = path.join(tempDir, 'pyproject.toml');

    try {
      await createPyprojectToml({
        projectName: 'test-app',
        pyprojectPath,
        dependencies: [],
      });

      const content = fs.readFileSync(pyprojectPath, 'utf8');
      expect(content).toContain(
        `requires-python = "~=${DEFAULT_PYTHON_VERSION_STRING}.0"`
      );
    } finally {
      if (fs.existsSync(tempDir)) {
        fs.removeSync(tempDir);
      }
    }
  });

  it('sets requires-python to compatible release of provided pythonVersion', async () => {
    const tempDir = path.join(tmpdir(), `pyproject-test-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const pyprojectPath = path.join(tempDir, 'pyproject.toml');

    try {
      await createPyprojectToml({
        projectName: 'test-app',
        pyprojectPath,
        dependencies: [],
        pythonVersion: '3.14',
      });

      const content = fs.readFileSync(pyprojectPath, 'utf8');
      expect(content).toContain('requires-python = "~=3.14.0"');
    } finally {
      if (fs.existsSync(tempDir)) {
        fs.removeSync(tempDir);
      }
    }
  });
});

it('should select default or latest installed version when no Piplock detected', () => {
  makeMockPython('3.10');
  const { pythonVersion: result } = selectVersion({
    constraints: undefined,
  });
  expect(result).toHaveProperty('runtime');
  // When default version isn't installed, falls back to latest available
  expect(result.runtime).toMatch(/^python3\.\d+$/);
  expect(warningMessages).toStrictEqual([]);
});

it('should select latest supported installed version and warn when invalid Piplock detected', () => {
  makeMockPython('3.10');
  const { pythonVersion: result } = selectVersion({
    constraints: [makeConstraint('999', 'Pipfile.lock')],
  });
  expect(result).toHaveProperty('runtime');
  expect(result.runtime).toMatch(/^python3\.\d+$/);
  expect(warningMessages).toStrictEqual([
    'Warning: Python version "999" detected in Pipfile.lock is invalid and will be ignored. https://vercel.link/python-version',
  ]);
});

it('should throw if uv not found', () => {
  expect(() =>
    selectVersion({
      constraints: [makeConstraint('3.6', 'Pipfile.lock')],
    })
  ).toThrow('uv is required but was not found in PATH.');
  expect(warningMessages).toStrictEqual([]);
});

it('should throw if no python versions installed', () => {
  // Create a mock uv binary that returns an empty list
  fs.mkdirSync(tmpPythonDir, { recursive: true });
  const isWin = process.platform === 'win32';
  const uvBin = path.join(tmpPythonDir, `uv${isWin ? '.cmd' : ''}`);
  if (isWin) {
    fs.writeFileSync(uvBin, '@echo off\r\necho []\r\n', 'utf8');
  } else {
    fs.writeFileSync(uvBin, '#!/bin/sh\necho "[]"\n', 'utf8');
    fs.chmodSync(uvBin, 0o755);
  }
  process.env.PATH = `${tmpPythonDir}${path.delimiter}${process.env.PATH}`;

  expect(() =>
    selectVersion({
      constraints: [makeConstraint('3.6', 'Pipfile.lock')],
    })
  ).toThrow('Unable to find any supported Python versions.');
  expect(warningMessages).toStrictEqual([]);
});

it('should throw for discontinued versions', () => {
  global.Date.now = () => new Date('2022-07-31').getTime();
  makeMockPython('3.6');

  expect(() =>
    selectVersion({
      constraints: [makeConstraint('3.6', 'Pipfile.lock')],
    })
  ).toThrow(
    'Python version "3.6" detected in Pipfile.lock is discontinued and must be upgraded.'
  );
  expect(warningMessages).toStrictEqual([]);
});

it('should warn for deprecated versions, soon to be discontinued', () => {
  global.Date.now = () => new Date('2021-07-01').getTime();
  makeMockPython('3.6');

  expect(
    selectVersion({
      constraints: [makeConstraint('3.6', 'Pipfile.lock')],
    }).pythonVersion
  ).toHaveProperty('runtime', 'python3.6');
  expect(warningMessages).toStrictEqual([
    'Error: Python version "3.6" detected in Pipfile.lock has reached End-of-Life. Deployments created on or after 2022-07-18 will fail to build. https://vercel.link/python-version',
  ]);
});

/**
 * Generates the JSON output for `uv python list --only-installed --output-format json`
 * based on the mock installed versions.
 */
function generateUvPythonListJson(versions: string[]): string {
  const entries = versions.map(version => {
    const [major, minor] = version.split('.').map(Number);
    return {
      key: `cpython-${major}.${minor}.0-linux-x86_64-gnu`,
      version: `${major}.${minor}.0`,
      version_parts: { major, minor, patch: 0 },
      path: `/uv/python/bin/python${version}`,
      symlink: `/uv/python/versions/cpython-${major}.${minor}.0-linux-x86_64-gnu/bin/python${version}`,
      url: null,
      os: 'linux',
      variant: 'default',
      implementation: 'cpython',
      arch: 'x86_64',
      libc: 'gnu',
    };
  });
  return JSON.stringify(entries);
}

function makeMockPython(version: string) {
  // Track this version for uv python list output
  if (!mockInstalledVersions.includes(version)) {
    mockInstalledVersions.push(version);
  }

  fs.mkdirSync(tmpPythonDir, { recursive: true });
  const isWin = process.platform === 'win32';
  const posixScript = '#!/bin/sh\n# mock binary\nexit 0\n';
  const winScript = '@echo off\r\nrem mock binary\r\nexit /b 0\r\n';

  for (const name of ['python', 'pip']) {
    const bin = path.join(
      tmpPythonDir,
      `${name}${version}${isWin ? '.cmd' : ''}`
    );
    fs.writeFileSync(bin, isWin ? winScript : posixScript, 'utf8');
    if (!isWin) fs.chmodSync(bin, 0o755);

    // Also provide unversioned "python3"/"pip3" shims for dev mode
    const major = version.split('.')[0];
    if (major === '3') {
      const shim = path.join(tmpPythonDir, `${name}3${isWin ? '.cmd' : ''}`);
      fs.writeFileSync(shim, isWin ? winScript : posixScript, 'utf8');
      if (!isWin) fs.chmodSync(shim, 0o755);
    }

    // Also provide fully unversioned "python"/"pip" shims (needed on Windows where
    // runStdlibPyScript uses "python" instead of "python3")
    const unversionedShim = path.join(
      tmpPythonDir,
      `${name}${isWin ? '.cmd' : ''}`
    );
    fs.writeFileSync(unversionedShim, isWin ? winScript : posixScript, 'utf8');
    if (!isWin) fs.chmodSync(unversionedShim, 0o755);
  }

  // Write the uv python list JSON to a file that the mock uv binary will read
  const uvPythonListFile = path.join(tmpPythonDir, 'uv-python-list.json');
  fs.writeFileSync(
    uvPythonListFile,
    generateUvPythonListJson(mockInstalledVersions),
    'utf8'
  );

  // mock uv: handle `python list` command, succeed for all other commands
  const uvBin = path.join(tmpPythonDir, `uv${isWin ? '.cmd' : ''}`);
  if (isWin) {
    const uvWinScript = [
      '@echo off',
      'rem mock uv binary',
      'if "%1"=="python" if "%2"=="list" (',
      `  type "${uvPythonListFile}"`,
      '  exit /b 0',
      ')',
      'rem always succeed',
      'exit /b 0',
      '',
    ].join('\r\n');
    fs.writeFileSync(uvBin, uvWinScript, 'utf8');
  } else {
    const uvPosixScript = [
      '#!/bin/sh',
      '# mock uv binary',
      'if [ "$1" = "python" ] && [ "$2" = "list" ]; then',
      `  /bin/cat "${uvPythonListFile}"`,
      '  exit 0',
      'fi',
      '# always succeed',
      'exit 0',
      '',
    ].join('\n');
    fs.writeFileSync(uvBin, uvPosixScript, 'utf8');
    fs.chmodSync(uvBin, 0o755);
  }

  process.env.PATH = `${tmpPythonDir}${path.delimiter}${process.env.PATH}`;
}

describe('file exclusions', () => {
  let mockWorkPath: string;

  beforeEach(() => {
    mockWorkPath = path.join(tmpdir(), `python-test-${Date.now()}`);
    fs.mkdirSync(mockWorkPath, { recursive: true });
    makeMockPython('3.9');
  });

  afterEach(() => {
    if (fs.existsSync(mockWorkPath)) {
      fs.removeSync(mockWorkPath);
    }
  });

  it('should exclude predefined files by default', async () => {
    // Test with one excluded directory
    const excludedDir = '.pnpm-store';
    const testFiles = {
      'handler.py': new FileBlob({
        data: 'def app(environ, start_response): pass',
      }),
      'package.json': new FileBlob({ data: 'package.json' }),
      'pnpm-lock.yaml': new FileBlob({ data: 'pnpm-lock.yaml' }),
      'yarn.lock': new FileBlob({ data: 'yarn.lock' }),
      'package-lock.json': new FileBlob({ data: 'package-lock.json' }),
      'node_modules/package.json': new FileBlob({
        data: 'node_modules/package.json',
      }),
      'node_modules/package-lock.json': new FileBlob({
        data: 'node_modules/package-lock.json',
      }),
      'node_modules/yarn.lock': new FileBlob({
        data: 'node_modules/yarn.lock',
      }),
      'node_modules/pnpm-lock.yaml': new FileBlob({
        data: 'node_modules/pnpm-lock.yaml',
      }),
    };

    // Add files that should be excluded
    const dirPath = path.join(mockWorkPath, excludedDir);
    fs.mkdirSync(dirPath, { recursive: true });
    fs.writeFileSync(path.join(dirPath, 'test.txt'), 'should be excluded');

    // Add a nested node_modules that should also be excluded
    const nestedNodeModules = path.join(mockWorkPath, 'src', 'node_modules');
    fs.mkdirSync(nestedNodeModules, { recursive: true });
    fs.writeFileSync(path.join(nestedNodeModules, 'package.json'), '{}');

    const result = await build({
      workPath: mockWorkPath,
      files: testFiles,
      entrypoint: 'handler.py',
      meta: { isDev: true },
      config: {},
      repoRootPath: mockWorkPath,
    });

    const outputFiles = Object.keys(getBuildOutputV3(result).files || {});
    const excludedLockFiles = [
      'pnpm-lock.yaml',
      'yarn.lock',
      'package-lock.json',
    ];
    for (const file of excludedLockFiles) {
      expect(outputFiles.some(f => f.includes(file))).toBe(false);
    }

    // Should include the handler
    expect(outputFiles.some(f => f.includes('handler'))).toBe(true);

    // Should not include any excluded directories
    expect(outputFiles.some(f => f.includes(excludedDir))).toBe(false);
  });

  it('should add config.excludeFiles to predefined exclusions', async () => {
    const testFiles = {
      'handler.py': new FileBlob({
        data: 'def app(environ, start_response): pass',
      }),
      'secret.txt': new FileBlob({ data: 'secret data' }),
      'config.ini': new FileBlob({ data: '[settings]' }),
      'public.txt': new FileBlob({ data: 'public data' }),
    };

    // Should still exclude predefined files (test with .git if it exists)
    const gitDir = path.join(mockWorkPath, '.git');
    fs.mkdirSync(gitDir, { recursive: true });
    fs.writeFileSync(path.join(gitDir, 'config'), 'git config');

    const result = await build({
      workPath: mockWorkPath,
      files: testFiles,
      entrypoint: 'handler.py',
      meta: { isDev: true },
      config: { excludeFiles: 'secret.txt' },
      repoRootPath: mockWorkPath,
    });

    const outputFiles = Object.keys(getBuildOutputV3(result).files || {});

    // Should not include the user-excluded file
    expect(outputFiles.some(f => f.includes('secret.txt'))).toBe(false);

    // Should still include other files
    expect(outputFiles.some(f => f.includes('public.txt'))).toBe(true);
    expect(outputFiles.some(f => f.includes('config.ini'))).toBe(true);

    expect(outputFiles.some(f => f.includes('.git'))).toBe(false);
  });
});

describe('python version selection from uv.lock and pyproject.toml', () => {
  let mockWorkPath: string;

  beforeEach(() => {
    mockWorkPath = path.join(tmpdir(), `python-uvlock-test-${Date.now()}`);
    fs.mkdirSync(mockWorkPath, { recursive: true });
    makeMockPython('3.11');
    makeMockPython('3.10');
  });

  afterEach(() => {
    if (fs.existsSync(mockWorkPath)) {
      fs.removeSync(mockWorkPath);
    }
  });

  it('uses python version from uv.lock when present (build succeeds)', async () => {
    const files = {
      'handler.py': new FileBlob({
        data: 'def app(environ, start_response): pass',
      }),
      'uv.lock': new FileBlob({ data: '[project]\npython = "3.11"\n' }),
      'pyproject.toml': new FileBlob({
        data: '[project]\nname = "x"\nversion = "0.0.1"\n',
      }),
    } as Record<string, FileBlob>;

    const result = await build({
      workPath: mockWorkPath,
      files,
      entrypoint: 'handler.py',
      meta: { isDev: false },
      config: {},
      repoRootPath: mockWorkPath,
    });

    const handler = getBuildOutputV3(result).files?.['vc__handler__python.py'];
    expect(handler).toBeDefined();
  });

  it('falls back to pyproject.toml requires-python when no uv.lock (build succeeds)', async () => {
    const files = {
      'handler.py': new FileBlob({
        data: 'def app(environ, start_response): pass',
      }),
      'pyproject.toml': new FileBlob({
        data: '[project]\nname = "x"\nversion = "0.0.1"\nrequires-python = ">=3.10,<3.12"\n',
      }),
    } as Record<string, FileBlob>;

    const result = await build({
      workPath: mockWorkPath,
      files,
      entrypoint: 'handler.py',
      meta: { isDev: false },
      config: {},
      repoRootPath: mockWorkPath,
    });

    const handler = getBuildOutputV3(result).files?.['vc__handler__python.py'];
    expect(handler).toBeDefined();
  });

  it('throws when pyproject.toml requires discontinued python version', async () => {
    const files = {
      'handler.py': new FileBlob({
        data: 'def app(environ, start_response): pass',
      }),
      'pyproject.toml': new FileBlob({
        data: '[project]\nname = "x"\nversion = "0.0.1"\nrequires-python = ">=3.6,<3.7"\n',
      }),
    } as Record<string, FileBlob>;

    await expect(
      build({
        workPath: mockWorkPath,
        files,
        entrypoint: 'handler.py',
        meta: { isDev: false },
        config: {},
        repoRootPath: mockWorkPath,
      })
    ).rejects.toThrow(/discontinued/i);
  });
});

describe('uv workspace lockfile resolution (workspace root above workPath)', () => {
  it('succeeds when uv writes uv.lock at the workspace root instead of the member directory', async () => {
    const repoRoot = path.join(
      tmpdir(),
      `python-uv-workspace-parent-${Date.now()}`
    );
    const workPath = path.join(repoRoot, 'apps', 'python-app2');

    fs.mkdirSync(workPath, { recursive: true });

    // Create a workspace root pyproject.toml so the runtime can associate the
    // workspace-root lockfile with a project.
    fs.writeFileSync(
      path.join(repoRoot, 'pyproject.toml'),
      [
        '[project]',
        'name = "root"',
        'version = "0.0.0"',
        '',
        '[tool.uv.workspace]',
        'members = ["apps/python-app2"]',
        '',
      ].join('\n')
    );

    // Setup mocked Python + uv
    makeMockPython('3.9');

    // Override the mock uv binary to emulate workspace behavior.
    // The lock command will create uv.lock at workspace root via repoRoot setup.
    const isWin = process.platform === 'win32';
    const uvBin = path.join(tmpPythonDir, `uv${isWin ? '.cmd' : ''}`);
    const uvPythonListFile = path.join(tmpPythonDir, 'uv-python-list.json');
    if (isWin) {
      const uvWinScript = [
        '@echo off',
        'rem mock uv binary (workspace)',
        'if "%1"=="python" if "%2"=="list" (',
        `  type "${uvPythonListFile}"`,
        '  exit /b 0',
        ')',
        'exit /b 0',
        '',
      ].join('\r\n');
      fs.writeFileSync(uvBin, uvWinScript, 'utf8');
    } else {
      const uvPosixScript = [
        '#!/bin/sh',
        '# mock uv binary (workspace)',
        'if [ "$1" = "python" ] && [ "$2" = "list" ]; then',
        `  /bin/cat "${uvPythonListFile}"`,
        '  exit 0',
        'fi',
        'exit 0',
        '',
      ].join('\n');
      fs.writeFileSync(uvBin, uvPosixScript, 'utf8');
      fs.chmodSync(uvBin, 0o755);
    }

    // Create uv.lock at workspace root (repoRoot) to simulate workspace lockfile
    fs.writeFileSync(path.join(repoRoot, 'uv.lock'), '[mock]\n', 'utf8');

    const files = {
      'main.py': new FileBlob({
        data: 'from fastapi import FastAPI\napp = FastAPI()\n',
      }),
      'pyproject.toml': new FileBlob({
        data: [
          '[project]',
          'name = "python-app2"',
          'version = "0.0.1"',
          'requires-python = ">=3.9,<3.10"',
          'dependencies = ["fastapi"]',
          '',
        ].join('\n'),
      }),
    } as Record<string, FileBlob>;

    const result = await build({
      workPath,
      files,
      entrypoint: 'main.py',
      meta: { isDev: false },
      config: { framework: 'fastapi' },
      repoRootPath: repoRoot,
    });

    const handler =
      getBuildOutputV2Lambda(result).files?.['vc__handler__python.py'];
    expect(handler).toBeDefined();

    fs.removeSync(repoRoot);
  });
});

describe('fastapi entrypoint discovery', () => {
  it('should throw a clear error when no FastAPI entrypoint is found', async () => {
    const mockWorkPath = path.join(
      tmpdir(),
      `python-fastapi-test-${Date.now()}`
    );
    fs.mkdirSync(mockWorkPath, { recursive: true });
    makeMockPython('3.9');

    const files = {
      'invalid_entrypoint.py': new FileBlob({
        data: 'from fastapi import FastAPI\napp = FastAPI()\n',
      }),
    } as Record<string, FileBlob>;

    await expect(
      build({
        workPath: mockWorkPath,
        files,
        entrypoint: '<detect>',
        meta: { isDev: true },
        config: { framework: 'fastapi' },
        repoRootPath: mockWorkPath,
      })
    ).rejects.toThrow(/No fastapi entrypoint found/i);

    if (fs.existsSync(mockWorkPath)) {
      fs.removeSync(mockWorkPath);
    }
  });
});

describe('fastapi entrypoint discovery - positive cases', () => {
  it('discovers root-level app.py containing FastAPI', async () => {
    const workPath = path.join(
      tmpdir(),
      `python-fastapi-pass-root-${Date.now()}`
    );
    fs.mkdirSync(workPath, { recursive: true });
    makeMockPython('3.9');

    const files = {
      'app.py': new FileBlob({
        data: 'from fastapi import FastAPI\napp = FastAPI()\n',
      }),
    } as Record<string, FileBlob>;
    // isDev mode assumes files are already present
    await download(files, workPath);

    const result = await build({
      workPath,
      files,
      entrypoint: '<detect>',
      meta: { isDev: true },
      config: { framework: 'fastapi' },
      repoRootPath: workPath,
    });

    const handler =
      getBuildOutputV2Lambda(result).files?.['vc__handler__python.py'];
    if (!handler || !('data' in handler)) {
      throw new Error('handler bootstrap not found');
    }
    const content = handler.data.toString();
    expect(content.includes('os.path.join(_here, "app.py")')).toBe(true);

    fs.removeSync(workPath);
  });

  it('discovers src/index.py containing FastAPI', async () => {
    const workPath = path.join(
      tmpdir(),
      `python-fastapi-pass-src-${Date.now()}`
    );
    fs.mkdirSync(path.join(workPath, 'src'), { recursive: true });
    makeMockPython('3.9');

    const files = {
      'src/index.py': new FileBlob({
        data: 'import fastapi\n\napp = fastapi.FastAPI()',
      }),
    } as Record<string, FileBlob>;
    // isDev mode assumes files are already present
    await download(files, workPath);

    const result = await build({
      workPath,
      files,
      entrypoint: '<detect>',
      meta: { isDev: true },
      config: { framework: 'fastapi' },
      repoRootPath: workPath,
    });

    const handler =
      getBuildOutputV2Lambda(result).files?.['vc__handler__python.py'];
    if (!handler || !('data' in handler)) {
      throw new Error('handler bootstrap not found');
    }
    const content = handler.data.toString();
    expect(content.includes('os.path.join(_here, "src/index.py")')).toBe(true);

    fs.removeSync(workPath);
  });

  it('prefers candidate with FastAPI content when multiple candidates exist', async () => {
    const workPath = path.join(
      tmpdir(),
      `python-fastapi-pass-pref-${Date.now()}`
    );
    fs.mkdirSync(workPath, { recursive: true });
    makeMockPython('3.9');

    const files = {
      'app.py': new FileBlob({ data: 'print("no framework here")\n' }),
      'index.py': new FileBlob({
        data: 'import fastapi\nfrom fastapi import FastAPI\napp = FastAPI()\n',
      }),
    } as Record<string, FileBlob>;
    // isDev mode assumes files are already present
    await download(files, workPath);

    const result = await build({
      workPath,
      files,
      entrypoint: '<detect>',
      meta: { isDev: true },
      config: { framework: 'fastapi' },
      repoRootPath: workPath,
    });

    const handler =
      getBuildOutputV2Lambda(result).files?.['vc__handler__python.py'];
    if (!handler || !('data' in handler)) {
      throw new Error('handler bootstrap not found');
    }
    const content = handler.data.toString();
    expect(content.includes('os.path.join(_here, "index.py")')).toBe(true);

    fs.removeSync(workPath);
  });
});

describe('Django entrypoint discovery', () => {
  it('build() resolves Django entrypoint from WSGI_APPLICATION (hello.wsgi.application -> hello/wsgi.py)', async () => {
    vi.mocked(getDjangoSettings).mockResolvedValueOnce({
      settingsModule: 'hello.settings',
      djangoSettings: { WSGI_APPLICATION: 'hello.wsgi.application' },
      djangoVersion: [5, 1, 0],
    });
    const workPath = path.join(tmpdir(), `python-django-wsgi-${Date.now()}`);
    fs.mkdirSync(workPath, { recursive: true });
    makeMockPython('3.9');

    const files = {
      'manage.py': new FileBlob({
        data: "os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'hello.settings')\n",
      }),
      'hello/settings.py': new FileBlob({
        data: "WSGI_APPLICATION = 'hello.wsgi.application'\n",
      }),
      'hello/wsgi.py': new FileBlob({
        data: 'application = lambda env, start: None\n',
      }),
    } as Record<string, FileBlob>;
    // isDev mode assumes files are already present
    await download(files, workPath);

    const result = await build({
      workPath,
      files,
      entrypoint: '<detect>',
      meta: { isDev: true },
      config: { framework: 'django' },
      repoRootPath: workPath,
    });

    const handler =
      getBuildOutputV2Lambda(result).files?.['vc__handler__python.py'];
    if (!handler || !('data' in handler)) {
      throw new Error('handler bootstrap not found');
    }
    expect(handler.data.toString()).toContain(
      'os.path.join(_here, "hello/wsgi.py")'
    );

    if (fs.existsSync(workPath)) fs.removeSync(workPath);
  });

  it('falls back to candidate when manage.py is missing', async () => {
    const workPath = path.join(
      tmpdir(),
      `python-django-fallback-${Date.now()}`
    );
    fs.mkdirSync(workPath, { recursive: true });
    makeMockPython('3.9');

    const files = {
      'src/app.py': new FileBlob({
        data: 'application = lambda env, start: None\n',
      }),
    } as Record<string, FileBlob>;
    // isDev mode assumes files are already present
    await download(files, workPath);

    const result = await build({
      workPath,
      files,
      entrypoint: '<detect>',
      meta: { isDev: true },
      config: { framework: 'django' },
      repoRootPath: workPath,
    });

    const handler =
      getBuildOutputV2Lambda(result).files?.['vc__handler__python.py'];
    if (!handler || !('data' in handler)) {
      throw new Error('handler bootstrap not found');
    }
    expect(handler.data.toString()).toContain(
      'os.path.join(_here, "src/app.py")'
    );

    if (fs.existsSync(workPath)) fs.removeSync(workPath);
  });

  it('build() returns settings module even when WSGI path is not in files', async () => {
    vi.mocked(getDjangoSettings).mockResolvedValueOnce({
      settingsModule: 'hello.settings',
      djangoSettings: { WSGI_APPLICATION: 'hello.wsgi.application' },
      djangoVersion: [5, 1, 0],
    });
    const workPath = path.join(
      tmpdir(),
      `python-django-wsgi-missing-${Date.now()}`
    );
    fs.mkdirSync(workPath, { recursive: true });
    makeMockPython('3.9');

    const files = {
      'manage.py': new FileBlob({
        data: "os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'hello.settings')\n",
      }),
      'hello/settings.py': new FileBlob({
        data: "WSGI_APPLICATION = 'hello.wsgi.application'\n",
      }),
    } as Record<string, FileBlob>;
    // isDev mode assumes files are already present
    await download(files, workPath);

    const result = await build({
      workPath,
      files,
      entrypoint: '<detect>',
      meta: { isDev: true },
      config: { framework: 'django' },
      repoRootPath: workPath,
    });

    const handler =
      getBuildOutputV2Lambda(result).files?.['vc__handler__python.py'];
    if (!handler || !('data' in handler)) {
      throw new Error('handler bootstrap not found');
    }
    expect(handler.data.toString()).toContain(
      'os.path.join(_here, "hello/wsgi.py")'
    );

    if (fs.existsSync(workPath)) fs.removeSync(workPath);
  });

  it('build() resolves Django entrypoint from a subdirectory', async () => {
    vi.mocked(getDjangoSettings).mockResolvedValueOnce({
      settingsModule: 'config.settings',
      djangoSettings: { WSGI_APPLICATION: 'config.wsgi.application' },
      djangoVersion: [5, 1, 0],
    });
    const workPath = path.join(
      tmpdir(),
      `python-django-root-dir-${Date.now()}`
    );
    fs.mkdirSync(workPath, { recursive: true });
    makeMockPython('3.9');

    // Django app lives under root dir "mysite"; no manage.py at workPath root
    const files = {
      'mysite/manage.py': new FileBlob({
        data: "os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')\n",
      }),
      'mysite/config/settings.py': new FileBlob({
        data: "WSGI_APPLICATION = 'config.wsgi.application'\n",
      }),
      'mysite/config/wsgi.py': new FileBlob({
        data: 'application = lambda env, start: None\n',
      }),
    } as Record<string, FileBlob>;
    // isDev mode assumes files are already present
    await download(files, workPath);

    const result = await build({
      workPath,
      files,
      entrypoint: '<detect>',
      meta: { isDev: true },
      config: { framework: 'django' },
      repoRootPath: workPath,
    });

    const handler =
      getBuildOutputV2Lambda(result).files?.['vc__handler__python.py'];
    if (!handler || !('data' in handler)) {
      throw new Error('handler bootstrap not found');
    }
    expect(handler.data.toString()).toContain(
      'os.path.join(_here, "mysite/config/wsgi.py")'
    );

    if (fs.existsSync(workPath)) fs.removeSync(workPath);
  });

  it('build() discovers Django entrypoint from WSGI_APPLICATION when configured entrypoint is missing', async () => {
    vi.mocked(getDjangoSettings).mockResolvedValueOnce({
      settingsModule: 'hello.settings',
      djangoSettings: { WSGI_APPLICATION: 'hello.world.application' },
      djangoVersion: [5, 1, 0],
    });
    const workPath = path.join(tmpdir(), `python-django-build-${Date.now()}`);
    fs.mkdirSync(workPath, { recursive: true });
    makeMockPython('3.9');

    const files = {
      'manage.py': new FileBlob({
        data: "os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'hello.settings')\n",
      }),
      'hello/settings.py': new FileBlob({
        data: "WSGI_APPLICATION = 'hello.world.application'\n",
      }),
      'hello/world.py': new FileBlob({
        data: 'application = lambda env, start: None\n',
      }),
    } as Record<string, FileBlob>;
    // isDev mode assumes files are already present
    await download(files, workPath);

    const result = await build({
      workPath,
      files,
      entrypoint: '<detect>',
      meta: { isDev: true },
      config: { framework: 'django' },
      repoRootPath: workPath,
    });

    const handler =
      getBuildOutputV2Lambda(result).files?.['vc__handler__python.py'];
    if (!handler || !('data' in handler)) {
      throw new Error('handler bootstrap not found');
    }
    const content = handler.data.toString();
    expect(content).toContain('os.path.join(_here, "hello/world.py")');

    if (fs.existsSync(workPath)) fs.removeSync(workPath);
  });

  it('returns a v2 result with static files in output and filesystem route', async () => {
    vi.mocked(getDjangoSettings).mockResolvedValueOnce({
      settingsModule: 'myapp.settings',
      djangoSettings: {
        WSGI_APPLICATION: 'myapp.wsgi.application',
        STATIC_URL: '/static/',
        STATIC_ROOT: 'staticfiles',
      },
      djangoVersion: [5, 1, 0],
    });
    // Simulate collectstatic succeeding
    vi.mocked(runDjangoCollectStatic).mockImplementationOnce(
      async (_venvPath, _workPath, _env, outputStaticDir) => {
        fs.mkdirSync(path.join(outputStaticDir, 'static'), { recursive: true });
        fs.writeFileSync(
          path.join(outputStaticDir, 'static', 'app.css'),
          'body {}'
        );
        return {
          staticSourceDirs: [path.join(_workPath, 'static')],
          staticRoot: null,
          cdnOutputDir: outputStaticDir,
          manifestRelPath: null,
        };
      }
    );

    const workPath = path.join(tmpdir(), `python-django-build-${Date.now()}`);
    fs.mkdirSync(workPath, { recursive: true });
    makeMockPython('3.9');

    const files = {
      'manage.py': new FileBlob({
        data: "os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myapp.settings')\n",
      }),
      'myapp/wsgi.py': new FileBlob({
        data: 'application = lambda env, start: None\n',
      }),
      'static/app.css': new FileBlob({ data: 'body {}' }),
    } as Record<string, FileBlob>;
    // isDev mode assumes files are already present
    await download(files, workPath);

    const result = await build({
      workPath: workPath,
      files,
      entrypoint: '<detect>',
      meta: { isDev: false },
      config: { framework: 'django', zeroConfig: true },
      repoRootPath: workPath,
    });

    const v2result = getBuildOutputV2(result);
    expect(v2result.routes).toContainEqual({ handle: 'filesystem' });
    expect(v2result.routes).toContainEqual(
      expect.objectContaining({ src: '/(.*)', dest: '/index' })
    );
    const lambda = v2result.output['index'];
    expect(lambda).toBeDefined(); // Lambda keyed by entrypoint sans extension
    expect((lambda as any).files?.['static/app.css']).toBeDefined(); // Included in Lambda bundle
    expect(v2result.output['static/app.css']).toBeDefined(); // Static file from collectstatic

    if (fs.existsSync(workPath)) fs.removeSync(workPath);
  });
});

describe('pyproject.toml entrypoint detection', () => {
  beforeEach(() => {
    vi.resetModules();
    makeMockPython('3.9');
  });

  afterEach(() => {
    vi.doUnmock('../src/uv');
  });

  it('resolves FastAPI entrypoint from pyproject scripts (uvicorn module:attr)', async () => {
    const realUv =
      await vi.importActual<typeof import('../src/uv')>('../src/uv');
    vi.doMock('../src/uv', () => ({
      ...realUv,
      UvRunner: createMockUvRunner(),
    }));

    const { build: buildWithMocks } = await import('../src/index');

    const workPath = path.join(
      tmpdir(),
      `python-pyproject-fastapi-${Date.now()}`
    );
    fs.mkdirSync(path.join(workPath, 'backend', 'api'), { recursive: true });

    const files = {
      'pyproject.toml': new FileBlob({
        data: '[project]\nname = "x"\nversion = "0.0.1"\n\n[project.scripts]\napp = "uvicorn backend.api.server:main"\n',
      }),
      'backend/api/server.py': new FileBlob({
        data: 'from fastapi import FastAPI\napp = FastAPI()\n',
      }),
    } as Record<string, FileBlob>;
    // isDev mode assumes files are already present
    await download(files, workPath);

    const result = await buildWithMocks({
      workPath,
      files,
      entrypoint: '<detect>',
      meta: { isDev: true },
      config: { framework: 'fastapi' },
      repoRootPath: workPath,
    });

    const handler =
      getBuildOutputV2Lambda(result).files?.['vc__handler__python.py'];
    if (!handler || !('data' in handler)) {
      throw new Error('handler bootstrap not found');
    }
    const content = handler.data.toString();
    expect(content.includes('backend/api/server.py')).toBe(true);

    if (fs.existsSync(workPath)) fs.removeSync(workPath);
  });

  it('resolves Flask entrypoint from pyproject scripts (module:attr -> .py)', async () => {
    const realUv =
      await vi.importActual<typeof import('../src/uv')>('../src/uv');
    vi.doMock('../src/uv', () => ({
      ...realUv,
      UvRunner: createMockUvRunner(),
    }));

    const { build: buildWithMocks } = await import('../src/index');

    const workPath = path.join(
      tmpdir(),
      `python-pyproject-flask-${Date.now()}`
    );
    fs.mkdirSync(workPath, { recursive: true });

    const files = {
      'pyproject.toml': new FileBlob({
        data: '[project]\nname = "x"\nversion = "0.0.1"\n\n[project.scripts]\napp = "backend:run"\n',
      }),
      'backend.py': new FileBlob({
        data: 'from flask import Flask\napp = Flask(__name__)\n',
      }),
    } as Record<string, FileBlob>;
    // isDev mode assumes files are already present
    await download(files, workPath);

    const result = await buildWithMocks({
      workPath,
      files,
      entrypoint: '<detect>',
      meta: { isDev: true },
      config: { framework: 'flask' },
      repoRootPath: workPath,
    });

    const handler =
      getBuildOutputV2Lambda(result).files?.['vc__handler__python.py'];
    if (!handler || !('data' in handler)) {
      throw new Error('handler bootstrap not found');
    }
    const content = handler.data.toString();
    expect(content.includes('backend.py')).toBe(true);

    if (fs.existsSync(workPath)) fs.removeSync(workPath);
  });

  it('falls back to package __init__.py when module path has no .py file', async () => {
    const realUv =
      await vi.importActual<typeof import('../src/uv')>('../src/uv');
    vi.doMock('../src/uv', () => ({
      ...realUv,
      UvRunner: createMockUvRunner(),
    }));

    const { build: buildWithMocks } = await import('../src/index');

    const workPath = path.join(tmpdir(), `python-pyproject-init-${Date.now()}`);
    fs.mkdirSync(path.join(workPath, 'backend', 'server'), { recursive: true });

    const files = {
      'pyproject.toml': new FileBlob({
        data: '[project]\nname = "x"\nversion = "0.0.1"\n\n[project.scripts]\napp = "backend.server:main"\n',
      }),
      'backend/server/__init__.py': new FileBlob({
        data: 'from flask import Flask\napp = Flask(__name__)\n',
      }),
    } as Record<string, FileBlob>;
    // isDev mode assumes files are already present
    await download(files, workPath);

    const result = await buildWithMocks({
      workPath,
      files,
      entrypoint: '<detect>',
      meta: { isDev: true },
      config: { framework: 'flask' },
      repoRootPath: workPath,
    });

    const handler =
      getBuildOutputV2Lambda(result).files?.['vc__handler__python.py'];
    if (!handler || !('data' in handler)) {
      throw new Error('handler bootstrap not found');
    }
    const content = handler.data.toString();
    expect(content.includes('backend/server/__init__.py')).toBe(true);

    if (fs.existsSync(workPath)) fs.removeSync(workPath);
  });
});

describe('vercel.json entrypoint configuration', () => {
  let workPath: string;

  beforeEach(() => {
    workPath = path.join(
      tmpdir(),
      `python-vercel-json-entrypoint-${Date.now()}`
    );
    fs.mkdirSync(workPath, { recursive: true });
    makeMockPython('3.9');
  });

  afterEach(() => {
    if (fs.existsSync(workPath)) fs.removeSync(workPath);
  });

  it('errors when the configured entrypoint file does not exist', async () => {
    await expect(
      build({
        workPath,
        files: {},
        entrypoint: 'nonexistent.py',
        meta: { isDev: true },
        config: { framework: 'fastapi' },
        repoRootPath: workPath,
      })
    ).rejects.toThrow(/ENOENT/);
  });

  it('detects the variable automatically when no variable is specified', async () => {
    const files = {
      'app/wsgi.py': new FileBlob({
        data: 'application = lambda env, start: None\n',
      }),
    } as Record<string, FileBlob>;
    await download(files, workPath);

    const result = await build({
      workPath,
      files,
      entrypoint: 'app/wsgi.py',
      meta: { isDev: true },
      config: { framework: 'django' },
      repoRootPath: workPath,
    });

    const handler =
      getBuildOutputV2Lambda(result).files?.['vc__handler__python.py'];
    if (!handler || !('data' in handler)) throw new Error('handler not found');
    const content = handler.data.toString();
    expect(content).toContain('"__VC_HANDLER_VARIABLE_NAME": "application"');
  });

  it('errors when no standard callable is found in the configured entrypoint', async () => {
    const files = {
      'myapp.py': new FileBlob({ data: 'print("hello")\n' }),
    } as Record<string, FileBlob>;
    await download(files, workPath);

    await expect(
      build({
        workPath,
        files,
        entrypoint: 'myapp.py',
        meta: { isDev: true },
        config: { framework: 'fastapi' },
        repoRootPath: workPath,
      })
    ).rejects.toThrow(
      /Could not find a top-level "app", "application", or "handler" in "myapp\.py"/
    );
  });
});

describe('handlerFunction validation', () => {
  let mockWorkPath: string;

  beforeEach(() => {
    mockWorkPath = path.join(tmpdir(), `python-handler-func-${Date.now()}`);
    fs.mkdirSync(mockWorkPath, { recursive: true });
    makeMockPython('3.11');
  });

  afterEach(() => {
    if (fs.existsSync(mockWorkPath)) {
      fs.removeSync(mockWorkPath);
    }
  });

  it('builds successfully when handlerFunction exists as a top-level function', async () => {
    const files = {
      'jobs/cleanup.py': new FileBlob({
        data: 'def sync_handler():\n    print("done")\n',
      }),
      'pyproject.toml': new FileBlob({
        data: '[project]\nname = "x"\nversion = "0.0.1"\n',
      }),
    } as Record<string, FileBlob>;

    const result = await build({
      workPath: mockWorkPath,
      files,
      entrypoint: 'jobs/cleanup.py',
      meta: { isDev: false },
      config: { handlerFunction: 'sync_handler' },
      repoRootPath: mockWorkPath,
      service: { type: 'job', trigger: 'schedule' },
    });

    expect(result).toBeDefined();
  });

  it('builds successfully when handlerFunction exists as an async function', async () => {
    const files = {
      'jobs/cleanup.py': new FileBlob({
        data: 'async def async_handler():\n    print("done")\n',
      }),
      'pyproject.toml': new FileBlob({
        data: '[project]\nname = "x"\nversion = "0.0.1"\n',
      }),
    } as Record<string, FileBlob>;

    const result = await build({
      workPath: mockWorkPath,
      files,
      entrypoint: 'jobs/cleanup.py',
      meta: { isDev: false },
      config: { handlerFunction: 'async_handler' },
      repoRootPath: mockWorkPath,
      service: { type: 'job', trigger: 'schedule' },
    });

    expect(result).toBeDefined();
  });

  it('throws PYTHON_HANDLER_NOT_FOUND when handlerFunction does not exist', async () => {
    const files = {
      'jobs/cleanup.py': new FileBlob({
        data: 'def other_func():\n    pass\n',
      }),
      'pyproject.toml': new FileBlob({
        data: '[project]\nname = "x"\nversion = "0.0.1"\n',
      }),
    } as Record<string, FileBlob>;

    await expect(
      build({
        workPath: mockWorkPath,
        files,
        entrypoint: 'jobs/cleanup.py',
        meta: { isDev: false },
        config: { handlerFunction: 'nonexistent_handler' },
        repoRootPath: mockWorkPath,
        service: { type: 'job', trigger: 'schedule' },
      })
    ).rejects.toThrow(/Handler function "nonexistent_handler" not found/);
  });

  it('throws when handlerFunction is nested inside another function', async () => {
    const files = {
      'jobs/cleanup.py': new FileBlob({
        data: 'def outer():\n    def cleanup():\n        pass\n',
      }),
      'pyproject.toml': new FileBlob({
        data: '[project]\nname = "x"\nversion = "0.0.1"\n',
      }),
    } as Record<string, FileBlob>;

    await expect(
      build({
        workPath: mockWorkPath,
        files,
        entrypoint: 'jobs/cleanup.py',
        meta: { isDev: false },
        config: { handlerFunction: 'cleanup' },
        repoRootPath: mockWorkPath,
        service: { type: 'job', trigger: 'schedule' },
      })
    ).rejects.toThrow(/Handler function "cleanup" not found/);
  });

  it('uses handlerFunction as variable name for web services', async () => {
    const files = {
      'app.py': new FileBlob({
        data: 'flask_app = lambda environ, start_response: None\n',
      }),
      'pyproject.toml': new FileBlob({
        data: '[project]\nname = "x"\nversion = "0.0.1"\n',
      }),
    } as Record<string, FileBlob>;
    await download(files, mockWorkPath);

    const result = await build({
      workPath: mockWorkPath,
      files,
      entrypoint: 'app.py',
      meta: { isDev: true },
      config: { handlerFunction: 'flask_app', framework: 'flask' },
      repoRootPath: mockWorkPath,
    });

    const handler =
      getBuildOutputV2Lambda(result).files?.['vc__handler__python.py'];
    if (!handler || !('data' in handler)) {
      throw new Error('handler bootstrap not found');
    }
    const content = handler.data.toString();
    expect(content).toContain('"__VC_HANDLER_VARIABLE_NAME": "flask_app"');
  });

  it('errors when handlerFunction variable does not exist for web services', async () => {
    const files = {
      'app.py': new FileBlob({
        data: 'other_var = lambda environ, start_response: None\n',
      }),
      'pyproject.toml': new FileBlob({
        data: '[project]\nname = "x"\nversion = "0.0.1"\n',
      }),
    } as Record<string, FileBlob>;
    await download(files, mockWorkPath);

    await expect(
      build({
        workPath: mockWorkPath,
        files,
        entrypoint: 'app.py',
        meta: { isDev: true },
        config: { handlerFunction: 'flask_app', framework: 'flask' },
        repoRootPath: mockWorkPath,
      })
    ).rejects.toThrow(/Handler function "flask_app" not found in app\.py/);
  });
});

describe('cron service build result', () => {
  let mockWorkPath: string;

  beforeEach(() => {
    mockWorkPath = path.join(tmpdir(), `python-cron-result-${Date.now()}`);
    fs.mkdirSync(mockWorkPath, { recursive: true });
    makeMockPython('3.11');
  });

  afterEach(() => {
    if (fs.existsSync(mockWorkPath)) {
      fs.removeSync(mockWorkPath);
    }
  });

  it('returns crons with correct path and schedule', async () => {
    const files = {
      'jobs/cleanup.py': new FileBlob({
        data: 'def sync_handler():\n    print("done")\n',
      }),
      'pyproject.toml': new FileBlob({
        data: '[project]\nname = "x"\nversion = "0.0.1"\n',
      }),
    } as Record<string, FileBlob>;

    const result = await build({
      workPath: mockWorkPath,
      files,
      entrypoint: 'jobs/cleanup.py',
      meta: { isDev: false },
      config: { handlerFunction: 'sync_handler' },
      repoRootPath: mockWorkPath,
      service: { type: 'cron', name: 'cleanup', schedule: '0 0 * * *' },
    });

    const v2result = getBuildOutputV2(result);
    expect(v2result.crons).toEqual([
      {
        path: '/_svc/cleanup/crons/jobs/cleanup/sync_handler',
        schedule: '0 0 * * *',
        resolvedHandler: 'jobs.cleanup:sync_handler',
      },
    ]);
  });

  it('does not emit routes (handled by generateServicesRoutes)', async () => {
    const files = {
      'jobs/cleanup.py': new FileBlob({
        data: 'def sync_handler():\n    print("done")\n',
      }),
      'pyproject.toml': new FileBlob({
        data: '[project]\nname = "x"\nversion = "0.0.1"\n',
      }),
    } as Record<string, FileBlob>;

    const result = await build({
      workPath: mockWorkPath,
      files,
      entrypoint: 'jobs/cleanup.py',
      meta: { isDev: false },
      config: { handlerFunction: 'sync_handler' },
      repoRootPath: mockWorkPath,
      service: { type: 'cron', name: 'cleanup', schedule: '0 0 * * *' },
    });

    const v2result = getBuildOutputV2(result);
    expect(v2result.routes).toBeUndefined();
  });

  it('uses default handler name "cron" when no handlerFunction', async () => {
    const files = {
      'jobs/cleanup.py': new FileBlob({
        data: 'def handler():\n    pass\n',
      }),
      'pyproject.toml': new FileBlob({
        data: '[project]\nname = "x"\nversion = "0.0.1"\n',
      }),
    } as Record<string, FileBlob>;

    const result = await build({
      workPath: mockWorkPath,
      files,
      entrypoint: 'jobs/cleanup.py',
      meta: { isDev: false },
      config: {},
      repoRootPath: mockWorkPath,
      service: { type: 'cron', name: 'cleanup', schedule: '*/5 * * * *' },
    });

    const v2result = getBuildOutputV2(result);
    expect(v2result.crons).toEqual([
      {
        path: '/_svc/cleanup/crons/jobs/cleanup/cron',
        schedule: '*/5 * * * *',
        resolvedHandler: 'jobs.cleanup',
      },
    ]);
  });

  it('does not return crons for non-cron services', async () => {
    const files = {
      'app.py': new FileBlob({
        data: 'app = lambda environ, start_response: None\n',
      }),
      'pyproject.toml': new FileBlob({
        data: '[project]\nname = "x"\nversion = "0.0.1"\n',
      }),
    } as Record<string, FileBlob>;
    await download(files, mockWorkPath);

    const result = await build({
      workPath: mockWorkPath,
      files,
      entrypoint: 'app.py',
      meta: { isDev: true },
      config: { framework: 'flask' },
      repoRootPath: mockWorkPath,
      service: { type: 'web', name: 'api' },
    });

    const v2result = getBuildOutputV2(result);
    expect(v2result.crons).toBeUndefined();
  });

  it('does not set __VC_CRON_ROUTES when not a cron service', async () => {
    const files = {
      'handler.py': new FileBlob({
        data: 'def app(environ, start_response): pass',
      }),
      'pyproject.toml': new FileBlob({
        data: '[project]\nname = "x"\nversion = "0.0.1"\n',
      }),
    } as Record<string, FileBlob>;

    const result = await build({
      workPath: mockWorkPath,
      files,
      entrypoint: 'handler.py',
      meta: { isDev: false },
      config: {},
      repoRootPath: mockWorkPath,
    });

    const handler = getBuildOutputV3(result).files?.['vc__handler__python.py'];
    if (!handler || !('data' in handler)) {
      throw new Error('handler bootstrap not found');
    }
    const content = handler.data.toString();
    expect(content).not.toContain('__VC_CRON_ROUTES');
  });
});

describe('dynamic cron detection', () => {
  const mockedExeca = vi.mocked(execa);

  afterEach(() => {
    mockedExeca.mockReset();
  });

  it('returns undefined for non-cron services', async () => {
    const result = await getServiceCrons({
      service: { type: 'web', name: 'api' },
      pythonBin: '/usr/bin/python3',
      env: {},
      workPath: '/tmp/test',
    });
    expect(result).toBeUndefined();
  });

  it('returns static cron for non-dynamic schedule', async () => {
    const result = await getServiceCrons({
      service: { type: 'cron', name: 'cleanup', schedule: '0 0 * * *' },
      entrypoint: 'jobs/cleanup.py',
      handlerFunction: 'sync_handler',
      pythonBin: '/usr/bin/python3',
      env: {},
      workPath: '/tmp/test',
    });
    expect(result).toEqual([
      {
        path: '/_svc/cleanup/crons/jobs/cleanup/sync_handler',
        schedule: '0 0 * * *',
        resolvedHandler: 'jobs.cleanup:sync_handler',
      },
    ]);
  });

  it('calls python and returns dynamic cron entry', async () => {
    mockedExeca.mockResolvedValueOnce({
      stdout: JSON.stringify({
        entries: [
          {
            module_function: 'jobs.cleanup:sync_handler',
            schedule: '0 0 * * *',
          },
        ],
      }),
    } as any);

    const result = await getServiceCrons({
      service: { type: 'cron', name: 'cleanup', schedule: '<dynamic>' },
      entrypoint: 'jobs/cleanup.py',
      handlerFunction: 'get_crons',
      pythonBin: '/usr/bin/python3',
      env: {},
      workPath: '/tmp/test',
    });

    expect(result).toEqual([
      {
        path: '/_svc/cleanup/crons/jobs/cleanup/sync_handler',
        schedule: '0 0 * * *',
        resolvedHandler: 'jobs.cleanup:sync_handler',
      },
    ]);

    // Verify execa was called with the right args
    expect(mockedExeca).toHaveBeenCalledWith(
      '/usr/bin/python3',
      ['-c', expect.any(String), 'jobs.cleanup', 'get_crons'],
      { env: {}, cwd: '/tmp/test' }
    );
  });

  it('throws if dynamic returns 0 entries', async () => {
    mockedExeca.mockResolvedValueOnce({
      stdout: JSON.stringify({ entries: [] }),
    } as any);

    await expect(
      getServiceCrons({
        service: { type: 'cron', name: 'cleanup', schedule: '<dynamic>' },
        entrypoint: 'jobs/cleanup.py',
        handlerFunction: 'get_crons',
        pythonBin: '/usr/bin/python3',
        env: {},
        workPath: '/tmp/test',
      })
    ).rejects.toThrow(/returned no entries/);
  });

  it('returns multiple dynamic cron entries', async () => {
    mockedExeca.mockResolvedValueOnce({
      stdout: JSON.stringify({
        entries: [
          { module_function: 'jobs.cleanup:sync', schedule: '0 0 * * *' },
          { module_function: 'jobs.cleanup:daily', schedule: '0 6 * * *' },
        ],
      }),
    } as any);

    const result = await getServiceCrons({
      service: { type: 'cron', name: 'cleanup', schedule: '<dynamic>' },
      entrypoint: 'jobs/cleanup.py',
      handlerFunction: 'get_crons',
      pythonBin: '/usr/bin/python3',
      env: {},
      workPath: '/tmp/test',
    });

    expect(result).toEqual([
      {
        path: '/_svc/cleanup/crons/jobs/cleanup/sync',
        schedule: '0 0 * * *',
        resolvedHandler: 'jobs.cleanup:sync',
      },
      {
        path: '/_svc/cleanup/crons/jobs/cleanup/daily',
        schedule: '0 6 * * *',
        resolvedHandler: 'jobs.cleanup:daily',
      },
    ]);
  });

  it('throws if handlerFunction is missing for dynamic', async () => {
    await expect(
      getServiceCrons({
        service: { type: 'cron', name: 'cleanup', schedule: '<dynamic>' },
        entrypoint: 'jobs/cleanup.py',
        pythonBin: '/usr/bin/python3',
        env: {},
        workPath: '/tmp/test',
      })
    ).rejects.toThrow(/get_crons/);
  });

  it('throws with structured error when python fails', async () => {
    mockedExeca.mockRejectedValueOnce({
      stdout: JSON.stringify({
        error: "Failed to import module 'jobs.cleanup': No module named 'jobs'",
      }),
      stderr: '',
    });

    await expect(
      getServiceCrons({
        service: { type: 'cron', name: 'cleanup', schedule: '<dynamic>' },
        entrypoint: 'jobs/cleanup.py',
        handlerFunction: 'get_crons',
        pythonBin: '/usr/bin/python3',
        env: {},
        workPath: '/tmp/test',
      })
    ).rejects.toThrow(/Failed to import module/);
  });

  it('throws if module:function lacks colon', async () => {
    mockedExeca.mockResolvedValueOnce({
      stdout: JSON.stringify({
        entries: [{ module_function: 'no_colon_here', schedule: '0 0 * * *' }],
      }),
    } as any);

    await expect(
      getServiceCrons({
        service: { type: 'cron', name: 'cleanup', schedule: '<dynamic>' },
        entrypoint: 'jobs/cleanup.py',
        handlerFunction: 'get_crons',
        pythonBin: '/usr/bin/python3',
        env: {},
        workPath: '/tmp/test',
      })
    ).rejects.toThrow(/module:function/);
  });
});

describe('non-web services should not generate catch-all routes', () => {
  let mockWorkPath: string;

  beforeEach(() => {
    mockWorkPath = path.join(tmpdir(), `python-service-routes-${Date.now()}`);
    fs.mkdirSync(mockWorkPath, { recursive: true });
    makeMockPython('3.11');
  });

  afterEach(() => {
    if (fs.existsSync(mockWorkPath)) {
      fs.removeSync(mockWorkPath);
    }
  });

  it('cron service returns V2 with no routes', async () => {
    const files = {
      'jobs/cleanup.py': new FileBlob({
        data: 'if __name__ == "__main__":\n    print("cleanup done")\n',
      }),
      'pyproject.toml': new FileBlob({
        data: '[project]\nname = "x"\nversion = "0.0.1"\n',
      }),
    } as Record<string, FileBlob>;

    const result = await build({
      workPath: mockWorkPath,
      files,
      entrypoint: 'jobs/cleanup.py',
      meta: { isDev: false },
      config: { framework: 'python' },
      repoRootPath: mockWorkPath,
      service: { type: 'cron', name: 'my-cron' },
    });

    const v2result = getBuildOutputV2(result);
    expect(v2result.output['_svc/my-cron/index']).toBeDefined();
    expect(v2result.routes).toBeUndefined();
  });

  it('worker service returns V2 with no routes', async () => {
    const files = {
      'worker/broker.py': new FileBlob({
        data: [
          'import dramatiq',
          'from vercel.workers.dramatiq import VercelQueuesBroker',
          '',
          'broker = VercelQueuesBroker()',
          'dramatiq.set_broker(broker)',
        ].join('\n'),
      }),
      'worker/tasks.py': new FileBlob({
        data: [
          'import dramatiq',
          '',
          "@dramatiq.actor(queue_name='jobs')",
          'def process_job(payload: dict):',
          "    return {'ok': True, 'payload': payload}",
        ].join('\n'),
      }),
      'worker/run.py': new FileBlob({
        data: [
          'from worker.broker import broker',
          'from worker import tasks',
          '',
          "__all__ = ['broker', 'tasks']",
        ].join('\n'),
      }),
      'pyproject.toml': new FileBlob({
        data: '[project]\nname = "my-worker"\nversion = "0.0.1"\ndependencies = ["dramatiq", "vercel-workers"]\n',
      }),
    } as Record<string, FileBlob>;

    const result = await build({
      workPath: mockWorkPath,
      files,
      entrypoint: 'worker/run.py',
      meta: { isDev: false },
      config: { framework: 'python' },
      repoRootPath: mockWorkPath,
      service: { type: 'worker', name: 'my-worker' },
    });

    const v2result = getBuildOutputV2(result);
    expect(v2result.output['_svc/my-worker/index']).toBeDefined();
    expect(v2result.routes).toBeUndefined();
  });

  it('web service returns V2 with no routes', async () => {
    const files = {
      'main.py': new FileBlob({
        data: 'from fastapi import FastAPI; app = FastAPI()',
      }),
      'pyproject.toml': new FileBlob({
        data: '[project]\nname = "my-api"\nversion = "0.0.1"\ndependencies = ["fastapi"]\n',
      }),
    } as Record<string, FileBlob>;
    await download(files, mockWorkPath);

    const result = await build({
      workPath: mockWorkPath,
      files,
      entrypoint: 'main.py',
      meta: { isDev: false },
      config: { framework: 'fastapi' },
      repoRootPath: mockWorkPath,
      service: { type: 'web', name: 'my-api' },
    });

    const v2result = getBuildOutputV2(result);
    expect(v2result.output['_svc/my-api/index']).toBeDefined();
    expect(v2result.routes).toBeUndefined();
  });
});

describe('python version fallback logging', () => {
  let mockWorkPath: string;
  let consoleLogSpy: MockInstance;

  beforeEach(() => {
    mockWorkPath = path.join(tmpdir(), `python-version-log-${Date.now()}`);
    fs.mkdirSync(mockWorkPath, { recursive: true });
    makeMockPython('3.11');
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    if (fs.existsSync(mockWorkPath)) {
      fs.removeSync(mockWorkPath);
    }
  });

  it('logs when no Python version is specified in pyproject.toml', async () => {
    const files = {
      'handler.py': new FileBlob({
        data: 'def app(environ, start_response): pass',
      }),
      'pyproject.toml': new FileBlob({
        data: '[project]\nname = "myproject"\nversion = "0.1.0"\n',
      }),
    } as Record<string, FileBlob>;

    await build({
      workPath: mockWorkPath,
      files,
      entrypoint: 'handler.py',
      meta: { isDev: false },
      config: {},
      repoRootPath: mockWorkPath,
    });

    // Should log that it's falling back to default/latest installed
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'No Python version specified in .python-version, pyproject.toml, or Pipfile.lock'
      )
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Using python version')
    );
  });

  it('logs when Python version is found in pyproject.toml', async () => {
    const files = {
      'handler.py': new FileBlob({
        data: 'def app(environ, start_response): pass',
      }),
      'pyproject.toml': new FileBlob({
        data: '[project]\nname = "x"\nversion = "0.0.1"\nrequires-python = ">=3.11,<3.13"\n',
      }),
    } as Record<string, FileBlob>;

    await build({
      workPath: mockWorkPath,
      files,
      entrypoint: 'handler.py',
      meta: { isDev: false },
      config: {},
      repoRootPath: mockWorkPath,
    });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Using Python 3.11 from pyproject.toml')
    );
  });

  it('logs when Python version is found in .python-version', async () => {
    const files = {
      'handler.py': new FileBlob({
        data: 'def app(environ, start_response): pass',
      }),
      '.python-version': new FileBlob({ data: '3.11\n' }),
    } as Record<string, FileBlob>;

    await build({
      workPath: mockWorkPath,
      files,
      entrypoint: 'handler.py',
      meta: { isDev: false },
      config: {},
      repoRootPath: mockWorkPath,
    });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Using Python 3.11 from .python-version')
    );
  });
});

describe('.python-version file priority', () => {
  let mockWorkPath: string;
  let consoleLogSpy: MockInstance;
  let consoleWarnSpy: MockInstance;

  beforeEach(() => {
    mockWorkPath = path.join(
      tmpdir(),
      `python-version-file-priority-${Date.now()}`
    );
    fs.mkdirSync(mockWorkPath, { recursive: true });
    makeMockPython('3.10');
    makeMockPython('3.11');
    makeMockPython('3.12');
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    if (fs.existsSync(mockWorkPath)) {
      fs.removeSync(mockWorkPath);
    }
  });

  it('.python-version takes priority over pyproject.toml', async () => {
    const files = {
      'handler.py': new FileBlob({
        data: 'def app(environ, start_response): pass',
      }),
      '.python-version': new FileBlob({ data: '3.10\n' }),
      'pyproject.toml': new FileBlob({
        data: '[project]\nname = "x"\nversion = "0.0.1"\nrequires-python = ">=3.12"\n',
      }),
    } as Record<string, FileBlob>;

    await build({
      workPath: mockWorkPath,
      files,
      entrypoint: 'handler.py',
      meta: { isDev: false },
      config: {},
      repoRootPath: mockWorkPath,
    });

    // Should use 3.10 from .python-version, not 3.12 from pyproject.toml
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Using Python 3.10 from .python-version')
    );
  });

  it('.python-version takes priority over Pipfile.lock', async () => {
    // We also include a pyproject.toml to avoid triggering Pipfile.lock processing
    // which requires pipfile2req. The important part is that .python-version
    // takes priority over the python_version in Pipfile.lock.
    const files = {
      'handler.py': new FileBlob({
        data: 'def app(environ, start_response): pass',
      }),
      '.python-version': new FileBlob({ data: '3.10\n' }),
      'Pipfile.lock': new FileBlob({
        data: JSON.stringify({
          _meta: { requires: { python_version: '3.12' } },
          default: {},
          develop: {},
        }),
      }),
      'pyproject.toml': new FileBlob({
        data: '[project]\nname = "x"\nversion = "0.0.1"\n',
      }),
    } as Record<string, FileBlob>;

    await build({
      workPath: mockWorkPath,
      files,
      entrypoint: 'handler.py',
      meta: { isDev: false },
      config: {},
      repoRootPath: mockWorkPath,
    });

    // Should use 3.10 from .python-version, not 3.12 from Pipfile.lock
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Using Python 3.10 from .python-version')
    );
  });

  it('parses .python-version with patch version (3.11.4 -> 3.11)', async () => {
    const files = {
      'handler.py': new FileBlob({
        data: 'def app(environ, start_response): pass',
      }),
      '.python-version': new FileBlob({ data: '3.11.4\n' }),
    } as Record<string, FileBlob>;

    await build({
      workPath: mockWorkPath,
      files,
      entrypoint: 'handler.py',
      meta: { isDev: false },
      config: {},
      repoRootPath: mockWorkPath,
    });

    // Should extract 3.11 from 3.11.4
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Using Python 3.11 from .python-version')
    );
  });

  it('parses .python-version with comments', async () => {
    const files = {
      'handler.py': new FileBlob({
        data: 'def app(environ, start_response): pass',
      }),
      '.python-version': new FileBlob({
        data: '# This is a comment\n3.11\n',
      }),
    } as Record<string, FileBlob>;

    await build({
      workPath: mockWorkPath,
      files,
      entrypoint: 'handler.py',
      meta: { isDev: false },
      config: {},
      repoRootPath: mockWorkPath,
    });

    // Should skip comment and use 3.11
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Using Python 3.11 from .python-version')
    );
  });

  it('throws error when .python-version has invalid content', async () => {
    const files = {
      'handler.py': new FileBlob({
        data: 'def app(environ, start_response): pass',
      }),
      '.python-version': new FileBlob({ data: 'invalid-version\n' }),
      'pyproject.toml': new FileBlob({
        data: '[project]\nname = "x"\nversion = "0.0.1"\nrequires-python = ">=3.12"\n',
      }),
    } as Record<string, FileBlob>;

    // Should throw an error about invalid .python-version content
    await expect(
      build({
        workPath: mockWorkPath,
        files,
        entrypoint: 'handler.py',
        meta: { isDev: false },
        config: {},
        repoRootPath: mockWorkPath,
      })
    ).rejects.toThrow('could not parse .python-version file');
  });
});

describe('.python-version file auto-creation', () => {
  let mockWorkPath: string;
  let consoleLogSpy: MockInstance;

  beforeEach(() => {
    mockWorkPath = path.join(
      tmpdir(),
      `python-version-file-create-${Date.now()}`
    );
    fs.mkdirSync(mockWorkPath, { recursive: true });
    makeMockPython('3.10');
    makeMockPython('3.11');
    makeMockPython('3.12');
    makeMockPython('3.13');
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    if (fs.existsSync(mockWorkPath)) {
      fs.removeSync(mockWorkPath);
    }
  });

  it('writes .python-version file when pyproject.toml selects version <= 3.12', async () => {
    const files = {
      'handler.py': new FileBlob({
        data: 'def app(environ, start_response): pass',
      }),
      'pyproject.toml': new FileBlob({
        data: '[project]\nname = "x"\nversion = "0.0.1"\nrequires-python = ">=3.9"\n',
      }),
    } as Record<string, FileBlob>;

    await build({
      workPath: mockWorkPath,
      files,
      entrypoint: 'handler.py',
      meta: { isDev: false },
      config: {},
      repoRootPath: mockWorkPath,
    });

    // Should log that it's writing .python-version file
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Writing .python-version file with version 3.12')
    );

    // Verify the file was created
    const pythonVersionPath = path.join(mockWorkPath, '.python-version');
    expect(fs.existsSync(pythonVersionPath)).toBe(true);
    const content = fs.readFileSync(pythonVersionPath, 'utf8');
    expect(content.trim()).toBe('3.12');
  });

  it('does NOT write .python-version file when one already exists', async () => {
    const files = {
      'handler.py': new FileBlob({
        data: 'def app(environ, start_response): pass',
      }),
      '.python-version': new FileBlob({ data: '3.11\n' }),
      'pyproject.toml': new FileBlob({
        data: '[project]\nname = "x"\nversion = "0.0.1"\nrequires-python = ">=3.9"\n',
      }),
    } as Record<string, FileBlob>;

    await build({
      workPath: mockWorkPath,
      files,
      entrypoint: 'handler.py',
      meta: { isDev: false },
      config: {},
      repoRootPath: mockWorkPath,
    });

    // Should NOT log about writing .python-version file
    expect(consoleLogSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Writing .python-version file')
    );

    // Should use existing .python-version
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Using Python 3.11 from .python-version')
    );
  });

  it('does NOT write .python-version file when selecting 3.13+', async () => {
    const files = {
      'handler.py': new FileBlob({
        data: 'def app(environ, start_response): pass',
      }),
      'pyproject.toml': new FileBlob({
        data: '[project]\nname = "x"\nversion = "0.0.1"\nrequires-python = ">=3.13"\n',
      }),
    } as Record<string, FileBlob>;

    await build({
      workPath: mockWorkPath,
      files,
      entrypoint: 'handler.py',
      meta: { isDev: false },
      config: {},
      repoRootPath: mockWorkPath,
    });

    // Should NOT log about writing .python-version file
    expect(consoleLogSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Writing .python-version file')
    );

    // Should use 3.13 from pyproject.toml
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Using Python 3.13 from pyproject.toml')
    );
  });

  it('does NOT write .python-version file for Pipfile.lock projects', async () => {
    // Include pyproject.toml to avoid triggering pipfile2req
    const files = {
      'handler.py': new FileBlob({
        data: 'def app(environ, start_response): pass',
      }),
      'Pipfile.lock': new FileBlob({
        data: JSON.stringify({
          _meta: { requires: { python_version: '3.11' } },
          default: {},
          develop: {},
        }),
      }),
      'pyproject.toml': new FileBlob({
        data: '[project]\nname = "x"\nversion = "0.0.1"\n',
      }),
    } as Record<string, FileBlob>;

    await build({
      workPath: mockWorkPath,
      files,
      entrypoint: 'handler.py',
      meta: { isDev: false },
      config: {},
      repoRootPath: mockWorkPath,
    });

    // Should NOT log about writing .python-version file (no requires-python in pyproject.toml)
    expect(consoleLogSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Writing .python-version file')
    );
  });
});

describe('uv install path', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('which');
    vi.doUnmock('execa');
    vi.doUnmock('../src/install');
  });

  it('uses uv to install requirement (no fallback to pip)', async () => {
    const mockExeca: any = vi.fn(async () => ({ stdout: '' }));
    mockExeca.stdout = vi.fn(async () => '');

    vi.doMock('which', () => ({
      default: { sync: vi.fn(() => '/mock/uv') },
    }));

    vi.doMock('execa', () => ({
      default: mockExeca,
    }));

    // Clear the hoisted mock and re-import fresh
    vi.doUnmock('../src/install');
    const { installRequirement } = await import('../src/install');

    const workPath = path.join(tmpdir(), `python-uv-test-${Date.now()}`);
    fs.mkdirSync(workPath, { recursive: true });

    try {
      await installRequirement({
        pythonPath: '/usr/bin/python3',
        pipPath: '/usr/bin/pip3',
        uvPath: '/mock/uv',
        dependency: 'foo',
        version: '1.2.3',
        workPath,
        meta: { isDev: false },
      });
    } finally {
      if (fs.existsSync(workPath)) fs.removeSync(workPath);
    }

    expect(mockExeca).toHaveBeenCalled();
    const [cmd, args, opts] = mockExeca.mock.calls[0];
    expect(cmd).toBe('/mock/uv');
    expect(args.slice(0, 2)).toEqual(['pip', 'install']);
    expect(args).toContain('--target');
    expect(args).toContain('_vendor');
    expect(args).toContain('foo==1.2.3');
    expect(opts).toHaveProperty('cwd', workPath);
  });
});

describe('custom install hooks', () => {
  beforeEach(() => {
    vi.resetModules();
    makeMockPython('3.12');
  });

  afterEach(() => {
    vi.doUnmock('which');
    vi.doUnmock('execa');
    vi.doUnmock('@vercel/build-utils');
    vi.doUnmock('../src/install');
    vi.doUnmock('../src/utils');
    vi.doUnmock('../src/dependency-externalizer');
    vi.doUnmock('../src/index');
    vi.doUnmock('../src/uv');
  });

  it('uses projectSettings.installCommand instead of uv install for FastAPI', async () => {
    const mockExecCommand = vi.fn(async () => {});
    const mockEnsureUvProject = vi.fn(async () => ({
      projectDir: '/mock/project',
      pyprojectPath: '/mock/project/pyproject.toml',
      lockPath: '/mock/project/uv.lock',
    }));

    const realBuildUtils = await vi.importActual<
      typeof import('@vercel/build-utils')
    >('@vercel/build-utils');
    vi.doMock('@vercel/build-utils', () => ({
      ...realBuildUtils,
      execCommand: mockExecCommand,
    }));

    const realInstall =
      await vi.importActual<typeof import('../src/install')>('../src/install');
    vi.doMock('../src/install', () => ({
      ...realInstall,
      ensureUvProject: mockEnsureUvProject,
      getVenvSitePackagesDirs: vi.fn(async () => []),
    }));

    const realUtils =
      await vi.importActual<typeof import('../src/utils')>('../src/utils');
    vi.doMock('../src/utils', () => ({
      ...realUtils,
      ensureVenv: vi.fn(async () => {}),
    }));

    // Import after mocks are configured
    const { build: buildWithMocks } = await import('../src/index');

    const workPath = path.join(tmpdir(), `python-custom-install-${Date.now()}`);
    fs.mkdirSync(workPath, { recursive: true });

    const files = {
      'handler.py': new FileBlob({
        data: 'def app(environ, start_response): pass',
      }),
    } as Record<string, FileBlob>;

    try {
      await buildWithMocks({
        workPath,
        files,
        entrypoint: 'handler.py',
        meta: { isDev: false },
        config: {
          framework: 'fastapi',
          projectSettings: {
            installCommand: 'echo custom-install',
          },
        },
        repoRootPath: workPath,
      });
    } finally {
      if (fs.existsSync(workPath)) fs.removeSync(workPath);
    }

    // Custom install should be used, so uv-based install should be skipped
    expect(mockEnsureUvProject).not.toHaveBeenCalled();
    expect(mockExecCommand).toHaveBeenCalledWith(
      'echo custom-install',
      expect.objectContaining({
        cwd: workPath,
        env: expect.objectContaining({
          VIRTUAL_ENV: expect.any(String),
          UV_PROJECT_ENVIRONMENT: expect.any(String),
          UV_NO_DEV: 'true',
        }),
      })
    );
  });

  it('uses pyproject.toml install script when no projectSettings.installCommand', async () => {
    const mockExecCommand = vi.fn(async () => {});
    const mockEnsureUvProject = vi.fn(async () => ({
      projectDir: '/mock/project',
      pyprojectPath: '/mock/project/pyproject.toml',
      lockPath: '/mock/project/uv.lock',
    }));

    const realBuildUtils = await vi.importActual<
      typeof import('@vercel/build-utils')
    >('@vercel/build-utils');
    vi.doMock('@vercel/build-utils', () => ({
      ...realBuildUtils,
      execCommand: mockExecCommand,
    }));

    const realInstall =
      await vi.importActual<typeof import('../src/install')>('../src/install');
    vi.doMock('../src/install', () => ({
      ...realInstall,
      ensureUvProject: mockEnsureUvProject,
      getVenvSitePackagesDirs: vi.fn(async () => []),
    }));

    const realUtils =
      await vi.importActual<typeof import('../src/utils')>('../src/utils');
    vi.doMock('../src/utils', () => ({
      ...realUtils,
      ensureVenv: vi.fn(async () => {}),
    }));

    // Import after mocks are configured
    const { build: buildWithMocks } = await import('../src/index');

    const workPath = path.join(
      tmpdir(),
      `python-custom-install-pyproject-${Date.now()}`
    );
    fs.mkdirSync(workPath, { recursive: true });

    const files = {
      'handler.py': new FileBlob({
        data: 'def app(environ, start_response): pass',
      }),
      'pyproject.toml': new FileBlob({
        data: [
          '[project]',
          'name = "x"',
          'version = "0.0.1"',
          '',
          '[tool.vercel.scripts]',
          'vercel-install = "echo pyproject-install"',
          '',
        ].join('\n'),
      }),
    } as Record<string, FileBlob>;

    try {
      await buildWithMocks({
        workPath,
        files,
        entrypoint: 'handler.py',
        meta: { isDev: false },
        config: {
          framework: 'fastapi',
        },
        repoRootPath: workPath,
      });
    } finally {
      if (fs.existsSync(workPath)) fs.removeSync(workPath);
    }

    // pyproject install should be used, so uv-based install should be skipped
    expect(mockEnsureUvProject).not.toHaveBeenCalled();
    expect(mockExecCommand).toHaveBeenCalledWith(
      'echo pyproject-install',
      expect.objectContaining({
        cwd: workPath,
        env: expect.any(Object),
      })
    );
  });

  it('falls back to uv install when no custom install is configured', async () => {
    const mockExecCommand = vi.fn(async () => {});
    const mockEnsureUvProject = vi.fn(async () => ({
      projectDir: '/mock/project',
      pyprojectPath: '/mock/project/pyproject.toml',
      lockPath: '/mock/project/uv.lock',
    }));
    const mockUvSync = vi.fn(async () => {});

    const realBuildUtils = await vi.importActual<
      typeof import('@vercel/build-utils')
    >('@vercel/build-utils');
    vi.doMock('@vercel/build-utils', () => ({
      ...realBuildUtils,
      execCommand: mockExecCommand,
    }));

    const realInstall =
      await vi.importActual<typeof import('../src/install')>('../src/install');
    vi.doMock('../src/install', () => ({
      ...realInstall,
      ensureUvProject: mockEnsureUvProject,
      getVenvSitePackagesDirs: vi.fn(async () => []),
    }));

    const realUtils =
      await vi.importActual<typeof import('../src/utils')>('../src/utils');
    vi.doMock('../src/utils', () => ({
      ...realUtils,
      ensureVenv: vi.fn(async () => {}),
    }));

    // Mock UvRunner to prevent actual uv sync commands
    const realUv =
      await vi.importActual<typeof import('../src/uv')>('../src/uv');
    vi.doMock('../src/uv', () => ({
      ...realUv,
      UvRunner: createMockUvRunner({ onSync: mockUvSync }),
    }));

    // Import after mocks are configured
    const { build: buildWithMocks } = await import('../src/index');

    const workPath = path.join(
      tmpdir(),
      `python-custom-install-default-${Date.now()}`
    );
    fs.mkdirSync(workPath, { recursive: true });

    const files = {
      'handler.py': new FileBlob({
        data: 'def app(environ, start_response): pass',
      }),
    } as Record<string, FileBlob>;

    try {
      await buildWithMocks({
        workPath,
        files,
        entrypoint: 'handler.py',
        meta: { isDev: false },
        config: {
          framework: 'fastapi',
        },
        repoRootPath: workPath,
      });
    } finally {
      if (fs.existsSync(workPath)) fs.removeSync(workPath);
    }

    // No custom install -> uv-based install should be used
    expect(mockEnsureUvProject).toHaveBeenCalled();
    // uv sync should have been called
    expect(mockUvSync).toHaveBeenCalled();
    // execCommand should not have been called for install or build
    expect(mockExecCommand).not.toHaveBeenCalled();
  });
});

describe('worker services dependency installation', () => {
  async function buildWithPipSpy(
    options: { hasWorkerServices?: boolean } = {}
  ) {
    const pipCalls: string[][] = [];

    const realInstall =
      await vi.importActual<typeof import('../src/install')>('../src/install');
    vi.doMock('../src/install', () => ({
      ...realInstall,
      // Keep this suite focused on dependency install behavior and avoid
      // probing a real venv python binary during quirk scanning.
      getVenvSitePackagesDirs: vi.fn(async () => []),
    }));

    const realUtils =
      await vi.importActual<typeof import('../src/utils')>('../src/utils');
    vi.doMock('../src/utils', () => ({
      ...realUtils,
      // Avoid creating a real virtualenv in unit tests.
      ensureVenv: vi.fn(async () => {}),
    }));
    const realUv =
      await vi.importActual<typeof import('../src/uv')>('../src/uv');
    vi.doMock('../src/uv', () => ({
      ...realUv,
      UvRunner: class {
        getPath() {
          return '/mock/uv';
        }
        listInstalledPythons() {
          return new Set(mockInstalledVersions);
        }
        async sync() {}
        async lock() {}
        async pip(options: { args: string[] }) {
          pipCalls.push(options.args);
        }
      },
    }));

    // Worker dependency installation happens before dependency externalization.
    // Mock externalization to keep this test focused on install behavior.
    vi.doMock('../src/dependency-externalizer', () => ({
      PythonDependencyExternalizer: class {
        async analyze() {
          return { overLambdaLimit: false, allVendorFiles: {} };
        }
        async generateBundle() {}
      },
    }));

    const { build: buildWithMocks } = await import('../src/index');

    const workPath = path.join(
      tmpdir(),
      `python-worker-services-install-${Date.now()}`
    );
    fs.mkdirSync(workPath, { recursive: true });

    const files = {
      'handler.py': new FileBlob({
        data: 'def app(environ, start_response): pass',
      }),
    } as Record<string, FileBlob>;

    try {
      await buildWithMocks({
        workPath,
        files,
        entrypoint: 'handler.py',
        meta: { isDev: false },
        config: {
          framework: 'services',
          ...(options.hasWorkerServices === true
            ? { hasWorkerServices: true }
            : {}),
        },
        repoRootPath: workPath,
      });
    } finally {
      if (fs.existsSync(workPath)) fs.removeSync(workPath);
    }

    return pipCalls;
  }

  beforeEach(() => {
    vi.resetModules();
    makeMockPython('3.12');
    delete process.env.VERCEL_WORKERS_PYTHON;
  });

  afterEach(() => {
    delete process.env.VERCEL_WORKERS_PYTHON;
    vi.doUnmock('../src/dependency-externalizer');
    vi.doUnmock('../src/install');
    vi.doUnmock('../src/index');
    vi.doUnmock('../src/utils');
    vi.doUnmock('../src/uv');
  });

  it('installs vercel-workers when worker services are enabled', async () => {
    const pipCalls = await buildWithPipSpy({ hasWorkerServices: true });
    const workersDep = `vercel-workers==${VERCEL_WORKERS_VERSION}`;
    expect(pipCalls.some(args => args.includes(workersDep))).toBe(true);
  });

  it('does not install vercel-workers when worker services are not enabled', async () => {
    const pipCalls = await buildWithPipSpy();
    expect(
      pipCalls.some(args =>
        args.some(arg => arg.startsWith('vercel-workers=='))
      )
    ).toBe(false);
  });

  it('uses VERCEL_WORKERS_PYTHON override when provided', async () => {
    process.env.VERCEL_WORKERS_PYTHON =
      'vercel-workers @ file:///tmp/vercel-workers.whl';
    const pipCalls = await buildWithPipSpy({ hasWorkerServices: true });
    expect(
      pipCalls.some(args =>
        args.includes('vercel-workers @ file:///tmp/vercel-workers.whl')
      )
    ).toBe(true);
  });
});

describe('UV_PYTHON_DOWNLOADS environment variable protection', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getProtectedUvEnv', () => {
    it('sets UV_PYTHON_DOWNLOADS to the configured mode by default', () => {
      const env = getProtectedUvEnv({});
      expect(env.UV_PYTHON_DOWNLOADS).toBe(UV_PYTHON_DOWNLOADS_MODE);
    });

    it('overrides UV_PYTHON_DOWNLOADS when user tries to set it to "auto"', () => {
      const userEnv = { UV_PYTHON_DOWNLOADS: 'auto' };
      const env = getProtectedUvEnv(userEnv);
      expect(env.UV_PYTHON_DOWNLOADS).toBe(UV_PYTHON_DOWNLOADS_MODE);
    });

    it('overrides UV_PYTHON_DOWNLOADS when user tries to unset it (undefined)', () => {
      const userEnv = { UV_PYTHON_DOWNLOADS: undefined };
      const env = getProtectedUvEnv(userEnv);
      expect(env.UV_PYTHON_DOWNLOADS).toBe(UV_PYTHON_DOWNLOADS_MODE);
    });

    it('overrides UV_PYTHON_DOWNLOADS when user tries to set empty string', () => {
      const userEnv = { UV_PYTHON_DOWNLOADS: '' };
      const env = getProtectedUvEnv(userEnv);
      expect(env.UV_PYTHON_DOWNLOADS).toBe(UV_PYTHON_DOWNLOADS_MODE);
    });

    it('overrides UV_PYTHON_DOWNLOADS from process.env', () => {
      process.env.UV_PYTHON_DOWNLOADS = 'foobar';
      const env = getProtectedUvEnv();
      expect(env.UV_PYTHON_DOWNLOADS).toBe(UV_PYTHON_DOWNLOADS_MODE);
    });

    it('preserves other environment variables from baseEnv', () => {
      const userEnv = {
        HOME: '/home/user',
        UV_PYTHON_DOWNLOADS: 'auto',
      };
      const env = getProtectedUvEnv(userEnv);

      expect(env.HOME).toBe('/home/user');
      expect(env.UV_PYTHON_DOWNLOADS).toBe(UV_PYTHON_DOWNLOADS_MODE);
    });

    it('sets UV_CACHE_DIR when provided', () => {
      const cacheDir = '/tmp/project/.vercel/python/cache/uv';
      const env = getProtectedUvEnv({}, cacheDir);
      expect(env.UV_CACHE_DIR).toBe(cacheDir);
    });

    it('does not set UV_CACHE_DIR when not provided', () => {
      const env = getProtectedUvEnv({});
      expect(env.UV_CACHE_DIR).toBeUndefined();
    });
  });

  describe('getUvCacheDir', () => {
    it('returns the correct cache directory path', () => {
      expect(getUvCacheDir('/repo')).toBe('/repo/.vercel/python/cache/uv');
    });
  });

  describe('createVenvEnv', () => {
    it('sets VIRTUAL_ENV and PATH correctly while protecting uv env', () => {
      process.env.UV_PYTHON_DOWNLOADS = 'manual';
      process.env.PATH = '/usr/bin';
      const venvPath = '/path/to/venv';
      const cacheDir = getUvCacheDir('/repo');
      const env = createVenvEnv(venvPath, process.env, cacheDir);

      expect(env.VIRTUAL_ENV).toBe(venvPath);
      expect(env.UV_PROJECT_ENVIRONMENT).toBe(venvPath);
      expect(env.UV_NO_DEV).toBe('true');
      expect(env.PATH).toContain(getVenvBinDir(venvPath));
      expect(env.PATH).toContain('/usr/bin');
      expect(env.UV_PYTHON_DOWNLOADS).toBe(UV_PYTHON_DOWNLOADS_MODE);
      expect(env.UV_CACHE_DIR).toBe(cacheDir);
    });
  });
});

describe('ensureVenv uv invocation', () => {
  // The top-level `vi.mock('../src/utils', ...)` replaces `ensureVenv` with
  // a no-op for build-pipeline tests.  This suite needs the real
  // implementation, so it resets modules and unmocks `../src/utils` before
  // re-importing.
  let mockExeca: ReturnType<typeof vi.fn>;
  let ensureVenvReal: typeof import('../src/utils').ensureVenv;
  let venvDir: string;

  beforeEach(async () => {
    vi.resetModules();
    mockExeca = vi.fn(async () => ({ stdout: '' }) as any);
    vi.doMock('execa', () => ({ default: mockExeca }));
    vi.doUnmock('../src/utils');
    ({ ensureVenv: ensureVenvReal } = await import('../src/utils'));
    venvDir = path.join(
      tmpdir(),
      `vc-test-ensure-venv-${Math.floor(Math.random() * 1e6)}`
    );
  });

  afterEach(() => {
    vi.doUnmock('execa');
    if (fs.existsSync(venvDir)) {
      fs.removeSync(venvDir);
    }
  });

  it('omits --python when major/minor are undefined (vercel dev)', async () => {
    // Simulates `getDevPythonVersion()` which now leaves major/minor
    // undefined so uv resolves the interpreter via its own chain
    // (`.python-version`, managed default, system `python3`).  uv >= 0.10.11
    // rejects `--python 3.0`, so passing no `--python` here is required.
    await ensureVenvReal({
      pythonVersion: { pythonPath: 'python3' },
      venvPath: venvDir,
      uvPath: '/mock/uv',
    });

    expect(mockExeca).toHaveBeenCalledTimes(1);
    const [cmd, args] = mockExeca.mock.calls[0];
    expect(cmd).toBe('/mock/uv');
    expect(args).toEqual(['venv', venvDir, '--allow-existing', '--seed']);
    expect(args).not.toContain('--python');
  });

  it('passes --python <major>.<minor> for a pinned production version', async () => {
    await ensureVenvReal({
      pythonVersion: {
        pythonPath: 'python3.12',
        major: 3,
        minor: 12,
      },
      venvPath: venvDir,
      uvPath: '/mock/uv',
    });

    expect(mockExeca).toHaveBeenCalledTimes(1);
    const [cmd, args] = mockExeca.mock.calls[0];
    expect(cmd).toBe('/mock/uv');
    expect(args).toEqual([
      'venv',
      venvDir,
      '--allow-existing',
      '--seed',
      '--python',
      '3.12',
    ]);
  });
});
