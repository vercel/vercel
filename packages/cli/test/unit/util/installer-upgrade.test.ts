import { beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../mocks/client';
import { installProductionRelease } from '../../../src/util/installer-upgrade';
import {
  installAndActivateProductionVersion,
  listAvailableVersions,
  resolveLatestNativeVersion,
} from '../../../src/util/native-self-update';
import { readActivePointer } from '../../../src/util/native-install-layout';

vi.mock('../../../src/util/pkg', () => ({
  default: { version: '60.0.0', name: 'vercel' },
}));

vi.mock('../../../src/util/native-self-update', () => ({
  CURL_INSTALL_COMMAND:
    'curl -fsSL https://api-frameworks.vercel.sh/install | bash',
  installAndActivateProductionVersion: vi.fn(),
  listAvailableVersions: vi.fn(),
  resolveLatestNativeVersion: vi.fn(),
}));

vi.mock('../../../src/util/native-install-layout', () => ({
  readActivePointer: vi.fn(),
}));

const installMock = vi.mocked(installAndActivateProductionVersion);
const listMock = vi.mocked(listAvailableVersions);
const latestMock = vi.mocked(resolveLatestNativeVersion);
const pointerMock = vi.mocked(readActivePointer);

describe('installProductionRelease', () => {
  beforeEach(() => {
    client.reset();
    vi.resetAllMocks();
    installMock.mockResolvedValue({ slot: 'b', downloaded: true });
    listMock.mockResolvedValue(['61.0.0', '60.0.0', '59.0.0']);
    latestMock.mockResolvedValue('61.0.0');
    pointerMock.mockResolvedValue({ track: 'production', slot: 'a' });
  });

  it('installs and activates the latest release', async () => {
    await expect(
      installProductionRelease({ skipIfCurrent: true })
    ).resolves.toBe(0);

    expect(listMock).not.toHaveBeenCalled();
    expect(installMock).toHaveBeenCalledWith('61.0.0');
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Upgraded Vercel CLI to v61.0.0.');
    expect(output).not.toContain('No upgrade available');
    expect(output).not.toContain('Older CLI versions');
  });

  it('reports a no-op when already on the latest release', async () => {
    latestMock.mockResolvedValue('60.0.0');

    await expect(
      installProductionRelease({ skipIfCurrent: true })
    ).resolves.toBe(0);

    expect(installMock).not.toHaveBeenCalled();
    expect(client.stderr.getFullOutput()).toContain(
      'No upgrade available. Vercel CLI is already up to date (v60.0.0).'
    );
  });

  it('reinstalls the current release when not skipping', async () => {
    latestMock.mockResolvedValue('60.0.0');

    await expect(installProductionRelease({ version: 'latest' })).resolves.toBe(
      0
    );

    expect(installMock).toHaveBeenCalledWith('60.0.0');
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Vercel CLI v60.0.0 is active.');
    expect(output).not.toContain('Upgraded');
  });

  it('switches from a PR build back to production instead of skipping', async () => {
    latestMock.mockResolvedValue('60.0.0');
    pointerMock.mockResolvedValue({ track: 'pr', slot: 'a' });

    await expect(
      installProductionRelease({ skipIfCurrent: true })
    ).resolves.toBe(0);

    expect(installMock).toHaveBeenCalledWith('60.0.0');
    expect(client.stderr.getFullOutput()).toContain(
      'Upgraded Vercel CLI to v60.0.0.'
    );
  });

  it('uses the caller-supplied version and track', async () => {
    await expect(
      installProductionRelease({
        version: '60.0.0',
        currentVersion: '61.0.0',
        track: 'production',
      })
    ).resolves.toBe(0);

    expect(pointerMock).not.toHaveBeenCalled();
    expect(client.stderr.getFullOutput()).toContain(
      'Older CLI versions can replace the installer-managed links'
    );
  });

  it('installs a pinned older version and warns about legacy links', async () => {
    await expect(installProductionRelease({ version: '59.0.0' })).resolves.toBe(
      0
    );

    expect(latestMock).not.toHaveBeenCalled();
    expect(installMock).toHaveBeenCalledWith('59.0.0');
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Vercel CLI v59.0.0 is active.');
    expect(output).toContain('restore the bounded slot layout');
  });

  it('rejects a version that does not exist before downloading', async () => {
    await expect(installProductionRelease({ version: '99.0.0' })).resolves.toBe(
      1
    );

    expect(installMock).not.toHaveBeenCalled();
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Version 99.0.0 does not exist.');
    expect(output).toContain('version list');
  });

  it('still attempts the install when the version list is unavailable', async () => {
    listMock.mockRejectedValue(new Error('offline'));

    await expect(installProductionRelease({ version: '61.0.0' })).resolves.toBe(
      0
    );

    expect(installMock).toHaveBeenCalledWith('61.0.0');
  });

  it('reports install failures with the manual reinstall command', async () => {
    installMock.mockRejectedValue(new Error('HTTP 500'));

    await expect(installProductionRelease()).resolves.toBe(1);

    const output = client.stderr.getFullOutput();
    expect(output).toContain('Failed to install Vercel CLI v61.0.0: HTTP 500');
    expect(output).toContain(
      'curl -fsSL https://api-frameworks.vercel.sh/install | bash'
    );
    expect(output).not.toContain('Upgrade failed');
  });

  it('reports registry failures when resolving the latest release', async () => {
    latestMock.mockRejectedValue(new Error('HTTP 503'));

    await expect(installProductionRelease()).resolves.toBe(1);

    expect(installMock).not.toHaveBeenCalled();
    expect(client.stderr.getFullOutput()).toContain(
      'Failed to resolve the latest Vercel CLI version: HTTP 503'
    );
  });
});
