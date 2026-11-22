import { randomUUID } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fsMock = vi.hoisted(() => ({ lib: [] as string[] }));
vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    readdirSync: vi.fn((path: string, ...rest: unknown[]) =>
      path === '/lib'
        ? fsMock.lib
        : (actual.readdirSync as (...args: unknown[]) => unknown)(path, ...rest)
    ),
  };
});

import { TelemetryEventStore } from '../../../src/util/telemetry';
import { detectLibc } from '../../../src/util/telemetry/libc';
import { getOrCreatePersistedCliDevice } from '../../../src/util/telemetry/session';
import { RootTelemetryClient } from '../../../src/util/telemetry/root';

function mockPlatform(platform: NodeJS.Platform) {
  vi.spyOn(process, 'platform', 'get').mockReturnValue(platform);
}

function mockReport(report: NodeJS.ProcessReport | undefined) {
  vi.spyOn(process, 'report', 'get').mockReturnValue(
    report as NodeJS.ProcessReport
  );
}

type FakeReport = NodeJS.ProcessReport & { excludeNetwork: boolean };

function fakeReport(header: Record<string, unknown>): FakeReport {
  return {
    excludeNetwork: false,
    getReport: vi.fn(() => ({ header })),
  } as unknown as FakeReport;
}

describe('detectLibc', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    fsMock.lib = [];
  });

  it('returns undefined off linux', () => {
    mockPlatform('darwin');
    expect(detectLibc()).toBeUndefined();
  });

  it('detects glibc from the report header', () => {
    mockPlatform('linux');
    const report = fakeReport({ glibcVersionRuntime: '2.39' });
    mockReport(report);
    expect(detectLibc()).toBe('glibc');
    expect(report.excludeNetwork).toBe(false);
  });

  it('detects musl when the report has no glibc version', () => {
    mockPlatform('linux');
    mockReport(fakeReport({}));
    expect(detectLibc()).toBe('musl');
  });

  it('falls back to the musl loader check without process.report', () => {
    mockPlatform('linux');
    mockReport(undefined);
    fsMock.lib = ['ld-musl-x86_64.so.1'];
    expect(detectLibc()).toBe('musl');
    fsMock.lib = ['libc.so.6'];
    expect(detectLibc()).toBe('glibc');
  });
});

describe('persisted libc', () => {
  let filePath: string;

  beforeEach(() => {
    filePath = join(
      tmpdir(),
      `vercel-cli-telemetry-device-${randomUUID()}.json`
    );
  });

  afterEach(() => {
    rmSync(filePath, { force: true });
  });

  it('detects once and reuses the cached value', () => {
    const detect = vi.fn(() => 'musl' as const);
    const first = getOrCreatePersistedCliDevice({
      filePath,
      detectLibc: detect,
    });
    const second = getOrCreatePersistedCliDevice({
      filePath,
      detectLibc: detect,
    });

    expect(detect).toHaveBeenCalledTimes(1);
    expect(second).toEqual({ id: first.id, libc: 'musl' });
  });

  it('adds libc to an existing device file without changing its id', () => {
    writeFileSync(filePath, JSON.stringify({ id: 'existing-id' }));
    const device = getOrCreatePersistedCliDevice({
      filePath,
      detectLibc: () => 'glibc',
    });

    expect(device).toEqual({ id: 'existing-id', libc: 'glibc' });
    expect(JSON.parse(readFileSync(filePath, 'utf8'))).toEqual(device);
  });

  it('does not persist libc when detection returns nothing', () => {
    const device = getOrCreatePersistedCliDevice({
      filePath,
      detectLibc: () => undefined,
    });

    expect(device.libc).toBeUndefined();
    expect(JSON.parse(readFileSync(filePath, 'utf8'))).toEqual({
      id: device.id,
    });
  });

  it('tracks the cached libc as a telemetry event', () => {
    writeFileSync(filePath, JSON.stringify({ id: 'id', libc: 'musl' }));
    const store = new TelemetryEventStore({
      config: { enabled: true },
      cliDevice: { filePath },
    });
    const telemetry = new RootTelemetryClient({ opts: { store } });

    telemetry.trackLibc(store.currentLibc);

    expect(store.readonlyEvents).toMatchObject([
      { key: 'libc', value: 'musl' },
    ]);
  });
});
