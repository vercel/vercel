import chalk from 'chalk';
import { readFile } from 'fs/promises';
import type { JSONObject } from '@vercel-internals/types';
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
import readStandardInput from '../../util/input/read-standard-input';
import { GlobalConfigSchemaTelemetryClient } from '../../util/telemetry/commands/global-config/schema';
import { schemaSubcommand } from './command';
import { resolveGlobalConfigId } from './resolve-global-config-id';
import { parseSchemaBody } from './parse-schema-body';

const KNOWN_ACTIONS = ['get', 'set', 'remove'] as const;
type SchemaAction = (typeof KNOWN_ACTIONS)[number];

function resolveAction(raw: string | undefined): SchemaAction | undefined {
  if (raw === 'get' || raw === 'inspect') {
    return 'get';
  }
  if (raw === 'set') {
    return 'set';
  }
  if (raw === 'remove' || raw === 'rm' || raw === 'delete') {
    return 'remove';
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
  const [actionRaw, idOrSlug, fileArg] = args;
  const action = resolveAction(actionRaw);
  const skipConfirmation = flags['--yes'] === true;

  telemetry.trackCliArgumentAction(action);
  telemetry.trackCliArgumentIdOrSlug(idOrSlug);
  telemetry.trackCliArgumentFile(fileArg);
  telemetry.trackCliFlagYes(flags['--yes']);
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
        getCommandName('global-config schema <get|set|remove> <id-or-slug>')
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
          message: `Global Config id or slug is required. Usage: \`vercel global-config schema ${action} <id-or-slug>\``,
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
        getCommandName(`global-config schema ${action} <id-or-slug>`)
      )}`
    );
    return 1;
  }

  if (action === 'remove' && client.nonInteractive && !skipConfirmation) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: 'confirmation_required',
        message:
          "Removing a Global Config's schema requires confirmation. Re-run with `--yes`.",
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

  // Validate local input before any remote mutation.
  let schemaBody: { definition: unknown } | undefined;
  if (action === 'set') {
    let raw: string;
    if (fileArg) {
      try {
        raw = await readFile(fileArg, 'utf8');
      } catch (err: unknown) {
        const message = `Could not read schema file "${fileArg}": ${
          err instanceof Error ? err.message : String(err)
        }`;
        if (client.nonInteractive) {
          outputAgentError(
            client,
            { status: 'error', reason: 'invalid_arguments', message },
            1
          );
        }
        output.error(message);
        return 1;
      }
    } else {
      raw = await readStandardInput(client.stdin);
    }

    try {
      schemaBody = parseSchemaBody(raw);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (client.nonInteractive) {
        outputAgentError(
          client,
          { status: 'error', reason: 'invalid_arguments', message },
          1
        );
      }
      output.error(message);
      return 1;
    }
  }

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

  const path = `/v1/global-config/${encodeURIComponent(id)}/schema`;

  if (action === 'get') {
    let data: unknown;
    try {
      data = await client.fetch(path);
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

  if (action === 'set') {
    let data: unknown;
    try {
      data = await client.fetch(path, {
        method: 'POST',
        body: schemaBody as JSONObject,
      });
    } catch (err: unknown) {
      exitWithNonInteractiveError(client, err, 1, { variant: 'global-config' });
      printError(err);
      return 1;
    }

    if (asJson) {
      client.stdout.write(`${JSON.stringify(data ?? null, null, 2)}\n`);
      return 0;
    }
    output.success(`Global Config schema updated for ${chalk.bold(id)}.`);
    return 0;
  }

  // action === 'remove'
  if (
    !skipConfirmation &&
    !(await client.input.confirm(
      `Remove the schema for Global Config ${chalk.bold(id)} (${chalk.bold(
        idOrSlug
      )})?`,
      false
    ))
  ) {
    output.log('Canceled');
    return 0;
  }

  try {
    await client.fetch(path, { method: 'DELETE' });
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
          message: `Schema removed for Global Config ${id}.`,
        },
        null,
        2
      )}\n`
    );
    return 0;
  }

  output.success(`Schema removed for Global Config ${chalk.bold(id)}.`);
  return 0;
}
