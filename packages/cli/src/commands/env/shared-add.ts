import chalk from 'chalk';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import { createSharedEnvRecord } from '../../util/env/shared-env-mutations';
import type {
  SharedEnvTarget,
  SharedEnvType,
} from '../../util/env/get-shared-env-records';
import { envTargetChoices, isValidEnvTarget } from '../../util/env/env-target';
import readStandardInput from '../../util/input/read-standard-input';
import { normalizeStdinEnvValue } from '../../util/env/validate-env';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import stamp from '../../util/output/stamp';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import { isAPIError } from '../../util/errors-ts';
import { EnvSharedAddTelemetryClient } from '../../util/telemetry/commands/env/shared-add';
import { sharedAddSubcommand } from './command';

function collectTargets(raw: string[] | undefined): string[] {
  const targets: string[] = [];
  for (const entry of raw ?? []) {
    for (const t of entry.split(',').map(s => s.trim())) {
      if (t && !targets.includes(t)) {
        targets.push(t);
      }
    }
  }
  return targets;
}

export default async function add(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new EnvSharedAddTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(sharedAddSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }
  const { args, flags } = parsedArgs;

  const stdInput = await readStandardInput(client.stdin);
  const [name, valueArg] = args;

  telemetry.trackCliArgumentName(name);
  telemetry.trackCliArgumentValue(valueArg);
  telemetry.trackCliOptionEnvironment(
    flags['--environment'] as [string] | undefined
  );
  telemetry.trackCliOptionProject(flags['--project'] as [string] | undefined);
  telemetry.trackCliFlagSensitive(flags['--sensitive']);
  telemetry.trackCliOptionComment(flags['--comment']);
  telemetry.trackCliFlagYes(flags['--yes']);

  if (args.length > 2) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('env shared add <name> [value]')}`
      )}`
    );
    return 1;
  }

  const { contextName } = await getScope(client);

  let envName = name;
  if (!envName) {
    if (client.nonInteractive) {
      output.error(
        `Provide the variable name as an argument. Example: ${getCommandName(
          'env shared add <name> <value> -e production'
        )}`
      );
      return 1;
    }
    envName = await client.input.text({
      message: "What's the name of the variable?",
      validate: val => (val ? true : 'Name cannot be empty'),
    });
  }

  // Resolve the value: positional argument, then piped stdin, then a prompt.
  let value: string | undefined = valueArg;
  if (value === undefined && stdInput) {
    value = normalizeStdinEnvValue(stdInput).value;
  }
  if (value === undefined) {
    if (client.nonInteractive) {
      output.error(
        'Provide a value as an argument or pipe it via stdin in non-interactive mode.'
      );
      return 1;
    }
    value = await client.input.text({
      message: `What's the value of ${envName}?`,
    });
  }

  // Resolve target environments.
  let targets = collectTargets(flags['--environment']);
  const invalid = targets.filter(t => !isValidEnvTarget(t));
  if (invalid.length) {
    output.error(
      `Invalid environment ${invalid.map(t => chalk.bold(t)).join(', ')}. Use ${envTargetChoices
        .map(c => chalk.bold(c.value))
        .join(', ')}.`
    );
    return 1;
  }
  if (targets.length === 0) {
    if (client.nonInteractive) {
      output.error(
        `Provide at least one environment with ${chalk.cyan(
          '--environment'
        )} (production, preview, or development).`
      );
      return 1;
    }
    targets = await client.input.checkbox({
      message: 'Add to which Environments?',
      choices: envTargetChoices,
      validate: selected =>
        selected.length ? true : 'Select at least one Environment',
    });
  }

  const projects = flags['--project'] ?? [];
  const type: SharedEnvType = flags['--sensitive'] ? 'sensitive' : 'encrypted';
  const comment = flags['--comment'];

  if (!flags['--yes'] && !client.nonInteractive) {
    output.print(
      `Adding Shared Environment Variable ${chalk.bold(envName)} to ${chalk.bold(contextName)}\n`
    );
    printAlignedLabel('Environments', targets.join(', '));
    if (projects.length) {
      printAlignedLabel('Projects', projects.join(', '));
    }
    printAlignedLabel('Type', type === 'sensitive' ? 'Sensitive' : 'Encrypted');
    const confirmed = await client.input.confirm('Add this variable?', true);
    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }
  }

  const addStamp = stamp();
  output.spinner('Adding');

  let result;
  try {
    result = await createSharedEnvRecord(client, {
      key: envName,
      value,
      comment,
      target: targets as SharedEnvTarget[],
      projectId: projects,
      type,
    });
  } catch (err) {
    output.stopSpinner();
    if (isAPIError(err) && err.serverMessage) {
      output.error(err.serverMessage);
      return 1;
    }
    printError(err);
    return 1;
  }

  output.stopSpinner();

  if (!result.created.length) {
    const failure = result.failed[0];
    output.error(
      failure?.message ?? 'Failed to add the Shared Environment Variable.'
    );
    return 1;
  }

  printAlignedLabel('Added', `${envName} ${chalk.gray(addStamp())}`, {
    gutter: '✓',
  });
  printAlignedLabel('Team', contextName);
  printAlignedLabel('Environments', targets.join(', '));
  if (projects.length) {
    printAlignedLabel('Projects', projects.join(', '));
  }
  printAlignedLabel('Type', type === 'sensitive' ? 'Sensitive' : 'Encrypted');

  return 0;
}
