import { delimiter } from 'path';
import { getSpawnOptions } from '../src';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getNodeVersionByMajor } from '../src/fs/node-version';

describe('Test `getSpawnOptions()`', () => {
  const origProcessEnvPath = process.env.PATH;

  beforeEach(() => {
    process.env.PATH = undefined;
  });

  afterEach(() => {
    process.env.PATH = origProcessEnvPath;
  });

  const cases: Array<{
    name: string;
    args: Parameters<typeof getSpawnOptions>;
    envPath: string | undefined;
    want: string | undefined;
  }> = [
    {
      name: 'should do nothing when isDev and node14',
      args: [{ isDev: true }, getNodeVersionByMajor(14)!],
      envPath: '/foo',
      want: '/foo',
    },
    {
      name: 'should do nothing when isDev and node16',
      args: [{ isDev: true }, getNodeVersionByMajor(16)!],
      envPath: '/foo',
      want: '/foo',
    },
    {
      name: 'should replace 14 with 16 when only path',
      args: [{ isDev: false }, getNodeVersionByMajor(16)!],
      envPath: '/node14/bin',
      want: '/node16/bin',
    },
    {
      name: 'should replace 14 with 16 at beginning',
      args: [{ isDev: false }, getNodeVersionByMajor(16)!],
      envPath: `/node14/bin${delimiter}/foo`,
      want: `/node16/bin${delimiter}/foo`,
    },
    {
      name: 'should replace 14 with 16 at end',
      args: [{ isDev: false }, getNodeVersionByMajor(16)!],
      envPath: `/foo${delimiter}/node14/bin`,
      want: `/foo${delimiter}/node16/bin`,
    },
    {
      name: 'should replace 14 with 16 in middle',
      args: [{ isDev: false }, getNodeVersionByMajor(16)!],
      envPath: `/foo${delimiter}/node14/bin${delimiter}/bar`,
      want: `/foo${delimiter}/node16/bin${delimiter}/bar`,
    },
    {
      name: 'should prepend 16 at beginning when nothing to replace',
      args: [{ isDev: false }, getNodeVersionByMajor(16)!],
      envPath: `/foo`,
      want: `/node16/bin${delimiter}/foo`,
    },
    {
      name: 'should prepend 16 at beginning no path input',
      args: [{ isDev: false }, getNodeVersionByMajor(16)!],
      envPath: '',
      want: `/node16/bin`,
    },
    {
      name: 'should replace 12 with 14 when only path',
      args: [{ isDev: false }, getNodeVersionByMajor(14)!],
      envPath: '/node12/bin',
      want: '/node14/bin',
    },
  ];

  for (const { name, args, envPath, want } of cases) {
    it(name, () => {
      process.env.PATH = envPath;
      const opts = getSpawnOptions(...args);
      expect(opts.env?.PATH).toBe(want);
    });
  }
});
