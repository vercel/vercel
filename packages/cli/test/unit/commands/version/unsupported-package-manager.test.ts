import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import version from '../../../../src/commands/version';
import status from '../../../../src/commands/version/status';
import { getUpdateCommandInfo } from '../../../../src/util/get-update-command';
import { isNativeBinaryInstall } from '../../../../src/util/native-install';
import {
  installAndActivatePrBinary,
  installAndActivateProductionVersion,
  listAvailableVersions,
  resolveLatestNativeVersion,
} from '../../../../src/util/native-self-update';
import chars from '../../../../src/util/output/chars';

vi.mock('../../../../src/util/get-update-command', () => ({
  getUpdateCommandInfo: vi.fn(),
  isHomebrewInstall: vi.fn().mockResolvedValue(false),
  HOMEBREW_UPGRADE_COMMAND: 'brew upgrade vercel',
}));

vi.mock('../../../../src/util/native-install', async importOriginal => ({
  ...(await importOriginal<
    typeof import('../../../../src/util/native-install')
  >()),
  isNativeBinaryInstall: vi.fn(),
}));

vi.mock('../../../../src/util/native-self-update', async importOriginal => ({
  ...(await importOriginal<
    typeof import('../../../../src/util/native-self-update')
  >()),
  isCurlInstall: vi.fn().mockResolvedValue(false),
  listAvailableVersions: vi.fn(),
  resolveLatestNativeVersion: vi.fn(),
  installAndActivateProductionVersion: vi.fn(),
  installAndActivatePrBinary: vi.fn(),
}));

vi.mock('../../../../src/util/pkg', () => ({
  default: { version: '59.6.3', name: 'vercel' },
}));

describe.each([
  false,
  true,
])('version with an unsupported installation (native: %s)', native => {
  beforeEach(() => {
    vi.mocked(isNativeBinaryInstall).mockReturnValue(native);
    vi.mocked(getUpdateCommandInfo).mockRejectedValue(
      new Error(
        'Could not detect a supported global npm, pnpm, Yarn, or Bun installation of Vercel CLI. Update it with the package manager that installed it.'
      )
    );
    vi.mocked(listAvailableVersions).mockResolvedValue(['59.6.3', '58.0.0']);
  });

  afterEach(() => {
    client.reset();
    vi.clearAllMocks();
  });

  it.each([
    'version',
    'status',
  ])('keeps %s inspection working', async action => {
    client.setArgv('version');
    const exitCode =
      action === 'status' ? await status(client) : await version(client);

    expect(exitCode).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Version: 59.6.3');
    expect(output).toContain(
      `Runtime: ${native ? 'native binary' : 'Node.js'}`
    );
    expect(output).toContain(
      'Managed by: package manager (unsupported installation)'
    );
    expect(output).toContain(
      'Could not detect a supported global npm, pnpm, Yarn, or Bun installation'
    );
    expect(output).not.toContain('Upgrade command:');
    expect(output).not.toContain('npm i');
    expect(output).not.toContain('undefined');
    expect(output).not.toContain('assumed');
  });

  it.each(['list', 'installed'])('keeps %s working', async action => {
    client.setArgv('version', action);

    expect(await version(client)).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('59.6.3');
    expect(output).toContain('(current)');
    if (action === 'list') {
      expect(output).toContain('58.0.0');
    } else {
      expect(output).toContain(
        'managed by an unsupported package-manager installation'
      );
    }
    expect(output).not.toContain('npm i');
    expect(output).not.toContain('Failed to list versions');
  });

  it.each([
    ['use', '58.0.0'],
    ['use', 'latest'],
    ['use', 'pr/115'],
    ['update'],
  ])('rejects install operation %s %s without mutation', async (...args) => {
    client.setArgv('version', ...args);

    expect(await version(client)).toBe(1);
    const output = client.stderr.getFullOutput();
    expect(output).toContain(
      `${chars.fatal} Could not detect a supported global npm, pnpm, Yarn, or Bun installation of Vercel CLI.`
    );
    expect(output).toContain(
      'Update it with the package manager that installed it.'
    );
    expect(output).not.toContain('npm i');
    expect(output).not.toContain('Or install this version');
    expect(resolveLatestNativeVersion).not.toHaveBeenCalled();
    expect(installAndActivateProductionVersion).not.toHaveBeenCalled();
    expect(installAndActivatePrBinary).not.toHaveBeenCalled();
    expect(listAvailableVersions).not.toHaveBeenCalled();
  });
});
