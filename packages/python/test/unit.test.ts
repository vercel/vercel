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
vi.mock('../src/install', async () => {
  const real =
    await vi.importActual<typeof import('../src/install')>('../src/install');
  return {
    ...real,
    mirrorSitePackagesIntoVendor: vi.fn(async () => ({})),
  };
});

// Imports after mocks are set up (vitest hoists vi.mock calls)
import {
  getSupportedPythonVersion,
  DEFAULT_PYTHON_VERSION,
  resetInstalledPythonsCache,
} from '../src/version';
import { build } from '../src/index';
import { createVenvEnv, getVenvBinDir } from '../src/utils';
import { UV_PYTHON_DOWNLOADS_MODE, getProtectedUvEnv } from '../src/uv';
import { createPyprojectToml } from '../src/install';
import { FileBlob } from '@vercel/build-utils';
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
    constructor() {}
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

it('should only match supported versions, otherwise throw an error', () => {
  makeMockPython('3.9');
  const result = getSupportedPythonVersion({
    declaredPythonVersion: { version: '3.9', source: 'Pipfile.lock' },
  });
  expect(result).toHaveProperty('runtime', 'python3.9');
});

it('should ignore minor version in vercel dev', () => {
  expect(
    getSupportedPythonVersion({
      declaredPythonVersion: { version: '3.9', source: 'Pipfile.lock' },
      isDev: true,
    })
  ).toHaveProperty('runtime', 'python3');
  expect(
    getSupportedPythonVersion({
      declaredPythonVersion: { version: '3.6', source: 'Pipfile.lock' },
      isDev: true,
    })
  ).toHaveProperty('runtime', 'python3');
  expect(
    getSupportedPythonVersion({
      declaredPythonVersion: { version: '999', source: 'Pipfile.lock' },
      isDev: true,
    })
  ).toHaveProperty('runtime', 'python3');
  expect(warningMessages).toStrictEqual([]);
});

describe('requires-python range parsing', () => {
  it('selects latest installed within range ">=3.10,<3.12"', () => {
    makeMockPython('3.10');
    makeMockPython('3.11');
    const result = getSupportedPythonVersion({
      declaredPythonVersion: {
        version: '>=3.10,<3.12',
        source: 'pyproject.toml',
      },
    });
    expect(result).toHaveProperty('runtime', 'python3.11');
  });

  it('selects highest allowed when upper bound inclusive (>=3.10,<=3.12)', () => {
    makeMockPython('3.11');
    makeMockPython('3.12');
    const result = getSupportedPythonVersion({
      declaredPythonVersion: {
        version: '>=3.10,<=3.12',
        source: 'pyproject.toml',
      },
    });
    expect(result).toHaveProperty('runtime', 'python3.12');
  });

  it('respects compatible release "~=3.10" (>=3.10,<3.11)', () => {
    makeMockPython('3.10');
    makeMockPython('3.11');
    const result = getSupportedPythonVersion({
      declaredPythonVersion: {
        version: '~=3.10',
        source: 'pyproject.toml',
      },
    });
    expect(result).toHaveProperty('runtime', 'python3.10');
  });
});

describe('Python 3.13 and 3.14 support', () => {
  it('selects Python 3.13 when specified in requires-python', () => {
    makeMockPython('3.12');
    makeMockPython('3.13');
    const result = getSupportedPythonVersion({
      declaredPythonVersion: {
        version: '>=3.13',
        source: 'pyproject.toml',
      },
    });
    expect(result).toHaveProperty('runtime', 'python3.13');
  });

  it('selects Python 3.14 when specified in requires-python', () => {
    makeMockPython('3.13');
    makeMockPython('3.14');
    const result = getSupportedPythonVersion({
      declaredPythonVersion: {
        version: '>=3.14',
        source: 'pyproject.toml',
      },
    });
    expect(result).toHaveProperty('runtime', 'python3.14');
  });

  it('prefers DEFAULT_PYTHON_VERSION (3.12) when range allows it', () => {
    // Even though 3.13 and 3.14 are installed and match >=3.12,
    // we prefer 3.12 to make 3.13+ opt-in only
    makeMockPython('3.12');
    makeMockPython('3.13');
    makeMockPython('3.14');
    const result = getSupportedPythonVersion({
      declaredPythonVersion: {
        version: '>=3.12',
        source: 'pyproject.toml',
      },
    });
    expect(result).toHaveProperty('runtime', 'python3.12');
  });

  it('prefers 3.12 when upper bound excludes 3.14 but includes 3.12', () => {
    // >=3.12,<3.14 allows 3.12 and 3.13, but we prefer 3.12
    makeMockPython('3.12');
    makeMockPython('3.13');
    makeMockPython('3.14');
    const result = getSupportedPythonVersion({
      declaredPythonVersion: {
        version: '>=3.12,<3.14',
        source: 'pyproject.toml',
      },
    });
    expect(result).toHaveProperty('runtime', 'python3.12');
  });

  it('respects compatible release "~=3.13" (>=3.13,<3.14)', () => {
    makeMockPython('3.13');
    makeMockPython('3.14');
    const result = getSupportedPythonVersion({
      declaredPythonVersion: {
        version: '~=3.13',
        source: 'pyproject.toml',
      },
    });
    expect(result).toHaveProperty('runtime', 'python3.13');
  });

  it('respects compatible release "~=3.14" (>=3.14,<3.15)', () => {
    makeMockPython('3.13');
    makeMockPython('3.14');
    const result = getSupportedPythonVersion({
      declaredPythonVersion: {
        version: '~=3.14',
        source: 'pyproject.toml',
      },
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
    const result = getSupportedPythonVersion({
      declaredPythonVersion: {
        version: '>=3.9',
        source: 'pyproject.toml',
      },
    });
    expect(result).toHaveProperty('runtime', 'python3.12');
  });

  it('prefers 3.12 for range >=3.11,<=3.13', () => {
    // This range includes 3.11, 3.12, and 3.13, but we prefer 3.12
    makeMockPython('3.11');
    makeMockPython('3.12');
    makeMockPython('3.13');
    const result = getSupportedPythonVersion({
      declaredPythonVersion: {
        version: '>=3.11,<=3.13',
        source: 'pyproject.toml',
      },
    });
    expect(result).toHaveProperty('runtime', 'python3.12');
  });

  it('falls back to latest when 3.12 is not installed but matches', () => {
    // If 3.12 matches but is not installed, fall back to latest installed
    makeMockPython('3.13');
    makeMockPython('3.14');
    // Note: NOT installing 3.12
    const result = getSupportedPythonVersion({
      declaredPythonVersion: {
        version: '>=3.12',
        source: 'pyproject.toml',
      },
    });
    // Should fall back to 3.14 (latest installed that matches)
    expect(result).toHaveProperty('runtime', 'python3.14');
  });
});

describe('.python-version file support', () => {
  it('selects Python version from .python-version source', () => {
    makeMockPython('3.11');
    makeMockPython('3.12');
    const result = getSupportedPythonVersion({
      declaredPythonVersion: {
        version: '3.11',
        source: '.python-version',
      },
    });
    expect(result).toHaveProperty('runtime', 'python3.11');
  });

  it('uses exact match for .python-version (like Pipfile.lock)', () => {
    makeMockPython('3.10');
    makeMockPython('3.11');
    makeMockPython('3.12');
    const result = getSupportedPythonVersion({
      declaredPythonVersion: {
        version: '3.10',
        source: '.python-version',
      },
    });
    // Should match exactly 3.10, not pick the latest
    expect(result).toHaveProperty('runtime', 'python3.10');
  });

  it('warns and falls back when .python-version specifies unavailable version', () => {
    makeMockPython('3.12');
    makeMockPython('3.13');
    // Request 3.9 which is not installed
    const result = getSupportedPythonVersion({
      declaredPythonVersion: {
        version: '3.9',
        source: '.python-version',
      },
    });
    // Should fall back to default
    expect(result).toHaveProperty('runtime', 'python3.12');
    expect(warningMessages[0]).toContain('not installed and will be ignored');
  });

  it('warns and falls back when .python-version specifies invalid version', () => {
    makeMockPython('3.12');
    const result = getSupportedPythonVersion({
      declaredPythonVersion: {
        version: 'invalid',
        source: '.python-version',
      },
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
      getSupportedPythonVersion({
        declaredPythonVersion: {
          version: '3.11',
          source: '.python-version',
        },
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
  it('uses DEFAULT_PYTHON_VERSION when no version specified and default is installed', () => {
    makeMockPython('3.13');
    makeMockPython('3.14');
    makeMockPython(DEFAULT_PYTHON_VERSION);
    const result = getSupportedPythonVersion({
      declaredPythonVersion: undefined,
    });
    expect(result).toHaveProperty('runtime', `python${DEFAULT_PYTHON_VERSION}`);
  });

  it('falls back to latest installed when default is not installed', () => {
    makeMockPython('3.13');
    makeMockPython('3.14');
    // Note: NOT installing DEFAULT_PYTHON_VERSION (3.12)
    const result = getSupportedPythonVersion({
      declaredPythonVersion: undefined,
    });
    // Should pick 3.14 as the latest installed
    expect(result).toHaveProperty('runtime', 'python3.14');
  });

  it('respects explicit version even when default is installed', () => {
    makeMockPython(DEFAULT_PYTHON_VERSION);
    makeMockPython('3.13');
    makeMockPython('3.14');
    const result = getSupportedPythonVersion({
      declaredPythonVersion: {
        version: '>=3.14',
        source: 'pyproject.toml',
      },
    });
    // Should pick 3.14 because it was explicitly requested
    expect(result).toHaveProperty('runtime', 'python3.14');
  });

  it('DEFAULT_PYTHON_VERSION constant is exported and has expected value', () => {
    expect(DEFAULT_PYTHON_VERSION).toBe('3.12');
  });
});

describe('fallback behavior when requested version is not installed', () => {
  it('falls back to DEFAULT_PYTHON_VERSION when Pipfile.lock requests unavailable version', () => {
    // Setup: 3.14, 3.13, 3.12 are installed, but NOT 3.9
    makeMockPython('3.14');
    makeMockPython('3.13');
    makeMockPython(DEFAULT_PYTHON_VERSION); // 3.12

    const result = getSupportedPythonVersion({
      declaredPythonVersion: { version: '3.9', source: 'Pipfile.lock' },
    });

    // Should fall back to 3.12 (the default), NOT 3.14 (the latest)
    expect(result).toHaveProperty('runtime', `python${DEFAULT_PYTHON_VERSION}`);
    expect(warningMessages[0]).toContain('not installed and will be ignored');
  });

  it('falls back to latest installed when requested AND default are both unavailable', () => {
    // Setup: 3.14, 3.13 are installed, but NOT 3.9 or 3.12
    makeMockPython('3.14');
    makeMockPython('3.13');
    // Note: NOT installing 3.12 (default) or 3.9 (requested)

    const result = getSupportedPythonVersion({
      declaredPythonVersion: { version: '3.9', source: 'Pipfile.lock' },
    });

    // Should fall back to 3.14 (latest installed) since 3.12 is also unavailable
    expect(result).toHaveProperty('runtime', 'python3.14');
    expect(warningMessages[0]).toContain('not installed and will be ignored');
  });

  it('falls back to DEFAULT_PYTHON_VERSION when pyproject.toml requests unavailable version', () => {
    // Setup: 3.14, 3.13, 3.12 are installed, but NOT 3.9
    makeMockPython('3.14');
    makeMockPython('3.13');
    makeMockPython(DEFAULT_PYTHON_VERSION); // 3.12

    const result = getSupportedPythonVersion({
      declaredPythonVersion: { version: '==3.9', source: 'pyproject.toml' },
    });

    // Should fall back to 3.12 (the default), NOT 3.14 (the latest)
    expect(result).toHaveProperty('runtime', `python${DEFAULT_PYTHON_VERSION}`);
    expect(warningMessages[0]).toContain('not installed and will be ignored');
  });
});

describe('createPyprojectToml', () => {
  it('sets requires-python to compatible release of DEFAULT_PYTHON_VERSION when no pythonVersion provided', async () => {
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
        `requires-python = "~=${DEFAULT_PYTHON_VERSION}.0"`
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
  const result = getSupportedPythonVersion({
    declaredPythonVersion: undefined,
  });
  expect(result).toHaveProperty('runtime');
  // When default version isn't installed, falls back to latest available
  expect(result.runtime).toMatch(/^python3\.\d+$/);
  expect(warningMessages).toStrictEqual([]);
});

it('should select latest supported installed version and warn when invalid Piplock detected', () => {
  makeMockPython('3.10');
  const result = getSupportedPythonVersion({
    declaredPythonVersion: { version: '999', source: 'Pipfile.lock' },
  });
  expect(result).toHaveProperty('runtime');
  expect(result.runtime).toMatch(/^python3\.\d+$/);
  expect(warningMessages).toStrictEqual([
    'Warning: Python version "999" detected in Pipfile.lock is invalid and will be ignored. https://vercel.link/python-version',
  ]);
});

it('should throw if uv not found', () => {
  expect(() =>
    getSupportedPythonVersion({
      declaredPythonVersion: { version: '3.6', source: 'Pipfile.lock' },
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
    getSupportedPythonVersion({
      declaredPythonVersion: { version: '3.6', source: 'Pipfile.lock' },
    })
  ).toThrow('Unable to find any supported Python versions.');
  expect(warningMessages).toStrictEqual([]);
});

it('should throw for discontinued versions', () => {
  global.Date.now = () => new Date('2022-07-31').getTime();
  makeMockPython('3.6');

  expect(() =>
    getSupportedPythonVersion({
      declaredPythonVersion: { version: '3.6', source: 'Pipfile.lock' },
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
    getSupportedPythonVersion({
      declaredPythonVersion: { version: '3.6', source: 'Pipfile.lock' },
    })
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
      'handler.py': new FileBlob({ data: 'def handler(): pass' }),
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

    const outputFiles = Object.keys(result.output.files || {});
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
      'handler.py': new FileBlob({ data: 'def handler(): pass' }),
      'secret.txt': new FileBlob({ data: 'secret data' }),
      'config.ini': new FileBlob({ data: '[settings]' }),
      'public.txt': new FileBlob({ data: 'public data' }),
    };

    // Create the files in workPath
    fs.writeFileSync(path.join(mockWorkPath, 'secret.txt'), 'secret data');
    fs.writeFileSync(path.join(mockWorkPath, 'config.ini'), '[settings]');
    fs.writeFileSync(path.join(mockWorkPath, 'public.txt'), 'public data');

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

    const outputFiles = Object.keys(result.output.files || {});

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
      'handler.py': new FileBlob({ data: 'def handler(): pass' }),
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

    const handler = result.output.files?.['vc__handler__python.py'];
    expect(handler).toBeDefined();
  });

  it('falls back to pyproject.toml requires-python when no uv.lock (build succeeds)', async () => {
    const files = {
      'handler.py': new FileBlob({ data: 'def handler(): pass' }),
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

    const handler = result.output.files?.['vc__handler__python.py'];
    expect(handler).toBeDefined();
  });

  it('throws when pyproject.toml requires discontinued python version', async () => {
    const files = {
      'handler.py': new FileBlob({ data: 'def handler(): pass' }),
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

    const handler = result.output.files?.['vc__handler__python.py'];
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
        entrypoint: 'main.py',
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

    const result = await build({
      workPath,
      files,
      entrypoint: 'server.py',
      meta: { isDev: true },
      config: { framework: 'fastapi' },
      repoRootPath: workPath,
    });

    const handler = result.output.files?.['vc__handler__python.py'];
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

    const result = await build({
      workPath,
      files,
      entrypoint: 'server.py',
      meta: { isDev: true },
      config: { framework: 'fastapi' },
      repoRootPath: workPath,
    });

    const handler = result.output.files?.['vc__handler__python.py'];
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

    const result = await build({
      workPath,
      files,
      entrypoint: 'server.py',
      meta: { isDev: true },
      config: { framework: 'fastapi' },
      repoRootPath: workPath,
    });

    const handler = result.output.files?.['vc__handler__python.py'];
    if (!handler || !('data' in handler)) {
      throw new Error('handler bootstrap not found');
    }
    const content = handler.data.toString();
    expect(content.includes('os.path.join(_here, "index.py")')).toBe(true);

    fs.removeSync(workPath);
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

    const result = await buildWithMocks({
      workPath,
      files,
      entrypoint: 'missing.py',
      meta: { isDev: true },
      config: { framework: 'fastapi' },
      repoRootPath: workPath,
    });

    const handler = result.output.files?.['vc__handler__python.py'];
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

    const result = await buildWithMocks({
      workPath,
      files,
      entrypoint: 'missing.py',
      meta: { isDev: true },
      config: { framework: 'flask' },
      repoRootPath: workPath,
    });

    const handler = result.output.files?.['vc__handler__python.py'];
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

    const result = await buildWithMocks({
      workPath,
      files,
      entrypoint: 'missing.py',
      meta: { isDev: true },
      config: { framework: 'flask' },
      repoRootPath: workPath,
    });

    const handler = result.output.files?.['vc__handler__python.py'];
    if (!handler || !('data' in handler)) {
      throw new Error('handler bootstrap not found');
    }
    const content = handler.data.toString();
    expect(content.includes('backend/server/__init__.py')).toBe(true);

    if (fs.existsSync(workPath)) fs.removeSync(workPath);
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
      'handler.py': new FileBlob({ data: 'def handler(): pass' }),
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
      'handler.py': new FileBlob({ data: 'def handler(): pass' }),
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
      'handler.py': new FileBlob({ data: 'def handler(): pass' }),
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
      'handler.py': new FileBlob({ data: 'def handler(): pass' }),
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
      'handler.py': new FileBlob({ data: 'def handler(): pass' }),
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
      'handler.py': new FileBlob({ data: 'def handler(): pass' }),
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
      'handler.py': new FileBlob({ data: 'def handler(): pass' }),
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
      'handler.py': new FileBlob({ data: 'def handler(): pass' }),
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
      'handler.py': new FileBlob({ data: 'def handler(): pass' }),
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
      'handler.py': new FileBlob({ data: 'def handler(): pass' }),
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
      'handler.py': new FileBlob({ data: 'def handler(): pass' }),
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
      'handler.py': new FileBlob({ data: 'def handler(): pass' }),
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
      mirrorSitePackagesIntoVendor: vi.fn(async () => ({})),
    }));

    // Import after mocks are configured
    const { build: buildWithMocks } = await import('../src/index');

    const workPath = path.join(tmpdir(), `python-custom-install-${Date.now()}`);
    fs.mkdirSync(workPath, { recursive: true });

    const files = {
      'handler.py': new FileBlob({ data: 'def handler(): pass' }),
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
        env: expect.any(Object),
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
      mirrorSitePackagesIntoVendor: vi.fn(async () => ({})),
    }));

    // Import after mocks are configured
    const { build: buildWithMocks } = await import('../src/index');

    const workPath = path.join(
      tmpdir(),
      `python-custom-install-pyproject-${Date.now()}`
    );
    fs.mkdirSync(workPath, { recursive: true });

    const files = {
      'handler.py': new FileBlob({ data: 'def handler(): pass' }),
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
      mirrorSitePackagesIntoVendor: vi.fn(async () => ({})),
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
      'handler.py': new FileBlob({ data: 'def handler(): pass' }),
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
  });

  describe('createVenvEnv', () => {
    it('sets VIRTUAL_ENV and PATH correctly while protecting UV_PYTHON_DOWNLOADS', () => {
      process.env.UV_PYTHON_DOWNLOADS = 'manual';
      process.env.PATH = '/usr/bin';
      const venvPath = '/path/to/venv';
      const env = createVenvEnv(venvPath);

      expect(env.VIRTUAL_ENV).toBe(venvPath);
      expect(env.PATH).toContain(getVenvBinDir(venvPath));
      expect(env.PATH).toContain('/usr/bin');
      expect(env.UV_PYTHON_DOWNLOADS).toBe(UV_PYTHON_DOWNLOADS_MODE);
    });
  });
});

// --------------------------------------------------------------------------
// Runtime Dependency Installation Tests
// --------------------------------------------------------------------------
// These tests cover the new functionality for handling Python Lambda functions
// that exceed the 250MB uncompressed size limit by deferring public dependency
// installation to runtime.
// --------------------------------------------------------------------------

import { calculateBundleSize } from '../src/install';
import {
  classifyPackages,
  generateRuntimeRequirements,
  parseUvLock,
} from '@vercel/python-analysis';
import { FileFsRef } from '@vercel/build-utils';

describe('runtime dependency installation support', () => {
  describe('calculateBundleSize', () => {
    it('calculates size from FileFsRef objects', async () => {
      const tempDir = path.join(tmpdir(), `size-test-${Date.now()}`);
      fs.mkdirSync(tempDir, { recursive: true });

      // Create test files with known sizes
      const file1Path = path.join(tempDir, 'file1.txt');
      const file2Path = path.join(tempDir, 'file2.txt');
      fs.writeFileSync(file1Path, 'a'.repeat(100)); // 100 bytes
      fs.writeFileSync(file2Path, 'b'.repeat(200)); // 200 bytes

      const files = {
        'file1.txt': new FileFsRef({ fsPath: file1Path }),
        'file2.txt': new FileFsRef({ fsPath: file2Path }),
      };

      try {
        const size = await calculateBundleSize(files);
        expect(size).toBe(300);
      } finally {
        fs.removeSync(tempDir);
      }
    });

    it('calculates size from FileBlob objects', async () => {
      const files = {
        'file1.txt': new FileBlob({ data: 'a'.repeat(100) }),
        'file2.txt': new FileBlob({ data: Buffer.from('b'.repeat(200)) }),
      };

      const size = await calculateBundleSize(files);
      expect(size).toBe(300);
    });

    it('returns 0 for empty files object', async () => {
      const size = await calculateBundleSize({});
      expect(size).toBe(0);
    });
  });
  describe('classifyPackages', () => {
    it('classifies PyPI packages as public', () => {
      const lockContent = `
version = 1
requires-python = ">=3.12"

[[package]]
name = "requests"
version = "2.31.0"
`;
      const lockFile = parseUvLock(lockContent);
      const result = classifyPackages({ lockFile });
      expect(result.publicPackages).toContain('requests');
      expect(result.privatePackages).not.toContain('requests');
      expect(result.packageVersions['requests']).toBe('2.31.0');
    });

    it('classifies git source packages as private', () => {
      const lockContent = `
version = 1
requires-python = ">=3.12"

[[package]]
name = "my-private-pkg"
version = "1.0.0"

[package.source]
git = "https://github.com/myorg/private-pkg.git"
`;
      const lockFile = parseUvLock(lockContent);
      const result = classifyPackages({ lockFile });
      expect(result.privatePackages).toContain('my-private-pkg');
      expect(result.publicPackages).not.toContain('my-private-pkg');
    });

    it('classifies path source packages as private', () => {
      const lockContent = `
version = 1
requires-python = ">=3.12"

[[package]]
name = "local-pkg"
version = "0.1.0"

[package.source]
path = "./packages/local-pkg"
`;
      const lockFile = parseUvLock(lockContent);
      const result = classifyPackages({ lockFile });
      expect(result.privatePackages).toContain('local-pkg');
      expect(result.publicPackages).not.toContain('local-pkg');
    });

    it('classifies non-PyPI registry packages as private', () => {
      const lockContent = `
version = 1
requires-python = ">=3.12"

[[package]]
name = "internal-pkg"
version = "1.0.0"

[package.source]
registry = "https://private.pypi.mycompany.com/simple"
`;
      const lockFile = parseUvLock(lockContent);
      const result = classifyPackages({ lockFile });
      expect(result.privatePackages).toContain('internal-pkg');
      expect(result.publicPackages).not.toContain('internal-pkg');
    });

    it('classifies custom registry packages as public when UV_INDEX_URL matches', () => {
      const originalEnv = process.env.UV_INDEX_URL;
      try {
        process.env.UV_INDEX_URL = 'https://private.pypi.mycompany.com/simple';
        const lockContent = `
version = 1
requires-python = ">=3.12"

[[package]]
name = "internal-pkg"
version = "1.0.0"

[package.source]
registry = "https://private.pypi.mycompany.com/simple"
`;
        const lockFile = parseUvLock(lockContent);
        const result = classifyPackages({ lockFile });
        expect(result.publicPackages).toContain('internal-pkg');
        expect(result.privatePackages).not.toContain('internal-pkg');
      } finally {
        if (originalEnv === undefined) {
          delete process.env.UV_INDEX_URL;
        } else {
          process.env.UV_INDEX_URL = originalEnv;
        }
      }
    });

    it('classifies custom registry packages as public when UV_DEFAULT_INDEX matches', () => {
      const originalEnv = process.env.UV_DEFAULT_INDEX;
      try {
        process.env.UV_DEFAULT_INDEX = 'https://custom.index.com/simple';
        const lockContent = `
version = 1
requires-python = ">=3.12"

[[package]]
name = "custom-pkg"
version = "2.0.0"

[package.source]
registry = "https://custom.index.com/simple"
`;
        const lockFile = parseUvLock(lockContent);
        const result = classifyPackages({ lockFile });
        expect(result.publicPackages).toContain('custom-pkg');
        expect(result.privatePackages).not.toContain('custom-pkg');
      } finally {
        if (originalEnv === undefined) {
          delete process.env.UV_DEFAULT_INDEX;
        } else {
          process.env.UV_DEFAULT_INDEX = originalEnv;
        }
      }
    });

    it('classifies custom registry packages as public when UV_EXTRA_INDEX_URL matches', () => {
      const originalEnv = process.env.UV_EXTRA_INDEX_URL;
      try {
        process.env.UV_EXTRA_INDEX_URL =
          'https://extra1.index.com/simple https://extra2.index.com/simple';
        const lockContent = `
version = 1
requires-python = ">=3.12"

[[package]]
name = "extra-pkg"
version = "3.0.0"

[package.source]
registry = "https://extra2.index.com/simple"
`;
        const lockFile = parseUvLock(lockContent);
        const result = classifyPackages({ lockFile });
        expect(result.publicPackages).toContain('extra-pkg');
        expect(result.privatePackages).not.toContain('extra-pkg');
      } finally {
        if (originalEnv === undefined) {
          delete process.env.UV_EXTRA_INDEX_URL;
        } else {
          process.env.UV_EXTRA_INDEX_URL = originalEnv;
        }
      }
    });

    it('returns empty classification for empty lock file', () => {
      const lockFile = { packages: [] };
      const result = classifyPackages({ lockFile });
      expect(result.privatePackages).toHaveLength(0);
      expect(result.publicPackages).toHaveLength(0);
    });

    it('excludes specified packages from classification', () => {
      const lockContent = `
version = 1
requires-python = ">=3.12"

[[package]]
name = "my-app"
version = "0.1.0"

[[package]]
name = "requests"
version = "2.31.0"
`;
      const lockFile = parseUvLock(lockContent);
      const result = classifyPackages({
        lockFile,
        excludePackages: ['my-app'],
      });
      // my-app should be excluded entirely
      expect(result.publicPackages).not.toContain('my-app');
      expect(result.privatePackages).not.toContain('my-app');
      expect(result.packageVersions['my-app']).toBeUndefined();
      // requests should still be classified
      expect(result.publicPackages).toContain('requests');
    });
  });

  describe('generateRuntimeRequirements', () => {
    it('generates requirements file content with versions', () => {
      const classification = {
        privatePackages: ['private-pkg'],
        publicPackages: ['requests', 'flask'],
        packageVersions: {
          'private-pkg': '1.0.0',
          requests: '2.31.0',
          flask: '3.0.0',
        },
      };

      const content = generateRuntimeRequirements(classification);
      expect(content).toContain('requests==2.31.0');
      expect(content).toContain('flask==3.0.0');
      expect(content).not.toContain('private-pkg');
    });

    it('generates empty requirements for no public packages', () => {
      const classification = {
        privatePackages: ['private-pkg'],
        publicPackages: [],
        packageVersions: { 'private-pkg': '1.0.0' },
      };

      const content = generateRuntimeRequirements(classification);
      expect(content).toContain('# Auto-generated');
      expect(content).not.toContain('==');
    });
  });
});
