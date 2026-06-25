import type { ShouldServe, StartDevServer } from '@vercel/build-utils';
import { spawnSrvx } from './dev/spawn-srvx.js';
import { findEntrypointWithHintOrThrow } from './find-entrypoint.js';

export const shouldPersistDevServer = true;

export const shouldServe: ShouldServe = opts => {
  const requestPath = opts.requestPath.replace(/\/$/, '');
  if (requestPath.startsWith('api') && opts.hasMatched) {
    return false;
  }
  return true;
};

export const startDevServer: StartDevServer = async opts => {
  // Multi-service projects have their own lifecycle and trigger handling.
  // Keep their existing fallback behavior until the backends dev adapter
  // supports every service type.
  if (opts.service) {
    return null;
  }

  const entrypoint = await findEntrypointWithHintOrThrow(
    opts.workPath,
    opts.entrypoint
  );

  return spawnSrvx({
    workPath: opts.workPath,
    entrypoint,
    publicDir: opts.publicDir ?? 'public',
    env: opts.meta?.env,
    signal: opts.signal,
    onStdout: opts.onStdout,
    onStderr: opts.onStderr,
  });
};
