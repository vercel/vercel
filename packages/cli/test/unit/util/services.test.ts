import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';

import {
  servicesToBuildsAndRoutes,
  validateServices,
} from '../../../src/util/services';
import type { VercelConfig } from '../../../src/util/dev/types';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))
  );
});

async function createFixture(files: Record<string, string>): Promise<string> {
  const cwd = await mkdtemp(path.join(tmpdir(), 'vercel-services-'));
  tempDirs.push(cwd);

  await Promise.all(
    Object.entries(files).map(async ([relativePath, contents]) => {
      const filePath = path.join(cwd, relativePath);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, contents);
    })
  );

  return cwd;
}

describe('services utilities', () => {
  it('treats prefix "/" as a root service when generating routes', async () => {
    const cwd = await createFixture({
      'root.py': 'print("root")',
      'api.py': 'print("api")',
    });

    const { rewriteRoutes } = await servicesToBuildsAndRoutes(
      [
        { type: 'web', entry: 'root.py', prefix: '/' },
        { type: 'web', entry: 'api.py', prefix: '/api' },
      ],
      cwd
    );

    expect(rewriteRoutes).toEqual([
      { src: '^/api(?:/.*)?$', dest: '/api.py', check: true },
      { src: '^(?!\\/api(?:/|$)).*', dest: '/root.py', check: true },
    ]);
  });

  it('generates catch-all route for "/" prefix when no other prefixes exist', async () => {
    const cwd = await createFixture({
      'root.py': 'print("root")',
    });

    const { rewriteRoutes } = await servicesToBuildsAndRoutes(
      [{ type: 'web', entry: 'root.py', prefix: '/' }],
      cwd
    );

    expect(rewriteRoutes).toEqual([
      { src: '^/.*', dest: '/root.py', check: true },
    ]);
  });

  it('treats prefix "/" as a root during validation', () => {
    const error = validateServices({
      services: [
        { type: 'web', entry: 'root.py', prefix: '/' },
        { type: 'web', entry: 'other.py' },
      ],
    } as VercelConfig);

    expect(error?.code).toBe('SERVICES_MULTIPLE_ROOT');
  });

  it('creates cron builds, crons, and internal routes for cron services', async () => {
    const cwd = await createFixture({
      'crons/daily.py': 'def main():\n    print("daily")\n',
    });

    const { builds, rewriteRoutes, crons } = await servicesToBuildsAndRoutes(
      [
        {
          type: 'cron',
          entry: 'crons/daily.py',
          schedule: '* * * * *',
        },
      ] as any,
      cwd
    );

    expect(builds).toHaveLength(1);
    expect(builds[0].src).toBe('crons/daily.py');
    expect(builds[0].use).toBe('@vercel/python');

    expect(crons).toEqual([
      {
        path: '/_vc/crons/crons/daily/main',
        schedule: '* * * * *',
      },
    ]);

    expect(rewriteRoutes).toEqual([
      {
        src: '^/_vc/crons/crons/daily/main$',
        dest: '/crons/daily.py',
        check: true,
      },
    ]);
  });

  it('creates worker builds and internal routes for worker services', async () => {
    const cwd = await createFixture({
      'workers/worker.py': 'print("worker")\n',
    });

    const { builds, rewriteRoutes } = await servicesToBuildsAndRoutes(
      [
        {
          type: 'worker',
          entry: 'workers/worker.py',
          topic: 'default',
        },
      ] as any,
      cwd
    );

    expect(builds).toHaveLength(1);
    expect(builds[0].src).toBe('workers/worker.py');
    expect(builds[0].use).toBe('@vercel/python');

    expect(rewriteRoutes).toEqual([
      {
        src: '^/_vc/workers/workers/worker/worker$',
        dest: '/workers/worker.py',
        check: true,
      },
    ]);
  });

  it('requires schedule for cron services during validation', () => {
    const error = validateServices({
      services: [{ type: 'cron', entry: 'crons/daily.py' }],
    } as unknown as VercelConfig);

    expect(error?.code).toBe('SERVICES_CRON_MISSING_SCHEDULE');
  });
});
