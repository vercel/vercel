import { beforeEach, describe, expect, it, vi } from 'vitest';
import output from '../../../src/output-manager';
import { fetchLatestVersion } from '../../../src/util/get-latest-version';
import { executeStandaloneUpgrade } from '../../../src/util/native-upgrade';
import pkg from '../../../src/util/pkg';

vi.mock('../../../src/output-manager', () => ({
  default: {
    error: vi.fn(),
    log: vi.fn(),
  },
}));

vi.mock('../../../src/util/get-latest-version', () => ({
  fetchLatestVersion: vi.fn(),
}));

vi.mock('../../../src/util/native-install', () => ({
  getReleaseTarget: () => 'vercel-test-target',
}));

const fetchLatestVersionMock = vi.mocked(fetchLatestVersion);
const outputMock = vi.mocked(output);

describe('executeStandaloneUpgrade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves the native release stream and skips an up-to-date download', async () => {
    fetchLatestVersionMock.mockResolvedValue(pkg.version);

    await expect(executeStandaloneUpgrade()).resolves.toBe(0);

    expect(fetchLatestVersionMock).toHaveBeenCalledWith({
      name: '@vercel/vc-native',
    });
    expect(outputMock.log).toHaveBeenCalledWith(
      `No upgrade available. Vercel CLI is already up to date (v${pkg.version}).`
    );
  });

  it('fails cleanly when the native release version cannot be resolved', async () => {
    fetchLatestVersionMock.mockResolvedValue(undefined);

    await expect(executeStandaloneUpgrade()).resolves.toBe(1);

    expect(outputMock.error).toHaveBeenCalledWith(
      'Could not determine the latest version to install.'
    );
  });
});
