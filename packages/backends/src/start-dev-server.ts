import { createRequire } from 'node:module';
import type {
  Files,
  ShouldServe,
  StartDevServer,
  StartDevServerSuccess,
} from '@vercel/build-utils';
import { findEntrypointWithHintOrThrow } from './find-entrypoint.js';

const require_ = createRequire(import.meta.url);

const getNodeStartDevServer = () =>
  (require_('@vercel/node') as { startDevServer: StartDevServer })
    .startDevServer;

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

function snapshotFiles(files: Files): Files {
  return { ...files };
}

function filesAreEqual(previous: Files, current: Files): boolean {
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

function forceKill(pid: number): void {
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
      if (persistentDevServers.get(key) === server) {
        persistentDevServers.delete(key);
      }

      try {
        if (server.result.shutdown) {
          await server.result.shutdown();
        } else {
          forceKill(server.result.pid);
        }
      } catch {
        forceKill(server.result.pid);
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

  const killAll = () => {
    shuttingDown = true;
    for (const [key, server] of persistentDevServers) {
      persistentDevServers.delete(key);
      server.stopPromise = Promise.resolve();
      forceKill(server.result.pid);
    }
  };

  process.on('SIGINT', killAll);
  process.on('SIGTERM', killAll);
  process.on('exit', killAll);
}

export const shouldServe: ShouldServe = async opts => {
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
  const files = snapshotFiles(opts.files);
  installCleanupHandlers();

  const existing = persistentDevServers.get(key);
  if (existing) {
    if (
      filesAreEqual(existing.files, opts.files) &&
      isProcessRunning(existing.result.pid)
    ) {
      return persistentResult(key, existing);
    }
    await stopPersistentDevServer(key, existing);
  }

  const pending = pendingDevServers.get(key);
  if (pending) {
    if (filesAreEqual(pending.files, opts.files)) {
      const server = await pending.promise;
      return server ? persistentResult(key, server) : null;
    }

    // A source change landed while the previous process was starting. Let it
    // settle, then the recursive call will retire it and start current code.
    try {
      await pending.promise;
    } catch {
      // The changed source gets a fresh startup attempt below.
    }
    return startDevServer(opts);
  }

  process.env.EXPERIMENTAL_NODE_TYPESCRIPT_ERRORS = '1';
  const pendingServer: PendingDevServer = {
    files,
    promise: Promise.resolve(null),
  };
  pendingServer.promise = (async () => {
    const result = await getNodeStartDevServer()({
      ...opts,
      config: { ...opts.config, helpers: false },
      entrypoint,
      publicDir: opts.publicDir ?? 'public',
    });
    if (!result) return null;

    const server: PersistentDevServer = { files, result };
    if (shuttingDown) {
      forceKill(result.pid);
      return null;
    }

    persistentDevServers.set(key, server);
    return server;
  })();
  pendingDevServers.set(key, pendingServer);

  try {
    const server = await pendingServer.promise;
    return server ? persistentResult(key, server) : null;
  } finally {
    if (pendingDevServers.get(key) === pendingServer) {
      pendingDevServers.delete(key);
    }
  }
};
