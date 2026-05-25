import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';
import {
  buildCommandWithGlobalFlags,
  exitWithNonInteractiveError,
  outputAgentError,
} from '../../util/agent-output';
import { getCommandName } from '../../util/pkg-name';
import output from '../../output-manager';
import { EdgeConfigItemsTelemetryClient } from '../../util/telemetry/commands/edge-config/items';
import { itemsSubcommand } from './command';
import { resolveEdgeConfigId } from './resolve-edge-config-id';

export default async function itemsCmd(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new EdgeConfigItemsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(itemsSubcommand.options)
    );
  } catch (error) {
    if (client.nonInteractive) {
      exitWithNonInteractiveError(client, error, 1, { variant: 'edge-config' });
    }
    printError(error);
    return 1;
  }

  const { args, flags } = parsedArgs;
  const [idOrSlug] = args;
  const key = flags['--key'];

  telemetry.trackCliArgumentIdOrSlug(idOrSlug);
  telemetry.trackCliOptionKey(key);
  telemetry.trackCliOptionFormat(flags['--format']);

  if (!idOrSlug) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'missing_arguments',
          message:
            'Edge Config id or slug is required. Usage: `vercel edge-config items <id-or-slug>`',
          next: [
            {
              command: buildCommandWithGlobalFlags(
                client.argv,
                'edge-config list'
              ),
            },
          ],
        },
        1
      );
    }
    output.error(
      `Missing id or slug. Usage: ${chalk.cyan(getCommandName('edge-config items <id-or-slug>'))}`
    );
    return 1;
  }

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  let id: string | null;
  try {
    id = await resolveEdgeConfigId(client, idOrSlug);
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, { variant: 'edge-config' });
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
          message: `No Edge Config matches "${idOrSlug}" in the current team.`,
          next: [
            {
              command: buildCommandWithGlobalFlags(
                client.argv,
                'edge-config list'
              ),
            },
          ],
        },
        1
      );
    }
    output.error(`No Edge Config matches "${idOrSlug}" in the current team.`);
    return 1;
  }

  let data: unknown;
  try {
    if (key) {
      const path = `/v1/edge-config/${encodeURIComponent(id)}/item/${encodeURIComponent(key)}`;
      data = await client.fetch(path);
    } else {
      data = await client.fetch(
        `/v1/edge-config/${encodeURIComponent(id)}/items`
      );
    }
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, { variant: 'edge-config' });
    printError(err);
    return 1;
  }

  if (key && (data === null || data === undefined)) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'not_found',
          message: `No item with key "${key}" in Edge Config ${id}.`,
          next: [
            {
              command: buildCommandWithGlobalFlags(
                client.argv,
                `edge-config items ${idOrSlug}`
              ),
            },
          ],
        },
        1
      );
    }
    output.error(`No item with key "${key}" in Edge Config ${id}.`);
    return 1;
  }

  if (asJson) {
    client.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
    return 0;
  }

  output.log(JSON.stringify(data, null, 2));
  return 0;
}
