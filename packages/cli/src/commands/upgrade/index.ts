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
import { setUseNativeBinary } from '../../util/native-binary';

// `--binary` accepts an optional boolean value. The `arg` parser has no notion
// of optional-value flags, so normalize a valueless `--binary` to `--binary=true`.
function normalizeBinaryFlag(argv: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--binary') {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        result.push(arg, next);
        i++;
      } else {
        result.push('--binary=true');
      }
      continue;
    }
    result.push(arg);
  }
  return result;
}

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
    parsedArgs = parseArguments(
      normalizeBinaryFlag(client.argv.slice(2)),
      flagsSpecification
    );
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
  const binaryFlag = parsedArgs.flags['--binary'];
  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  telemetry.trackCliFlagDryRun(dryRun);
  telemetry.trackCliFlagEnableAuto(enableAuto);
  telemetry.trackCliFlagDisableAuto(disableAuto);
  telemetry.trackCliOptionBinary(binaryFlag);
  telemetry.trackCliOptionFormat(parsedArgs.flags['--format']);
  telemetry.trackCliFlagJson(parsedArgs.flags['--json']);

  if (enableAuto && disableAuto) {
    output.error('Cannot use --enable-auto and --disable-auto together');
    return 1;
  }

  if (binaryFlag !== undefined) {
    if (binaryFlag !== 'true' && binaryFlag !== 'false') {
      output.error('Invalid value for `--binary`. Expected `true` or `false`.');
      return 1;
    }
    const enabled = binaryFlag === 'true';
    setUseNativeBinary(client, enabled);
    output.success(
      `Native Vercel CLI binary ${enabled ? 'enabled' : 'disabled'}.`
    );
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
