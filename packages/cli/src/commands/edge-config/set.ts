import chalk from 'chalk';
import type { JSONObject } from '@vercel-internals/types';
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
import { EdgeConfigSetTelemetryClient } from '../../util/telemetry/commands/edge-config/set';
import { setSubcommand } from './command';
import { resolveEdgeConfigId } from './resolve-edge-config-id';

/** Parse `--value`: JSON when valid, otherwise the raw string. */
export function parseItemValueForSet(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return '';
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return raw;
  }
}

export default async function setCmd(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new EdgeConfigSetTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(setSubcommand.options)
    );
  } catch (error) {
    if (client.nonInteractive) {
      exitWithNonInteractiveError(client, error, 1, { variant: 'edge-config' });
    }
    printError(error);
    return 1;
  }

  const { args, flags } = parsedArgs;
  const [idOrSlug, key] = args;
  telemetry.trackCliArgumentIdOrSlug(idOrSlug);
  telemetry.trackCliArgumentKey(key);
  telemetry.trackCliOptionValue(flags['--value']);
  telemetry.trackCliOptionFormat(flags['--format']);

  if (!idOrSlug || !key) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'missing_arguments',
          message:
            'Edge Config id or slug and item key are required. Use `--value` for the JSON value.',
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
      `Missing arguments. Usage: ${chalk.cyan(getCommandName('edge-config set <id-or-slug> <key> --value <json>'))}`
    );
    return 1;
  }

  const valueRaw = flags['--value'];
  if (valueRaw === undefined) {
    output.error(
      '`--value` is required (JSON for `PUT /v1/edge-config/:id/item/:key`).'
    );
    return 1;
  }

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  let parsedValue: unknown;
  try {
    parsedValue = parseItemValueForSet(String(valueRaw));
  } catch (e) {
    output.error(e instanceof Error ? e.message : String(e));
    return 1;
  }

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

  let lastPayload: unknown;
  try {
    lastPayload = await client.fetch(
      `/v1/edge-config/${encodeURIComponent(id)}/item/${encodeURIComponent(key)}`,
      {
        method: 'PUT',
        body: { value: parsedValue } as JSONObject,
      }
    );
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, { variant: 'edge-config' });
    printError(err);
    return 1;
  }

  if (asJson) {
    client.stdout.write(`${JSON.stringify(lastPayload, null, 2)}\n`);
    return 0;
  }

  output.success('Edge Config item set.');
  return 0;
}
