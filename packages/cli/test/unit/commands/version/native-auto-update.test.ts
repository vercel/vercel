import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'path';
import { tmpdir } from 'os';
import fs from 'fs-extra';
import { client } from '../../../mocks/client';
import { isNativeBinaryInstall } from '../../../../src/util/native-install';
import {
  spawnNativeUpdateCheck,
  spawnNativeUpdateChild,
} from '../../../../src/commands/version/native-update-worker';
import {
  cacheNativeUpdateDiscoveryAttempt,
  cacheNativeUpdateVersion,
  getNativeUpdateCacheFile,
  markNativeUpdateStaged,
  NATIVE_UPDATE_CHECK_INTERVAL,
  NATIVE_UPDATE_DISCOVERY_LEASE,
  restoreNativeUpdateAfterDiscoveryFailure,
  scheduleNativeAutoUpdate,
  withNativeUpdateCacheLock,
} from '../../../../src/commands/version/native-auto-update';

vi.mock('ci-info', () => ({ default: { isCI: false } }));
vi.mock('../../../../src/util/native-self-update', () => ({
  getNativePackageName: vi.fn(() => '@vercel/vc-native-test'),
}));
vi.mock('../../../../src/util/native-install', () => ({
  isNativeBinaryInstall: vi.fn(),
}));
vi.mock('../../../../src/commands/version/native-update-worker', () => ({
  isNativeUpdateChild: vi.fn(() => false),
  spawnNativeUpdateCheck: vi.fn(),
  spawnNativeUpdateChild: vi.fn(),
}));

// Each test gets its own cache directory (and therefore its own lock file
// path) so that concurrent-write sub-tests can never contend with locks left
// behind, or still settling, from a previous test case. Sharing a single
// directory across the whole file previously meant every `withNativeUpdateCacheLock`
// call in every test raced against the same lock path.
let cacheDir: string;
const installRoot = '/home/user/.vercel';
const executablePath = `${installRoot}/versions/tracks/production/a/vercel`;
type ScheduleOptions = NonNullable<
  Parameters<typeof scheduleNativeAutoUpdate>[2]
>;

function schedule(exitCode: number, options: ScheduleOptions = {}): void {
  scheduleNativeAutoUpdate(client, exitCode, {
    cacheDir,
    executablePath,
    installRoot,
    ...options,
  });
}

const isNativeBinaryInstallMock = vi.mocked(isNativeBinaryInstall);
const spawnNativeUpdateCheckMock = vi.mocked(spawnNativeUpdateCheck);
const spawnNativeUpdateChildMock = vi.mocked(spawnNativeUpdateChild);

async function exitedChildPid(): Promise<number> {
  const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
  const pid = child.pid;
  await new Promise<void>((resolveExit, rejectExit) => {
    child.once('error', rejectExit);
    child.once('close', () => resolveExit());
  });
  if (!pid) throw new Error('Failed to start child process');
  return pid;
}

describe('scheduleNativeAutoUpdate', () => {
  beforeEach(() => {
    cacheDir = join(
      tmpdir(),
      `test-vercel-cli-native-auto-update-${process.pid}-${randomUUID()}`
    );
    client.config = {};
    client.isAgent = false;
    client.nonInteractive = false;
    isNativeBinaryInstallMock.mockReturnValue(true);
  });

  afterEach(() => {
    client.reset();
    vi.clearAllMocks();
    fs.removeSync(cacheDir);
  });

  it('writes a flattened native cache key with a one-day expiry', async () => {
    await cacheNativeUpdateVersion('60.0.0', { cacheDir, now: 1000 });

    expect(getNativeUpdateCacheFile(cacheDir)).toBe(
      join(cacheDir, 'package-updates', '@vercel-vc-native-test-latest.json')
    );
    expect(fs.readJSONSync(getNativeUpdateCacheFile(cacheDir))).toEqual({
      expireAt: 1000 + NATIVE_UPDATE_CHECK_INTERVAL,
      selectProduction: false,
      staged: false,
      version: '60.0.0',
    });
  });

  it('serializes concurrent cache writes', async () => {
    let active = 0;
    let maxActive = 0;
    const action = async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise(resolveWait => setTimeout(resolveWait, 25));
      active--;
    };

    await Promise.all([
      withNativeUpdateCacheLock(cacheDir, action),
      withNativeUpdateCacheLock(cacheDir, action),
    ]);
    expect(maxActive).toBe(1);
  });

  it('serializes concurrent abandoned cache-lock recovery', async () => {
    const lock = `${getNativeUpdateCacheFile(cacheDir)}.lock`;
    const deadPid = await exitedChildPid();
    fs.ensureDirSync(lock);
    fs.writeJSONSync(join(lock, 'owner.json'), {
      token: 'abandoned',
      pid: deadPid,
      createdAt: Date.now() - 11_000,
    });
    let active = 0;
    let maxActive = 0;
    const action = async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise(resolveWait => setTimeout(resolveWait, 25));
      active--;
    };

    await Promise.all([
      withNativeUpdateCacheLock(cacheDir, action),
      withNativeUpdateCacheLock(cacheDir, action),
    ]);

    expect(maxActive).toBe(1);
    expect(
      fs
        .readdirSync(join(cacheDir, 'package-updates'))
        .filter(name => name.includes('.lock.abandoned-'))
    ).toHaveLength(1);
  });

  it('times out without stealing a live cache lock', async () => {
    const lock = `${getNativeUpdateCacheFile(cacheDir)}.lock`;
    fs.ensureDirSync(lock);
    fs.writeJSONSync(join(lock, 'owner.json'), {
      token: 'live',
      pid: process.pid,
      createdAt: Date.now() - 11_000,
    });

    await expect(
      withNativeUpdateCacheLock(cacheDir, async () => {}, { waitMs: 20 })
    ).rejects.toThrow(
      `Timed out waiting for the native update cache. If no Vercel update is running, remove the lock at ${lock} and retry.`
    );
    expect(fs.readJSONSync(join(lock, 'owner.json'))).toMatchObject({
      token: 'live',
    });
  });

  it('retries a cached production update on every successful invocation', async () => {
    await cacheNativeUpdateVersion('60.0.0', { cacheDir, now: 1000 });

    schedule(0, { cacheDir, now: 2000 });
    schedule(0, { cacheDir, now: 3000 });

    expect(spawnNativeUpdateChildMock).toHaveBeenNthCalledWith(
      1,
      '60.0.0',
      false
    );
    expect(spawnNativeUpdateChildMock).toHaveBeenNthCalledWith(
      2,
      '60.0.0',
      false
    );
    expect(spawnNativeUpdateCheckMock).not.toHaveBeenCalled();
  });

  it('retries explicit production selection intent', async () => {
    await cacheNativeUpdateVersion('60.0.0', {
      cacheDir,
      now: 1000,
      selectProduction: true,
    });

    schedule(0, { cacheDir, now: 2000 });

    expect(spawnNativeUpdateChildMock).toHaveBeenCalledWith('60.0.0', true);
  });

  it('preserves explicit selection when discovery finishes afterward', async () => {
    await cacheNativeUpdateVersion('60.0.0', {
      cacheDir,
      now: 1000,
      selectProduction: true,
    });
    await cacheNativeUpdateVersion('60.0.0', {
      cacheDir,
      now: 2000,
    });

    schedule(0, { cacheDir, now: 3000 });

    expect(spawnNativeUpdateChildMock).toHaveBeenCalledWith('60.0.0', true);
  });

  it('does not let automatic work consume explicit selection intent', async () => {
    await cacheNativeUpdateVersion('60.0.0', { cacheDir, now: 1000 });
    await cacheNativeUpdateVersion('60.0.0', {
      cacheDir,
      now: 2000,
      selectProduction: true,
    });

    await cacheNativeUpdateDiscoveryAttempt({ cacheDir, now: 3000 });
    await markNativeUpdateStaged('60.0.0', { cacheDir });
    schedule(0, { cacheDir, now: 4000 });

    expect(spawnNativeUpdateChildMock).toHaveBeenCalledWith('60.0.0', true);
  });

  it('does not let an older child mark newer metadata as staged', async () => {
    await cacheNativeUpdateVersion('60.0.0', { cacheDir, now: 1000 });
    await cacheNativeUpdateVersion('61.0.0', { cacheDir, now: 2000 });

    await markNativeUpdateStaged('60.0.0', { cacheDir });

    expect(fs.readJSONSync(getNativeUpdateCacheFile(cacheDir))).toEqual({
      expireAt: 2000 + NATIVE_UPDATE_CHECK_INTERVAL,
      selectProduction: false,
      staged: false,
      version: '61.0.0',
    });
  });

  it('detaches discovery when the native cache is missing', () => {
    schedule(0, { cacheDir, now: 1000 });

    expect(spawnNativeUpdateCheckMock).toHaveBeenCalledOnce();
    expect(spawnNativeUpdateChildMock).not.toHaveBeenCalled();
  });

  it('does not spawn discovery for package-manager native installs', () => {
    schedule(0, {
      cacheDir,
      executablePath: '/npm/bin/vc',
      installRoot: '/home/user/.vercel',
      now: 1000,
    });

    expect(spawnNativeUpdateCheckMock).not.toHaveBeenCalled();
    expect(spawnNativeUpdateChildMock).not.toHaveBeenCalled();
  });

  it('refreshes expired metadata without racing the stale retry', async () => {
    await cacheNativeUpdateVersion('60.0.0', { cacheDir, now: 1000 });

    schedule(0, {
      cacheDir,
      now: 1000 + NATIVE_UPDATE_CHECK_INTERVAL,
    });

    expect(spawnNativeUpdateChildMock).not.toHaveBeenCalled();
    expect(spawnNativeUpdateCheckMock).toHaveBeenCalledOnce();
  });

  it('restores a known unstaged version when rediscovery fails', async () => {
    await cacheNativeUpdateVersion('60.0.0', { cacheDir, now: 1000 });
    await cacheNativeUpdateDiscoveryAttempt({
      cacheDir,
      now: 1000 + NATIVE_UPDATE_CHECK_INTERVAL,
    });

    expect(fs.readJSONSync(getNativeUpdateCacheFile(cacheDir))).toEqual({
      discoveryStartedAt: 1000 + NATIVE_UPDATE_CHECK_INTERVAL,
      expireAt: 1000 + NATIVE_UPDATE_CHECK_INTERVAL * 2,
      selectProduction: false,
      staged: true,
      version: '60.0.0',
    });

    await restoreNativeUpdateAfterDiscoveryFailure({ cacheDir });
    schedule(0, {
      cacheDir,
      now: 1000 + NATIVE_UPDATE_CHECK_INTERVAL + 1,
    });

    expect(spawnNativeUpdateChildMock).toHaveBeenCalledWith('60.0.0', false);
  });

  it('retries a known version after an abandoned discovery lease', async () => {
    const discoveryStartedAt = 1000 + NATIVE_UPDATE_CHECK_INTERVAL;
    await cacheNativeUpdateVersion('60.0.0', { cacheDir, now: 1000 });
    await cacheNativeUpdateDiscoveryAttempt({
      cacheDir,
      now: discoveryStartedAt,
    });

    schedule(0, {
      cacheDir,
      now: discoveryStartedAt + NATIVE_UPDATE_DISCOVERY_LEASE - 1,
    });
    expect(spawnNativeUpdateChildMock).not.toHaveBeenCalled();

    schedule(0, {
      cacheDir,
      now: discoveryStartedAt + NATIVE_UPDATE_DISCOVERY_LEASE,
    });
    expect(spawnNativeUpdateChildMock).toHaveBeenCalledWith('60.0.0', false);
  });

  it('stops retrying after a child records completed staging', async () => {
    await cacheNativeUpdateVersion('60.0.0', { cacheDir, now: 1000 });
    await markNativeUpdateStaged('60.0.0', { cacheDir });

    schedule(0, { cacheDir, now: 2000 });

    expect(spawnNativeUpdateChildMock).not.toHaveBeenCalled();
    expect(spawnNativeUpdateCheckMock).not.toHaveBeenCalled();
  });

  it('retries persisted explicit selection when auto-update is disabled', async () => {
    await cacheNativeUpdateVersion('60.0.0', {
      cacheDir,
      now: 1000,
      selectProduction: true,
    });
    client.config = { updates: { auto: false } };

    schedule(0, { cacheDir, now: 2000 });

    expect(spawnNativeUpdateChildMock).toHaveBeenCalledWith('60.0.0', true);
  });

  it('does not check when native auto-update is explicitly disabled', () => {
    client.config = { updates: { auto: false } };

    schedule(0, { cacheDir });

    expect(spawnNativeUpdateCheckMock).not.toHaveBeenCalled();
    expect(spawnNativeUpdateChildMock).not.toHaveBeenCalled();
  });

  it('does not check after a failed command or during agent execution', () => {
    schedule(1, { cacheDir });
    client.isAgent = true;
    schedule(0, { cacheDir });

    expect(spawnNativeUpdateCheckMock).not.toHaveBeenCalled();
    expect(spawnNativeUpdateChildMock).not.toHaveBeenCalled();
  });
});
