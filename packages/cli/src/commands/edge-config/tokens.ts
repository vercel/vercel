import chalk, { gray } from 'chalk';
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
import table from '../../util/output/table';
import output from '../../output-manager';
import { EdgeConfigTokensTelemetryClient } from '../../util/telemetry/commands/edge-config/tokens';
import { tokensSubcommand } from './command';
import { resolveEdgeConfigId } from './resolve-edge-config-id';

interface TokenRow {
  id?: string;
  label?: string;
  token?: string;
  createdAt?: number;
}

export default async function tokensCmd(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new EdgeConfigTokensTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(tokensSubcommand.options)
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
  const addLabel = flags['--add'];
  const removeTokens = flags['--remove'];
  const skipConfirmation = flags['--yes'] === true;

  telemetry.trackCliArgumentIdOrSlug(idOrSlug);
  telemetry.trackCliOptionAdd(addLabel);
  telemetry.trackCliOptionRemove(removeTokens);
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
            'Edge Config id or slug is required. Usage: `vercel edge-config tokens <id-or-slug>`',
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
      `Missing id or slug. Usage: ${chalk.cyan(getCommandName('edge-config tokens <id-or-slug>'))}`
    );
    return 1;
  }

  if (addLabel && removeTokens?.length) {
    output.error('Use either `--add` or `--remove`, not both.');
    return 1;
  }

  if (removeTokens?.length && client.nonInteractive && !skipConfirmation) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: 'confirmation_required',
        message:
          'Revoking Edge Config tokens requires confirmation. Re-run with `--yes`.',
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

  const base = `/v1/edge-config/${encodeURIComponent(id)}`;

  try {
    if (addLabel) {
      const created = await client.fetch<{ token: string; id: string }>(
        `${base}/token`,
        {
          method: 'POST',
          body: { label: addLabel },
        }
      );
      if (asJson) {
        client.stdout.write(`${JSON.stringify(created, null, 2)}\n`);
        return 0;
      }
      output.success('Token created.');
      output.print(
        `${chalk.bold('Token')} (copy now; it will not be shown again):\n${created.token}\n`
      );
      output.print(`${gray(`id: ${created.id}`)}\n`);
      return 0;
    }

    if (removeTokens?.length) {
      if (
        !skipConfirmation &&
        !(await client.input.confirm(
          `Revoke ${removeTokens.length} token(s) on ${chalk.bold(id)}?`,
          false
        ))
      ) {
        output.log('Canceled');
        return 0;
      }

      await client.fetch(`${base}/tokens`, {
        method: 'DELETE',
        body: { tokens: removeTokens },
      });

      if (asJson) {
        client.stdout.write(
          `${JSON.stringify({ status: 'ok', revoked: removeTokens.length }, null, 2)}\n`
        );
        return 0;
      }
      output.success(`Revoked ${removeTokens.length} token(s).`);
      return 0;
    }

    const rows = await client.fetch<TokenRow[]>(`${base}/tokens`);
    if (asJson) {
      client.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
      return 0;
    }

    if (!rows.length) {
      output.log('No tokens.');
      return 0;
    }

    const tableRows = [
      ['id', 'label', 'created'].map(h => gray(h)),
      ...rows.map(t => [
        t.id ?? '',
        t.label ?? '',
        t.createdAt != null ? new Date(t.createdAt).toISOString() : '',
      ]),
    ];
    client.stderr.write(`${table(tableRows, { hsep: 2 })}\n`);
    return 0;
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, { variant: 'edge-config' });
    printError(err);
    return 1;
  }
}
