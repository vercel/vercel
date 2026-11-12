import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import execa from 'execa';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startDevServer } from '../src/start-dev-server';

vi.setConfig({ testTimeout: 120 * 1000, hookTimeout: 120 * 1000 });

async function killServer(pid: number) {
  if (process.platform === 'win32') {
    // `/T` also kills the reloader's child.
    await execa('taskkill', ['/pid', String(pid), '/T', '/F'], {
      reject: false,
    });
    return;
  }
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    // Already stopped.
  }
}

// No retries: a retry would reuse the server the failed attempt started.
describe('startDevServer with a proxy', { retry: 0 }, () => {
  let workPath: string;
  const pids = new Set<number>();

  function start(entrypoint: string, handlerFunction = 'proxy') {
    return startDevServer({
      entrypoint,
      workPath,
      config: { zeroConfig: true, middleware: true, handlerFunction },
      meta: { isDev: true },
      files: {},
      repoRootPath: workPath,
    });
  }

  beforeAll(async () => {
    workPath = await mkdtemp(join(tmpdir(), 'vc-python-proxy-dev-'));
    // No `vercel.proxy` dependency group, so nothing is installed.
    await writeFile(
      join(workPath, 'pyproject.toml'),
      '[project]\nname = "proxy-dev"\nversion = "0.0.1"\n'
    );
    await writeFile(
      join(workPath, 'proxy.py'),
      [
        'def proxy(environ, start_response):',
        '    if environ.get("PATH_INFO") == "/block":',
        '        start_response("403 Forbidden", [("Content-Type", "text/plain")])',
        '        return [b"blocked"]',
        '    start_response("200 OK", [("x-middleware-next", "1")])',
        '    return [b""]',
        '',
      ].join('\n')
    );
    await writeFile(join(workPath, 'broken.py'), 'other = None\n');
  });

  afterAll(async () => {
    for (const pid of pids) {
      await killServer(pid);
    }
    await rm(workPath, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 200,
    });
  });

  it('starts one server for concurrent first requests', async () => {
    const results = await Promise.all([
      start('proxy.py'),
      start('proxy.py'),
      start('proxy.py'),
    ]);
    for (const result of results) {
      if (!result) throw new Error('proxy dev server did not start');
      pids.add(result.pid);
    }

    expect(new Set(results.map(r => r?.pid)).size).toBe(1);
    const response = await fetch(`http://127.0.0.1:${results[0]?.port}/block`);
    expect(response.status).toBe(403);
    expect(await response.text()).toBe('blocked');
  });

  it('rejects every request when the handler is missing', async () => {
    // With no other request waiting, the failed start must not surface as an
    // unhandled rejection, which exits `vc dev`.
    await expect(start('broken.py')).rejects.toMatchObject({
      code: 'PYTHON_HANDLER_NOT_FOUND',
    });

    const results = await Promise.allSettled([
      start('broken.py'),
      start('broken.py'),
    ]);

    for (const result of results) {
      expect(result.status).toBe('rejected');
      expect((result as PromiseRejectedResult).reason).toMatchObject({
        code: 'PYTHON_HANDLER_NOT_FOUND',
      });
    }
  });
});
