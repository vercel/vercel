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
  partialToken?: string;
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
  const removeValues = flags['--remove'];
  const removeCount = removeValues?.length ?? 0;
  const skipConfirmation = flags['--yes'] === true;

  telemetry.trackCliArgumentIdOrSlug(idOrSlug);
  telemetry.trackCliOptionAdd(addLabel);
  telemetry.trackCliOptionRemove(removeValues);
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

  if (addLabel && removeCount > 0) {
    output.error('Use either `--add` or `--remove`, not both.');
    return 1;
  }

  if (removeCount > 0 && client.nonInteractive && !skipConfirmation) {
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

    if (removeValues?.length) {
      if (
        !skipConfirmation &&
        !(await client.input.confirm(
          `Revoke ${removeValues.length} token(s) on ${chalk.bold(id)}?`,
          false
        ))
      ) {
        output.log('Canceled');
        return 0;
      }

      // Disambiguate ids from plaintext tokens by consulting the store's own
      // list. The DELETE endpoint accepts `tokens` and `ids` independently,
      // but both are opaque UUID-shaped strings with no reliable client-side
      // distinguishing feature, so we let the server's source of truth
      // classify each value.
      const rows = await client.fetch<TokenRow[]>(`${base}/tokens`);
      const knownIds = new Set(
        rows.map(r => r.id).filter((v): v is string => Boolean(v))
      );
      const ids: string[] = [];
      const tokens: string[] = [];
      for (const value of removeValues) {
        if (knownIds.has(value)) ids.push(value);
        else tokens.push(value);
      }

      const body: { tokens?: string[]; ids?: string[] } = {};
      if (tokens.length) body.tokens = tokens;
      if (ids.length) body.ids = ids;

      await client.fetch(`${base}/tokens`, {
        method: 'DELETE',
        body,
      });

      if (asJson) {
        client.stdout.write(
          `${JSON.stringify({ status: 'ok', revoked: removeValues.length }, null, 2)}\n`
        );
        return 0;
      }
      output.success(`Revoked ${removeValues.length} token(s).`);
      return 0;
    }

    const rows = await client.fetch<TokenRow[]>(`${base}/tokens`);
    if (asJson) {
      // Pick an explicit allowlist of fields so we never forward a plaintext
      // `token` in `--format json`, even if an older API deploy still returns
      // it during FLA-2777 rollout. `--add` output is unchanged and still
      // reveals the token once on creation.
      const sanitized = rows.map(row => ({
        id: row.id,
        label: row.label,
        partialToken: row.partialToken,
        createdAt: row.createdAt,
      }));
      client.stdout.write(`${JSON.stringify(sanitized, null, 2)}\n`);
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
