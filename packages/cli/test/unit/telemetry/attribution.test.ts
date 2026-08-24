import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TelemetryEventStore } from '../../../src/util/telemetry';
import { RootTelemetryClient } from '../../../src/util/telemetry/root';
import {
  getOrCreatePersistedCliSession,
  touchPersistedCliSession,
} from '../../../src/util/telemetry/session';
import { ctxHash } from '../../../src/util/telemetry/sanitize';

let telemetry: RootTelemetryClient;
let store: TelemetryEventStore;

beforeEach(() => {
  vi.stubEnv('VERCEL_CLI_TELEMETRY_V2', '1');
  store = new TelemetryEventStore({ isDebug: true, config: {} });
  telemetry = new RootTelemetryClient({ opts: { store } });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('agent attribution events', () => {
  it('tracks version, source, and conflict', () => {
    telemetry.trackAgentVersion('1.2.3');
    telemetry.trackAgentDetectionSource('both');
    telemetry.trackAgentDetectionConflict({
      env: 'cursor',
      proctree: 'claude',
    });
    expect(store.readonlyEvents).toMatchObject([
      { key: 'agent_version', value: '1.2.3' },
      { key: 'agent_detection_source', value: 'both' },
      { key: 'agent_detection_conflict', value: 'proctree:claude,env:cursor' },
    ]);
  });

  it('skips absent values and redacts odd versions', () => {
    telemetry.trackAgentVersion(undefined);
    telemetry.trackAgentDetectionSource(undefined);
    telemetry.trackAgentDetectionConflict(undefined);
    telemetry.trackContextId(undefined);
    expect(store.readonlyEvents).toHaveLength(0);
    telemetry.trackAgentVersion('weird version!');
    expect(store.readonlyEvents[0]?.value).toBe('[REDACTED]');
  });
});

describe('context-scoped sessions', () => {
  const dir = () => mkdtempSync(join(tmpdir(), 'vc-telemetry-test-'));

  it('derives a context id and scopes the persisted session to it', () => {
    const base = dir();
    const filePath = join(base, 'telemetry-session.json');
    // A shared device file keeps the context-hash salt stable, as in the CLI.
    const cliDevice = { filePath: join(base, 'telemetry-device.json') };
    const a = new TelemetryEventStore({
      config: {},
      cliDevice,
      cliSession: { filePath },
      sessionContext: { pid: 100, bootTime: 1700000000, cwd: '/repo' },
    });
    const b = new TelemetryEventStore({
      config: {},
      cliDevice,
      cliSession: { filePath },
      sessionContext: { pid: 200, bootTime: 1700000000, cwd: '/repo' },
    });
    const aAgain = new TelemetryEventStore({
      config: {},
      cliDevice,
      cliSession: { filePath },
      sessionContext: { pid: 100, bootTime: 1700000000, cwd: '/repo' },
    });

    expect(a.currentContextId).toBeDefined();
    expect(a.currentContextId).not.toBe(b.currentContextId);
    expect(a.currentSessionId).not.toBe(b.currentSessionId);
    expect(aAgain.currentSessionId).toBe(a.currentSessionId);

    const file = JSON.parse(readFileSync(filePath, 'utf8'));
    expect(Object.keys(file.contexts)).toHaveLength(2);
  });

  it('is deterministic per device salt', () => {
    expect(ctxHash([100, 1700000000, '/repo'], 'device')).toBe(
      ctxHash([100, 1700000000, '/repo'], 'device')
    );
    expect(ctxHash([100, 1700000000, '/repo'], 'device')).not.toBe(
      ctxHash([100, 1700000000, '/repo'], 'other-device')
    );
  });

  it('migrates legacy single-session files', () => {
    const filePath = join(dir(), 'telemetry-session.json');
    const now = Date.now();
    writeFileSync(
      filePath,
      JSON.stringify({ id: 'legacy-id', createdAt: now, lastSeenAt: now })
    );

    const session = getOrCreatePersistedCliSession({
      filePath,
      now: () => now,
    });
    expect(session.id).toBe('legacy-id');

    // touch keeps the migrated map shape
    touchPersistedCliSession({ filePath }, session);
    const file = JSON.parse(readFileSync(filePath, 'utf8'));
    expect(file.contexts.default.id).toBe('legacy-id');
  });

  it('prunes expired contexts on write', () => {
    const filePath = join(dir(), 'telemetry-session.json');
    const now = Date.now();
    getOrCreatePersistedCliSession({
      filePath,
      contextKey: 'stale',
      now: () => now - 60 * 60 * 1000,
    });
    getOrCreatePersistedCliSession({
      filePath,
      contextKey: 'fresh',
      now: () => now,
    });

    const file = JSON.parse(readFileSync(filePath, 'utf8'));
    expect(Object.keys(file.contexts)).toEqual(['fresh']);
  });
});
