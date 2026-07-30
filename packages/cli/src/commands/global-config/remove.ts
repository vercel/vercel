import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';
import {
  buildCommandWithGlobalFlags,
  buildCommandWithYes,
  exitWithNonInteractiveError,
  outputAgentError,
} from '../../util/agent-output';
import { getCommandName } from '../../util/pkg-name';
import output from '../../output-manager';
import { GlobalConfigRemoveTelemetryClient } from '../../util/telemetry/commands/global-config/remove';
import { removeSubcommand } from './command';
import { resolveGlobalConfigId } from './resolve-global-config-id';

export default async function removeCmd(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new GlobalConfigRemoveTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(removeSubcommand.options)
    );
  } catch (error) {
    if (client.nonInteractive) {
      exitWithNonInteractiveError(client, error, 1, {
        variant: 'global-config',
      });
    }
    printError(error);
    return 1;
  }

  const { args, flags } = parsedArgs;
  const [idOrSlug] = args;
  const skipConfirmation = flags['--yes'] === true;

  telemetry.trackCliArgumentIdOrSlug(idOrSlug);
  telemetry.trackCliFlagYes(flags['--yes']);
  telemetry.trackCliOptionFormat(flags['--format']);

  if (!idOrSlug) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'missing_arguments',
          message:
            'Global Config id or slug is required. Usage: `vercel global-config remove <id-or-slug>`',
          next: [
            {
              command: buildCommandWithGlobalFlags(
                client.argv,
                'global-config list'
              ),
            },
          ],
        },
        1
      );
    }
    output.error(
      `Missing id or slug. Usage: ${chalk.cyan(getCommandName('global-config remove <id-or-slug>'))}`
    );
    return 1;
  }

  if (client.nonInteractive && !skipConfirmation) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: 'confirmation_required',
        message:
          'Removing a Global Config requires confirmation. Re-run with `--yes`.',
        next: [{ command: buildCommandWithYes(client.argv) }],
      },
      1
    );
  }

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  let id: string | null;
  try {
    id = await resolveGlobalConfigId(client, idOrSlug);
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, { variant: 'global-config' });
    printError(err);
    return 1;
  }

  if (!id) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'not_found',
          message: `No Global Config matches "${idOrSlug}" in the current team.`,
          next: [
            {
              command: buildCommandWithGlobalFlags(
                client.argv,
                'global-config list'
              ),
            },
          ],
        },
        1
      );
    }
    output.error(`No Global Config matches "${idOrSlug}" in the current team.`);
    return 1;
  }

  if (
    !skipConfirmation &&
    !(await client.input.confirm(
      `Delete Global Config ${chalk.bold(id)} (${chalk.bold(idOrSlug)})?`,
      false
    ))
  ) {
    output.log('Canceled');
    return 0;
  }

  try {
    await client.fetch(`/v1/global-config/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, { variant: 'global-config' });
    printError(err);
    return 1;
  }

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify(
        {
          status: 'ok',
          id,
          message: `Global Config ${id} removed.`,
        },
        null,
        2
      )}\n`
    );
    return 0;
  }

  output.success(`Global Config ${chalk.bold(id)} removed.`);
  return 0;
}
