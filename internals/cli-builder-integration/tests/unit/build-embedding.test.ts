import { isPackageInstalled, type PackageJson } from '@vercel/build-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shouldEmbedFlagsDefinitions } from '../../src/build-embedding';

vi.mock('@vercel/build-utils', () => ({
  isPackageInstalled: vi.fn(),
}));

const cwd = '/repo';
const packageJson: PackageJson = {
  dependencies: { '@flags-sdk/vercel': '^1.0.0' },
};

describe('shouldEmbedFlagsDefinitions', () => {
  beforeEach(() => {
    vi.mocked(isPackageInstalled).mockReset().mockResolvedValue(false);
    vi.stubEnv('VERCEL_FLAGS_DISABLE_DEFINITION_EMBEDDING', undefined);
    vi.stubEnv('VERCEL_FLAGS_EMBED_DEFINITIONS', undefined);
    vi.stubEnv('VERCEL_OIDC_TOKEN', undefined);
    vi.stubEnv('FLAGS', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe.each([
    '@flags-sdk/vercel',
    '@vercel/flags-core',
  ])('%s', packageName => {
    it('preserves detection of installed packages without a manifest', async () => {
      vi.mocked(isPackageInstalled).mockImplementation(
        async name => name === packageName
      );

      await expect(shouldEmbedFlagsDefinitions(cwd)).resolves.toBe(true);
    });

    it.each([
      'dependencies',
      'devDependencies',
      'optionalDependencies',
    ])('falls back to %s before dependencies are installed', async field => {
      vi.stubEnv('VERCEL_OIDC_TOKEN', 'test-oidc-token');
      const appPackageJson: PackageJson = {
        [field]: { [packageName]: '^1.0.0' },
      };

      await expect(
        shouldEmbedFlagsDefinitions(cwd, appPackageJson)
      ).resolves.toBe(true);
      expect(isPackageInstalled).toHaveBeenCalledWith(packageName, cwd);
    });
  });

  it.each([
    undefined,
    null,
    {},
    { dependencies: { flags: '^4.0.0' } },
  ])('does not enable embedding for an absent or unrelated manifest: %j', async pkg => {
    await expect(shouldEmbedFlagsDefinitions(cwd, pkg)).resolves.toBe(false);
  });

  it.each([
    0, 1700000000000,
  ])('uses the project activation timestamp %s without SDK packages', async enabledAt => {
    await expect(
      shouldEmbedFlagsDefinitions(cwd, undefined, { enabledAt })
    ).resolves.toBe(true);
    expect(isPackageInstalled).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    {},
  ])('does not enable embedding from missing activation metadata: %j', async vercelFlags => {
    await expect(
      shouldEmbedFlagsDefinitions(cwd, undefined, vercelFlags)
    ).resolves.toBe(false);
  });

  it.each([
    ['VERCEL_FLAGS_EMBED_DEFINITIONS', 'force-off'],
    ['VERCEL_FLAGS_DISABLE_DEFINITION_EMBEDDING', '1'],
  ])('honors %s=%s for a project with Flags enabled', async (name, value) => {
    vi.stubEnv(name, value);
    await expect(
      shouldEmbedFlagsDefinitions(cwd, undefined, { enabledAt: 1700000000000 })
    ).resolves.toBe(false);
    expect(isPackageInstalled).not.toHaveBeenCalled();
  });

  it('does not enable embedding from OIDC alone', async () => {
    vi.stubEnv('VERCEL_OIDC_TOKEN', 'test-oidc-token');

    await expect(shouldEmbedFlagsDefinitions(cwd, {})).resolves.toBe(false);
  });

  it('preserves SDK-key detection without installed or declared packages', async () => {
    vi.stubEnv('FLAGS', 'vf_server_test');

    await expect(shouldEmbedFlagsDefinitions(cwd)).resolves.toBe(true);
    expect(isPackageInstalled).not.toHaveBeenCalled();
  });

  it('honors force-on without installed or declared packages', async () => {
    vi.stubEnv('VERCEL_FLAGS_EMBED_DEFINITIONS', 'force-on');

    await expect(shouldEmbedFlagsDefinitions(cwd)).resolves.toBe(true);
    expect(isPackageInstalled).not.toHaveBeenCalled();
  });

  it('honors force-off even when the SDK is installed and declared', async () => {
    vi.mocked(isPackageInstalled).mockResolvedValue(true);
    vi.stubEnv('VERCEL_FLAGS_EMBED_DEFINITIONS', 'force-off');
    vi.stubEnv('FLAGS', 'vf_server_test');

    await expect(shouldEmbedFlagsDefinitions(cwd, packageJson)).resolves.toBe(
      false
    );
    expect(isPackageInstalled).not.toHaveBeenCalled();
  });

  it('honors the legacy opt-out even with force-on and a declared SDK', async () => {
    vi.stubEnv('VERCEL_FLAGS_DISABLE_DEFINITION_EMBEDDING', '1');
    vi.stubEnv('VERCEL_FLAGS_EMBED_DEFINITIONS', 'force-on');

    await expect(shouldEmbedFlagsDefinitions(cwd, packageJson)).resolves.toBe(
      false
    );
    expect(isPackageInstalled).not.toHaveBeenCalled();
  });
});
