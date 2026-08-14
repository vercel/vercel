import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve as pathResolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it, beforeAll } from 'vitest';
import getPort from 'get-port';
import { applyCronDispatch } from '../src/cron-dispatch';
import { spawnCronHost } from '../src/dev/spawn-cron-host';

const require_ = createRequire(import.meta.url);

// Tests exercise the *built* host artifact (dist/dev/cron-host.mjs).
// All dispatch behavior comes from the shim itself — those branches are
// covered by unit.cron-dispatch.test.ts.
const HOST_PATH = pathResolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'dist',
  'dev',
  'cron-host.mjs'
);

interface HostCtx {
  port: number;
  child: ChildProcess;
  cleanup: () => Promise<void>;
}

async function startHost(opts: {
  userModuleSource: string;
  userModuleFilename?: string;
  routes: Record<string, string>;
  cronSecret?: string;
  packageJson?: object;
}): Promise<HostCtx> {
  const userDir = await mkdtemp(join(tmpdir(), 'be-cron-host-user-'));
  const filename = opts.userModuleFilename || 'task.js';
  await writeFile(
    join(userDir, 'package.json'),
    JSON.stringify(opts.packageJson || { type: 'module' }),
    'utf-8'
  );
  const userAbs = join(userDir, filename);
  await writeFile(userAbs, opts.userModuleSource, 'utf-8');

  // Generate the production shim, retargeted to import by absolute path
  // — same call startDevServer makes at runtime. Tests use ESM user
  // modules, so the override is the file:// URL.
  const dispatch = await applyCronDispatch({
    files: {},
    handler: filename,
    workPath: userDir,
    routes: opts.routes,
    modulePathOverride: pathToFileURL(userAbs).href,
  });
  const shimSource = (
    dispatch.files[dispatch.handler] as unknown as { data: string }
  ).data;

  const env = { ...process.env } as NodeJS.ProcessEnv;
  if (opts.cronSecret !== undefined) {
    env.CRON_SECRET = opts.cronSecret;
  } else {
    delete env.CRON_SECRET;
  }

  const { child, port, shimDir } = await spawnCronHost({
    hostPath: HOST_PATH,
    shimSource,
    shimFileName: dispatch.handler,
    cwd: userDir,
    env,
  });

  // Wait for the host's stdout sentinel rather than just port-reachability
  // — the test exercises the full boot path (shim import, dispatch table
  // resolution) and a stdout match catches misbehavior earlier.
  await new Promise<void>((resolveFn, reject) => {
    let resolved = false;
    const onStdout = (buf: Buffer) => {
      if (!resolved && buf.toString().includes('listening on port')) {
        resolved = true;
        resolveFn();
      }
    };
    const onStderr = (buf: Buffer) => process.stderr.write(buf);
    const onExit = (code: number | null) => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`host exited before binding (code=${code})`));
      }
    };
    child.stdout?.on('data', onStdout);
    child.stderr?.on('data', onStderr);
    child.once('exit', onExit);
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error('host did not become ready within 10s'));
      }
    }, 10_000).unref();
  });

  const cleanup = async () => {
    try {
      child.kill('SIGTERM');
    } catch {
      /* already dead */
    }
    await new Promise<void>(r => {
      const t = setTimeout(r, 1000);
      child.once('exit', () => {
        clearTimeout(t);
        r();
      });
    });
    await rm(userDir, { recursive: true, force: true });
    await rm(shimDir, { recursive: true, force: true });
  };

  return { port, child, cleanup };
}

async function fetchHost(
  port: number,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${path}`, init);
}

describe.skipIf(process.platform === 'win32')('cron dev host', () => {
  beforeAll(async () => {
    const stat = await readFile(HOST_PATH).catch(() => null);
    if (!stat) {
      throw new Error(
        `host artifact missing at ${HOST_PATH} — run \`pnpm build\` in packages/backends first`
      );
    }
  });

  it('routes a POST to the shim and returns 200', async () => {
    const ctx = await startHost({
      userModuleSource: 'export default async function () {}',
      routes: { '/_svc/x/crons/task/cron': 'default' },
    });
    try {
      const res = await fetchHost(ctx.port, '/_svc/x/crons/task/cron', {
        method: 'POST',
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    } finally {
      await ctx.cleanup();
    }
  });

  it('returns 405 for non-GET/POST methods (shim path)', async () => {
    const ctx = await startHost({
      userModuleSource: 'export default async function () {}',
      routes: { '/_svc/x/crons/task/cron': 'default' },
    });
    try {
      const res = await fetchHost(ctx.port, '/_svc/x/crons/task/cron', {
        method: 'PUT',
      });
      expect(res.status).toBe(405);
    } finally {
      await ctx.cleanup();
    }
  });

  it('honors CRON_SECRET via Authorization Bearer (shim path)', async () => {
    const ctx = await startHost({
      userModuleSource: 'export default async function () {}',
      routes: { '/_svc/x/crons/task/cron': 'default' },
      cronSecret: 's3cret',
    });
    try {
      const unauth = await fetchHost(ctx.port, '/_svc/x/crons/task/cron', {
        method: 'POST',
      });
      expect(unauth.status).toBe(401);
      const ok = await fetchHost(ctx.port, '/_svc/x/crons/task/cron', {
        method: 'POST',
        headers: { authorization: 'Bearer s3cret' },
      });
      expect(ok.status).toBe(200);
    } finally {
      await ctx.cleanup();
    }
  });

  it('exits non-zero when the shim file is missing', async () => {
    const env = { ...process.env } as NodeJS.ProcessEnv;
    env.__VC_DISPATCH_SHIM_ABS = '/nonexistent/shim.mjs';
    env.__VC_PORT = String(await getPort());
    const tsxBin = require_.resolve('tsx');
    const child = spawn(process.execPath, ['--import', tsxBin, HOST_PATH], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const exitCode = await new Promise<number | null>(r => {
      child.once('exit', code => r(code));
    });
    expect(exitCode).toBe(1);
  });

  it('exits non-zero when env vars are missing', async () => {
    const env = { ...process.env } as NodeJS.ProcessEnv;
    delete env.__VC_DISPATCH_SHIM_ABS;
    delete env.__VC_PORT;
    const tsxBin = require_.resolve('tsx');
    const child = spawn(process.execPath, ['--import', tsxBin, HOST_PATH], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stderrChunks: Buffer[] = [];
    child.stderr?.on('data', b => stderrChunks.push(b));
    const exitCode = await new Promise<number | null>(r => {
      child.once('exit', code => r(code));
    });
    expect(exitCode).toBe(1);
    expect(Buffer.concat(stderrChunks).toString()).toMatch(
      /missing __VC_DISPATCH_SHIM_ABS/
    );
  });
});
