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
  const result = getSupportedPythonVersion({ pipLockPythonVersion: '3.9' });
  expect(result).toHaveProperty('runtime', 'python3.9');
});

it('should ignore minor version in vercel dev', () => {
  expect(
    getSupportedPythonVersion({ pipLockPythonVersion: '3.9', isDev: true })
  ).toHaveProperty('runtime', 'python3');
  expect(
    getSupportedPythonVersion({ pipLockPythonVersion: '3.6', isDev: true })
  ).toHaveProperty('runtime', 'python3');
  expect(
    getSupportedPythonVersion({ pipLockPythonVersion: '999', isDev: true })
  ).toHaveProperty('runtime', 'python3');
  expect(warningMessages).toStrictEqual([]);
});

it('should select latest supported installed version when no Piplock detected', () => {
  makeMockPython('3.10');
  const result = getSupportedPythonVersion({ pipLockPythonVersion: undefined });
  expect(result).toHaveProperty('runtime');
  expect(result.runtime).toMatch(/^python3\.\d+$/);
  expect(warningMessages).toStrictEqual([]);
});

it('should select latest supported installed version and warn when invalid Piplock detected', () => {
  makeMockPython('3.10');
  const result = getSupportedPythonVersion({ pipLockPythonVersion: '999' });
  expect(result).toHaveProperty('runtime');
  expect(result.runtime).toMatch(/^python3\.\d+$/);
  expect(warningMessages).toStrictEqual([
    'Warning: Python version "999" detected in Pipfile.lock is invalid and will be ignored. http://vercel.link/python-version',
  ]);
});

it('should throw if python not found', () => {
  process.env.PATH = '.';
  expect(() =>
    getSupportedPythonVersion({ pipLockPythonVersion: '3.6' })
  ).toThrow('Unable to find any supported Python versions.');
  expect(warningMessages).toStrictEqual([]);
});

it('should throw for discontinued versions', () => {
  global.Date.now = () => new Date('2022-07-31').getTime();
  makeMockPython('3.6');

  expect(() =>
    getSupportedPythonVersion({ pipLockPythonVersion: '3.6' })
  ).toThrow(
    'Python version "3.6" detected in Pipfile.lock is discontinued and must be upgraded.'
  );
  expect(warningMessages).toStrictEqual([]);
});

it('should warn for deprecated versions, soon to be discontinued', () => {
  global.Date.now = () => new Date('2021-07-01').getTime();
  makeMockPython('3.6');

  expect(
    getSupportedPythonVersion({ pipLockPythonVersion: '3.6' })
  ).toHaveProperty('runtime', 'python3.6');
  expect(warningMessages).toStrictEqual([
    'Error: Python version "3.6" detected in Pipfile.lock has reached End-of-Life. Deployments created on or after 2022-07-18 will fail to build. http://vercel.link/python-version',
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

// describe('startDevServer', () => {
//   it('returns null when framework is not fastapi', async () => {
//     const { startDevServer } = await import('../src/index');
//     const res = await startDevServer({
//       entrypoint: 'app.py',
//       workPath: tmpdir(),
//       meta: {},
//       config: {},
//     } as any);
//     expect(res).toBeNull();
//   });

//   it('starts uvicorn and detects the bound port', async () => {
//     jest.resetModules();

//     // Mocks must be applied before importing the module under test
//     let spawnMock: jest.Mock<any, any> = jest.fn();
//     jest.doMock('child_process', () => {
//       const { EventEmitter } = require('events');
//       spawnMock = jest.fn((cmd: string) => {
//         const child = new EventEmitter();
//         // Simulate Windows taskkill completing so shutdown() resolves on win32
//         if (cmd === 'taskkill') {
//           process.nextTick(() => {
//             child.emit('exit', 0);
//           });
//           return child;
//         }
//         (child as any).pid = 43210;
//         (child as any).stdout = new EventEmitter();
//         (child as any).stderr = new EventEmitter();
//         // Emit a readiness log line on next tick
//         process.nextTick(() => {
//           (child as any).stdout.emit(
//             'data',
//             Buffer.from('Uvicorn running on http://127.0.0.1:56789\n')
//           );
//         });
//         return child;
//       });
//       return { __esModule: true, spawn: spawnMock };
//     });

//     jest.doMock('../src/utils', () => ({
//       __esModule: true,
//       detectAsgiServer: jest.fn(async () => 'uvicorn'),
//       isInVirtualEnv: jest.fn(() => ''),
//       useVirtualEnv: jest.fn(() => ({
//         pythonCmd: '/mock/python',
//         venvRoot: '/mock/venv',
//       })) as any,
//     }));

//     jest.doMock('../src/version', () => ({
//       __esModule: true,
//       getLatestPythonVersion: jest.fn(() => ({
//         pythonPath: '/usr/bin/python3',
//         pipPath: '/usr/bin/pip3',
//         version: '3.10',
//         runtime: 'python3.10',
//       })) as any,
//     }));

//     const { startDevServer } = await import('../src/index');

//     const workPath = path.join(tmpdir(), `python-devserver-${Date.now()}`);
//     fs.mkdirSync(workPath, { recursive: true });
//     try {
//       // Create a valid FastAPI entrypoint file that the detector can find
//       fs.writeFileSync(
//         path.join(workPath, 'app.py'),
//         'from fastapi import FastAPI\napp = FastAPI()\n'
//       );

//       const res = await startDevServer({
//         entrypoint: 'main.py',
//         workPath,
//         meta: { env: { FOO: 'bar' } },
//         config: { framework: 'fastapi' },
//       } as any);

//       expect(res).not.toBeNull();
//       expect(res?.port).toBe(56789);
//       expect(res?.pid).toBe(43210);

//       // Validate spawn args
//       expect(spawnMock).toHaveBeenCalledTimes(1);
//       const [pythonCmd, argv, opts] = spawnMock.mock.calls[0];
//       expect(pythonCmd).toBe('/mock/python');
//       expect(argv).toEqual(
//         expect.arrayContaining(['-m', 'uvicorn', 'app:app', '--reload'])
//       );
//       expect(argv).toEqual(expect.arrayContaining(['--host', '127.0.0.1']));
//       expect(argv).toEqual(expect.arrayContaining(['--port', '0']));
//       expect(argv).toContain('--use-colors');
//       expect(opts).toBeDefined();
//       expect(opts.env).toBeDefined();
//       expect(opts).toHaveProperty('cwd', workPath);
//       expect(opts.stdio).toEqual(['inherit', 'pipe', 'pipe']);
//       expect(opts.env.TERM).toBe('xterm-256color');
//       expect(opts.env.FORCE_COLOR).toBe('1');
//       expect(opts.env.PY_COLORS).toBe('1');
//       expect(opts.env.CLICOLOR_FORCE).toBe('1');
//       expect(opts.env.FOO).toBe('bar');

//       // Ensure we can shut it down without throwing
//       if (res?.shutdown) {
//         jest.useFakeTimers();
//         const p = res.shutdown();
//         jest.advanceTimersByTime(1600);
//         await p;
//         jest.useRealTimers();
//       }
//     } finally {
//       if (fs.existsSync(workPath)) fs.removeSync(workPath);
//     }
//   });

//   it('starts hypercorn and detects the bound port', async () => {
//     jest.resetModules();

//     let spawnMock: jest.Mock<any, any> = jest.fn();
//     jest.doMock('child_process', () => {
//       const { EventEmitter } = require('events');
//       spawnMock = jest.fn((cmd: string) => {
//         const child = new EventEmitter();
//         // Simulate Windows taskkill completing so shutdown() resolves on win32
//         if (cmd === 'taskkill') {
//           process.nextTick(() => {
//             child.emit('exit', 0);
//           });
//           return child;
//         }
//         (child as any).pid = 54321;
//         (child as any).stdout = new EventEmitter();
//         (child as any).stderr = new EventEmitter();
//         process.nextTick(() => {
//           (child as any).stdout.emit(
//             'data',
//             Buffer.from('Hypercorn running on http://127.0.0.1:45678\n')
//           );
//         });
//         return child;
//       });
//       return { __esModule: true, spawn: spawnMock };
//     });

//     jest.doMock('../src/utils', () => ({
//       __esModule: true,
//       detectAsgiServer: jest.fn(async () => 'hypercorn'),
//       isInVirtualEnv: jest.fn(() => ''),
//       useVirtualEnv: jest.fn(() => ({
//         pythonCmd: '/mock/python',
//         venvRoot: '/mock/venv',
//       })) as any,
//     }));

//     jest.doMock('../src/version', () => ({
//       __esModule: true,
//       getLatestPythonVersion: jest.fn(() => ({
//         pythonPath: '/usr/bin/python3',
//         pipPath: '/usr/bin/pip3',
//         version: '3.10',
//         runtime: 'python3.10',
//       })) as any,
//     }));

//     const { startDevServer } = await import('../src/index');

//     const workPath = path.join(tmpdir(), `python-devserver-${Date.now()}`);
//     fs.mkdirSync(workPath, { recursive: true });
//     fs.writeFileSync(
//       path.join(workPath, 'app.py'),
//       'from fastapi import FastAPI\napp = FastAPI()\n'
//     );

//     try {
//       const res = await startDevServer({
//         entrypoint: 'main.py',
//         workPath,
//         meta: {},
//         config: { framework: 'fastapi' },
//       } as any);

//       expect(res).not.toBeNull();
//       expect(res?.port).toBe(45678);
//       expect(res?.pid).toBe(54321);

//       const [pythonCmd, argv, opts] = spawnMock.mock.calls[0];
//       expect(pythonCmd).toBe('/mock/python');
//       expect(argv).toEqual(
//         expect.arrayContaining(['-m', 'hypercorn', 'app:app', '--reload'])
//       );
//       expect(argv).toEqual(expect.arrayContaining(['-b', '127.0.0.1:0']));
//       expect(opts).toHaveProperty('cwd', workPath);

//       if (res?.shutdown) {
//         jest.useFakeTimers();
//         const p = res.shutdown();
//         jest.advanceTimersByTime(1600);
//         await p;
//         jest.useRealTimers();
//       }
//     } finally {
//       if (fs.existsSync(workPath)) fs.removeSync(workPath);
//     }
//   });

//   (process.platform === 'win32' ? it.skip : it)(
//     'shutdown sends SIGTERM then SIGKILL on POSIX',
//     async () => {
//       jest.resetModules();

//       let spawnMock: jest.Mock<any, any> = jest.fn();
//       jest.doMock('child_process', () => {
//         const { EventEmitter } = require('events');
//         spawnMock = jest.fn(() => {
//           const child = new EventEmitter();
//           (child as any).pid = 24680;
//           (child as any).stdout = new EventEmitter();
//           (child as any).stderr = new EventEmitter();
//           process.nextTick(() => {
//             (child as any).stdout.emit(
//               'data',
//               Buffer.from('Uvicorn running on http://127.0.0.1:34567\n')
//             );
//           });
//           return child;
//         });
//         return { __esModule: true, spawn: spawnMock };
//       });

//       jest.doMock('../src/utils', () => ({
//         __esModule: true,
//         detectAsgiServer: jest.fn(async () => 'uvicorn'),
//         isInVirtualEnv: jest.fn(() => ''),
//         useVirtualEnv: jest.fn(() => ({
//           pythonCmd: '/mock/python',
//           venvRoot: '/mock/venv',
//         })) as any,
//       }));

//       jest.doMock('../src/version', () => ({
//         __esModule: true,
//         getLatestPythonVersion: jest.fn(() => ({
//           pythonPath: '/usr/bin/python3',
//           pipPath: '/usr/bin/pip3',
//           version: '3.10',
//           runtime: 'python3.10',
//         })) as any,
//       }));

//       const { startDevServer } = await import('../src/index');

//       const workPath = path.join(tmpdir(), `python-devserver-${Date.now()}`);
//       fs.mkdirSync(workPath, { recursive: true });
//       fs.writeFileSync(
//         path.join(workPath, 'app.py'),
//         'from fastapi import FastAPI\napp = FastAPI()\n'
//       );

//       const res = await startDevServer({
//         entrypoint: 'main.py',
//         workPath,
//         meta: {},
//         config: { framework: 'fastapi' },
//       } as any);

//       expect(res).not.toBeNull();

//       jest.useFakeTimers();
//       const killSpy = jest
//         .spyOn(process, 'kill')
//         .mockImplementation(() => true as unknown as never);

//       const shutdownPromise = res?.shutdown
//         ? res.shutdown()
//         : Promise.resolve();
//       // SIGTERM is sent immediately
//       expect(killSpy).toHaveBeenCalledWith(24680, 'SIGTERM');

//       // Advance timers to trigger the SIGKILL fallback
//       jest.advanceTimersByTime(1600);
//       await shutdownPromise;

//       expect(killSpy).toHaveBeenCalledWith(24680, 'SIGKILL');

//       killSpy.mockRestore();
//       jest.useRealTimers();

//       if (fs.existsSync(workPath)) fs.removeSync(workPath);
//     }
//   );
// });
