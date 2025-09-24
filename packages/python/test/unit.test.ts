import { getSupportedPythonVersion } from '../src/version';
import { build } from '../src/index';
import fs from 'fs-extra';
import path from 'path';
import { tmpdir } from 'os';
import { FileBlob } from '@vercel/build-utils';

const tmpPythonDir = path.join(
  tmpdir(),
  `vc-test-python-${Math.floor(Math.random() * 1e6)}`
);
let warningMessages: string[];
const originalConsoleWarn = console.warn;
const realDateNow = Date.now.bind(global.Date);
const origPath = process.env.PATH;

jest.setTimeout(30 * 1000);

beforeEach(() => {
  warningMessages = [];
  console.warn = m => {
    warningMessages.push(m);
  };
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

it('should select latest supported installed version when no Piplock detected', () => {
  makeMockPython('3.10');
  const result = getSupportedPythonVersion({
    declaredPythonVersion: undefined,
  });
  expect(result).toHaveProperty('runtime');
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
    'Warning: Python version "999" detected in Pipfile.lock is invalid and will be ignored. http://vercel.link/python-version',
  ]);
});

it('should throw if python not found', () => {
  process.env.PATH = '.';
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
    'Error: Python version "3.6" detected in Pipfile.lock has reached End-of-Life. Deployments created on or after 2022-07-18 will fail to build. http://vercel.link/python-version',
  ]);
});

function makeMockPython(version: string) {
  fs.mkdirSync(tmpPythonDir, { recursive: true });
  const isWin = process.platform === 'win32';
  const posixScript = '#!/usr/bin/env sh\n# mock binary\nexit 0\n';
  const winScript = '@echo off\r\nrem mock binary\r\nexit /b 0\r\n';

  for (const name of ['python', 'pip']) {
    const bin = path.join(
      tmpPythonDir,
      `${name}${version}${isWin ? '.cmd' : ''}`
    );
    fs.writeFileSync(bin, isWin ? winScript : posixScript, 'utf8');
    if (!isWin) fs.chmodSync(bin, 0o755);
  }

  const uvBin = path.join(tmpPythonDir, `uv${isWin ? '.cmd' : ''}`);
  fs.writeFileSync(uvBin, isWin ? winScript : posixScript, 'utf8');
  if (!isWin) fs.chmodSync(uvBin, 0o755);

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
    ).rejects.toThrow('No FastAPI entrypoint found');

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
