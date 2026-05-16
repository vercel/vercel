import { help } from '../help';
import { upgradeCommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { executeUpgrade } from '../../util/upgrade';
import getUpdateCommand, { isGlobal } from '../../util/get-update-command';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import pkg from '../../util/pkg';
import type Client from '../../util/client';
import { UpgradeTelemetryClient } from '../../util/telemetry/commands/upgrade';
import { isAutoUpdateEnabled, setAutoUpdate } from '../../util/updates';

export default async function upgrade(client: Client): Promise<number> {
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
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('upgrade');
    output.print(help(upgradeCommand, { columns: client.stderr.columns }));
    return 0;
  }

  const dryRun = parsedArgs.flags['--dry-run'];
  const enableAuto = parsedArgs.flags['--enable-auto'];
  const disableAuto = parsedArgs.flags['--disable-auto'];
  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  telemetry.trackCliFlagDryRun(dryRun);
  telemetry.trackCliFlagEnableAuto(enableAuto);
  telemetry.trackCliFlagDisableAuto(disableAuto);
  telemetry.trackCliOptionFormat(parsedArgs.flags['--format']);
  telemetry.trackCliFlagJson(parsedArgs.flags['--json']);

  if (enableAuto && disableAuto) {
    output.error('Cannot use --enable-auto and --disable-auto together');
    return 1;
  }

  if (enableAuto || disableAuto) {
    const enabled = Boolean(enableAuto);
    setAutoUpdate(client, enabled);
    output.success(
      `Automatic CLI updates ${enabled ? 'enabled' : 'disabled'}.`
    );
    return 0;
  }

  // --json implies --dry-run behavior
  if (dryRun || asJson) {
    const updateCommand = await getUpdateCommand();
    const global = await isGlobal();

    if (asJson) {
      const jsonOutput = {
        currentVersion: pkg.version,
        installationType: global ? 'global' : 'local',
        upgradeCommand: updateCommand,
        autoUpdatesEnabled: isAutoUpdateEnabled(client.config),
      };
      client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
    } else {
      output.print(`Current version: ${pkg.version}\n`);
      output.print(`Installation type: ${global ? 'global' : 'local'}\n`);
      output.print(`Upgrade command: ${updateCommand}\n`);
      output.print(
        `Automatic updates: ${isAutoUpdateEnabled(client.config) ? 'Enabled' : 'Disabled'}\n`
      );
    }
    return 0;
  }

  return executeUpgrade();
}
