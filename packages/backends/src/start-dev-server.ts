import type {
  Files,
  ShouldServe,
  StartDevServer,
  StartDevServerSuccess,
} from '@vercel/build-utils';
import { findEntrypointWithHintOrThrow } from './find-entrypoint.js';

interface PersistentDevServer {
  files: Files;
  result: StartDevServerSuccess;
  stopPromise?: Promise<void>;
}

interface PendingDevServer {
  files: Files;
  promise: Promise<PersistentDevServer | null>;
}

const persistentDevServers = new Map<string, PersistentDevServer>();
const pendingDevServers = new Map<string, PendingDevServer>();

let cleanupHandlersInstalled = false;
let shuttingDown = false;

// @vercel/node is large and only needed by `vercel dev`, so load it on demand.
const startNodeDevServer: StartDevServer = async opts => {
  // @ts-expect-error -- @vercel/node's public types omit builder APIs.
  const { startDevServer } = await import('@vercel/node');
  return startDevServer(opts);
};

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
  return {
    ...server.result,
    persistent: true,
    shutdown: () => stopPersistentDevServer(key, server),
  };
}

function installCleanupHandlers(): void {
  if (cleanupHandlersInstalled) return;
  cleanupHandlersInstalled = true;

  const stopAll = () => {
    shuttingDown = true;
    for (const [key, server] of persistentDevServers) {
      void stopPersistentDevServer(key, server);
    }
  };

  const killAll = () => {
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

  const entrypoint = await findEntrypointWithHintOrThrow(
    opts.workPath,
    opts.entrypoint
  );

  const key = `${opts.workPath}::${entrypoint}`;
  installCleanupHandlers();

  // Reuse a live server, or retire stale state before starting one replacement.
  // Concurrent cold requests wait on the same pending start.
  while (!shuttingDown) {
    const existing = persistentDevServers.get(key);
    if (existing) {
      if (
        !existing.stopPromise &&
        filesAreEqual(existing.files, opts.files) &&
        isProcessRunning(existing.result.pid)
      ) {
        return persistentResult(key, existing);
      }
      await stopPersistentDevServer(key, existing);
      continue;
    }

    const pending = pendingDevServers.get(key);
    if (pending) {
      let server: PersistentDevServer | null;
      try {
        server = await pending.promise;
      } catch (error) {
        if (filesAreEqual(pending.files, opts.files)) {
          throw error;
        }
        continue;
      }

      if (filesAreEqual(pending.files, opts.files)) {
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
    process.env.EXPERIMENTAL_NODE_TYPESCRIPT_ERRORS = '1';
    const promise = startNodeDevServer({
      ...opts,
      config: { ...opts.config, helpers: false },
      entrypoint,
      publicDir: opts.publicDir ?? 'public',
    }).then(async result => {
      if (!result) return null;

      const server: PersistentDevServer = { files, result };
      if (shuttingDown) {
        await stopPersistentDevServer(key, server);
        return null;
      }

      persistentDevServers.set(key, server);
      return server;
    });
    const pendingServer: PendingDevServer = { files, promise };
    pendingDevServers.set(key, pendingServer);

    try {
      const server = await promise;
      if (!filesAreEqual(files, opts.files)) {
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
