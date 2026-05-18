import { afterEach, describe, expect, it, vi } from 'vitest';
import ciInfo from 'ci-info';
import { client } from '../../mocks/client';
import * as updateCommand from '../../../src/util/get-update-command';
import * as configFilesUtil from '../../../src/util/config/files';
import {
  canAutoUpdate,
  hasAutoUpdatePreference,
  isAutoUpdateEnabled,
  setAutoUpdate,
} from '../../../src/util/updates';

vi.mock('ci-info', () => ({
  default: {
    isCI: false,
  },
}));

const isGlobalSpy = vi.spyOn(updateCommand, 'isGlobal');
const writeConfigSpy = vi.spyOn(configFilesUtil, 'writeToConfigFile');

function setIsCI(value: boolean) {
  Object.defineProperty(ciInfo, 'isCI', {
    configurable: true,
    value,
  });
}

describe('updates', () => {
  afterEach(() => {
    client.reset();
    isGlobalSpy.mockReset();
    writeConfigSpy.mockClear();
    setIsCI(false);
  });

  it('reads auto-update state from global config', () => {
    expect(isAutoUpdateEnabled({})).toBe(false);
    expect(isAutoUpdateEnabled({ updates: { auto: false } })).toBe(false);
    expect(isAutoUpdateEnabled({ updates: { auto: true } })).toBe(true);
  });

  it('detects whether an auto-update preference has been saved', () => {
    expect(hasAutoUpdatePreference({})).toBe(false);
    expect(hasAutoUpdatePreference({ updates: { auto: true } })).toBe(true);
    expect(hasAutoUpdatePreference({ updates: { auto: false } })).toBe(true);
  });

  it('writes auto-update preference to global config', () => {
    setAutoUpdate(client, true);

    expect(client.config.updates?.auto).toBe(true);
    expect(writeConfigSpy).toHaveBeenCalledWith({
      updates: { auto: true },
    });
  });

  it('allows auto-update only for successful global interactive invocations', async () => {
    client.config = { updates: { auto: true } };
    isGlobalSpy.mockResolvedValue(true);

    await expect(canAutoUpdate(client, 0)).resolves.toBe(true);
  });

  it('does not auto-update when disabled', async () => {
    client.config = { updates: { auto: false } };
    isGlobalSpy.mockResolvedValue(true);

    await expect(canAutoUpdate(client, 0)).resolves.toBe(false);
    expect(isGlobalSpy).not.toHaveBeenCalled();
  });

  it('does not auto-update after failed commands', async () => {
    client.config = { updates: { auto: true } };
    isGlobalSpy.mockResolvedValue(true);

    await expect(canAutoUpdate(client, 1)).resolves.toBe(false);
    expect(isGlobalSpy).not.toHaveBeenCalled();
  });

  it('does not auto-update in CI', async () => {
    client.config = { updates: { auto: true } };
    setIsCI(true);
    isGlobalSpy.mockResolvedValue(true);

    await expect(canAutoUpdate(client, 0)).resolves.toBe(false);
    expect(isGlobalSpy).not.toHaveBeenCalled();
  });

  it('does not auto-update local installs', async () => {
    client.config = { updates: { auto: true } };
    isGlobalSpy.mockResolvedValue(false);

    await expect(canAutoUpdate(client, 0)).resolves.toBe(false);
  });

  it('does not auto-update non-interactive invocations', async () => {
    client.config = { updates: { auto: true } };
    client.nonInteractive = true;
    isGlobalSpy.mockResolvedValue(true);

    await expect(canAutoUpdate(client, 0)).resolves.toBe(false);
    expect(isGlobalSpy).not.toHaveBeenCalled();
  });

  it('does not auto-update after the resolved upgrade command', async () => {
    client.config = { updates: { auto: true } };
    isGlobalSpy.mockResolvedValue(true);

    await expect(canAutoUpdate(client, 0, 'upgrade')).resolves.toBe(false);
    expect(isGlobalSpy).not.toHaveBeenCalled();
  });
});
