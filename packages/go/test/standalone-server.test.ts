jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

jest.mock('fs-extra', () => ({
  copy: jest.fn(),
  pathExists: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn(),
}));

jest.mock('@vercel/build-utils', () => ({
  FileBlob: jest.fn(),
  Lambda: jest.fn(),
  cloneEnv: jest.fn(
    (
      baseEnv: Record<string, string | undefined>,
      metaEnv: Record<string, string | undefined> = {},
      overrides: Record<string, string | undefined> = {}
    ) => ({
      ...baseEnv,
      ...metaEnv,
      ...overrides,
    })
  ),
  debug: jest.fn(),
  download: jest.fn(),
  getLambdaOptionsFromFunction: jest.fn(),
  getWriteableDirectory: jest.fn(),
  glob: jest.fn(),
}));

jest.mock('../src/go-helpers', () => ({
  createGo: jest.fn(),
  resolvePreferredGoVersion: jest.fn(),
}));

import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { spawn } from 'child_process';
import { copy, writeFile } from 'fs-extra';
import { getWriteableDirectory } from '@vercel/build-utils';
import { resolvePreferredGoVersion } from '../src/go-helpers';
import { startStandaloneDevServer } from '../src/standalone-server';

const mockedSpawn = spawn as unknown as jest.Mock;
const mockedCopy = copy as unknown as jest.Mock;
const mockedWriteFile = writeFile as unknown as jest.Mock;
const mockedGetWriteableDirectory =
  getWriteableDirectory as unknown as jest.Mock;
const mockedResolvePreferredGoVersion =
  resolvePreferredGoVersion as unknown as jest.Mock;

function createMockChildProcess() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    pid: number;
  };

  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.pid = 12345;

  return child;
}

describe('startStandaloneDevServer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedSpawn.mockReset();
    mockedCopy.mockReset();
    mockedWriteFile.mockReset();
    mockedGetWriteableDirectory.mockReset();
    mockedResolvePreferredGoVersion.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('stages the bootstrap module before running go run', async () => {
    const child = createMockChildProcess();

    mockedSpawn.mockReturnValue(child as any);
    mockedCopy.mockResolvedValue(undefined as any);
    mockedWriteFile.mockResolvedValue(undefined as any);
    mockedGetWriteableDirectory.mockResolvedValue('/tmp/bootstrap-dev');
    mockedResolvePreferredGoVersion.mockResolvedValue('1.25.8');
    jest.spyOn(Math, 'random').mockReturnValue(0);

    const promise = startStandaloneDevServer(
      {
        workPath: '/repo/app',
        meta: { env: { FOO: 'bar' } },
      } as any,
      'cmd/api/main.go'
    );

    await (
      jest as unknown as {
        advanceTimersByTimeAsync: (ms: number) => Promise<void>;
      }
    ).advanceTimersByTimeAsync(2000);

    const result = await promise;

    expect(mockedCopy).toHaveBeenCalledWith(
      expect.stringContaining('/packages/go/bootstrap'),
      '/tmp/bootstrap-dev/bootstrap'
    );
    expect(mockedWriteFile).toHaveBeenCalledWith(
      '/tmp/bootstrap-dev/main.go',
      expect.stringContaining('bootstrap.DevMain()')
    );
    expect(mockedWriteFile).toHaveBeenCalledWith(
      '/tmp/bootstrap-dev/go.mod',
      expect.stringContaining('toolchain go1.25.8')
    );
    expect(mockedSpawn).toHaveBeenCalledWith(
      'go',
      ['run', '-tags', 'vcdev', '.'],
      expect.objectContaining({
        cwd: '/tmp/bootstrap-dev',
        env: expect.objectContaining({
          PORT: '49152',
          FOO: 'bar',
          __VC_GO_DEV_RUN_TARGET: './cmd/api',
          __VC_GO_DEV_WORK_PATH: '/repo/app',
        }),
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    );
    expect(result).toEqual({ port: 49152, pid: 12345 });
  });

  it('uses the bootstrap minimum for older Go versions', async () => {
    const child = createMockChildProcess();

    mockedSpawn.mockReturnValue(child as any);
    mockedCopy.mockResolvedValue(undefined as any);
    mockedWriteFile.mockResolvedValue(undefined as any);
    mockedGetWriteableDirectory.mockResolvedValue('/tmp/bootstrap-dev');
    mockedResolvePreferredGoVersion.mockResolvedValue('1.18.10');
    jest.spyOn(Math, 'random').mockReturnValue(0);

    const promise = startStandaloneDevServer(
      {
        workPath: '/repo/app',
      } as any,
      'main.go'
    );

    await (
      jest as unknown as {
        advanceTimersByTimeAsync: (ms: number) => Promise<void>;
      }
    ).advanceTimersByTimeAsync(2000);

    await promise;

    expect(mockedWriteFile).toHaveBeenCalledWith(
      '/tmp/bootstrap-dev/go.mod',
      'module main\n\ngo 1.20\n'
    );
  });
});
