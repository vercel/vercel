import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import upgrade from '../../../../src/commands/upgrade';
import { upgradeCommand } from '../../../../src/commands/upgrade/command';
import * as upgradeUtil from '../../../../src/util/upgrade';
import * as getUpdateCommandUtil from '../../../../src/util/get-update-command';
import * as configFilesUtil from '../../../../src/util/config/files';
import * as nativeSelfUpdateUtil from '../../../../src/util/native-self-update';
import * as installerUpgradeUtil from '../../../../src/util/installer-upgrade';

const writeConfigSpy = vi.spyOn(configFilesUtil, 'writeToConfigFile');
const executeUpgradeSpy = vi.spyOn(upgradeUtil, 'executeUpgrade');
const executeHomebrewUpgradeSpy = vi.spyOn(
  upgradeUtil,
  'executeHomebrewUpgrade'
);
const getUpdateCommandSpy = vi.spyOn(getUpdateCommandUtil, 'default');
const isGlobalSpy = vi.spyOn(getUpdateCommandUtil, 'isGlobal');
const isHomebrewInstallSpy = vi.spyOn(
  getUpdateCommandUtil,
  'isHomebrewInstall'
);
const isCurlInstallSpy = vi.spyOn(nativeSelfUpdateUtil, 'isCurlInstall');
const installProductionReleaseSpy = vi.spyOn(
  installerUpgradeUtil,
  'installProductionRelease'
);

describe('upgrade', () => {
  const originalVercelVcNative = process.env.VERCEL_VC_NATIVE;

  beforeEach(() => {
    getUpdateCommandSpy.mockResolvedValue('npm i -g vercel@latest');
    isGlobalSpy.mockResolvedValue(true);
    isHomebrewInstallSpy.mockResolvedValue(false);
    isCurlInstallSpy.mockResolvedValue(false);
  });

  afterEach(() => {
    writeConfigSpy.mockClear();
    getUpdateCommandSpy.mockReset();
    isGlobalSpy.mockReset();
    isHomebrewInstallSpy.mockReset();
    executeUpgradeSpy.mockReset();
    executeHomebrewUpgradeSpy.mockReset();
    isCurlInstallSpy.mockReset();
    installProductionReleaseSpy.mockReset();
    if (originalVercelVcNative === undefined) {
      delete process.env.VERCEL_VC_NATIVE;
    } else {
      process.env.VERCEL_VC_NATIVE = originalVercelVcNative;
    }
  });

  it('reports unsupported installer errors with a failure exit code', async () => {
    executeUpgradeSpy.mockRejectedValueOnce(
      new getUpdateCommandUtil.UnsupportedUpgradeInstallError(
        'Could not detect a supported global npm, pnpm, Yarn, or Bun installation of Vercel CLI. Update it with the package manager that installed it.'
      )
    );
    client.setArgv('upgrade');
    await expect(upgrade(client)).resolves.toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Update it with the package manager that installed it'
    );
    expect(writeConfigSpy).not.toHaveBeenCalled();
  });

  describe('Homebrew installs', () => {
    beforeEach(() => {
      isHomebrewInstallSpy.mockResolvedValue(true);
      getUpdateCommandSpy.mockResolvedValue('brew upgrade vercel');
    });

    it.each([
      ['--dry-run'],
      ['--dry-run', '--json'],
      [],
    ])('rejects a pinned version instead of upgrading to latest (%s)', async (...flags) => {
      client.setArgv('upgrade', '63.0.0', ...flags);

      await expect(upgrade(client)).resolves.toBe(1);

      expect(client.stderr.getFullOutput()).toContain(
        "Can't install a specific version of a Vercel CLI installed with Homebrew. Run `brew upgrade vercel` to update to the latest version"
      );
      expect(client.stdout.getFullOutput()).toBe('');
      expect(getUpdateCommandSpy).not.toHaveBeenCalled();
      expect(executeUpgradeSpy).not.toHaveBeenCalled();
    });

    it('previews the Homebrew upgrade command for latest', async () => {
      client.setArgv('upgrade', 'latest', '--dry-run');

      await expect(upgrade(client)).resolves.toBe(0);

      expect(client.stderr.getFullOutput()).toContain(
        'Upgrade command: brew upgrade vercel'
      );
    });

    it.each([
      [],
      ['latest'],
    ])('runs brew upgrade for the latest version (%s)', async (...args) => {
      executeHomebrewUpgradeSpy.mockResolvedValueOnce(0);
      client.setArgv('upgrade', ...args);

      await expect(upgrade(client)).resolves.toBe(0);

      expect(executeHomebrewUpgradeSpy).toHaveBeenCalledOnce();
      expect(executeUpgradeSpy).not.toHaveBeenCalled();
    });

    it('passes through the brew exit code', async () => {
      executeHomebrewUpgradeSpy.mockResolvedValueOnce(3);
      client.setArgv('upgrade');

      await expect(upgrade(client)).resolves.toBe(3);
    });

    it('rejects --bypass-min-release-age', async () => {
      client.setArgv('upgrade', '--bypass-min-release-age');

      await expect(upgrade(client)).resolves.toBe(1);

      expect(client.stderr.getFullOutput()).toContain(
        "Can't use `--bypass-min-release-age` with a CLI installed with Homebrew."
      );
      expect(executeHomebrewUpgradeSpy).not.toHaveBeenCalled();
      expect(writeConfigSpy).not.toHaveBeenCalled();
    });
  });

  describe('--help', () => {
    it('documents that minimum release-age bypass persists', () => {
      expect(
        upgradeCommand.options.find(
          option => option.name === 'bypass-min-release-age'
        )?.description
      ).toContain('this and future foreground upgrades');
    });

    it('tracks telemetry', async () => {
      const command = 'upgrade';

      client.setArgv(command, '--help');
      const exitCodePromise = upgrade(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: command,
        },
      ]);
    });
  });

  describe('--dry-run', () => {
    it('tracks telemetry', async () => {
      client.setArgv('upgrade', '--dry-run');
      const exitCodePromise = upgrade(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:dry-run',
          value: 'TRUE',
        },
      ]);
    });

    it('prints upgrade information without executing', async () => {
      delete process.env.VERCEL_VC_NATIVE;
      client.setArgv('upgrade', '--dry-run');
      const exitCode = await upgrade(client);
      expect(exitCode).toBe(0);

      await expect(client.stderr).toOutput('Current version:');
      await expect(client.stderr).toOutput('Installation type:');
      await expect(client.stderr).toOutput('Upgrade command:');
      await expect(client.stderr).toOutput('Automatic updates: Disabled');
    });

    it('prints a vercel upgrade command for a package-managed native runtime', async () => {
      process.env.VERCEL_VC_NATIVE = '1';
      client.setArgv('upgrade', '--dry-run');

      const exitCode = await upgrade(client);

      expect(exitCode).toBe(0);
      const output = client.stderr.getFullOutput();
      expect(output).toContain('Upgrade command:');
      expect(output).toContain('npm i -g vercel@latest');
      expect(output).not.toContain('@vercel/vc-native');
      expect(output).not.toContain('--force');
    });
  });

  describe('--json', () => {
    it('tracks telemetry', async () => {
      client.setArgv('upgrade', '--json');
      const exitCodePromise = upgrade(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:json',
          value: 'TRUE',
        },
      ]);
    });

    it('outputs valid JSON', async () => {
      delete process.env.VERCEL_VC_NATIVE;
      client.setArgv('upgrade', '--json');
      const exitCode = await upgrade(client);
      expect(exitCode).toBe(0);

      const output = client.stdout.getFullOutput();
      const json = JSON.parse(output);

      expect(json).toHaveProperty('currentVersion');
      expect(json).toHaveProperty('installationType');
      expect(json).toHaveProperty('upgradeCommand');
      expect(json).toHaveProperty('autoUpdatesEnabled', false);
      expect(['global', 'local']).toContain(json.installationType);
    });

    it('outputs a vercel upgrade command for a package-managed native runtime', async () => {
      process.env.VERCEL_VC_NATIVE = '1';
      client.setArgv('upgrade', '--json');

      const exitCode = await upgrade(client);

      expect(exitCode).toBe(0);
      const json = JSON.parse(client.stdout.getFullOutput());
      expect(json.upgradeCommand).toBe('npm i -g vercel@latest');
    });
  });

  describe('--format', () => {
    it('tracks telemetry for --format json', async () => {
      client.setArgv('upgrade', '--format', 'json');
      const exitCodePromise = upgrade(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:format',
          value: 'json',
        },
      ]);
    });

    it('outputs upgrade information as valid JSON that can be piped to jq', async () => {
      client.setArgv('upgrade', '--format', 'json');
      const exitCode = await upgrade(client);
      expect(exitCode).toBe(0);

      const output = client.stdout.getFullOutput();
      // Should be valid JSON - this will throw if not parseable
      const json = JSON.parse(output);

      expect(json).toHaveProperty('currentVersion');
      expect(json).toHaveProperty('installationType');
      expect(json).toHaveProperty('upgradeCommand');
      expect(json).toHaveProperty('autoUpdatesEnabled', false);
    });
  });

  describe.each([
    ['--dry-run'],
    ['--json'],
    ['--format', 'json'],
  ])('preference preview with %s', (...previewArgs) => {
    describe.each([false, true])('native installation: %s', native => {
      it.each([
        [
          '--no-bypass-min-release-age',
          'bypassMinReleaseAge',
          false,
          'minimum release-age bypass',
        ],
        [
          '--disable-min-release-age-bypass',
          'bypassMinReleaseAge',
          false,
          'minimum release-age bypass',
        ],
        [
          '--bypass-min-release-age',
          'bypassMinReleaseAge',
          true,
          'minimum release-age bypass',
        ],
        ['--autoupdate', 'autoUpdatesEnabled', true, 'automatic CLI updates'],
        [
          '--no-autoupdate',
          'autoUpdatesEnabled',
          false,
          'automatic CLI updates',
        ],
        ['--enable-auto', 'autoUpdatesEnabled', true, 'automatic CLI updates'],
        [
          '--disable-auto',
          'autoUpdatesEnabled',
          false,
          'automatic CLI updates',
        ],
      ] as const)('previews %s without mutations', async (flag, preference, enabled, label) => {
        if (native) {
          process.env.VERCEL_VC_NATIVE = '1';
        } else {
          delete process.env.VERCEL_VC_NATIVE;
        }
        client.config = {
          updates: { auto: !enabled, bypassMinReleaseAge: !enabled },
        };
        const originalConfig = structuredClone(client.config);
        client.setArgv('upgrade', flag, ...previewArgs);

        await expect(upgrade(client)).resolves.toBe(0);

        expect(writeConfigSpy).not.toHaveBeenCalled();
        expect(executeUpgradeSpy).not.toHaveBeenCalled();
        expect(client.config).toEqual(originalConfig);
        const stderr = client.stderr.getFullOutput();
        if (previewArgs[0] === '--dry-run') {
          expect(client.stdout.getFullOutput()).toBe('');
          expect(stderr).toContain(
            `Would ${enabled ? 'enable' : 'disable'} ${label}. No settings changed.`
          );
          if (flag === '--bypass-min-release-age') {
            expect(stderr).toContain('Upgrade command:');
          } else {
            expect(stderr).not.toContain('Upgrade command:');
          }
          expect(stderr).not.toContain('Minimum release-age bypass disabled.');
          expect(stderr).not.toContain('Automatic CLI updates enabled.');
          expect(stderr).not.toContain('Automatic CLI updates disabled.');
        } else {
          const json = JSON.parse(client.stdout.getFullOutput());
          expect(json).toEqual({
            currentVersion: expect.any(String),
            installationType: expect.stringMatching(/^(global|local)$/),
            ...(flag === '--bypass-min-release-age' && {
              upgradeCommand: expect.any(String),
            }),
            autoUpdatesEnabled: !enabled,
            requestedSettings: { [preference]: enabled },
          });
          expect(stderr).toBe('');
        }
      });
    });

    it('previews only the preference that would execute', async () => {
      client.setArgv(
        'upgrade',
        '--disable-min-release-age-bypass',
        '--enable-auto',
        ...previewArgs
      );

      await expect(upgrade(client)).resolves.toBe(0);

      expect(writeConfigSpy).not.toHaveBeenCalled();
      expect(executeUpgradeSpy).not.toHaveBeenCalled();
      if (previewArgs[0] === '--dry-run') {
        const stderr = client.stderr.getFullOutput();
        expect(stderr).toContain('Would disable minimum release-age bypass.');
        expect(stderr).not.toContain('Would enable');
      } else {
        expect(
          JSON.parse(client.stdout.getFullOutput()).requestedSettings
        ).toEqual({
          bypassMinReleaseAge: false,
        });
      }
    });
  });

  describe('target version', () => {
    it('passes an explicit semantic version to the installer', async () => {
      executeUpgradeSpy.mockResolvedValueOnce(0);
      client.setArgv('upgrade', '58.0.0');

      await expect(upgrade(client)).resolves.toBe(0);

      expect(executeUpgradeSpy).toHaveBeenCalledWith(
        '58.0.0',
        client,
        false,
        true
      );
    });

    it('normalizes a v-prefixed semantic version', async () => {
      executeUpgradeSpy.mockResolvedValueOnce(0);
      client.setArgv('upgrade', 'v58.0.0');

      await expect(upgrade(client)).resolves.toBe(0);

      expect(executeUpgradeSpy).toHaveBeenCalledWith(
        '58.0.0',
        client,
        false,
        true
      );
    });

    it('passes an explicit latest tag to the installer', async () => {
      executeUpgradeSpy.mockResolvedValueOnce(0);
      client.setArgv('upgrade', 'latest');

      await expect(upgrade(client)).resolves.toBe(0);

      expect(executeUpgradeSpy).toHaveBeenCalledWith(
        'latest',
        client,
        false,
        true
      );
    });

    it.each([
      ['latest', 'latest'],
      ['58.0.0', 'version'],
      ['v58.0.0', 'version'],
      ['next', 'invalid'],
    ])('tracks the %s target classification', async (target, classification) => {
      executeUpgradeSpy.mockResolvedValueOnce(0);
      client.setArgv('upgrade', target);

      await upgrade(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:version',
          value: classification,
        },
      ]);
    });

    it('rejects invalid versions before running the installer', async () => {
      executeUpgradeSpy.mockResolvedValueOnce(0);
      client.setArgv('upgrade', 'next');

      await expect(upgrade(client)).resolves.toBe(1);

      expect(executeUpgradeSpy).not.toHaveBeenCalled();
      await expect(client.stderr).toOutput(
        'Invalid version: "next". Use a major.minor.patch version or "latest".'
      );
    });

    it('rejects unexpected positional arguments', async () => {
      client.setArgv('upgrade', '58.0.0', 'extra');

      await expect(upgrade(client)).resolves.toBe(1);

      expect(executeUpgradeSpy).not.toHaveBeenCalled();
      await expect(client.stderr).toOutput('Unexpected argument: "extra".');
    });

    it.each([
      '--no-bypass-min-release-age',
      '--disable-min-release-age-bypass',
      '--autoupdate',
      '--no-autoupdate',
      '--enable-auto',
      '--disable-auto',
    ])('rejects a target with settings-only flag %s', async flag => {
      client.setArgv('upgrade', '58.0.0', flag);

      await expect(upgrade(client)).resolves.toBe(2);

      expect(writeConfigSpy).not.toHaveBeenCalled();
      expect(executeUpgradeSpy).not.toHaveBeenCalled();
      await expect(client.stderr).toOutput(
        "Can't use a version with settings-only upgrade options."
      );
    });

    it('shows the explicit version in dry-run output', async () => {
      client.setArgv('upgrade', '58.0.0', '--dry-run');

      await expect(upgrade(client)).resolves.toBe(0);
      await expect(client.stderr).toOutput('vercel@58.0.0');
    });
  });

  describe('--autoupdate', () => {
    it('enables automatic updates in the global config', async () => {
      client.setArgv('upgrade', '--autoupdate');
      const exitCode = await upgrade(client);

      expect(exitCode).toBe(0);
      expect(client.config.updates?.auto).toBe(true);
      expect(writeConfigSpy).toHaveBeenCalledWith({
        updates: { auto: true },
      });
      await expect(client.stderr).toOutput('Automatic CLI updates enabled.');
      expect(client.stderr.getFullOutput()).not.toContain('deprecated');
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:autoupdate',
          value: 'TRUE',
        },
      ]);
    });

    it('still accepts the old --enable-auto, with a warning', async () => {
      client.setArgv('upgrade', '--enable-auto');
      const exitCode = await upgrade(client);

      expect(exitCode).toBe(0);
      expect(client.config.updates?.auto).toBe(true);
      expect(client.stderr.getFullOutput()).toContain(
        '--enable-auto is deprecated. Use --autoupdate.'
      );
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:enable-auto',
          value: 'TRUE',
        },
      ]);
    });
  });

  describe('--no-autoupdate', () => {
    it('disables automatic updates in the global config', async () => {
      client.config = { updates: { auto: true } };
      client.setArgv('upgrade', '--no-autoupdate');
      const exitCode = await upgrade(client);

      expect(exitCode).toBe(0);
      expect(client.config.updates?.auto).toBe(false);
      expect(writeConfigSpy).toHaveBeenCalledWith({
        updates: { auto: false },
      });
      await expect(client.stderr).toOutput('Automatic CLI updates disabled.');
      expect(client.stderr.getFullOutput()).not.toContain('deprecated');
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:no-autoupdate',
          value: 'TRUE',
        },
      ]);
    });

    it('still accepts the old --disable-auto, with a warning', async () => {
      client.config = { updates: { auto: true } };
      client.setArgv('upgrade', '--disable-auto');
      const exitCode = await upgrade(client);

      expect(exitCode).toBe(0);
      expect(client.config.updates?.auto).toBe(false);
      expect(client.stderr.getFullOutput()).toContain(
        '--disable-auto is deprecated. Use --no-autoupdate.'
      );
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:disable-auto',
          value: 'TRUE',
        },
      ]);
    });
  });

  describe('--no-bypass-min-release-age', () => {
    it('restores package-manager release-age checks', async () => {
      client.config = { updates: { bypassMinReleaseAge: true } };
      client.setArgv('upgrade', '--no-bypass-min-release-age');

      const exitCode = await upgrade(client);

      expect(exitCode).toBe(0);
      expect(client.config.updates?.bypassMinReleaseAge).toBe(false);
      expect(writeConfigSpy).toHaveBeenCalledWith({
        updates: { bypassMinReleaseAge: false },
      });
      expect(executeUpgradeSpy).not.toHaveBeenCalled();
      await expect(client.stderr).toOutput(
        'Minimum release-age bypass disabled.'
      );
      expect(client.stderr.getFullOutput()).not.toContain('deprecated');
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:no-bypass-min-release-age',
          value: 'TRUE',
        },
      ]);
    });

    it('still accepts the old --disable-min-release-age-bypass, with a warning', async () => {
      client.config = { updates: { bypassMinReleaseAge: true } };
      client.setArgv('upgrade', '--disable-min-release-age-bypass');

      const exitCode = await upgrade(client);

      expect(exitCode).toBe(0);
      expect(client.config.updates?.bypassMinReleaseAge).toBe(false);
      expect(client.stderr.getFullOutput()).toContain(
        '--disable-min-release-age-bypass is deprecated. Use --no-bypass-min-release-age.'
      );
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:disable-min-release-age-bypass',
          value: 'TRUE',
        },
      ]);
    });
  });

  it.each([
    ['--no-bypass-min-release-age'],
    ['--disable-min-release-age-bypass'],
  ])('rejects --bypass-min-release-age with %s', async offFlag => {
    client.setArgv('upgrade', '--bypass-min-release-age', offFlag);

    const result = await upgrade(client);

    expect(result).toBe(2);
    await expect(client.stderr).toOutput(
      `Can't use --bypass-min-release-age with ${offFlag}.`
    );
    expect(executeUpgradeSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['--autoupdate', '--no-autoupdate'],
    ['--enable-auto', '--disable-auto'],
    ['--autoupdate', '--disable-auto'],
  ])('rejects %s with %s', async (onFlag, offFlag) => {
    client.setArgv('upgrade', onFlag, offFlag);
    const result = await upgrade(client);

    expect(result).toBe(2);
    await expect(client.stderr).toOutput(
      `Can't use ${onFlag} with ${offFlag}.`
    );
  });

  it('should reject invalid arguments', async () => {
    client.setArgv('--invalid');
    const result = await upgrade(client);
    expect(result).toBe(2);
  });

  describe('curl-installed CLI', () => {
    beforeEach(() => {
      process.env.VERCEL_VC_NATIVE = '1';
      isCurlInstallSpy.mockResolvedValue(true);
      installProductionReleaseSpy.mockResolvedValue(0);
      getUpdateCommandSpy.mockRejectedValue(
        new getUpdateCommandUtil.UnsupportedUpgradeInstallError(
          'Could not detect a supported global npm, pnpm, Yarn, or Bun installation of Vercel CLI.'
        )
      );
    });

    it('upgrades through the installer instead of a package manager', async () => {
      client.setArgv('upgrade');

      await expect(upgrade(client)).resolves.toBe(0);

      expect(installProductionReleaseSpy).toHaveBeenCalledWith({
        version: undefined,
        skipIfCurrent: true,
      });
      expect(executeUpgradeSpy).not.toHaveBeenCalled();
      expect(getUpdateCommandSpy).not.toHaveBeenCalled();
      expect(client.stderr.getFullOutput()).not.toContain(
        'Could not detect a supported global'
      );
    });

    it.each([
      ['59.11.7', '59.11.7'],
      ['latest', 'latest'],
    ])('passes explicit target %s to the installer', async (arg, expected) => {
      client.setArgv('upgrade', arg);

      await expect(upgrade(client)).resolves.toBe(0);

      expect(installProductionReleaseSpy).toHaveBeenCalledWith({
        version: expected,
        skipIfCurrent: false,
      });
    });

    it('propagates installer upgrade failures', async () => {
      installProductionReleaseSpy.mockResolvedValue(1);
      client.setArgv('upgrade');

      await expect(upgrade(client)).resolves.toBe(1);
    });

    it('rejects --bypass-min-release-age without persisting it', async () => {
      client.config = {};
      client.setArgv('upgrade', '--bypass-min-release-age');

      await expect(upgrade(client)).resolves.toBe(1);

      expect(client.stderr.getFullOutput()).toContain(
        "Can't use `--bypass-min-release-age` with a CLI installed by the Vercel installer."
      );
      expect(installProductionReleaseSpy).not.toHaveBeenCalled();
      expect(executeUpgradeSpy).not.toHaveBeenCalled();
      expect(writeConfigSpy).not.toHaveBeenCalled();
    });

    it.each([
      ['--dry-run'],
      ['--json'],
      ['--format', 'json'],
    ])('rejects --bypass-min-release-age in %s preview like execution', async (...previewArgs) => {
      client.config = {};
      client.setArgv('upgrade', '--bypass-min-release-age', ...previewArgs);

      await expect(upgrade(client)).resolves.toBe(1);

      expect(client.stdout.getFullOutput()).toBe('');
      const output = client.stderr.getFullOutput();
      expect(output).toContain(
        "Can't use `--bypass-min-release-age` with a CLI installed by the Vercel installer."
      );
      expect(output).not.toContain('Would enable minimum release-age bypass');
      expect(installProductionReleaseSpy).not.toHaveBeenCalled();
      expect(writeConfigSpy).not.toHaveBeenCalled();
    });

    it('lets settings-only flags take precedence over --bypass-min-release-age', async () => {
      client.config = {};
      client.setArgv(
        'upgrade',
        '--bypass-min-release-age',
        '--enable-auto',
        '--dry-run'
      );

      await expect(upgrade(client)).resolves.toBe(0);

      const output = client.stderr.getFullOutput();
      expect(output).toContain('Would enable automatic CLI updates.');
      expect(output).not.toContain("Can't use `--bypass-min-release-age`");
    });

    it('reports installer installation type in --json without an upgrade command', async () => {
      client.setArgv('upgrade', '--json');

      await expect(upgrade(client)).resolves.toBe(0);

      const json = JSON.parse(client.stdout.getFullOutput());
      expect(json.installationType).toBe('installer');
      expect(json).not.toHaveProperty('upgradeCommand');
      expect(getUpdateCommandSpy).not.toHaveBeenCalled();
      expect(isGlobalSpy).not.toHaveBeenCalled();
      expect(installProductionReleaseSpy).not.toHaveBeenCalled();
    });

    it('reports installer installation type in --dry-run', async () => {
      client.setArgv('upgrade', '--dry-run');

      await expect(upgrade(client)).resolves.toBe(0);

      const output = client.stderr.getFullOutput();
      expect(output).toContain('Installation type: installer');
      expect(output).not.toContain('Upgrade command:');
      expect(installProductionReleaseSpy).not.toHaveBeenCalled();
    });
  });
});
