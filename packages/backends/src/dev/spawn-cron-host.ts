import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import getPort from 'get-port';

const require_ = createRequire(import.meta.url);

export interface SpawnCronHostOptions {
  /**
   * Absolute path to the built `cron-host.mjs` artifact. Caller computes
   * this rather than the helper because the path resolution is
   * bundling-relative (different when this module is bundled into
   * `dist/index.mjs` vs loaded as TS source under test).
   */
  hostPath: string;
  /** Generated dispatcher shim source (output of `applyCronDispatch`). */
  shimSource: string;
  /** File name for the shim (basename of `applyCronDispatch.handler`). */
  shimFileName: string;
  /** cwd for the spawned process — usually the user module's directory. */
  cwd: string;
  /** Env passed to the child. The helper sets the shim path and port on top. */
  env: NodeJS.ProcessEnv;
  /** Port to bind. Allocated via `get-port` when omitted. */
  port?: number;
}

export interface SpawnedCronHost {
  child: ChildProcess;
  pid: number;
  port: number;
  /** Tmp dir holding the shim. Caller is responsible for cleanup. */
  shimDir: string;
}

/**
 * Spawn the dev-mode HTTP host for a cron dispatcher shim. Writes the
 * shim to a tmp dir, picks a port, and execs `node --import tsx
 * <cron-host.mjs>` with the shim path and port wired through env vars.
 *
 * Caller adds readiness signaling (e.g. wait for port-reachability or
 * a stdout sentinel) and cleanup (kill the child, rm the tmp dir).
 *
 * Throws synchronously on tsx resolution failure (no tmp dir created
 * yet) and on a missing child PID after spawn.
 */
export async function spawnCronHost(
  opts: SpawnCronHostOptions
): Promise<SpawnedCronHost> {
  // Resolve tsx before doing any filesystem work so a missing dep
  // doesn't leak a tmp dir.
  const tsxBin = require_.resolve('tsx');

  const port = opts.port ?? (await getPort());
  const shimDir = await mkdtemp(join(tmpdir(), 'vc-be-cron-'));
  const shimAbs = join(shimDir, opts.shimFileName);
  await writeFile(shimAbs, opts.shimSource, 'utf-8');

  const env = { ...opts.env };
  env.__VC_DISPATCH_SHIM_ABS = shimAbs;
  env.__VC_PORT = String(port);

  const child = spawn(process.execPath, ['--import', tsxBin, opts.hostPath], {
    cwd: opts.cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });

  if (!child.pid) {
    throw new Error('cron host child failed to spawn');
  }

  return { child, pid: child.pid, port, shimDir };
}
