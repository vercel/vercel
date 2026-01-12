import { help } from '../help';
import { upgradeCommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { executeUpgrade } from '../../util/upgrade';
import getUpdateCommand, { isGlobal } from '../../util/get-update-command';
import { printError } from '../../util/error';
import output from '../../output-manager';
import pkg from '../../util/pkg';
import type Client from '../../util/client';
import { UpgradeTelemetryClient } from '../../util/telemetry/commands/upgrade';

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
  const asJson = parsedArgs.flags['--json'];

  telemetry.trackCliFlagDryRun(dryRun);
  telemetry.trackCliFlagJson(asJson);

  // --json implies --dry-run behavior
  if (dryRun || asJson) {
    const updateCommand = await getUpdateCommand();
    const global = await isGlobal();

    if (asJson) {
      const jsonOutput = {
        currentVersion: pkg.version,
        installationType: global ? 'global' : 'local',
        upgradeCommand: updateCommand,
      };
      client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
    } else {
      output.print(`Current version: ${pkg.version}\n`);
      output.print(`Installation type: ${global ? 'global' : 'local'}\n`);
      output.print(`Upgrade command: ${updateCommand}\n`);
    }
    return 0;
  }

  return executeUpgrade();
}
