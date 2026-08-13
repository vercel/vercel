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
import { GlobalConfigSchemaTelemetryClient } from '../../util/telemetry/commands/global-config/schema';
import { schemaSubcommand } from './command';
import { resolveGlobalConfigId } from './resolve-global-config-id';

const KNOWN_ACTIONS = ['get'] as const;
type SchemaAction = (typeof KNOWN_ACTIONS)[number];

function resolveAction(raw: string | undefined): SchemaAction | undefined {
  if (raw === 'get' || raw === 'inspect') {
    return 'get';
  }
  return undefined;
}

export default async function schemaCmd(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new GlobalConfigSchemaTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(schemaSubcommand.options)
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
  const [actionRaw, idOrSlug] = args;
  const action = resolveAction(actionRaw);

  telemetry.trackCliArgumentAction(action);
  telemetry.trackCliArgumentIdOrSlug(idOrSlug);
  telemetry.trackCliOptionFormat(flags['--format']);

  if (!action) {
    const message = `Unknown action "${actionRaw ?? ''}". Supported: ${KNOWN_ACTIONS.join(
      ', '
    )}.`;
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'invalid_arguments',
          message,
        },
        1
      );
    }
    output.error(
      `${message} Usage: ${chalk.cyan(
        getCommandName('global-config schema get <id-or-slug>')
      )}`
    );
    return 1;
  }

  if (!idOrSlug) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'missing_arguments',
          message:
            'Global Config id or slug is required. Usage: `vercel global-config schema get <id-or-slug>`',
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
      `Missing id or slug. Usage: ${chalk.cyan(
        getCommandName('global-config schema get <id-or-slug>')
      )}`
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

  let data: unknown;
  try {
    data = await client.fetch(
      `/v1/global-config/${encodeURIComponent(id)}/schema`
    );
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, { variant: 'global-config' });
    printError(err);
    return 1;
  }

  if (asJson) {
    client.stdout.write(`${JSON.stringify(data ?? null, null, 2)}\n`);
    return 0;
  }

  if (data === null || data === undefined) {
    output.log('No schema is set for this Global Config.');
    return 0;
  }

  output.log(JSON.stringify(data, null, 2));
  return 0;
}
