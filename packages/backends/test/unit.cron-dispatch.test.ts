import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applyCronDispatch } from '../src/cron-dispatch';

async function setupWorkPath(packageJson?: object): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'be-cron-dispatch-'));
  if (packageJson) {
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify(packageJson),
      'utf-8'
    );
  }
  return dir;
}

function getShimSource(
  result: Awaited<ReturnType<typeof applyCronDispatch>>
): string {
  const blob = result.files[result.handler];
  // FileBlob.data is the source string we wrote.
  return (blob as unknown as { data: string }).data;
}

describe('applyCronDispatch', () => {
  it('produces an ESM shim for an .mjs handler', async () => {
    const workPath = await setupWorkPath();
    try {
      const result = await applyCronDispatch({
        files: {},
        handler: 'index.mjs',
        workPath,
      });
      expect(result.handler).toBe('index.__vc_cron_dispatch.mjs');
      const src = getShimSource(result);
      expect(src).toContain('import * as __vc_user_module from "./index.mjs"');
      expect(src).toContain('export default function');
      expect(src).toContain('__VC_CRON_ROUTES');
      expect(src).toContain('CRON_SECRET');
    } finally {
      await rm(workPath, { recursive: true, force: true });
    }
  });

  it('produces a CJS shim for a .cjs handler', async () => {
    const workPath = await setupWorkPath();
    try {
      const result = await applyCronDispatch({
        files: {},
        handler: 'index.cjs',
        workPath,
      });
      expect(result.handler).toBe('index.__vc_cron_dispatch.cjs');
      const src = getShimSource(result);
      expect(src).toContain('const __vc_user_module = require("./index.cjs")');
      expect(src).toContain('module.exports = function');
      expect(src).toContain('__VC_CRON_ROUTES');
    } finally {
      await rm(workPath, { recursive: true, force: true });
    }
  });

  it('treats .js as ESM when package.json "type" is "module"', async () => {
    const workPath = await setupWorkPath({ type: 'module' });
    try {
      const result = await applyCronDispatch({
        files: {},
        handler: 'index.js',
        workPath,
      });
      expect(result.handler).toBe('index.__vc_cron_dispatch.js');
      const src = getShimSource(result);
      expect(src).toContain('import * as __vc_user_module from "./index.js"');
      expect(src).toContain('export default function');
    } finally {
      await rm(workPath, { recursive: true, force: true });
    }
  });

  it('treats .js as CJS when package.json has no module type', async () => {
    const workPath = await setupWorkPath({ name: 'app' });
    try {
      const result = await applyCronDispatch({
        files: {},
        handler: 'index.js',
        workPath,
      });
      expect(result.handler).toBe('index.__vc_cron_dispatch.js');
      const src = getShimSource(result);
      expect(src).toContain('const __vc_user_module = require("./index.js")');
      expect(src).toContain('module.exports = function');
    } finally {
      await rm(workPath, { recursive: true, force: true });
    }
  });

  it('places the shim alongside a nested handler', async () => {
    const workPath = await setupWorkPath({ type: 'module' });
    try {
      const result = await applyCronDispatch({
        files: {},
        handler: 'jobs/index.mjs',
        workPath,
      });
      expect(result.handler).toBe('jobs/index.__vc_cron_dispatch.mjs');
      const src = getShimSource(result);
      expect(src).toContain('import * as __vc_user_module from "./index.mjs"');
    } finally {
      await rm(workPath, { recursive: true, force: true });
    }
  });

  it('preserves existing files and adds the shim', async () => {
    const workPath = await setupWorkPath({ type: 'module' });
    try {
      const original = { 'index.mjs': 'sentinel' as unknown };
      const result = await applyCronDispatch({
        files: original as never,
        handler: 'index.mjs',
        workPath,
      });
      expect(result.files['index.mjs']).toBe('sentinel');
      expect(result.files['index.__vc_cron_dispatch.mjs']).toBeDefined();
    } finally {
      await rm(workPath, { recursive: true, force: true });
    }
  });
});

interface MockRes {
  statusCode: number;
  body: string;
  setHeader: () => void;
  end: (body: string) => void;
}

function makeReq(
  method: string,
  url: string,
  headers: Record<string, string> = {}
) {
  return { method, url, headers } as const;
}

function makeRes(): MockRes {
  const res = {
    statusCode: 200,
    body: '',
    setHeader() {
      // no-op
    },
    end(body: string) {
      this.body = body;
    },
  } as MockRes;
  return res;
}

interface ShimContext {
  handler: (req: unknown, res: MockRes) => Promise<void>;
  cleanup: () => Promise<void>;
}

async function setupShimDir(opts: {
  /**
   * Object → JSON-stringified into the env var.
   * String → used verbatim (for malformed-JSON tests).
   * `null` → env var deleted (for missing-env tests).
   */
  routes: Record<string, string> | string | null;
  cronSecret?: string;
  userModuleSource: string;
}): Promise<{ shimUrl: string; restore: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), 'be-cron-behave-'));
  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify({ type: 'module' }),
    'utf-8'
  );
  await writeFile(join(dir, 'index.mjs'), opts.userModuleSource, 'utf-8');
  const result = await applyCronDispatch({
    files: {},
    handler: 'index.mjs',
    workPath: dir,
  });
  const shimSource = (
    result.files[result.handler] as unknown as { data: string }
  ).data;
  await writeFile(join(dir, result.handler), shimSource, 'utf-8');

  const prevRoutes = process.env.__VC_CRON_ROUTES;
  const prevSecret = process.env.CRON_SECRET;
  if (opts.routes === null) {
    delete process.env.__VC_CRON_ROUTES;
  } else {
    process.env.__VC_CRON_ROUTES =
      typeof opts.routes === 'string'
        ? opts.routes
        : JSON.stringify(opts.routes);
  }
  if (opts.cronSecret !== undefined) {
    process.env.CRON_SECRET = opts.cronSecret;
  } else {
    delete process.env.CRON_SECRET;
  }

  return {
    shimUrl: pathToFileURL(join(dir, result.handler)).toString(),
    restore: async () => {
      if (prevRoutes === undefined) delete process.env.__VC_CRON_ROUTES;
      else process.env.__VC_CRON_ROUTES = prevRoutes;
      if (prevSecret === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = prevSecret;
      await rm(dir, { recursive: true, force: true });
    },
  };
}

async function loadEsmShim(opts: {
  routes: Record<string, string>;
  cronSecret?: string;
  userModuleSource: string;
}): Promise<ShimContext> {
  const setup = await setupShimDir(opts);
  try {
    const mod = await import(setup.shimUrl);
    return { handler: mod.default, cleanup: setup.restore };
  } catch (err) {
    await setup.restore();
    throw err;
  }
}

describe('cron dispatcher behavior', () => {
  it('returns 405 for non-GET/POST methods', async () => {
    const ctx = await loadEsmShim({
      routes: { '/_svc/x/crons/index/cron': 'default' },
      userModuleSource: 'export default async function () {}',
    });
    try {
      const res = makeRes();
      await ctx.handler(makeReq('PUT', '/_svc/x/crons/index/cron'), res);
      expect(res.statusCode).toBe(405);
      expect(JSON.parse(res.body)).toEqual({ error: 'method not allowed' });
    } finally {
      await ctx.cleanup();
    }
  });

  it('checks method before auth (PUT without secret returns 405, not 401)', async () => {
    const ctx = await loadEsmShim({
      routes: { '/_svc/x/crons/index/cron': 'default' },
      cronSecret: 's3cret',
      userModuleSource: 'export default async function () {}',
    });
    try {
      const res = makeRes();
      await ctx.handler(makeReq('PUT', '/_svc/x/crons/index/cron'), res);
      expect(res.statusCode).toBe(405);
    } finally {
      await ctx.cleanup();
    }
  });

  it('returns 401 when CRON_SECRET set and Authorization header missing', async () => {
    const ctx = await loadEsmShim({
      routes: { '/_svc/x/crons/index/cron': 'default' },
      cronSecret: 's3cret',
      userModuleSource: 'export default async function () {}',
    });
    try {
      const res = makeRes();
      await ctx.handler(makeReq('POST', '/_svc/x/crons/index/cron'), res);
      expect(res.statusCode).toBe(401);
    } finally {
      await ctx.cleanup();
    }
  });

  it('returns 401 when Authorization mismatches (wrong-length too)', async () => {
    const ctx = await loadEsmShim({
      routes: { '/_svc/x/crons/index/cron': 'default' },
      cronSecret: 's3cret',
      userModuleSource: 'export default async function () {}',
    });
    try {
      const wrong = makeRes();
      await ctx.handler(
        makeReq('POST', '/_svc/x/crons/index/cron', {
          authorization: 'Bearer wrong',
        }),
        wrong
      );
      expect(wrong.statusCode).toBe(401);

      // Even at the right length, the wrong content must 401.
      const wrongSameLen = makeRes();
      await ctx.handler(
        makeReq('POST', '/_svc/x/crons/index/cron', {
          authorization: 'Bearer wrongx',
        }),
        wrongSameLen
      );
      expect(wrongSameLen.statusCode).toBe(401);
    } finally {
      await ctx.cleanup();
    }
  });

  it('invokes the default export and returns 200', async () => {
    const ctx = await loadEsmShim({
      routes: { '/_svc/x/crons/index/cron': 'default' },
      userModuleSource: `
        globalThis.__cron_test_calls = (globalThis.__cron_test_calls || 0)
        export default async function () {
          globalThis.__cron_test_calls++
        }
      `,
    });
    try {
      (globalThis as Record<string, unknown>).__cron_test_calls = 0;
      const res = makeRes();
      await ctx.handler(makeReq('POST', '/_svc/x/crons/index/cron'), res);
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ ok: true });
      expect((globalThis as Record<string, unknown>).__cron_test_calls).toBe(1);
    } finally {
      await ctx.cleanup();
    }
  });

  it('returns 200 with valid Bearer secret', async () => {
    const ctx = await loadEsmShim({
      routes: { '/_svc/x/crons/index/cron': 'default' },
      cronSecret: 's3cret',
      userModuleSource: 'export default async function () {}',
    });
    try {
      const res = makeRes();
      await ctx.handler(
        makeReq('POST', '/_svc/x/crons/index/cron', {
          authorization: 'Bearer s3cret',
        }),
        res
      );
      expect(res.statusCode).toBe(200);
    } finally {
      await ctx.cleanup();
    }
  });

  it('returns 404 when path is not in the route table', async () => {
    const ctx = await loadEsmShim({
      routes: { '/_svc/x/crons/index/cron': 'default' },
      userModuleSource: 'export default async function () {}',
    });
    try {
      const res = makeRes();
      await ctx.handler(makeReq('POST', '/something/else'), res);
      expect(res.statusCode).toBe(404);
    } finally {
      await ctx.cleanup();
    }
  });

  it('returns 500 when the handler throws', async () => {
    const ctx = await loadEsmShim({
      routes: { '/_svc/x/crons/index/cron': 'default' },
      userModuleSource: `
        export default async function () {
          throw new Error('boom')
        }
      `,
    });
    try {
      const res = makeRes();
      await ctx.handler(makeReq('POST', '/_svc/x/crons/index/cron'), res);
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body)).toEqual({ error: 'internal' });
    } finally {
      await ctx.cleanup();
    }
  });

  it('strips query string from the inbound URL', async () => {
    const ctx = await loadEsmShim({
      routes: { '/_svc/x/crons/index/cron': 'default' },
      userModuleSource: 'export default async function () {}',
    });
    try {
      const res = makeRes();
      await ctx.handler(
        makeReq('POST', '/_svc/x/crons/index/cron?foo=bar'),
        res
      );
      expect(res.statusCode).toBe(200);
    } finally {
      await ctx.cleanup();
    }
  });
});

describe('cron dispatcher boot-time validation', () => {
  it('throws at module load when a route names a missing handler', async () => {
    const setup = await setupShimDir({
      routes: { '/_svc/x/crons/index/cron': 'doesNotExist' },
      userModuleSource: 'export default async function () {}',
    });
    try {
      await expect(import(setup.shimUrl)).rejects.toThrow(
        /not a function in the user module/
      );
    } finally {
      await setup.restore();
    }
  });

  it('throws at module load when a named export is not callable', async () => {
    const setup = await setupShimDir({
      routes: { '/_svc/x/crons/index/cron': 'cleanup' },
      userModuleSource: `export const cleanup = 'not-a-function'`,
    });
    try {
      await expect(import(setup.shimUrl)).rejects.toThrow(
        /not a function in the user module/
      );
    } finally {
      await setup.restore();
    }
  });

  it('throws at module load when __VC_CRON_ROUTES is malformed JSON', async () => {
    const setup = await setupShimDir({
      routes: 'this-is-not-json',
      userModuleSource: 'export default async function () {}',
    });
    try {
      await expect(import(setup.shimUrl)).rejects.toThrow();
    } finally {
      await setup.restore();
    }
  });

  it('boots successfully with a valid named-export route', async () => {
    const setup = await setupShimDir({
      routes: { '/_svc/x/crons/index/hourly': 'hourly' },
      userModuleSource: `export async function hourly() {}`,
    });
    try {
      await expect(import(setup.shimUrl)).resolves.toBeTruthy();
    } finally {
      await setup.restore();
    }
  });

  it('throws at module load when __VC_CRON_ROUTES is not set', async () => {
    const setup = await setupShimDir({
      routes: null,
      userModuleSource: 'export default async function () {}',
    });
    try {
      await expect(import(setup.shimUrl)).rejects.toThrow(
        /__VC_CRON_ROUTES.*environment variable is not set/
      );
    } finally {
      await setup.restore();
    }
  });
});
