import assert from 'assert';
import { getEnvForPackageManager, NodeVersion } from '../src';
import { CliType } from '../src/fs/run-user-scripts';

describe('Test `getEnvForPackageManager()`', () => {
  const cases = [
    {
      name: 'should do nothing to env for npm < 6 and node < 16',
      args: {
        cliType: 'npm' as CliType,
        nodeVersion: {
          major: 14,
        } as NodeVersion,
        lockfileVersion: 1,
        env: {
          FOO: 'bar',
        },
      },
      want: {
        FOO: 'bar',
      },
    },
    {
      name: 'should set path if npm 7+ is detected and node < 16',
      args: {
        cliType: 'npm' as CliType,
        nodeVersion: {
          major: 14,
        } as NodeVersion,
        lockfileVersion: 2,
        env: {
          FOO: 'bar',
          PATH: 'foo',
        },
      },
      want: {
        FOO: 'bar',
        PATH: `/node16/bin-npm7:foo`,
      },
    },
    {
      name: 'should not set path if node is 16 and npm 7+ is detected',
      args: {
        cliType: 'npm' as CliType,
        nodeVersion: {
          major: 16,
        } as NodeVersion,
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
    },
    {
      name: 'should set YARN_NODE_LINKER w/yarn if it is not already defined',
      args: {
        cliType: 'yarn' as CliType,
        nodeVersion: {
          major: 16,
        } as NodeVersion,
        lockfileVersion: 2,
        env: {
          FOO: 'bar',
        },
      },
      want: {
        FOO: 'bar',
        YARN_NODE_LINKER: 'node-modules',
      },
    },
    {
      name: 'should not set YARN_NODE_LINKER if it already exists',
      args: {
        cliType: 'yarn' as CliType,
        nodeVersion: {
          major: 16,
        } as NodeVersion,
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
    },
  ];

  for (const { name, want, args } of cases) {
    it(name, () => {
      assert.deepStrictEqual(
        getEnvForPackageManager({
          cliType: args.cliType,
          lockfileVersion: args.lockfileVersion,
          nodeVersion: args.nodeVersion,
          env: args.env,
        }),
        want
      );
    });
  }
});
