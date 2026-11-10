import { randomUUID } from 'node:crypto';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import loadJSON from 'load-json-file';
import writeJSON from 'write-json-file';
import { detectLibc, isLibc, type Libc } from './libc';

export const DEFAULT_CLI_SESSION_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
export const DEFAULT_CLI_SESSION_MAX_LIFETIME_MS = 24 * 60 * 60 * 1000;

export interface PersistedCliSession {
  id: string;
  createdAt: number;
  lastSeenAt: number;
}

export interface PersistedCliDevice {
  id: string;
  libc?: Libc;
}

export interface PersistedCliSessionOptions {
  filePath: string;
  inactivityTimeoutMs?: number;
  maxLifetimeMs?: number;
  now?: () => number;
}

export interface PersistedCliDeviceOptions {
  filePath: string;
  detectLibc?: () => Libc | undefined;
}

function isPersistedCliSession(value: unknown): value is PersistedCliSession {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const session = value as Partial<PersistedCliSession>;
  return (
    typeof session.id === 'string' &&
    typeof session.createdAt === 'number' &&
    Number.isFinite(session.createdAt) &&
    typeof session.lastSeenAt === 'number' &&
    Number.isFinite(session.lastSeenAt)
  );
}

function isPersistedCliDevice(value: unknown): value is PersistedCliDevice {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const device = value as Partial<PersistedCliDevice>;
  return (
    typeof device.id === 'string' &&
    (device.libc === undefined || isLibc(device.libc))
  );
}

function readPersistedCliSession(filePath: string): PersistedCliSession | null {
  try {
    const session = loadJSON.sync(filePath);
    return isPersistedCliSession(session) ? session : null;
  } catch {
    return null;
  }
}

function writePersistedCliSession(
  filePath: string,
  session: PersistedCliSession
): void {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    // Session timestamps are best-effort telemetry. Keep replacement atomic,
    // but avoid forcing a disk flush twice per CLI invocation.
    writeFileSync(temporaryPath, `${JSON.stringify(session, null, 2)}\n`, {
      flag: 'wx',
      mode: 0o600,
    });
    renameSync(temporaryPath, filePath);
  } catch {
    // best-effort for telemetry
  } finally {
    try {
      rmSync(temporaryPath, { force: true });
    } catch {
      // best-effort cleanup
    }
  }
}

function readPersistedCliDevice(filePath: string): PersistedCliDevice | null {
  try {
    const device = loadJSON.sync(filePath);
    return isPersistedCliDevice(device) ? device : null;
  } catch {
    return null;
  }
}

function writePersistedCliDevice(
  filePath: string,
  device: PersistedCliDevice
): void {
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeJSON.sync(filePath, device, { indent: 2 });
  } catch {
    // best-effort for telemetry
  }
}

export function getOrCreatePersistedCliSession(
  opts: PersistedCliSessionOptions
): PersistedCliSession {
  const now = opts.now?.() ?? Date.now();
  const inactivityTimeoutMs =
    opts.inactivityTimeoutMs ?? DEFAULT_CLI_SESSION_INACTIVITY_TIMEOUT_MS;
  const maxLifetimeMs =
    opts.maxLifetimeMs ?? DEFAULT_CLI_SESSION_MAX_LIFETIME_MS;
  const existing = readPersistedCliSession(opts.filePath);

  const shouldReuseExisting =
    existing &&
    now - existing.lastSeenAt <= inactivityTimeoutMs &&
    now - existing.createdAt <= maxLifetimeMs;

  const session = shouldReuseExisting
    ? {
        ...existing,
        lastSeenAt: now,
      }
    : {
        id: randomUUID(),
        createdAt: now,
        lastSeenAt: now,
      };

  writePersistedCliSession(opts.filePath, session);
  return session;
}

export function touchPersistedCliSession(
  opts: PersistedCliSessionOptions,
  session: PersistedCliSession
): PersistedCliSession {
  const nextSession = {
    ...session,
    lastSeenAt: opts.now?.() ?? Date.now(),
  };
  writePersistedCliSession(opts.filePath, nextSession);
  return nextSession;
}

export function getOrCreatePersistedCliDevice(
  opts: PersistedCliDeviceOptions
): PersistedCliDevice {
  const existing = readPersistedCliDevice(opts.filePath);

  if (existing?.libc) {
    return existing;
  }

  const libc = (opts.detectLibc ?? detectLibc)();
  const device: PersistedCliDevice = {
    id: existing?.id ?? randomUUID(),
    ...(libc ? { libc } : {}),
  };

  if (!existing || libc) {
    writePersistedCliDevice(opts.filePath, device);
  }
  return device;
}
