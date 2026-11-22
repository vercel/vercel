import { afterEach, describe, expect, it, vi } from 'vitest';

const on = vi.hoisted(() => vi.fn());
const unref = vi.hoisted(() => vi.fn());
const spawn = vi.hoisted(() => vi.fn(() => ({ on, unref })));

vi.mock('node:child_process', async importOriginal => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  spawn,
}));

import {
  NATIVE_UPDATE_CHILD_ENV,
  NATIVE_UPDATE_SELECT_PRODUCTION_ENV,
  NATIVE_UPDATE_VERSION_ENV,
  spawnNativeUpdateCheck,
  spawnNativeUpdateChild,
} from '../../../../src/commands/version/native-update-worker';

describe('native update worker', () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env[NATIVE_UPDATE_CHILD_ENV];
    delete process.env[NATIVE_UPDATE_SELECT_PRODUCTION_ENV];
    delete process.env[NATIVE_UPDATE_VERSION_ENV];
  });

  it('detaches a metadata check without inheriting a staged version', () => {
    process.env[NATIVE_UPDATE_VERSION_ENV] = '59.0.0';

    spawnNativeUpdateCheck();

    expect(spawn).toHaveBeenCalledWith(
      process.execPath,
      ['version', 'check'],
      expect.objectContaining({
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        env: expect.objectContaining({
          [NATIVE_UPDATE_CHILD_ENV]: '1',
          [NATIVE_UPDATE_SELECT_PRODUCTION_ENV]: '0',
        }),
      })
    );
    const options = (spawn.mock.calls as unknown[][])[0][2] as {
      env: NodeJS.ProcessEnv;
    };
    expect(options.env[NATIVE_UPDATE_VERSION_ENV]).toBeUndefined();
    expect(on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(unref).toHaveBeenCalledOnce();
  });

  it('detaches a staging child with the discovered version', () => {
    spawnNativeUpdateChild('60.0.0', false);

    expect(spawn).toHaveBeenCalledWith(
      process.execPath,
      ['version', 'check'],
      expect.objectContaining({
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        env: expect.objectContaining({
          [NATIVE_UPDATE_CHILD_ENV]: '1',
          [NATIVE_UPDATE_SELECT_PRODUCTION_ENV]: '0',
          [NATIVE_UPDATE_VERSION_ENV]: '60.0.0',
        }),
      })
    );
    expect(unref).toHaveBeenCalledOnce();
  });
});
