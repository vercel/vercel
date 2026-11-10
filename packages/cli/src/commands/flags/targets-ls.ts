import chalk from 'chalk';
import plural from 'pluralize';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import formatTable from '../../util/format-table';
import stamp from '../../util/output/stamp';
import { listFlagTargets } from '../../util/flags/targets';
import type { FlagTargetEntry } from '../../util/flags/targets';
import { resolveTargetingLabel } from '../../util/flags/format-flag-details';
import output from '../../output-manager';
import { FlagsTargetsCommandTelemetryClient } from '../../util/telemetry/commands/flags/targets';
import { targetsListSubcommand } from './command';
import {
  describeInactiveTargetingMode,
  isExitCodeResult,
  resolveRulesCommandContext,
} from './rules-common';
import { formatTargetVariant } from './targets-common';
import type { Flag, FlagSettings } from '../../util/flags/types';

export default async function targetsLs(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsTargetsCommandTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    targetsListSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 2;
  }

  const { args, flags } = parsedArgs;
  const [flagArg] = args;
  const environment = flags['--environment'] as string | undefined;
  const json = flags['--json'] as boolean | undefined;

  telemetryClient.trackCliArgumentFlag(flagArg);
  telemetryClient.trackCliOptionEnvironment(environment);
  telemetryClient.trackCliFlagJson(json);
  telemetryClient.trackCliOptionProject(flags['--project']);

  if (!flagArg) {
    output.error('Please provide a flag slug or ID to list targets for');
    output.log(
      `Example: ${getCommandName('flags targets list my-feature --environment production')}`
    );
    return 2;
  }

  if (json && !environment) {
    output.error('Missing required option --environment when using --json');
    output.log(
      `Example: ${getCommandName('flags targets list my-feature --environment production --json')}`
    );
    return 2;
  }

  try {
    const context = await resolveRulesCommandContext(client, {
      projectName: flags['--project'],
      flagArg,
      environment,
      promptMessage: 'Select an environment to list targets for:',
      fetchSettings: !json,
    });
    if (isExitCodeResult(context)) {
      return context.exitCode;
    }

    const { envConfig } = context;
    const targets = envConfig.targets ?? {};
    if (json) {
      client.stdout.write(
        `${JSON.stringify(
          {
            flag: context.flag.slug,
            environment: context.environment,
            active: envConfig.active,
            ...(envConfig.reuse ? { reuse: envConfig.reuse } : {}),
            targets,
          },
          null,
          2
        )}\n`
      );
      return 0;
    }

    const entries = listFlagTargets(targets);
    const lsStamp = stamp();
    const inactiveMode = describeInactiveTargetingMode(context.flag, envConfig);
    if (entries.length === 0) {
      const projectFlag = flags['--project']
        ? ` --project ${flags['--project']}`
        : '';
      output.log(
        `No targets found for ${chalk.bold(context.flag.slug)} in ${context.environment} ${chalk.gray(lsStamp())}`
      );
      output.log(
        `\nAdd one with: ${getCommandName(`flags targets add ${context.flag.slug} --environment ${context.environment} user.id=user_123${projectFlag}`)}`
      );
      return 0;
    }

    output.log(
      `${plural('target', entries.length, true)} found for ${chalk.bold(context.flag.slug)} in ${context.environment} ${chalk.gray(lsStamp())}`
    );
    printTargetsTable(entries, context.flag, context.settings);
    if (inactiveMode) {
      output.print(
        `${chalk.yellow('!')} ${chalk.bold(context.environment)} ${inactiveMode}; these targets are not evaluated until targeting is active again.\n`
      );
    }
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}

function printTargetsTable(
  entries: FlagTargetEntry[],
  flag: Flag,
  settings?: FlagSettings
) {
  const headers = ['Attribute', 'Value', 'Label', 'Variant'];
  const rows = entries.map(entry => [
    `${entry.entity}.${entry.attribute}`,
    chalk.bold(entry.value),
    resolveTargetingLabel(
      settings,
      entry.entity,
      entry.attribute,
      entry.value
    ) ??
      entry.note ??
      '',
    formatTargetVariant(flag, entry.variantId),
  ]);

  const table = formatTable(
    headers,
    ['l', 'l', 'l', 'l'],
    [{ name: '', rows }]
  );
  output.print(`\n${table}\n`);
}
