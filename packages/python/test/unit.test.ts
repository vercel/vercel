import {
  getSupportedPythonVersion,
  DEFAULT_PYTHON_VERSION,
  resetInstalledPythonsCache,
} from '../src/version';
import { build } from '../src/index';
import { createVenvEnv, getVenvBinDir } from '../src/utils';
import { UV_PYTHON_DOWNLOADS_MODE, getProtectedUvEnv } from '../src/uv';
import { createPyprojectToml } from '../src/install';
import fs from 'fs-extra';
import path from 'path';
import { tmpdir } from 'os';
import { FileBlob } from '@vercel/build-utils';

// For tests that exercise the build pipeline, we don't care about the actual
// vendored dependencies, only that the build completes and the handler exists.
// Mock out mirroring of site-packages so tests don't depend on a real venv.
jest.mock('../src/install', () => {
  const real = jest.requireActual('../src/install');
  return {
    ...real,
    mirrorSitePackagesIntoVendor: jest.fn(async () => ({})),
  };
});

const tmpPythonDir = path.join(
  tmpdir(),
  `vc-test-python-${Math.floor(Math.random() * 1e6)}`
);
let warningMessages: string[];
const originalConsoleWarn = console.warn;
const realDateNow = Date.now.bind(global.Date);
const origPath = process.env.PATH;

/** Tracks mock Python versions for uv python list output */
let mockInstalledVersions: string[] = [];

jest.setTimeout(30 * 1000);

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

  it('selects Python 3.14 as highest when range allows multiple versions', () => {
    makeMockPython('3.12');
    makeMockPython('3.13');
    makeMockPython('3.14');
    const result = getSupportedPythonVersion({
      declaredPythonVersion: {
        version: '>=3.12',
        source: 'pyproject.toml',
      },
    });
    expect(result).toHaveProperty('runtime', 'python3.14');
  });

  it('selects Python 3.13 when upper bound excludes 3.14', () => {
    makeMockPython('3.12');
    makeMockPython('3.13');
    makeMockPython('3.14');
    const result = getSupportedPythonVersion({
      declaredPythonVersion: {
        version: '>=3.12,<3.14',
        source: 'pyproject.toml',
      },
    });
    expect(result).toHaveProperty('runtime', 'python3.13');
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
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
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
  it('sets requires-python to compatible release of DEFAULT_PYTHON_VERSION', async () => {
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
        `requires-python = "~=${DEFAULT_PYTHON_VERSION}"`
      );
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
  process.env.PATH = '.';
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

  // mock uv: handle `python list` command and also ensure uv.lock exists for other commands
  const uvBin = path.join(tmpPythonDir, `uv${isWin ? '.cmd' : ''}`);
  if (isWin) {
    const uvWinScript = [
      '@echo off',
      'rem mock uv binary',
      'if "%1"=="python" if "%2"=="list" (',
      `  type "${uvPythonListFile}"`,
      '  exit /b 0',
      ')',
      'if not exist "uv.lock" (',
      '  echo [mock]>uv.lock',
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
      `  cat "${uvPythonListFile}"`,
      '  exit 0',
      'fi',
      'if [ ! -f "uv.lock" ]; then',
      '  echo "[mock]" > uv.lock',
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

    // Override the mock uv binary to emulate workspace behavior: write the lockfile
    // at the workspace root (two levels up from apps/python-app2).
    // Also handle `python list` command for version detection.
    const isWin = process.platform === 'win32';
    const uvBin = path.join(tmpPythonDir, `uv${isWin ? '.cmd' : ''}`);
    const uvPythonListFile = path.join(tmpPythonDir, 'uv-python-list.json');
    if (isWin) {
      const uvWinScript = [
        '@echo off',
        'rem mock uv binary (workspace): write uv.lock at workspace root',
        'if "%1"=="python" if "%2"=="list" (',
        `  type "${uvPythonListFile}"`,
        '  exit /b 0',
        ')',
        'set LOCK=..\\..\\uv.lock',
        'if not exist "%LOCK%" (',
        '  echo [mock]>"%LOCK%"',
        ')',
        'exit /b 0',
        '',
      ].join('\r\n');
      fs.writeFileSync(uvBin, uvWinScript, 'utf8');
    } else {
      const uvPosixScript = [
        '#!/bin/sh',
        '# mock uv binary (workspace): write uv.lock at workspace root',
        'if [ "$1" = "python" ] && [ "$2" = "list" ]; then',
        `  cat "${uvPythonListFile}"`,
        '  exit 0',
        'fi',
        'if [ ! -f "../../uv.lock" ]; then',
        '  echo "[mock]" > ../../uv.lock',
        'fi',
        'exit 0',
        '',
      ].join('\n');
      fs.writeFileSync(uvBin, uvPosixScript, 'utf8');
      fs.chmodSync(uvBin, 0o755);
    }

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
  it('resolves FastAPI entrypoint from pyproject scripts (uvicorn module:attr)', async () => {
    const workPath = path.join(
      tmpdir(),
      `python-pyproject-fastapi-${Date.now()}`
    );
    fs.mkdirSync(path.join(workPath, 'backend', 'api'), { recursive: true });
    makeMockPython('3.9');

    const files = {
      'pyproject.toml': new FileBlob({
        data: '[project]\nname = "x"\nversion = "0.0.1"\n\n[project.scripts]\napp = "uvicorn backend.api.server:main"\n',
      }),
      'backend/api/server.py': new FileBlob({
        data: 'from fastapi import FastAPI\napp = FastAPI()\n',
      }),
    } as Record<string, FileBlob>;

    const result = await build({
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
    const workPath = path.join(
      tmpdir(),
      `python-pyproject-flask-${Date.now()}`
    );
    fs.mkdirSync(workPath, { recursive: true });
    makeMockPython('3.9');

    const files = {
      'pyproject.toml': new FileBlob({
        data: '[project]\nname = "x"\nversion = "0.0.1"\n\n[project.scripts]\napp = "backend:run"\n',
      }),
      'backend.py': new FileBlob({
        data: 'from flask import Flask\napp = Flask(__name__)\n',
      }),
    } as Record<string, FileBlob>;

    const result = await build({
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
    const workPath = path.join(tmpdir(), `python-pyproject-init-${Date.now()}`);
    fs.mkdirSync(path.join(workPath, 'backend', 'server'), { recursive: true });
    makeMockPython('3.9');

    const files = {
      'pyproject.toml': new FileBlob({
        data: '[project]\nname = "x"\nversion = "0.0.1"\n\n[project.scripts]\napp = "backend.server:main"\n',
      }),
      'backend/server/__init__.py': new FileBlob({
        data: 'from flask import Flask\napp = Flask(__name__)\n',
      }),
    } as Record<string, FileBlob>;

    const result = await build({
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
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    mockWorkPath = path.join(tmpdir(), `python-version-log-${Date.now()}`);
    fs.mkdirSync(mockWorkPath, { recursive: true });
    makeMockPython('3.11');
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
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
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    mockWorkPath = path.join(
      tmpdir(),
      `python-version-file-priority-${Date.now()}`
    );
    fs.mkdirSync(mockWorkPath, { recursive: true });
    makeMockPython('3.10');
    makeMockPython('3.11');
    makeMockPython('3.12');
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
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

  it('falls back to pyproject.toml when .python-version has invalid content', async () => {
    const files = {
      'handler.py': new FileBlob({ data: 'def handler(): pass' }),
      '.python-version': new FileBlob({ data: 'invalid-version\n' }),
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

    // Should fall back to pyproject.toml since .python-version is invalid
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Using Python 3.12 from pyproject.toml')
    );
  });
});

describe('uv install path', () => {
  it('uses uv to install requirement (no fallback to pip)', async () => {
    jest.resetModules();

    let installRequirement: any;
    let mockExeca: any;

    jest.isolateModules(() => {
      jest.doMock('which', () => ({
        __esModule: true,
        default: { sync: jest.fn(() => '/mock/uv') },
      }));

      jest.doMock('execa', () => {
        const fn: any = jest.fn(async () => ({ stdout: '' }));
        fn.stdout = jest.fn(async () => '');
        mockExeca = fn;
        return { __esModule: true, default: fn };
      });

      // Import after mocks are set
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('../src/install');
      installRequirement = mod.installRequirement;
    });

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
  // Helper to generate mock uv python list JSON for isolated module tests
  const mockUvPythonListJson = JSON.stringify([
    {
      key: 'cpython-3.12.0-linux-x86_64-gnu',
      version: '3.12.0',
      version_parts: { major: 3, minor: 12, patch: 0 },
      path: '/uv/python/bin/python3.12',
      symlink: null,
      url: null,
      os: 'linux',
      variant: 'default',
      implementation: 'cpython',
      arch: 'x86_64',
      libc: 'gnu',
    },
  ]);

  it('uses projectSettings.installCommand instead of uv install for FastAPI', async () => {
    jest.resetModules();

    let buildWithMocks: any;
    let mockExecCommand: jest.Mock = jest.fn();
    let mockEnsureUvProject: jest.Mock = jest.fn();

    jest.isolateModules(() => {
      jest.doMock('@vercel/build-utils', () => {
        const real = jest.requireActual('@vercel/build-utils');
        mockExecCommand = jest.fn(async () => {});
        return {
          __esModule: true,
          ...real,
          execCommand: mockExecCommand,
        };
      });

      jest.doMock('../src/install', () => {
        const real = jest.requireActual('../src/install');
        mockEnsureUvProject = jest.fn(async () => ({
          projectDir: '/mock/project',
          pyprojectPath: '/mock/project/pyproject.toml',
          lockPath: '/mock/project/uv.lock',
        }));
        return {
          __esModule: true,
          ...real,
          ensureUvProject: mockEnsureUvProject,
        };
      });

      // Mock child_process to return mock uv python list output
      jest.doMock('child_process', () => {
        const real = jest.requireActual('child_process');
        return {
          ...real,
          execSync: jest.fn((cmd: string) => {
            if (cmd.includes('uv python list')) {
              return mockUvPythonListJson;
            }
            return real.execSync(cmd);
          }),
        };
      });

      // Mock which to return a path for uv
      jest.doMock('which', () => ({
        __esModule: true,
        default: { sync: jest.fn(() => '/mock/uv') },
      }));

      // Import after mocks are configured
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('../src/index');
      buildWithMocks = mod.build;
    });

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
    jest.resetModules();

    let buildWithMocks: any;
    let mockExecCommand: jest.Mock = jest.fn();
    let mockEnsureUvProject: jest.Mock = jest.fn();

    jest.isolateModules(() => {
      jest.doMock('@vercel/build-utils', () => {
        const real = jest.requireActual('@vercel/build-utils');
        mockExecCommand = jest.fn(async () => {});
        return {
          __esModule: true,
          ...real,
          execCommand: mockExecCommand,
        };
      });

      jest.doMock('../src/install', () => {
        const real = jest.requireActual('../src/install');
        mockEnsureUvProject = jest.fn(async () => ({
          projectDir: '/mock/project',
          pyprojectPath: '/mock/project/pyproject.toml',
          lockPath: '/mock/project/uv.lock',
        }));
        return {
          __esModule: true,
          ...real,
          ensureUvProject: mockEnsureUvProject,
        };
      });

      // Mock child_process to return mock uv python list output
      jest.doMock('child_process', () => {
        const real = jest.requireActual('child_process');
        return {
          ...real,
          execSync: jest.fn((cmd: string) => {
            if (cmd.includes('uv python list')) {
              return mockUvPythonListJson;
            }
            return real.execSync(cmd);
          }),
        };
      });

      // Mock which to return a path for uv
      jest.doMock('which', () => ({
        __esModule: true,
        default: { sync: jest.fn(() => '/mock/uv') },
      }));

      // Import after mocks are configured
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('../src/index');
      buildWithMocks = mod.build;
    });

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
    jest.resetModules();

    let buildWithMocks: any;
    let mockExecCommand: jest.Mock = jest.fn();
    let mockEnsureUvProject: jest.Mock = jest.fn();

    jest.isolateModules(() => {
      jest.doMock('@vercel/build-utils', () => {
        const real = jest.requireActual('@vercel/build-utils');
        mockExecCommand = jest.fn(async () => {});
        return {
          __esModule: true,
          ...real,
          execCommand: mockExecCommand,
        };
      });

      jest.doMock('../src/install', () => {
        const real = jest.requireActual('../src/install');
        mockEnsureUvProject = jest.fn(async () => ({
          projectDir: '/mock/project',
          pyprojectPath: '/mock/project/pyproject.toml',
          lockPath: '/mock/project/uv.lock',
        }));
        return {
          __esModule: true,
          ...real,
          ensureUvProject: mockEnsureUvProject,
        };
      });

      // Mock child_process to return mock uv python list output
      jest.doMock('child_process', () => {
        const real = jest.requireActual('child_process');
        return {
          ...real,
          execSync: jest.fn((cmd: string) => {
            if (cmd.includes('uv python list')) {
              return mockUvPythonListJson;
            }
            return real.execSync(cmd);
          }),
        };
      });

      // Mock which to return a path for uv
      jest.doMock('which', () => ({
        __esModule: true,
        default: { sync: jest.fn(() => '/mock/uv') },
      }));

      // Import after mocks are configured
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('../src/index');
      buildWithMocks = mod.build;
    });

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
