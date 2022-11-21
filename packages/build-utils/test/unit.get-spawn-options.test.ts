import { delimiter } from 'path';
import { getSpawnOptions } from '../src';

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
      args: [
        { isDev: true },
        { major: 14, range: '14.x', runtime: 'nodejs14.x' },
      ],
      envPath: '/foo',
      want: '/foo',
    },
    {
      name: 'should do nothing when isDev and node16',
      args: [
        { isDev: true },
        { major: 16, range: '16.x', runtime: 'nodejs16.x' },
      ],
      envPath: '/foo',
      want: '/foo',
    },
    {
      name: 'should replace 14 with 16 when only path',
      args: [
        { isDev: false },
        { major: 16, range: '16.x', runtime: 'nodejs16.x' },
      ],
      envPath: '/node14/bin',
      want: '/node16/bin',
    },
    {
      name: 'should replace 14 with 16 at beginning',
      args: [
        { isDev: false },
        { major: 16, range: '16.x', runtime: 'nodejs16.x' },
      ],
      envPath: `/node14/bin${delimiter}/foo`,
      want: `/node16/bin${delimiter}/foo`,
    },
    {
      name: 'should replace 14 with 16 at end',
      args: [
        { isDev: false },
        { major: 16, range: '16.x', runtime: 'nodejs16.x' },
      ],
      envPath: `/foo${delimiter}/node14/bin`,
      want: `/foo${delimiter}/node16/bin`,
    },
    {
      name: 'should replace 14 with 16 in middle',
      args: [
        { isDev: false },
        { major: 16, range: '16.x', runtime: 'nodejs16.x' },
      ],
      envPath: `/foo${delimiter}/node14/bin${delimiter}/bar`,
      want: `/foo${delimiter}/node16/bin${delimiter}/bar`,
    },
    {
      name: 'should prepend 16 at beginning when nothing to replace',
      args: [
        { isDev: false },
        { major: 16, range: '16.x', runtime: 'nodejs16.x' },
      ],
      envPath: `/foo`,
      want: `/node16/bin${delimiter}/foo`,
    },
    {
      name: 'should prepend 16 at beginning no path input',
      args: [
        { isDev: false },
        { major: 16, range: '16.x', runtime: 'nodejs16.x' },
      ],
      envPath: '',
      want: `/node16/bin`,
    },
    {
      name: 'should replace 12 with 14 when only path',
      args: [
        { isDev: false },
        { major: 14, range: '14.x', runtime: 'nodejs14.x' },
      ],
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
