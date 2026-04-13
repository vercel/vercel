import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { tmpdir } from 'os';
import { getServiceCrons } from '../src/crons';

const pythonBin = process.env.PYTHON_BIN || 'python3';

describe('dynamic cron detection (integration)', () => {
  let workDir: string;

  afterEach(async () => {
    if (workDir) {
      await fs.remove(workDir);
    }
  });

  async function setupWorkDir(files: Record<string, string>): Promise<string> {
    workDir = path.join(
      tmpdir(),
      `cron-detect-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await fs.mkdirp(workDir);
    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = path.join(workDir, filePath);
      await fs.mkdirp(path.dirname(fullPath));
      await fs.writeFile(fullPath, content);
    }
    return workDir;
  }

  it('detects a single cron entry', async () => {
    await setupWorkDir({
      'jobs/cleanup.py': `
def get_crons():
    return [("jobs.cleanup:run", "0 0 * * *")]

def run():
    pass
`,
    });

    const result = await getServiceCrons({
      service: { type: 'cron', name: 'cleanup', schedule: '<dynamic>' },
      entrypoint: 'jobs/cleanup.py',
      handlerFunction: 'get_crons',
      pythonBin,
      env: { ...process.env, PYTHONPATH: workDir },
      workPath: workDir,
    });

    expect(result).toEqual([
      {
        path: '/_svc/cleanup/crons/jobs/cleanup/run',
        schedule: '0 0 * * *',
        resolvedHandler: 'jobs.cleanup:run',
      },
    ]);
  });

  it('detects multiple cron entries', async () => {
    await setupWorkDir({
      'jobs/tasks.py': `
def get_crons():
    return [
        ("jobs.tasks:daily_sync", "0 6 * * *"),
        ("jobs.tasks:hourly_check", "0 * * * *"),
    ]

def daily_sync():
    pass

def hourly_check():
    pass
`,
    });

    const result = await getServiceCrons({
      service: { type: 'cron', name: 'tasks', schedule: '<dynamic>' },
      entrypoint: 'jobs/tasks.py',
      handlerFunction: 'get_crons',
      pythonBin,
      env: { ...process.env, PYTHONPATH: workDir },
      workPath: workDir,
    });

    expect(result).toEqual([
      {
        path: '/_svc/tasks/crons/jobs/tasks/daily_sync',
        schedule: '0 6 * * *',
        resolvedHandler: 'jobs.tasks:daily_sync',
      },
      {
        path: '/_svc/tasks/crons/jobs/tasks/hourly_check',
        schedule: '0 * * * *',
        resolvedHandler: 'jobs.tasks:hourly_check',
      },
    ]);
  });

  it('detects entries that reference different modules', async () => {
    await setupWorkDir({
      'jobs/__init__.py': '',
      'jobs/registry.py': `
def get_crons():
    return [
        ("jobs.sync:run", "0 0 * * *"),
        ("jobs.report:generate", "0 6 * * 1"),
    ]
`,
      'jobs/sync.py': `
def run():
    pass
`,
      'jobs/report.py': `
def generate():
    pass
`,
    });

    const result = await getServiceCrons({
      service: { type: 'cron', name: 'scheduler', schedule: '<dynamic>' },
      entrypoint: 'jobs/registry.py',
      handlerFunction: 'get_crons',
      pythonBin,
      env: { ...process.env, PYTHONPATH: workDir },
      workPath: workDir,
    });

    expect(result).toEqual([
      {
        path: '/_svc/scheduler/crons/jobs/sync/run',
        schedule: '0 0 * * *',
        resolvedHandler: 'jobs.sync:run',
      },
      {
        path: '/_svc/scheduler/crons/jobs/report/generate',
        schedule: '0 6 * * 1',
        resolvedHandler: 'jobs.report:generate',
      },
    ]);
  });

  it('reports error when module cannot be imported', async () => {
    await setupWorkDir({});

    await expect(
      getServiceCrons({
        service: { type: 'cron', name: 'bad', schedule: '<dynamic>' },
        entrypoint: 'nonexistent.py',
        handlerFunction: 'get_crons',
        pythonBin,
        env: { ...process.env, PYTHONPATH: workDir },
        workPath: workDir,
      })
    ).rejects.toThrow(/Failed to import module/);
  });

  it('reports error when callable does not exist', async () => {
    await setupWorkDir({
      'jobs/cleanup.py': `
def something_else():
    pass
`,
    });

    await expect(
      getServiceCrons({
        service: { type: 'cron', name: 'cleanup', schedule: '<dynamic>' },
        entrypoint: 'jobs/cleanup.py',
        handlerFunction: 'get_crons',
        pythonBin,
        env: { ...process.env, PYTHONPATH: workDir },
        workPath: workDir,
      })
    ).rejects.toThrow(/no attribute 'get_crons'/);
  });

  it('reports error when callable returns invalid entries', async () => {
    await setupWorkDir({
      'jobs/cleanup.py': `
def get_crons():
    return ["not a tuple"]
`,
    });

    await expect(
      getServiceCrons({
        service: { type: 'cron', name: 'cleanup', schedule: '<dynamic>' },
        entrypoint: 'jobs/cleanup.py',
        handlerFunction: 'get_crons',
        pythonBin,
        env: { ...process.env, PYTHONPATH: workDir },
        workPath: workDir,
      })
    ).rejects.toThrow(/must be a.*pair/);
  });

  it('reports error when callable returns empty iterable', async () => {
    await setupWorkDir({
      'jobs/cleanup.py': `
def get_crons():
    return []
`,
    });

    await expect(
      getServiceCrons({
        service: { type: 'cron', name: 'cleanup', schedule: '<dynamic>' },
        entrypoint: 'jobs/cleanup.py',
        handlerFunction: 'get_crons',
        pythonBin,
        env: { ...process.env, PYTHONPATH: workDir },
        workPath: workDir,
      })
    ).rejects.toThrow(/returned no entries/);
  });
});
