import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join, sep } from 'path';

const { mockExecFile } = vi.hoisted(() => ({ mockExecFile: vi.fn() }));

vi.mock('child_process', () => {
  const customSym = Symbol.for('nodejs.util.promisify.custom');
  const execFile: any = vi.fn();
  execFile[customSym] = (file: string, args: string[]) =>
    mockExecFile(file, args);
  return { execFile };
});

vi.mock('fs-extra', () => ({
  realpath: vi.fn(),
  readFile: vi.fn().mockResolvedValue(Buffer.from('')),
}));

vi.mock('@vercel/build-utils', () => ({ scanParentDirs: vi.fn() }));

vi.mock('../../../src/util/native-install', () => ({
  isNativeBinaryInstall: () => false,
}));

vi.mock('../../../src/util/pkg-name', () => ({ packageName: 'vercel' }));

import { getUpdateCommandInfo } from '../../../src/util/get-update-command';
import { realpath } from 'fs-extra';
import { scanParentDirs } from '@vercel/build-utils';

const realpathMock = vi.mocked(realpath);
const scanParentDirsMock = vi.mocked(scanParentDirs);

describe('getUpdateCommandInfo install detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    realpathMock.mockImplementation(async (p: any) => String(p));
  });

  it('emits a global npm command when the CLI lives under the npm global root', async () => {
    realpathMock.mockResolvedValueOnce('/gnm/vercel/dist');
    mockExecFile.mockImplementation(async (file: string) => {
      if (file === 'npm') return { stdout: '/gnm\n', stderr: '' };
      throw new Error('not installed');
    });

    const info = await getUpdateCommandInfo();

    expect(info).toEqual({ command: 'npm i -g vercel@latest', global: true });
  });

  it('resolves pnpm global installs through the symlinked store path', async () => {
    realpathMock.mockResolvedValueOnce('/pnpm-store/vercel/dist');
    realpathMock.mockImplementation(async (p: any) => {
      if (p === join('/pnpm-gnm', 'vercel')) return '/pnpm-store/vercel';
      return String(p);
    });
    mockExecFile.mockImplementation(async (file: string) => {
      if (file === 'npm') return { stdout: '/npm-gnm\n', stderr: '' };
      if (file === 'pnpm') return { stdout: '/pnpm-gnm\n', stderr: '' };
      throw new Error('not installed');
    });

    const info = await getUpdateCommandInfo();

    expect(info).toEqual({ command: 'pnpm i -g vercel@latest', global: true });
  });

  it('falls back to the project package manager for a non-global install', async () => {
    const originalArgv = process.argv;
    process.argv = ['/usr/bin/node', '/proj/node_modules/.bin/vercel'];
    try {
      realpathMock.mockImplementation(async (p: any) => {
        const s = String(p);
        if (s.endsWith(`${sep}vercel`)) return `${s}-elsewhere`;
        return s;
      });
      realpathMock.mockResolvedValueOnce('/proj/node_modules/vercel/dist');
      mockExecFile.mockRejectedValue(new Error('no package manager'));
      scanParentDirsMock.mockResolvedValue({
        cliType: 'pnpm',
        lockfilePath: '/proj/pnpm-lock.yaml',
      } as any);

      const info = await getUpdateCommandInfo();

      expect(info).toEqual({ command: 'pnpm i vercel@latest', global: false });
    } finally {
      process.argv = originalArgv;
    }
  });
});
