import chalk from 'chalk';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import {
  updateSharedEnvRecord,
  type SharedEnvUpdate,
} from '../../util/env/shared-env-mutations';
import resolveSharedEnvVariable from '../../util/env/resolve-shared-env';
import type { SharedEnvTarget } from '../../util/env/get-shared-env-records';
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
import { EnvSharedUpdateTelemetryClient } from '../../util/telemetry/commands/env/shared-update';
import { sharedUpdateSubcommand } from './command';

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

export default async function update(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new EnvSharedUpdateTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    sharedUpdateSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }
  const { args, flags } = parsedArgs;

  const stdInput = await readStandardInput(client.stdin);
  const [nameOrId, valueArg] = args;

  telemetry.trackCliArgumentNameOrId(nameOrId);
  telemetry.trackCliArgumentValue(valueArg);
  telemetry.trackCliOptionEnvironment(
    flags['--environment'] as [string] | undefined
  );
  telemetry.trackCliOptionLinkProject(
    flags['--link-project'] as [string] | undefined
  );
  telemetry.trackCliOptionUnlinkProject(
    flags['--unlink-project'] as [string] | undefined
  );
  telemetry.trackCliFlagSensitive(flags['--sensitive']);
  telemetry.trackCliOptionComment(flags['--comment']);
  telemetry.trackCliFlagYes(flags['--yes']);

  if (args.length < 1 || args.length > 2) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('env shared update <name-or-id> [value]')}`
      )}`
    );
    return 1;
  }

  const { contextName } = await getScope(client);

  // Build the sparse update from the provided flags/args only.
  const update: SharedEnvUpdate = {};
  const changes: string[] = [];

  let value: string | undefined = valueArg;
  if (value === undefined && stdInput) {
    value = normalizeStdinEnvValue(stdInput).value;
  }
  if (value !== undefined) {
    update.value = value;
    changes.push('value');
  }

  const targets = collectTargets(flags['--environment']);
  if (targets.length) {
    const invalid = targets.filter(t => !isValidEnvTarget(t));
    if (invalid.length) {
      output.error(
        `Invalid environment ${invalid.map(t => chalk.bold(t)).join(', ')}. Use ${envTargetChoices
          .map(c => chalk.bold(c.value))
          .join(', ')}.`
      );
      return 1;
    }
    update.target = targets as SharedEnvTarget[];
    changes.push(`environments (${targets.join(', ')})`);
  }

  const link = flags['--link-project'] ?? [];
  const unlink = flags['--unlink-project'] ?? [];
  if (link.length || unlink.length) {
    update.projectIdUpdates = {
      ...(link.length ? { link } : {}),
      ...(unlink.length ? { unlink } : {}),
    };
    if (link.length) {
      changes.push(`link ${link.join(', ')}`);
    }
    if (unlink.length) {
      changes.push(`unlink ${unlink.join(', ')}`);
    }
  }

  if (flags['--sensitive']) {
    update.type = 'sensitive';
    changes.push('type (sensitive)');
  }

  if (typeof flags['--comment'] === 'string') {
    update.comment = flags['--comment'];
    changes.push('comment');
  }

  if (changes.length === 0) {
    output.error(
      `Nothing to update. Provide a new value, ${chalk.cyan(
        '--environment'
      )}, ${chalk.cyan('--link-project')}/${chalk.cyan(
        '--unlink-project'
      )}, ${chalk.cyan('--sensitive')}, or ${chalk.cyan('--comment')}.`
    );
    return 1;
  }

  output.spinner(
    `Resolving Shared Environment Variable under ${chalk.bold(contextName)}`
  );

  let resolved;
  try {
    resolved = await resolveSharedEnvVariable(client, nameOrId);
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }
  output.stopSpinner();

  if (resolved.status === 'not_found') {
    output.error(
      `No Shared Environment Variable ${chalk.bold(
        nameOrId
      )} found under ${chalk.bold(contextName)}.`
    );
    return 1;
  }
  if (resolved.status === 'ambiguous') {
    output.error(
      `Multiple Shared Environment Variables named ${chalk.bold(
        nameOrId
      )} were found. Update one by ID instead:`
    );
    for (const env of resolved.matches) {
      output.print(
        `  ${env.id}  ${chalk.gray(env.target?.join(', ') || '-')}\n`
      );
    }
    return 1;
  }

  const record = resolved.record;

  if (!flags['--yes'] && !client.nonInteractive) {
    output.print(
      `Updating Shared Environment Variable ${chalk.bold(
        record.key ?? record.id
      )} under ${chalk.bold(contextName)}\n`
    );
    printAlignedLabel('Changes', changes.join('; '));
    const confirmed = await client.input.confirm('Apply this update?', true);
    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }
  }

  const updateStamp = stamp();
  output.spinner('Updating');

  let result;
  try {
    result = await updateSharedEnvRecord(client, record.id, update);
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

  if (!result.updated.length) {
    const failure = result.failed[0];
    output.error(
      failure?.message ?? 'Failed to update the Shared Environment Variable.'
    );
    return 1;
  }

  printAlignedLabel(
    'Updated',
    `${record.key ?? record.id} ${chalk.gray(updateStamp())}`,
    {
      gutter: '✓',
    }
  );
  printAlignedLabel('Team', contextName);
  printAlignedLabel('Changes', changes.join('; '));

  return 0;
}
