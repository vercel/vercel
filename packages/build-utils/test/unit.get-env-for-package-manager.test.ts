import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  vi,
  MockInstance,
} from 'vitest';
import { delimiter } from 'path';
import { getEnvForPackageManager } from '../src';
import { PNPM_10_PREFERRED_AT } from '../src/fs/run-user-scripts';
import { getNodeVersionByMajor } from '../src/fs/node-version';

describe('Test `getEnvForPackageManager()`', () => {
  let consoleLogSpy: MockInstance<typeof console.log>;
  let consoleWarnSpy: MockInstance<typeof console.warn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log');
    consoleWarnSpy = vi.spyOn(console, 'warn');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('with "npm"', () => {
    test.each<{
      name: string;
      args: Parameters<typeof getEnvForPackageManager>[0];
      want: unknown;
      /**
       * Expected output on `console.log`. Set to `null` when no output is
       * expected.
       */
      consoleLogOutput?: string | null;
      /**
       * Expected output on `console.warn`. Set to `null` when no output is
       * expected.
       */
      consoleWarnOutput?: string | null;
    }>([
      {
        name: 'should do nothing to env for npm < 6 and node < 16',
        args: {
          cliType: 'npm',
          nodeVersion: getNodeVersionByMajor(14),
          packageJsonPackageManager: undefined,
          lockfileVersion: 1,
          env: {
            FOO: 'bar',
          },
        },
        want: {
          FOO: 'bar',
        },
        consoleLogOutput: null,
        consoleWarnOutput: null,
      },
      {
        name: 'should not set npm path if corepack enabled',
        args: {
          cliType: 'npm',
          nodeVersion: getNodeVersionByMajor(14),
          packageJsonPackageManager: 'npm@10.5.0',
          lockfileVersion: 2,
          env: {
            FOO: 'bar',
            ENABLE_EXPERIMENTAL_COREPACK: '1',
          },
        },
        want: {
          FOO: 'bar',
          ENABLE_EXPERIMENTAL_COREPACK: '1',
        },
        consoleLogOutput: null,
        consoleWarnOutput: null,
      },
      {
        name: 'should not prepend npm path again if already detected',
        args: {
          cliType: 'npm',
          nodeVersion: getNodeVersionByMajor(14),
          packageJsonPackageManager: undefined,
          lockfileVersion: 2,
          env: {
            FOO: 'bar',
            PATH: `/node16/bin-npm7${delimiter}foo`,
          },
        },
        want: {
          FOO: 'bar',
          PATH: `/node16/bin-npm7${delimiter}foo`,
        },
        consoleLogOutput: null,
        consoleWarnOutput: null,
      },
      {
        name: 'should not set path if node is 16 and npm 7+ is detected',
        args: {
          cliType: 'npm',
          nodeVersion: getNodeVersionByMajor(16),
          packageJsonPackageManager: undefined,
          lockfileVersion: 2,
          env: {
            FOO: 'bar',
            PATH: 'foo',
          },
        },
        want: {
          FOO: 'bar',
          PATH: 'foo',
        },
        consoleLogOutput: null,
        consoleWarnOutput: null,
      },
    ])('$name', ({ args, want, consoleLogOutput, consoleWarnOutput }) => {
      expect(
        getEnvForPackageManager({
          cliType: args.cliType,
          lockfileVersion: args.lockfileVersion,
          packageJsonPackageManager: args.packageJsonPackageManager,
          nodeVersion: args.nodeVersion,
          env: args.env,
        })
      ).toStrictEqual(want);

      // Check console.log output
      if (typeof consoleLogOutput === 'string') {
        expect(consoleLogSpy).toHaveBeenCalledWith(consoleLogOutput);
      } else if (consoleLogOutput === null) {
        expect(consoleLogSpy).not.toHaveBeenCalled();
      }

      // Check console.warn output
      if (typeof consoleWarnOutput === 'string') {
        expect(consoleWarnSpy).toHaveBeenCalledWith(consoleWarnOutput);
      } else if (consoleLogOutput === null) {
        expect(consoleWarnSpy).not.toHaveBeenCalled();
      }
    });
  });

  describe('with "pnpm"', () => {
    test.each<{
      name: string;
      args: Parameters<typeof getEnvForPackageManager>[0];
      want: unknown;
      /**
       * Expected output on `console.log`. Set to `null` when no output is
       * expected.
       */
      consoleLogOutput?: string | null;
      /**
       * Expected output on `console.warn`. Set to `null` when no output is
       * expected.
       */
      consoleWarnOutput?: string | null;
    }>([
      {
        name: 'should set path if pnpm 7+ is detected',
        args: {
          cliType: 'pnpm',
          nodeVersion: getNodeVersionByMajor(16),
          packageJsonPackageManager: undefined,
          lockfileVersion: 5.4,
          env: {
            FOO: 'bar',
            PATH: 'foo',
          },
        },
        want: {
          FOO: 'bar',
          PATH: `/pnpm7/node_modules/.bin${delimiter}foo`,
        },
        consoleLogOutput:
          'Detected `pnpm-lock.yaml` version 5.4 generated by pnpm@7.x',
        consoleWarnOutput: null,
      },
      {
        name: 'should set path if pnpm 8 is detected',
        args: {
          cliType: 'pnpm',
          nodeVersion: getNodeVersionByMajor(18),
          packageJsonPackageManager: undefined,
          lockfileVersion: 6.0,
          env: {
            FOO: 'bar',
            PATH: 'foo',
          },
        },
        want: {
          FOO: 'bar',
          PATH: `/pnpm8/node_modules/.bin${delimiter}foo`,
        },
        consoleLogOutput:
          'Detected `pnpm-lock.yaml` version 6 generated by pnpm@8.x',
        consoleWarnOutput: null,
      },
      {
        name: 'should set path if pnpm 9 is detected',
        args: {
          cliType: 'pnpm',
          nodeVersion: getNodeVersionByMajor(18),
          packageJsonPackageManager: undefined,
          lockfileVersion: 7.0,
          env: {
            FOO: 'bar',
            PATH: 'foo',
          },
        },
        want: {
          FOO: 'bar',
          PATH: `/pnpm9/node_modules/.bin${delimiter}foo`,
        },
        consoleLogOutput:
          'Detected `pnpm-lock.yaml` version 7 generated by pnpm@9.x',
        consoleWarnOutput: null,
      },
      {
        name: 'should set path if pnpm 10 is detected',
        args: {
          cliType: 'pnpm',
          nodeVersion: getNodeVersionByMajor(18),
          packageJsonPackageManager: undefined,
          lockfileVersion: 9.0,
          env: {
            FOO: 'bar',
            PATH: 'foo',
          },
          projectCreatedAt: PNPM_10_PREFERRED_AT.getTime() + 1000,
        },
        want: {
          FOO: 'bar',
          PATH: `/pnpm10/node_modules/.bin${delimiter}foo`,
        },
        consoleLogOutput:
          'Detected `pnpm-lock.yaml` 9 which may be generated by pnpm@9.x or pnpm@10.x\nUsing pnpm@10.x based on project creation date\nTo use pnpm@9.x, manually opt in using corepack (https://vercel.com/docs/deployments/configure-a-build#corepack)',
        consoleWarnOutput: null,
      },
      {
        name: 'should detect pnpm 10 with packageManager field pnpm 9',
        args: {
          cliType: 'pnpm',
          nodeVersion: getNodeVersionByMajor(18),
          packageJsonPackageManager: 'pnpm@9.5.0',
          lockfileVersion: 9.0,
          env: {
            FOO: 'bar',
            PATH: 'foo',
          },
          projectCreatedAt: PNPM_10_PREFERRED_AT.getTime() + 1000,
        },
        want: {
          FOO: 'bar',
          PATH: `/pnpm10/node_modules/.bin${delimiter}foo`,
        },
        consoleLogOutput:
          'Detected `pnpm-lock.yaml` version 9 generated by pnpm@10.x with package.json#packageManager pnpm@9.5.0',
        consoleWarnOutput: null,
      },
      {
        name: 'should not set pnpm path if corepack is enabled',
        args: {
          cliType: 'pnpm',
          nodeVersion: getNodeVersionByMajor(16),
          packageJsonPackageManager: 'pnpm@6.35.1',
          lockfileVersion: 5.4,
          env: {
            FOO: 'bar',
            ENABLE_EXPERIMENTAL_COREPACK: '1',
          },
        },
        want: {
          FOO: 'bar',
          ENABLE_EXPERIMENTAL_COREPACK: '1',
        },
        consoleLogOutput: null,
        consoleWarnOutput: null,
      },
      {
        name: 'should not prepend pnpm path again if already detected',
        args: {
          cliType: 'pnpm',
          nodeVersion: getNodeVersionByMajor(16),
          packageJsonPackageManager: undefined,
          lockfileVersion: 5.4,
          env: {
            FOO: 'bar',
            PATH: `/pnpm7/node_modules/.bin${delimiter}foo`,
          },
        },
        want: {
          FOO: 'bar',
          PATH: `/pnpm7/node_modules/.bin${delimiter}foo`,
        },
        consoleLogOutput: null,
        consoleWarnOutput: null,
      },
    ])('$name', ({ args, want, consoleLogOutput, consoleWarnOutput }) => {
      expect(getEnvForPackageManager({ ...args })).toStrictEqual(want);

      // Check console.log output
      if (typeof consoleLogOutput === 'string') {
        expect(consoleLogSpy).toHaveBeenCalledWith(consoleLogOutput);
      } else if (consoleLogOutput === null) {
        expect(consoleLogSpy).not.toHaveBeenCalled();
      }

      // Check console.warn output
      if (typeof consoleWarnOutput === 'string') {
        expect(consoleWarnSpy).toHaveBeenCalledWith(consoleWarnOutput);
      } else if (consoleLogOutput === null) {
        expect(consoleWarnSpy).not.toHaveBeenCalled();
      }
    });
  });

  describe('with "yarn"', () => {
    test.each<{
      name: string;
      args: Parameters<typeof getEnvForPackageManager>[0];
      want: unknown;
      /**
       * Expected output on `console.log`. Set to `null` when no output is
       * expected.
       */
      consoleLogOutput?: string | null;
      /**
       * Expected output on `console.warn`. Set to `null` when no output is
       * expected.
       */
      consoleWarnOutput?: string | null;
    }>([
      {
        name: 'should set YARN_NODE_LINKER w/yarn if it is not already defined',
        args: {
          cliType: 'yarn',
          nodeVersion: getNodeVersionByMajor(16),
          packageJsonPackageManager: undefined,
          lockfileVersion: 2,
          env: {
            FOO: 'bar',
          },
        },
        want: {
          FOO: 'bar',
          YARN_NODE_LINKER: 'node-modules',
        },
        consoleLogOutput: null,
        consoleWarnOutput: null,
      },
      {
        name: 'should not set YARN_NODE_LINKER if it already exists',
        args: {
          cliType: 'yarn',
          nodeVersion: getNodeVersionByMajor(16),
          packageJsonPackageManager: undefined,
          lockfileVersion: 2,
          env: {
            FOO: 'bar',
            YARN_NODE_LINKER: 'exists',
          },
        },
        want: {
          FOO: 'bar',
          YARN_NODE_LINKER: 'exists',
        },
        consoleLogOutput: null,
        consoleWarnOutput: null,
      },
    ])('$name', ({ args, want, consoleLogOutput, consoleWarnOutput }) => {
      expect(getEnvForPackageManager({ ...args })).toStrictEqual(want);

      // Check console.log output
      if (typeof consoleLogOutput === 'string') {
        expect(consoleLogSpy).toHaveBeenCalledWith(consoleLogOutput);
      } else if (consoleLogOutput === null) {
        expect(consoleLogSpy).not.toHaveBeenCalled();
      }

      // Check console.warn output
      if (typeof consoleWarnOutput === 'string') {
        expect(consoleWarnSpy).toHaveBeenCalledWith(consoleWarnOutput);
      } else if (consoleLogOutput === null) {
        expect(consoleWarnSpy).not.toHaveBeenCalled();
      }
    });
  });

  describe('with "bun"', () => {
    test.each<{
      name: string;
      args: Parameters<typeof getEnvForPackageManager>[0];
      want: unknown;
      /**
       * Expected output on `console.log`. Set to `null` when no output is
       * expected.
       */
      consoleLogOutput?: string | null;
      /**
       * Expected output on `console.warn`. Set to `null` when no output is
       * expected.
       */
      consoleWarnOutput?: string | null;
    }>([
      {
        name: 'should set path if bun v1 is detected',
        args: {
          cliType: 'bun',
          nodeVersion: getNodeVersionByMajor(18),
          packageJsonPackageManager: undefined,
          lockfileVersion: 0,
          env: {
            FOO: 'bar',
            PATH: '/usr/local/bin',
          },
        },
        want: {
          FOO: 'bar',
          PATH: `/bun1${delimiter}/usr/local/bin`,
        },
        consoleLogOutput: 'Detected `bun.lockb` generated by bun@1.x',
      },
    ])('$name', ({ args, want, consoleLogOutput, consoleWarnOutput }) => {
      expect(
        getEnvForPackageManager({
          cliType: args.cliType,
          lockfileVersion: args.lockfileVersion,
          packageJsonPackageManager: args.packageJsonPackageManager,
          nodeVersion: args.nodeVersion,
          env: args.env,
        })
      ).toStrictEqual(want);

      // Check console.log output
      if (typeof consoleLogOutput === 'string') {
        expect(consoleLogSpy).toHaveBeenCalledWith(consoleLogOutput);
      } else if (consoleLogOutput === null) {
        expect(consoleLogSpy).not.toHaveBeenCalled();
      }

      // Check console.warn output
      if (typeof consoleWarnOutput === 'string') {
        expect(consoleWarnSpy).toHaveBeenCalledWith(consoleWarnOutput);
      } else if (consoleLogOutput === null) {
        expect(consoleWarnSpy).not.toHaveBeenCalled();
      }
    });
  });
});
