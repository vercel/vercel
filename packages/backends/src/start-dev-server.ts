import type {
  Files,
  ShouldServe,
  StartDevServer,
  StartDevServerSuccess,
} from '@vercel/build-utils';
import { findEntrypointWithHintOrThrow } from './find-entrypoint.js';
import { spawnSrvx } from './dev/spawn-srvx.js';

interface PersistentDevServer {
  files: Files;
  env: NodeJS.ProcessEnv;
  result: StartDevServerSuccess;
  stopPromise?: Promise<void>;
}

interface PendingDevServer {
  files: Files;
  env: NodeJS.ProcessEnv;
  controller: AbortController;
  promise: Promise<PersistentDevServer | null>;
}

const persistentDevServers = new Map<string, PersistentDevServer>();
const pendingDevServers = new Map<string, PendingDevServer>();

let cleanupHandlersInstalled = false;
let shuttingDown = false;

function snapshotFiles(files: Files): Files {
  return { ...files };
}

function filesAreEqual(previous: Files, current: Files): boolean {
  // The CLI replaces a File object whenever its source changes, so reference
  // equality against a shallow snapshot is enough to detect invalidation.
  const previousNames = Object.keys(previous);
  const currentNames = Object.keys(current);
  return (
    previousNames.length === currentNames.length &&
    previousNames.every(name => previous[name] === current[name])
  );
}

function envsAreEqual(
  previous: NodeJS.ProcessEnv,
  current: NodeJS.ProcessEnv
): boolean {
  const previousNames = Object.keys(previous);
  const currentNames = Object.keys(current);
  return (
    previousNames.length === currentNames.length &&
    previousNames.every(name => previous[name] === current[name])
  );
}

function stateMatches(
  state: Pick<PersistentDevServer, 'files' | 'env'>,
  files: Files,
  env: NodeJS.ProcessEnv
): boolean {
  return filesAreEqual(state.files, files) && envsAreEqual(state.env, env);
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function terminateProcess(pid: number): void {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // The process has already exited.
  }
}

function stopPersistentDevServer(
  key: string,
  server: PersistentDevServer
): Promise<void> {
  if (!server.stopPromise) {
    server.stopPromise = (async () => {
      try {
        if (server.result.shutdown) {
          await server.result.shutdown();
        } else {
          terminateProcess(server.result.pid);
        }
      } catch {
        terminateProcess(server.result.pid);
      } finally {
        if (persistentDevServers.get(key) === server) {
          persistentDevServers.delete(key);
        }
      }
    })();
  }
  return server.stopPromise;
}

function persistentResult(
  key: string,
  server: PersistentDevServer
): StartDevServerSuccess {
  const { pid } = server.result;
  return {
    ...server.result,
    persistent: true,
    shutdown: () => {
      const current = persistentDevServers.get(key);
      return current?.result.pid === pid
        ? stopPersistentDevServer(key, current)
        : Promise.resolve();
    },
  };
}

function installCleanupHandlers(): void {
  if (cleanupHandlersInstalled) return;
  cleanupHandlersInstalled = true;

  const stopAll = () => {
    shuttingDown = true;
    for (const pending of pendingDevServers.values()) {
      pending.controller.abort();
    }
    for (const [key, server] of persistentDevServers) {
      void stopPersistentDevServer(key, server);
    }
  };

  const killAll = () => {
    for (const pending of pendingDevServers.values()) {
      pending.controller.abort();
    }
    for (const server of persistentDevServers.values()) {
      terminateProcess(server.result.pid);
    }
  };

  process.on('SIGINT', stopAll);
  process.on('SIGTERM', stopAll);
  process.on('exit', killAll);
}

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

  const key = `${opts.workPath}::${opts.entrypoint ?? '<detect>'}`;
  const entrypoint = await findEntrypointWithHintOrThrow(
    opts.workPath,
    opts.entrypoint
  );
  const env = { ...opts.meta?.env };
  installCleanupHandlers();

  // Reuse a live server, or retire stale state before starting one replacement.
  // Concurrent cold requests wait on the same pending start.
  while (!shuttingDown) {
    const existing = persistentDevServers.get(key);
    if (existing) {
      if (
        !existing.stopPromise &&
        stateMatches(existing, opts.files, env) &&
        isProcessRunning(existing.result.pid)
      ) {
        return persistentResult(key, existing);
      }
      await stopPersistentDevServer(key, existing);
      continue;
    }

    const pending = pendingDevServers.get(key);
    if (pending) {
      if (!stateMatches(pending, opts.files, env)) {
        pending.controller.abort();
      }

      let server: PersistentDevServer | null;
      try {
        server = await pending.promise;
      } catch (error) {
        if (stateMatches(pending, opts.files, env)) throw error;
        continue;
      }

      if (stateMatches(pending, opts.files, env)) {
        if (!server) return null;
        if (isProcessRunning(server.result.pid)) {
          return persistentResult(key, server);
        }
      }

      if (server) {
        await stopPersistentDevServer(key, server);
      }
      continue;
    }

    const files = snapshotFiles(opts.files);
    const controller = new AbortController();
    const promise = spawnSrvx({
      workPath: opts.workPath,
      entrypoint,
      publicDir: opts.publicDir ?? 'public',
      env,
      signal: controller.signal,
      onStdout: opts.onStdout,
      onStderr: opts.onStderr,
    }).then(async result => {
      const server: PersistentDevServer = { files, env, result };
      if (shuttingDown) {
        await stopPersistentDevServer(key, server);
        return null;
      }

      persistentDevServers.set(key, server);
      return server;
    });
    const pendingServer: PendingDevServer = {
      files,
      env,
      controller,
      promise,
    };
    pendingDevServers.set(key, pendingServer);

    try {
      const server = await promise;
      if (!stateMatches(pendingServer, opts.files, env)) {
        if (server) {
          await stopPersistentDevServer(key, server);
        }
        continue;
      }
      return server ? persistentResult(key, server) : null;
    } finally {
      if (pendingDevServers.get(key) === pendingServer) {
        pendingDevServers.delete(key);
      }
    }
  }

  return null;
};
