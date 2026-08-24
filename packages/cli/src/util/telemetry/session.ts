import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import loadJSON from 'load-json-file';
import writeJSON from 'write-json-file';

export const DEFAULT_CLI_SESSION_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
export const DEFAULT_CLI_SESSION_MAX_LIFETIME_MS = 24 * 60 * 60 * 1000;

const DEFAULT_CONTEXT_KEY = 'default';
const MAX_CONTEXTS = 50;

export interface PersistedCliSession {
  id: string;
  createdAt: number;
  lastSeenAt: number;
}

export interface PersistedCliDevice {
  id: string;
  /** HMAC salt for fingerprint/context hashes. Never transmitted. */
  fpSalt?: string;
}

export interface PersistedCliSessionOptions {
  filePath: string;
  /** Scopes the session to one terminal/harness; see `ctxHash`. */
  contextKey?: string;
  inactivityTimeoutMs?: number;
  maxLifetimeMs?: number;
  now?: () => number;
}

interface PersistedCliSessionFile {
  contexts: Record<string, PersistedCliSession>;
}

export interface PersistedCliDeviceOptions {
  filePath: string;
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
  return typeof device.id === 'string';
}

function readPersistedCliSessionFile(
  filePath: string
): PersistedCliSessionFile {
  try {
    const data = loadJSON.sync(filePath);
    // Pre-context files held a single top-level session.
    if (isPersistedCliSession(data)) {
      return { contexts: { [DEFAULT_CONTEXT_KEY]: data } };
    }
    if (data && typeof data === 'object' && 'contexts' in data) {
      const contexts: Record<string, PersistedCliSession> = {};
      for (const [key, session] of Object.entries(
        (data as PersistedCliSessionFile).contexts ?? {}
      )) {
        if (isPersistedCliSession(session)) {
          contexts[key] = session;
        }
      }
      return { contexts };
    }
  } catch {
    // fall through to an empty file
  }
  return { contexts: {} };
}

function writePersistedCliSessionFile(
  filePath: string,
  file: PersistedCliSessionFile
): void {
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeJSON.sync(filePath, file, { indent: 2 });
  } catch {
    // best-effort for telemetry
  }
}

/** Drops sessions that can no longer be reused, oldest first past the cap. */
function prune(
  contexts: Record<string, PersistedCliSession>,
  now: number,
  inactivityTimeoutMs: number,
  maxLifetimeMs: number
): Record<string, PersistedCliSession> {
  const alive = Object.entries(contexts)
    .filter(
      ([, s]) =>
        now - s.lastSeenAt <= inactivityTimeoutMs &&
        now - s.createdAt <= maxLifetimeMs
    )
    .sort(([, a], [, b]) => b.lastSeenAt - a.lastSeenAt)
    .slice(0, MAX_CONTEXTS);
  return Object.fromEntries(alive);
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
  const contextKey = opts.contextKey ?? DEFAULT_CONTEXT_KEY;
  const file = readPersistedCliSessionFile(opts.filePath);
  const existing = file.contexts[contextKey];

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

  file.contexts[contextKey] = session;
  writePersistedCliSessionFile(opts.filePath, {
    contexts: prune(file.contexts, now, inactivityTimeoutMs, maxLifetimeMs),
  });
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
  const file = readPersistedCliSessionFile(opts.filePath);
  file.contexts[opts.contextKey ?? DEFAULT_CONTEXT_KEY] = nextSession;
  writePersistedCliSessionFile(opts.filePath, file);
  return nextSession;
}

export function getOrCreatePersistedCliDevice(
  opts: PersistedCliDeviceOptions
): PersistedCliDevice {
  const existing = readPersistedCliDevice(opts.filePath);

  if (existing?.fpSalt) {
    return existing;
  }

  const device = {
    id: existing?.id ?? randomUUID(),
    fpSalt: randomUUID(),
  };

  writePersistedCliDevice(opts.filePath, device);
  return device;
}
