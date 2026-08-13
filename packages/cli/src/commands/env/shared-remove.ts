import chalk from 'chalk';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import { deleteSharedEnvRecord } from '../../util/env/shared-env-mutations';
import resolveSharedEnvVariable from '../../util/env/resolve-shared-env';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import stamp from '../../util/output/stamp';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import { isAPIError } from '../../util/errors-ts';
import {
  outputActionRequired,
  outputAgentError,
  buildCommandWithYes,
} from '../../util/agent-output';
import { EnvSharedRemoveTelemetryClient } from '../../util/telemetry/commands/env/shared-remove';
import { sharedRemoveSubcommand } from './command';

export default async function remove(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new EnvSharedRemoveTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    sharedRemoveSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }
  const { args, flags } = parsedArgs;
  const [nameOrId] = args;

  telemetry.trackCliArgumentNameOrId(nameOrId);
  telemetry.trackCliFlagYes(flags['--yes']);

  if (args.length !== 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('env shared remove <name-or-id>')}`
      )}`
    );
    return 1;
  }

  const { contextName } = await getScope(client);

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
    outputAgentError(client, {
      status: 'error',
      reason: 'env_not_found',
      message: `No Shared Environment Variable ${nameOrId} found under ${contextName}.`,
    });
    output.error(
      `No Shared Environment Variable ${chalk.bold(
        nameOrId
      )} found under ${chalk.bold(contextName)}.`
    );
    return 1;
  }
  if (resolved.status === 'ambiguous') {
    outputActionRequired(client, {
      status: 'action_required',
      reason: 'multiple_envs',
      message: `Multiple Shared Environment Variables named ${nameOrId} were found. Remove one by ID.`,
    });
    output.error(
      `Multiple Shared Environment Variables named ${chalk.bold(
        nameOrId
      )} were found. Remove one by ID instead:`
    );
    for (const env of resolved.matches) {
      output.print(
        `  ${env.id}  ${chalk.gray(env.target?.join(', ') || '-')}\n`
      );
    }
    return 1;
  }

  const record = resolved.record;

  if (!flags['--yes']) {
    if (client.nonInteractive) {
      outputActionRequired(
        client,
        {
          status: 'action_required',
          reason: 'confirmation_required',
          message: `Removing Shared Environment Variable ${record.key ?? record.id}. Use --yes to confirm.`,
          next: [{ command: buildCommandWithYes(client.argv) }],
        },
        1
      );
    }
    const confirmed = await client.input.confirm(
      `Remove Shared Environment Variable ${chalk.bold(
        record.key ?? record.id
      )} from ${chalk.bold(contextName)}?`,
      false
    );
    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }
  }

  const rmStamp = stamp();
  output.spinner('Removing');

  let result;
  try {
    result = await deleteSharedEnvRecord(client, record.id);
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

  if (!result.deleted.length) {
    const failure = result.failed[0];
    output.error(
      failure?.message ?? 'Failed to remove the Shared Environment Variable.'
    );
    return 1;
  }

  printAlignedLabel(
    'Removed',
    `${record.key ?? record.id} ${chalk.gray(rmStamp())}`,
    { gutter: '✓' }
  );
  printAlignedLabel('Team', contextName);

  return 0;
}
