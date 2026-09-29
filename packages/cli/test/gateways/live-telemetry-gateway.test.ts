import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  liveTelemetryGateway,
  sendTelemetryToSubprocess,
} from '../../src/gateways/telemetry-gateway';
import output from '../../src/output-manager';
import { isNativeBinaryInstall } from '../../src/util/native-install';
import {
  getOrCreatePersistedCliDevice,
  getOrCreatePersistedCliSession,
  touchPersistedCliSession,
} from '../../src/util/telemetry/session';
import { readVercelPluginActiveSessionMarker } from '../../src/util/telemetry/vercel-plugin';

// Never spawn a real `telemetry flush` subprocess.
vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
vi.mock('../../src/util/native-install', () => ({
  isNativeBinaryInstall: vi.fn(),
}));
vi.mock('../../src/util/telemetry/session', () => ({
  getOrCreatePersistedCliDevice: vi.fn(),
  getOrCreatePersistedCliSession: vi.fn(),
  touchPersistedCliSession: vi.fn(),
}));
// Never read the real ~/.config/vercel-plugin marker.
vi.mock('../../src/util/telemetry/vercel-plugin', () => ({
  readVercelPluginActiveSessionMarker: vi.fn(),
}));

const paths = {
  deviceFilePath: '/global/telemetry-device.json',
  sessionFilePath: '/global/telemetry-session.json',
};
const session = { id: 'sess_1', createdAt: 1, lastSeenAt: 2 };
const payload = { headers: { 'x-a': '1' }, body: [{ event: 'e' }] };

type FakeChild = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
  unref: ReturnType<typeof vi.fn>;
};

function fakeChild(): FakeChild {
  return Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    kill: vi.fn(),
    unref: vi.fn(),
  });
}

describe('liveTelemetryGateway (mocked storage and spawn)', () => {
  beforeEach(() => {
    vi.mocked(getOrCreatePersistedCliDevice)
      .mockReset()
      .mockReturnValue({ id: 'dev_1' });
    vi.mocked(getOrCreatePersistedCliSession)
      .mockReset()
      .mockReturnValue(session);
    vi.mocked(touchPersistedCliSession)
      .mockReset()
      .mockReturnValue({ ...session, lastSeenAt: 3 });
    vi.mocked(readVercelPluginActiveSessionMarker).mockReset();
    vi.mocked(spawn).mockReset();
    vi.mocked(isNativeBinaryInstall).mockReset().mockReturnValue(false);
  });

  it('loads the device id from the device file', () => {
    expect(liveTelemetryGateway(paths).loadDeviceId()).toBe('dev_1');
    expect(getOrCreatePersistedCliDevice).toHaveBeenCalledWith({
      filePath: paths.deviceFilePath,
    });
  });

  it('loads and touches the session in the session file', () => {
    const gateway = liveTelemetryGateway(paths);

    expect(gateway.loadSession()).toBe(session);
    expect(getOrCreatePersistedCliSession).toHaveBeenCalledWith({
      filePath: paths.sessionFilePath,
    });
    expect(gateway.touchSession({ session })).toEqual({
      ...session,
      lastSeenAt: 3,
    });
    expect(touchPersistedCliSession).toHaveBeenCalledWith(
      { filePath: paths.sessionFilePath },
      session
    );
  });

  it.each([
    null,
    { pluginVersion: '1.2.3' },
  ])('returns the plugin session marker %j', marker => {
    vi.mocked(readVercelPluginActiveSessionMarker).mockReturnValue(marker);

    expect(liveTelemetryGateway(paths).readPluginSessionMarker()).toBe(marker);
    expect(readVercelPluginActiveSessionMarker).toHaveBeenCalledWith();
  });

  it('sends the payload to a detached subprocess', async () => {
    const child = fakeChild();
    vi.mocked(spawn).mockReturnValue(child as never);

    await liveTelemetryGateway(paths).send({ payload, debug: false });

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(child.unref).toHaveBeenCalled();
  });
});

describe('sendTelemetryToSubprocess (mocked spawn)', () => {
  const originalArgv = process.argv;
  const originalExecPath = process.execPath;
  const flushArgs = ['telemetry', 'flush', JSON.stringify(payload)];

  beforeEach(() => {
    vi.mocked(spawn).mockReset();
    vi.mocked(isNativeBinaryInstall).mockReset().mockReturnValue(false);
    process.execPath = '/usr/bin/node';
    process.argv = ['/usr/bin/node', '/cli/dist/vc.js', 'whoami'];
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.execPath = originalExecPath;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function lastSpawn() {
    const [binary, args, options] = vi.mocked(spawn).mock.calls[0];
    return { binary, args, options: options as Record<string, unknown> };
  }

  it('runs the script with node and disables telemetry in the child', async () => {
    const child = fakeChild();
    vi.mocked(spawn).mockReturnValue(child as never);

    await sendTelemetryToSubprocess(payload, false);

    const { binary, args, options } = lastSpawn();
    expect(binary).toBe('/usr/bin/node');
    expect(args).toEqual(['/cli/dist/vc.js', ...flushArgs]);
    expect(options).toMatchObject({
      stdio: 'ignore',
      windowsHide: true,
      detached: true,
    });
    expect(options.env).toMatchObject({ VERCEL_TELEMETRY_DISABLED: '1' });
    expect(child.unref).toHaveBeenCalled();
  });

  it('keeps the launcher when execPath differs from argv[0]', async () => {
    vi.mocked(spawn).mockReturnValue(fakeChild() as never);
    process.argv = ['/usr/local/bin/node-shim', '/cli/dist/vc.js'];

    await sendTelemetryToSubprocess(payload, false);

    expect(lastSpawn()).toMatchObject({
      binary: '/usr/bin/node',
      args: ['/usr/local/bin/node-shim', '/cli/dist/vc.js', ...flushArgs],
    });
  });

  it('runs the native binary without a script path', async () => {
    vi.mocked(isNativeBinaryInstall).mockReturnValue(true);
    vi.mocked(spawn).mockReturnValue(fakeChild() as never);
    process.execPath = '/usr/local/bin/vercel';
    process.argv = ['/usr/local/bin/vercel', '/snapshot/cli/pkg.js'];

    await sendTelemetryToSubprocess(payload, false);

    expect(lastSpawn()).toMatchObject({
      binary: '/usr/local/bin/vercel',
      args: flushArgs,
    });
  });

  it('pipes output to debug logs and resolves on exit', async () => {
    const debug = vi.spyOn(output, 'debug').mockImplementation(() => {});
    const child = fakeChild();
    vi.mocked(spawn).mockReturnValue(child as never);

    const done = sendTelemetryToSubprocess(payload, true);
    expect(lastSpawn().options).toMatchObject({
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    expect(lastSpawn().options.env).toMatchObject({
      VERCEL_TELEMETRY_DISABLED: '1',
    });

    child.stdout.emit('data', Buffer.from('sent'));
    child.stderr.emit('data', Buffer.from('warn'));
    const spawnError = new Error('spawn failed');
    child.emit('error', spawnError);
    child.emit('exit', 0);
    await done;

    expect(debug).toHaveBeenCalledWith('sent');
    expect(debug).toHaveBeenCalledWith('warn');
    expect(debug).toHaveBeenCalledWith(spawnError);
    expect(debug).toHaveBeenCalledWith(
      'Telemetry subprocess exited with code 0'
    );
    expect(child.unref).toHaveBeenCalled();
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('kills a debug subprocess that does not exit within 2 seconds', async () => {
    vi.useFakeTimers();
    const debug = vi.spyOn(output, 'debug').mockImplementation(() => {});
    const child = fakeChild();
    vi.mocked(spawn).mockReturnValue(child as never);

    const done = sendTelemetryToSubprocess(payload, true);
    vi.advanceTimersByTime(2000);

    expect(child.kill).toHaveBeenCalled();
    expect(debug).toHaveBeenCalledWith(
      'Telemetry subprocess killed due to timeout'
    );

    child.emit('exit', null);
    await expect(done).resolves.toBeUndefined();
  });
});
