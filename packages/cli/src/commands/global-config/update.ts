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
import { GlobalConfigUpdateTelemetryClient } from '../../util/telemetry/commands/global-config/update';
import { updateSubcommand } from './command';
import { parsePatchBody } from './parse-patch-body';
import { resolveGlobalConfigId } from './resolve-global-config-id';

export default async function updateCmd(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new GlobalConfigUpdateTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(updateSubcommand.options)
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
  telemetry.trackCliArgumentIdOrSlug(idOrSlug);
  telemetry.trackCliOptionSlug(flags['--slug']);
  telemetry.trackCliOptionPatch(flags['--patch']);
  telemetry.trackCliOptionFormat(flags['--format']);

  if (!idOrSlug) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'missing_arguments',
          message:
            'Global Config id or slug is required. Provide `--slug` and/or `--patch`.',
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
      `Missing id or slug. Usage: ${chalk.cyan(getCommandName('global-config update <id-or-slug>'))}`
    );
    return 1;
  }

  const newSlug = flags['--slug'];
  const patchRaw = flags['--patch'];
  if (!newSlug && !patchRaw) {
    output.error(
      'Provide `--slug` to rename the store and/or `--patch` to update items.'
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

  let parsedPatchBody: { items: unknown[] } | undefined;
  if (patchRaw) {
    try {
      parsedPatchBody = parsePatchBody(String(patchRaw));
    } catch (e) {
      output.error(e instanceof Error ? e.message : String(e));
      return 1;
    }
  }

  let lastPayload: unknown;

  try {
    if (newSlug) {
      lastPayload = await client.fetch(
        `/v1/global-config/${encodeURIComponent(id)}`,
        {
          method: 'PUT',
          body: { slug: newSlug },
        }
      );
    }

    if (parsedPatchBody) {
      lastPayload = await client.fetch(
        `/v1/global-config/${encodeURIComponent(id)}/items`,
        {
          method: 'PATCH',
          body: parsedPatchBody as JSONObject,
        }
      );
    }
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, { variant: 'global-config' });
    printError(err);
    return 1;
  }

  if (asJson) {
    client.stdout.write(`${JSON.stringify(lastPayload, null, 2)}\n`);
    return 0;
  }

  output.success('Global Config updated.');
  return 0;
}
