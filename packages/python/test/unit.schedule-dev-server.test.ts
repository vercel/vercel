import { mkdtemp, readFile, rm, writeFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import execa from 'execa';
import type { ScheduleFunctionBuildConfig } from '@vercel/build-utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startDevServer } from '../src/start-dev-server';
import { createScheduleHandlerModule } from '../src/schedules';

vi.setConfig({ testTimeout: 120 * 1000, hookTimeout: 120 * 1000 });

const outputPath = '_vercel/schedules/default';

function scheduleFunction(
  ...scheduleNames: string[]
): ScheduleFunctionBuildConfig {
  return {
    outputPath,
    entrypoints: [
      {
        entrypoint: 'jobs/tick.py',
        sourceFile: 'jobs/tick.py',
        scheduleNames,
      },
    ],
  };
}

function dispatch(port: number, name: string, path = outputPath) {
  return fetch(`http://127.0.0.1:${port}/${path}`, {
    method: 'POST',
    headers: {
      'ce-specversion': '1.0',
      'ce-type': 'com.vercel.schedule.v1beta',
      'ce-source': `/schedule/default/${name}`,
      'ce-id': `schx_${name}`,
      'ce-vssscheduleid': `sch_${name}`,
      'ce-vssscheduledat': '2026-01-01T00:00:00Z',
      'ce-vssschedulename': name,
      'ce-vssnamespace': 'default',
      'ce-vssschedulesource': 'static',
    },
  });
}

function isGroupAlive(pid: number) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe('createScheduleHandlerModule', () => {
  it('resolves scripts from an explicit root for vercel dev', () => {
    expect(
      createScheduleHandlerModule(scheduleFunction('tick'), '/work/app')
    ).toContain(
      [
        '_root = "/work/app"',
        'app = create_schedule_scripts_app({',
        '    "tick": os.path.join(_root, "jobs/tick.py"),',
        '})',
      ].join('\n')
    );
  });
});

// The runtime's schedule supervisor starts scripts with POSIX-only process
// and pipe handling.
const isWindows = process.platform === 'win32';

describe.skipIf(isWindows)('startDevServer with a schedule function', () => {
  let workPath: string;
  const pids = new Set<number>();

  async function start(
    config: ScheduleFunctionBuildConfig,
    env?: NodeJS.ProcessEnv
  ) {
    const result = await startDevServer({
      entrypoint: 'jobs/tick.py',
      workPath,
      config: { zeroConfig: true, scheduleFunction: config },
      meta: { isDev: true, env },
      files: {},
      repoRootPath: workPath,
    });
    if (!result) throw new Error('schedule dev server did not start');
    pids.add(result.pid);
    return result;
  }

  beforeAll(async () => {
    workPath = await mkdtemp(join(tmpdir(), 'vc-python-schedule-dev-'));
    await mkdir(join(workPath, 'jobs'));
    // Import a project module to check the script's import path.
    await writeFile(join(workPath, 'helpers.py'), 'PREFIX = "fired"\n');
    await writeFile(
      join(workPath, 'jobs/tick.py'),
      [
        'import os',
        'from helpers import PREFIX',
        'name = os.environ["VERCEL_SCHEDULE_NAME"]',
        'with open(os.path.join(os.getcwd(), f"{name}.out"), "w") as f:',
        '    f.write(f"{PREFIX} {name} {os.environ[\'VERCEL_SCHEDULE_EXECUTION_ID\']}")',
        'with open(os.path.join(os.getcwd(), f"{name}.env"), "w") as f:',
        '    f.write(os.environ.get("APP_VALUE", ""))',
        '',
      ].join('\n')
    );
    await execa('python3', ['-m', 'venv', '.venv'], { cwd: workPath });
  });

  afterAll(async () => {
    for (const pid of pids) {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        // Already stopped.
      }
    }
    await rm(workPath, { recursive: true, force: true });
  });

  it('runs the dispatched schedule script from the project root', async () => {
    const { port } = await start(scheduleFunction('tick'));
    const response = await dispatch(port, 'tick');
    expect(response.status).toBeLessThan(300);
    expect(await readFile(join(workPath, 'tick.out'), 'utf8')).toBe(
      'fired tick schx_tick'
    );
    expect((await dispatch(port, 'other')).status).toBe(400);
  });

  it('reuses the server until its schedules change', async () => {
    const first = await start(scheduleFunction('tick'));
    expect((await start(scheduleFunction('tick'))).pid).toBe(first.pid);

    const changed = await start(scheduleFunction('tick', 'retry'));
    expect(changed.pid).not.toBe(first.pid);
    await expect.poll(() => isGroupAlive(first.pid)).toBe(false);
    expect((await dispatch(changed.port, 'retry')).status).toBeLessThan(300);
    expect(await readFile(join(workPath, 'retry.out'), 'utf8')).toBe(
      'fired retry schx_retry'
    );
  });

  it('keeps colliding output paths on separate servers', async () => {
    const hyphen = {
      ...scheduleFunction('hyphen'),
      outputPath: '_vercel/schedules/foo-bar',
    };
    const underscore = {
      ...scheduleFunction('underscore'),
      outputPath: '_vercel/schedules/foo_bar',
    };
    const [first, second] = await Promise.all([
      start(hyphen),
      start(underscore),
    ]);

    expect(first.pid).not.toBe(second.pid);
    expect(
      (await dispatch(first.port, 'hyphen', hyphen.outputPath)).status
    ).toBeLessThan(300);
    expect(
      (await dispatch(second.port, 'underscore', underscore.outputPath)).status
    ).toBeLessThan(300);
  });

  it('restarts when the schedule environment changes', async () => {
    const config = scheduleFunction('tick');
    const first = await start(config, { APP_VALUE: 'old' });
    expect((await dispatch(first.port, 'tick')).status).toBeLessThan(300);
    expect(await readFile(join(workPath, 'tick.env'), 'utf8')).toBe('old');
    expect((await start(config, { APP_VALUE: 'old' })).pid).toBe(first.pid);

    const changed = await start(config, { APP_VALUE: 'new' });
    expect(changed.pid).not.toBe(first.pid);
    expect((await dispatch(changed.port, 'tick')).status).toBeLessThan(300);
    expect(await readFile(join(workPath, 'tick.env'), 'utf8')).toBe('new');
  });

  it('rechecks schedules after an in-flight start', async () => {
    const path = '_vercel/schedules/pending';
    const [first, changed] = await Promise.all([
      start({ ...scheduleFunction('tick'), outputPath: path }),
      start({ ...scheduleFunction('tick', 'retry'), outputPath: path }),
    ]);

    expect(changed.pid).not.toBe(first.pid);
    expect((await dispatch(changed.port, 'retry', path)).status).toBeLessThan(
      300
    );
  });
});
