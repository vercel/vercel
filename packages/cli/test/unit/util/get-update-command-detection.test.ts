import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join, sep } from 'path';

const { mockExecFile, mockIsNative } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
  mockIsNative: vi.fn(),
}));

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
  isNativeBinaryInstall: () => mockIsNative(),
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
    mockIsNative.mockReturnValue(false);
  });

  describe('global installed, local not', () => {
    it('detects a global npm install under the npm global root', async () => {
      const npmRoot = join(sep, 'gnm');
      const installPath = join(npmRoot, 'vercel', 'dist');
      realpathMock.mockResolvedValueOnce(installPath);
      mockExecFile.mockImplementation(async (file: string) => {
        if (file === 'npm') return { stdout: `${npmRoot}\n`, stderr: '' };
        throw new Error('not installed');
      });

      const info = await getUpdateCommandInfo();

      expect(info).toEqual({ command: 'npm i -g vercel@latest', global: true });
    });

    it('detects a global pnpm install via the symlinked content-addressable store', async () => {
      const npmRoot = join(sep, 'npm-gnm');
      const pnpmRoot = join(sep, 'pnpm-gnm');
      const pnpmStorePackage = join(sep, 'pnpm-store', 'vercel');
      const installPath = join(pnpmStorePackage, 'dist');
      realpathMock.mockResolvedValueOnce(installPath);
      realpathMock.mockImplementation(async (p: any) => {
        if (p === join(pnpmRoot, 'vercel')) return pnpmStorePackage;
        return String(p);
      });
      mockExecFile.mockImplementation(async (file: string) => {
        if (file === 'npm') return { stdout: `${npmRoot}\n`, stderr: '' };
        if (file === 'pnpm') return { stdout: `${pnpmRoot}\n`, stderr: '' };
        throw new Error('not installed');
      });

      const info = await getUpdateCommandInfo();

      expect(info).toEqual({
        command: 'pnpm i -g vercel@latest',
        global: true,
      });
    });

    it('detects a global yarn install and uses "yarn global add"', async () => {
      const yarnDir = join(sep, 'ygd');
      const installPath = join(yarnDir, 'node_modules', 'vercel', 'dist');
      realpathMock.mockResolvedValueOnce(installPath);
      mockExecFile.mockImplementation(async (file: string) => {
        if (file === 'yarn') return { stdout: `${yarnDir}\n`, stderr: '' };
        throw new Error('not installed');
      });

      const info = await getUpdateCommandInfo();

      expect(info).toEqual({
        command: 'yarn global add vercel@latest',
        global: true,
      });
    });

    it('detects a global fnm install from the install path when global-root queries miss', async () => {
      const originalArgv = process.argv;
      process.argv = ['/usr/bin/node', '/some/bin/vercel'];
      try {
        const installPath = join(
          sep,
          'home',
          '.local',
          'share',
          'fnm',
          'node-versions',
          'v24',
          'installation',
          'lib',
          'node_modules',
          'vercel',
          'dist'
        );
        realpathMock.mockResolvedValueOnce(installPath);
        mockExecFile.mockImplementation(async (file: string) => {
          if (file === 'npm') {
            return { stdout: `${join(sep, 'unrelated')}\n`, stderr: '' };
          }
          throw new Error('not installed');
        });
        scanParentDirsMock.mockResolvedValue({
          cliType: 'npm',
          lockfilePath: undefined,
        } as any);

        const info = await getUpdateCommandInfo();

        expect(info).toEqual({
          command: 'npm i -g vercel@latest',
          global: true,
        });
      } finally {
        process.argv = originalArgv;
      }
    });
  });

  describe('local installed, global not', () => {
    it('uses a local pnpm command when the project has a pnpm lockfile', async () => {
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

        expect(info).toEqual({
          command: 'pnpm i vercel@latest',
          global: false,
        });
      } finally {
        process.argv = originalArgv;
      }
    });

    it('uses a local npm command when the project has a package-lock', async () => {
      const originalArgv = process.argv;
      process.argv = ['/usr/bin/node', '/proj/node_modules/.bin/vercel'];
      try {
        realpathMock.mockResolvedValueOnce('/proj/node_modules/vercel/dist');
        mockExecFile.mockRejectedValue(new Error('no package manager'));
        scanParentDirsMock.mockResolvedValue({
          cliType: 'npm',
          lockfilePath: '/proj/package-lock.json',
        } as any);

        const info = await getUpdateCommandInfo();

        expect(info).toEqual({ command: 'npm i vercel@latest', global: false });
      } finally {
        process.argv = originalArgv;
      }
    });

    it('uses "yarn add" for a local yarn install', async () => {
      const originalArgv = process.argv;
      process.argv = ['/usr/bin/node', '/proj/node_modules/.bin/vercel'];
      try {
        realpathMock.mockResolvedValueOnce('/proj/node_modules/vercel/dist');
        mockExecFile.mockRejectedValue(new Error('no package manager'));
        scanParentDirsMock.mockResolvedValue({
          cliType: 'yarn',
          lockfilePath: '/proj/yarn.lock',
        } as any);

        const info = await getUpdateCommandInfo();

        expect(info).toEqual({
          command: 'yarn add vercel@latest',
          global: false,
        });
      } finally {
        process.argv = originalArgv;
      }
    });
  });

  describe('edge cases', () => {
    it('defaults to global when the npm prefix path cannot be resolved', async () => {
      const originalArgv = process.argv;
      const originalPrefix = process.env.PREFIX;
      process.argv = ['/usr/bin/node', '/opt/tool/vercel'];
      process.env.PREFIX = '/broken-prefix';
      try {
        const installPath = '/opt/tool/vercel/dist';
        realpathMock.mockResolvedValueOnce(installPath);
        realpathMock.mockImplementation(async (p: any) => {
          if (p === '/broken-prefix') throw new Error('ENOENT');
          return String(p);
        });
        mockExecFile.mockRejectedValue(new Error('no package manager'));
        scanParentDirsMock.mockResolvedValue({
          cliType: 'npm',
          lockfilePath: undefined,
        } as any);

        const info = await getUpdateCommandInfo();

        expect(info).toEqual({
          command: 'npm i -g vercel@latest',
          global: true,
        });
      } finally {
        process.argv = originalArgv;
        if (originalPrefix === undefined) {
          delete process.env.PREFIX;
        } else {
          process.env.PREFIX = originalPrefix;
        }
      }
    });

    it('uses the native package name and --force for a global native binary install', async () => {
      mockIsNative.mockReturnValue(true);
      const npmRoot = join(sep, 'gnm');
      const installPath = join(npmRoot, '@vercel/vc-native', 'dist');
      realpathMock.mockResolvedValueOnce(installPath);
      mockExecFile.mockImplementation(async (file: string) => {
        if (file === 'npm') return { stdout: `${npmRoot}\n`, stderr: '' };
        throw new Error('not installed');
      });

      const info = await getUpdateCommandInfo();

      expect(info).toEqual({
        command: 'npm i -g @vercel/vc-native@latest --force',
        global: true,
      });
    });
  });
});
