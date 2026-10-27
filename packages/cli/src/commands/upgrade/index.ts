import { help } from '../help';
import { upgradeCommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import {
  executeHomebrewUpgrade,
  executeUpgrade,
  pinPackageVersion,
  setMinReleaseAgeBypass,
} from '../../util/upgrade';
import getUpdateCommand, {
  HOMEBREW_UPGRADE_COMMAND,
  isGlobal,
  isHomebrewInstall,
} from '../../util/get-update-command';
import { printError } from '../../util/error';
import { readOnOffOption } from '../../util/on-off-option';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import pkg from '../../util/pkg';
import type Client from '../../util/client';
import { UpgradeTelemetryClient } from '../../util/telemetry/commands/upgrade';
import { isAutoUpdateEnabled, setAutoUpdate } from '../../util/updates';
import {
  CURL_INSTALL_COMMAND,
  isCurlInstall,
} from '../../util/native-self-update';
import { installProductionRelease } from '../../util/installer-upgrade';
import semver from 'semver';

export default async function upgrade(client: Client): Promise<number> {
  try {
    return await runUpgrade(client);
  } catch (error) {
    printError(error);
    return 1;
  }
}

async function runUpgrade(client: Client): Promise<number> {
  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(upgradeCommand.options);

  const telemetry = new UpgradeTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  // Parse CLI args
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 2;
  }

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('upgrade');
    output.print(
      help(upgradeCommand, {
        stream: client.stderr,
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  const targetArg = parsedArgs.args[1];
  const target =
    targetArg === 'latest'
      ? targetArg
      : targetArg
        ? (semver.valid(targetArg) ?? undefined)
        : undefined;
  telemetry.trackCliArgumentVersion(
    targetArg
      ? targetArg === 'latest'
        ? 'latest'
        : target
          ? 'version'
          : 'invalid'
      : undefined
  );

  if (parsedArgs.args.length > 2) {
    output.error(`Unexpected argument: "${parsedArgs.args[2]}".`);
    return 1;
  }

  if (targetArg && !target) {
    output.error(
      `Invalid version: "${targetArg}". Use a major.minor.patch version or "latest".`
    );
    return 1;
  }

  const dryRun = parsedArgs.flags['--dry-run'];
  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 2;
  }
  const asJson = formatResult.jsonOutput;

  telemetry.trackCliFlagDryRun(dryRun);
  telemetry.trackCliFlagAutoupdate(parsedArgs.flags['--autoupdate']);
  telemetry.trackCliFlagNoAutoupdate(parsedArgs.flags['--no-autoupdate']);
  telemetry.trackCliFlagEnableAuto(parsedArgs.flags['--enable-auto']);
  telemetry.trackCliFlagDisableAuto(parsedArgs.flags['--disable-auto']);
  telemetry.trackCliFlagBypassMinReleaseAge(
    parsedArgs.flags['--bypass-min-release-age']
  );
  telemetry.trackCliFlagNoBypassMinReleaseAge(
    parsedArgs.flags['--no-bypass-min-release-age']
  );
  telemetry.trackCliFlagDisableMinReleaseAgeBypass(
    parsedArgs.flags['--disable-min-release-age-bypass']
  );
  telemetry.trackCliOptionFormat(parsedArgs.flags['--format']);
  telemetry.trackCliFlagJson(parsedArgs.flags['--json']);

  const autoupdate = readOnOffOption(client, parsedArgs.flags, {
    on: '--autoupdate',
    off: '--no-autoupdate',
    oldOn: '--enable-auto',
    oldOff: '--disable-auto',
  });
  if ('error' in autoupdate) {
    output.error(autoupdate.error);
    return 2;
  }
  const enableAuto = autoupdate.value === true;
  const disableAuto = autoupdate.value === false;

  const releaseAgeBypass = readOnOffOption(client, parsedArgs.flags, {
    on: '--bypass-min-release-age',
    off: '--no-bypass-min-release-age',
    oldOff: '--disable-min-release-age-bypass',
  });
  if ('error' in releaseAgeBypass) {
    output.error(releaseAgeBypass.error);
    return 2;
  }
  const bypassMinReleaseAge = releaseAgeBypass.value === true;
  const disableMinReleaseAgeBypass = releaseAgeBypass.value === false;

  const hasSettingsOnlyFlag = Boolean(
    disableMinReleaseAgeBypass || enableAuto || disableAuto
  );
  if (target && hasSettingsOnlyFlag) {
    output.error("Can't use a version with settings-only upgrade options.");
    return 2;
  }

  // Curl-installed CLIs upgrade themselves; there's no package manager to detect.
  const installerManaged = await isCurlInstall();

  const homebrewManaged = !installerManaged && (await isHomebrewInstall());

  // Homebrew only installs the latest cask, so a pinned preview would silently
  // describe a latest-version upgrade.
  if (homebrewManaged && target && target !== 'latest') {
    output.error(
      `Can't install a specific version of a Vercel CLI installed with Homebrew. Run \`${HOMEBREW_UPGRADE_COMMAND}\` to update to the latest version, or switch versions with the installer: ${CURL_INSTALL_COMMAND}`
    );
    return 1;
  }

  if (homebrewManaged && bypassMinReleaseAge && !hasSettingsOnlyFlag) {
    output.error(
      "Can't use `--bypass-min-release-age` with a CLI installed with Homebrew. Homebrew has no minimum release-age setting.\nRun `vc upgrade` without the option."
    );
    return 1;
  }

  // Reject before previews so --dry-run/--json never report a setting that
  // execution would refuse. Settings-only flags take precedence over the
  // bypass, matching the preview and execution order below.
  if (installerManaged && bypassMinReleaseAge && !hasSettingsOnlyFlag) {
    output.fatal(
      "Can't use `--bypass-min-release-age` with a CLI installed by the Vercel installer. The installer downloads releases directly from the registry and has no minimum release-age setting.\nRun `vc upgrade` without the option."
    );
    return 1;
  }

  // --json implies --dry-run behavior, including setting changes.
  if (dryRun || asJson) {
    // Match the execution precedence when multiple preference flags are supplied.
    let requestedPreference;
    if (disableMinReleaseAgeBypass) {
      requestedPreference = {
        name: 'bypassMinReleaseAge',
        label: 'minimum release-age bypass',
        enabled: false,
      };
    } else if (enableAuto || disableAuto) {
      requestedPreference = {
        name: 'autoUpdatesEnabled',
        label: 'automatic CLI updates',
        enabled: Boolean(enableAuto),
      };
    } else if (bypassMinReleaseAge) {
      requestedPreference = {
        name: 'bypassMinReleaseAge',
        label: 'minimum release-age bypass',
        enabled: true,
      };
    }

    const detectedUpdateCommand =
      hasSettingsOnlyFlag || installerManaged
        ? undefined
        : await getUpdateCommand();
    const updateCommand =
      detectedUpdateCommand && target && target !== 'latest'
        ? pinPackageVersion(detectedUpdateCommand.split(' '), target).join(' ')
        : detectedUpdateCommand;
    const installationType = installerManaged
      ? 'installer'
      : (await isGlobal())
        ? 'global'
        : 'local';

    if (asJson) {
      const jsonOutput = {
        currentVersion: pkg.version,
        installationType,
        ...(updateCommand && { upgradeCommand: updateCommand }),
        autoUpdatesEnabled: isAutoUpdateEnabled(client.config),
        ...(requestedPreference && {
          requestedSettings: {
            [requestedPreference.name]: requestedPreference.enabled,
          },
        }),
      };
      client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
    } else {
      output.print(`Current version: ${pkg.version}\n`);
      output.print(`Installation type: ${installationType}\n`);
      if (updateCommand) {
        output.print(`Upgrade command: ${updateCommand}\n`);
      }
      output.print(
        `Automatic updates: ${isAutoUpdateEnabled(client.config) ? 'Enabled' : 'Disabled'}\n`
      );
      if (requestedPreference) {
        output.print(
          `Would ${requestedPreference.enabled ? 'enable' : 'disable'} ${requestedPreference.label}. No settings changed.\n`
        );
      }
    }
    return 0;
  }

  if (disableMinReleaseAgeBypass) {
    setMinReleaseAgeBypass(client, false);
    output.success('Minimum release-age bypass disabled.');
    return 0;
  }

  if (enableAuto || disableAuto) {
    const enabled = Boolean(enableAuto);
    setAutoUpdate(client, enabled);
    output.success(
      `Automatic CLI updates ${enabled ? 'enabled' : 'disabled'}.`
    );
    return 0;
  }

  if (installerManaged) {
    return installProductionRelease({
      version: target,
      skipIfCurrent: !target,
    });
  }

  if (homebrewManaged) {
    return executeHomebrewUpgrade();
  }

  return executeUpgrade(target, client, bypassMinReleaseAge, Boolean(target));
}
