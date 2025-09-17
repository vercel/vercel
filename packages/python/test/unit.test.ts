import { getSupportedPythonVersion } from '../src/version';
import { maybeGenerateRequirementsTxt } from '../src/deps';
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
  const result = getSupportedPythonVersion({ constraint: '3.9' });
  expect(result).toHaveProperty('runtime', 'python3.9');
});

it('should ignore minor version in vercel dev', () => {
  expect(
    getSupportedPythonVersion({ constraint: '3.9', isDev: true })
  ).toHaveProperty('runtime', 'python3');
  expect(
    getSupportedPythonVersion({ constraint: '3.6', isDev: true })
  ).toHaveProperty('runtime', 'python3');
  expect(
    getSupportedPythonVersion({ constraint: '999', isDev: true })
  ).toHaveProperty('runtime', 'python3');
  expect(warningMessages).toStrictEqual([]);
});

it('should select latest supported installed version when no Piplock detected', () => {
  makeMockPython('3.10');
  const result = getSupportedPythonVersion({});
  expect(result).toHaveProperty('runtime');
  expect(result.runtime).toMatch(/^python3\.\d+$/);
  expect(warningMessages).toStrictEqual([]);
});

it('should select latest supported installed version and warn when invalid Piplock detected', () => {
  makeMockPython('3.10');
  const result = getSupportedPythonVersion({
    constraint: '999',
    source: 'uv.lock',
  });
  expect(result).toHaveProperty('runtime');
  expect(result.runtime).toMatch(/^python3\.\d+$/);
  expect(warningMessages).toStrictEqual([
    'Python version "999" detected in uv.lock is invalid and will be ignored.',
  ]);
});

it('should throw if python not found', () => {
  process.env.PATH = '.';
  expect(() => getSupportedPythonVersion({ constraint: '3.6' })).toThrow(
    'Unable to find any supported Python versions.'
  );
  expect(warningMessages).toStrictEqual([]);
});

it('should throw for discontinued versions', () => {
  global.Date.now = () => new Date('2022-07-31').getTime();
  makeMockPython('3.6');

  expect(() =>
    getSupportedPythonVersion({ constraint: '3.6', source: 'Pipfile.lock' })
  ).toThrow(
    'Python version "3.6" detected in Pipfile.lock is discontinued and must be upgraded.'
  );
  expect(warningMessages).toStrictEqual([]);
});

describe('python version constraint parsing', () => {
  beforeEach(() => {
    // reset PATH is done in outer afterEach
  });

  it('supports range constraints ">=3.10,<=3.11"', () => {
    makeMockPython('3.11');
    const result = getSupportedPythonVersion({ constraint: '>=3.10,<=3.11' });
    expect(
      result.runtime === 'python3.11' || result.runtime === 'python3.10'
    ).toBe(true);
    expect(warningMessages).toStrictEqual([]);
  });

  it('supports caret and tilde constraints', () => {
    makeMockPython('3.10');
    expect(getSupportedPythonVersion({ constraint: '^3.10' })).toHaveProperty(
      'runtime',
      'python3.10'
    );
    expect(getSupportedPythonVersion({ constraint: '~3.10' })).toHaveProperty(
      'runtime',
      'python3.10'
    );
    expect(warningMessages).toStrictEqual([]);
  });

  it('supports wildcard minor version', () => {
    makeMockPython('3.11');
    const result = getSupportedPythonVersion({ constraint: '3.11.*' });
    expect(result).toHaveProperty('runtime', 'python3.11');
    expect(warningMessages).toStrictEqual([]);
  });

  it('falls back to latest when invalid constraint (warns)', () => {
    makeMockPython('3.11');
    // ensure system Python versions (e.g. 3.13) are not considered for this test
    process.env.PATH = tmpPythonDir;
    const result = getSupportedPythonVersion({
      constraint: '>=9.9',
      source: 'pyproject.toml',
    });
    expect(result.runtime).toMatch(/^python3\.(?:11|10|9)$/);
    expect(warningMessages).toStrictEqual([
      'Python version ">=9.9" detected in pyproject.toml is invalid and will be ignored.',
    ]);
  });
});

describe('lockfile generation: uv.lock and poetry.lock', () => {
  it('uv.lock: includes matching resolution_markers, preserves marker, and includes extras', async () => {
    const workPath = path.join(tmpdir(), `python-uvlock-${Date.now()}`);
    fs.mkdirSync(workPath, { recursive: true });
    const uvLockPath = path.join(workPath, 'uv.lock');
    const vendorBaseDir = path.join(
      workPath,
      '.vercel',
      'python',
      'py3.11',
      '.'
    );
    fs.mkdirSync(vendorBaseDir, { recursive: true });

    const uvLock = `
metadata = { requires-python = ">=3.10,<3.12" }

[[package]]
name = "foo"
version = "1.2.3"
category = "main"
optional = false
resolution_markers = ["python_version >= '3.10'"]
marker = "python_version < '3.12'"
extras = ["socks", "security"]
source = { registry = "pypi" }

[[package]]
name = "bar"
version = "2.0.0"
category = "main"
optional = false
resolution_markers = ["python_version < '3.10'"]
source = { registry = "pypi" }
`;
    fs.writeFileSync(uvLockPath, uvLock);

    const fsFiles = {
      'uv.lock': { fsPath: uvLockPath },
    } as Record<string, any>;

    const outPath = await maybeGenerateRequirementsTxt({
      entryDirectory: '.',
      vendorBaseDir,
      fsFiles,
      pythonVersion: '3.11',
    });

    if (!outPath) throw new Error('uv.lock generation returned null');
    const contents = fs.readFileSync(outPath, 'utf8');
    // includes foo with extras and marker, lines are sorted so foo may appear after bar depending on sorting
    expect(contents).toMatch(
      /foo\[socks,security]==1\.2\.3\s+;\s+python_version < '3\.12'/
    );
    // excludes bar due to resolution_markers
    expect(contents).not.toMatch(/\nbar==2\.0\.0\n/);

    fs.removeSync(workPath);
  });

  it('poetry.lock: includes matching marker, excludes non-matching, and includes extras', async () => {
    const workPath = path.join(tmpdir(), `python-poetrylock-${Date.now()}`);
    fs.mkdirSync(workPath, { recursive: true });
    const poetryLockPath = path.join(workPath, 'poetry.lock');
    const vendorBaseDir = path.join(
      workPath,
      '.vercel',
      'python',
      'py3.11',
      '.'
    );
    fs.mkdirSync(vendorBaseDir, { recursive: true });

    const poetryLock = `
[[package]]
name = "foo"
version = "1.2.3"
category = "main"
optional = false
marker = "python_version >= '3.10'"
extras = ["socks"]

[[package]]
name = "bar"
version = "2.0.0"
category = "main"
optional = false
marker = "python_version < '3.10'"
`;
    fs.writeFileSync(poetryLockPath, poetryLock);

    const fsFiles = {
      'poetry.lock': { fsPath: poetryLockPath },
    } as Record<string, any>;

    const outPath = await maybeGenerateRequirementsTxt({
      entryDirectory: '.',
      vendorBaseDir,
      fsFiles,
      pythonVersion: '3.11',
    });

    if (!outPath) throw new Error('poetry.lock generation returned null');
    const contents = fs.readFileSync(outPath, 'utf8');
    // includes foo with extras and marker
    expect(contents).toMatch(
      /foo\[socks]==1\.2\.3\s+;\s+python_version >= '3\.10'/
    );
    // excludes bar due to marker not matching python 3.11
    expect(contents).not.toMatch(/bar==2\.0\.0/);

    fs.removeSync(workPath);
  });
});

it('should warn for deprecated versions, soon to be discontinued', () => {
  global.Date.now = () => new Date('2021-07-01').getTime();
  makeMockPython('3.6');

  expect(getSupportedPythonVersion({ constraint: '3.6' })).toHaveProperty(
    'runtime',
    'python3.6'
  );
  expect(warningMessages).toStrictEqual([
    'Error: Python version "3.6" has reached End-of-Life. Deployments created on or after 2022-07-18 will fail to build. http://vercel.link/python-version',
  ]);
});

function makeMockPython(version: string) {
  fs.mkdirSync(tmpPythonDir);
  for (const name of ['python', 'pip']) {
    const bin = path.join(
      tmpPythonDir,
      `${name}${version}${process.platform === 'win32' ? '.exe' : ''}`
    );
    fs.writeFileSync(bin, '');
    fs.chmodSync(bin, 0o755);
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
