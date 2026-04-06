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
import { EdgeConfigAddTelemetryClient } from '../../util/telemetry/commands/edge-config/add';
import { addSubcommand } from './command';

export default async function addCmd(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new EdgeConfigAddTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(addSubcommand.options)
    );
  } catch (error) {
    if (client.nonInteractive) {
      exitWithNonInteractiveError(client, error, 1, { variant: 'edge-config' });
    }
    printError(error);
    return 1;
  }

  const { args, flags } = parsedArgs;
  const [slug] = args;

  telemetry.trackCliArgumentSlug(slug);
  telemetry.trackCliOptionItems(flags['--items']);
  telemetry.trackCliOptionFormat(flags['--format']);

  if (!slug) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'missing_arguments',
          message: 'Slug is required. Usage: `vercel edge-config add <slug>`',
          next: [
            {
              command: buildCommandWithGlobalFlags(
                client.argv,
                'edge-config add <slug>'
              ),
            },
          ],
        },
        1
      );
    }
    output.error(
      `Missing slug. Usage: ${chalk.cyan(getCommandName('edge-config add <slug>'))}`
    );
    return 1;
  }

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  let items: Record<string, unknown> | undefined;
  if (flags['--items']) {
    try {
      const parsed = JSON.parse(String(flags['--items'])) as unknown;
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        output.error('`--items` must be a JSON object of key → value pairs.');
        return 1;
      }
      items = parsed as Record<string, unknown>;
    } catch {
      output.error('`--items` must be valid JSON.');
      return 1;
    }
  }

  let created: unknown;
  try {
    created = await client.fetch('/v1/edge-config', {
      method: 'POST',
      body: (items ? { slug, items } : { slug }) as JSONObject,
    });
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, { variant: 'edge-config' });
    printError(err);
    return 1;
  }

  if (asJson) {
    client.stdout.write(`${JSON.stringify(created, null, 2)}\n`);
    return 0;
  }

  output.success(`Edge Config ${chalk.bold(slug)} created.`);
  return 0;
}
