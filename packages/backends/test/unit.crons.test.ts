import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCronRouteTable, getServiceCrons } from '../src/crons';

describe('getServiceCrons', () => {
  it('returns undefined for non-schedule-triggered services', async () => {
    expect(
      await getServiceCrons({
        service: { type: 'web', name: 'web', schedule: '0 0 * * *' },
        entrypoint: 'server.ts',
      })
    ).toBeUndefined();
    expect(
      await getServiceCrons({
        service: {
          type: 'job',
          trigger: 'queue',
          name: 'worker',
          schedule: '0 0 * * *',
        },
        entrypoint: 'worker.ts',
      })
    ).toBeUndefined();
    expect(await getServiceCrons({ entrypoint: 'cleanup.ts' })).toBeUndefined();
  });

  it('returns undefined when name or schedule is missing', async () => {
    expect(
      await getServiceCrons({
        service: { type: 'cron', schedule: '0 0 * * *' },
        entrypoint: 'cleanup.ts',
      })
    ).toBeUndefined();
    expect(
      await getServiceCrons({
        service: { type: 'cron', name: 'cleanup' },
        entrypoint: 'cleanup.ts',
      })
    ).toBeUndefined();
  });

  it('produces a single entry for a static schedule on a cron service', async () => {
    expect(
      await getServiceCrons({
        service: { type: 'cron', name: 'cleanup', schedule: '0 0 * * *' },
        entrypoint: 'cleanup.ts',
      })
    ).toEqual([
      {
        path: '/_svc/cleanup/crons/cleanup/cron',
        schedule: '0 0 * * *',
        exportName: 'default',
      },
    ]);
  });

  it('produces a single entry for a schedule-triggered job', async () => {
    expect(
      await getServiceCrons({
        service: {
          type: 'job',
          trigger: 'schedule',
          name: 'cleanup',
          schedule: '*/5 * * * *',
        },
        entrypoint: 'jobs/cleanup.ts',
      })
    ).toEqual([
      {
        path: '/_svc/cleanup/crons/jobs/cleanup/cron',
        schedule: '*/5 * * * *',
        exportName: 'default',
      },
    ]);
  });

  it('throws when entrypoint is missing for a cron service', async () => {
    await expect(
      getServiceCrons({
        service: { type: 'cron', name: 'cleanup', schedule: '0 0 * * *' },
      })
    ).rejects.toThrow(/missing an entrypoint/);
  });

  it('throws on a <dynamic> schedule when no bundle is provided', async () => {
    await expect(
      getServiceCrons({
        service: { type: 'cron', name: 'cleanup', schedule: '<dynamic>' },
        entrypoint: 'cleanup.ts',
      })
    ).rejects.toThrow(/Dynamic cron detection requires the bundled output/);
  });
});

describe.skipIf(process.platform === 'win32')(
  'getServiceCrons (<dynamic>)',
  () => {
    let bundleDir: string;

    beforeEach(async () => {
      bundleDir = await mkdtemp(join(tmpdir(), 'be-cron-dynamic-'));
      // Mark the dir as ESM so `.mjs`-via-extension already implies ESM,
      // and a hypothetical `.js` would also be treated as ESM.
      await writeFile(
        join(bundleDir, 'package.json'),
        JSON.stringify({ type: 'module' }),
        'utf-8'
      );
    });

    afterEach(async () => {
      await rm(bundleDir, { recursive: true, force: true });
    });

    async function detect(handler: string, source: string) {
      await writeFile(join(bundleDir, handler), source, 'utf-8');
      return getServiceCrons({
        service: { type: 'cron', name: 'tasks', schedule: '<dynamic>' },
        entrypoint: handler,
        bundle: { dir: bundleDir, handler },
      });
    }

    it('detects a single sync entry', async () => {
      const result = await detect(
        'index.mjs',
        `
export default () => [{ handler: 'hourly', schedule: '0 * * * *' }];
export function hourly() {}
`
      );
      expect(result).toEqual([
        {
          path: '/_svc/tasks/crons/index/hourly',
          schedule: '0 * * * *',
          exportName: 'hourly',
        },
      ]);
    });

    it('detects multiple async entries', async () => {
      const result = await detect(
        'index.mjs',
        `
export default async () => [
  { handler: 'hourly', schedule: '0 * * * *' },
  { handler: 'daily',  schedule: '0 0 * * *' },
];
export async function hourly() {}
export async function daily()  {}
`
      );
      expect(result).toEqual([
        {
          path: '/_svc/tasks/crons/index/hourly',
          schedule: '0 * * * *',
          exportName: 'hourly',
        },
        {
          path: '/_svc/tasks/crons/index/daily',
          schedule: '0 0 * * *',
          exportName: 'daily',
        },
      ]);
    });

    it('errors when default export is missing', async () => {
      await expect(
        detect('index.mjs', `export const notDefault = () => [];`)
      ).rejects.toThrow(/must default-export a function/);
    });

    it('errors when default export is not callable', async () => {
      await expect(
        detect('index.mjs', `export default 'not a function';`)
      ).rejects.toThrow(/must default-export a function/);
    });

    it('surfaces errors thrown by the registry', async () => {
      await expect(
        detect(
          'index.mjs',
          `export default () => { throw new Error('boom'); };`
        )
      ).rejects.toThrow(/error calling default export[\s\S]*boom/);
    });

    it('errors when the registry returns a non-array', async () => {
      await expect(
        detect(
          'index.mjs',
          `export default () => ({ handler: 'h', schedule: '* * * * *' });`
        )
      ).rejects.toThrow(/must return an array/);
    });

    it('errors when the registry returns no entries', async () => {
      await expect(
        detect('index.mjs', `export default () => [];`)
      ).rejects.toThrow(/returned no entries/);
    });

    it('errors when an entry is missing handler', async () => {
      await expect(
        detect('index.mjs', `export default () => [{ schedule: '* * * * *' }];`)
      ).rejects.toThrow(/"handler" must be a non-empty string/);
    });

    it('errors when an entry is missing schedule', async () => {
      await expect(
        detect(
          'index.mjs',
          `
export default () => [{ handler: 'hourly' }];
export function hourly() {}
`
        )
      ).rejects.toThrow(/"schedule" must be a non-empty string/);
    });

    it('errors when handler contains invalid characters', async () => {
      await expect(
        detect(
          'index.mjs',
          `
export default () => [{ handler: 'bad/name', schedule: '* * * * *' }];
export function badName() {}
`
        )
      ).rejects.toThrow(/contains invalid characters/);
    });

    it('errors when handler does not match a function export', async () => {
      await expect(
        detect(
          'index.mjs',
          `export default () => [{ handler: 'missing', schedule: '* * * * *' }];`
        )
      ).rejects.toThrow(/does not match a function export/);
    });

    it('errors on duplicate handlers', async () => {
      await expect(
        detect(
          'index.mjs',
          `
export default () => [
  { handler: 'hourly', schedule: '0 * * * *' },
  { handler: 'hourly', schedule: '0 0 * * *' },
];
export function hourly() {}
`
        )
      ).rejects.toThrow(/duplicate cron entry handler/);
    });
  }
);

describe('buildCronRouteTable', () => {
  it('maps each entry path to its handler', () => {
    expect(
      buildCronRouteTable([
        {
          path: '/_svc/cleanup/crons/cleanup/cron',
          schedule: '0 0 * * *',
          exportName: 'default',
        },
        {
          path: '/_svc/jobs/crons/jobs/hourly',
          schedule: '0 * * * *',
          exportName: 'hourly',
        },
      ])
    ).toEqual({
      '/_svc/cleanup/crons/cleanup/cron': 'default',
      '/_svc/jobs/crons/jobs/hourly': 'hourly',
    });
  });
});
