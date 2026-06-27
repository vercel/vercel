import { URLSearchParams } from 'url';
import chalk, { gray } from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';
import getCommandFlags from '../../util/get-command-flags';
import {
  buildCommandWithGlobalFlags,
  buildCommandWithYes,
  exitWithNonInteractiveError,
  outputAgentError,
} from '../../util/agent-output';
import { getCommandName } from '../../util/pkg-name';
import table from '../../util/output/table';
import output from '../../output-manager';
import { EdgeConfigBackupsTelemetryClient } from '../../util/telemetry/commands/edge-config/backups';
import { backupsSubcommand } from './command';
import { resolveEdgeConfigId } from './resolve-edge-config-id';

interface BackupRow {
  id: string;
  lastModified: number;
  metadata?: {
    itemsCount?: number;
    itemsBytes?: number;
  };
}

interface BackupListResponse {
  backups: BackupRow[];
  pagination?: {
    hasNext: boolean;
    next?: string;
  };
}

interface RestoreBackupResponse {
  status: 'ok';
  restoredFrom: string;
  previousDigest: string;
  digest: string;
}

export default async function backupsCmd(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new EdgeConfigBackupsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(backupsSubcommand.options)
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
  const backupVersion = flags['--backup-version'];
  const restoreVersion = flags['--restore'];
  const skipConfirmation = flags['--yes'] === true;
  const limit = flags['--limit'];
  const next = flags['--next'];

  telemetry.trackCliArgumentIdOrSlug(idOrSlug);
  telemetry.trackCliOptionBackupVersion(backupVersion);
  telemetry.trackCliOptionRestore(restoreVersion);
  telemetry.trackCliOptionLimit(limit);
  telemetry.trackCliOptionNext(next);
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
            'Edge Config id or slug is required. Usage: `vercel edge-config backups <id-or-slug>`',
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
    const usage = getCommandName('edge-config backups <id-or-slug>');
    output.error(`Missing id or slug. Usage: ${chalk.cyan(usage)}`);
    return 1;
  }

  if (backupVersion && restoreVersion) {
    output.error('Use either `--backup-version` or `--restore`, not both.');
    return 1;
  }

  if (
    limit !== undefined &&
    (!Number.isFinite(limit) || limit < 0 || limit > 50)
  ) {
    output.error('The `--limit` value must be between 0 and 50.');
    return 1;
  }

  if (restoreVersion && client.nonInteractive && !skipConfirmation) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: 'confirmation_required',
        message:
          'Restoring an Edge Config backup requires confirmation. Re-run with `--yes`.',
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

  const base = `/v1/edge-config/${encodeURIComponent(id)}/backups`;

  try {
    if (restoreVersion) {
      if (
        !skipConfirmation &&
        !(await client.input.confirm(
          `Restore Edge Config ${chalk.bold(id)} from backup ${chalk.bold(
            restoreVersion
          )}? This updates live items immediately.`,
          false
        ))
      ) {
        output.log('Canceled');
        return 0;
      }

      const restored = await client.fetch<RestoreBackupResponse>(
        `${base}/${encodeURIComponent(restoreVersion)}/restore`,
        { method: 'POST' }
      );
      if (asJson) {
        client.stdout.write(`${JSON.stringify(restored, null, 2)}\n`);
        return 0;
      }
      output.success(
        `Restored Edge Config ${chalk.bold(id)} from backup ${chalk.bold(
          restoreVersion
        )}.`
      );
      output.print(`${gray(`digest: ${restored.digest}`)}\n`);
      return 0;
    }

    if (backupVersion) {
      const backup = await client.fetch(
        `${base}/${encodeURIComponent(backupVersion)}`
      );
      if (asJson) {
        client.stdout.write(`${JSON.stringify(backup, null, 2)}\n`);
        return 0;
      }
      output.log(JSON.stringify(backup, null, 2));
      return 0;
    }

    const query = new URLSearchParams();
    if (limit !== undefined) {
      query.set('limit', String(limit));
    }
    if (next) {
      query.set('next', next);
    }
    query.set('metadata', 'true');

    const queryString = query.toString();
    const suffix = queryString ? `?${queryString}` : '';
    const response = await client.fetch<BackupListResponse>(`${base}${suffix}`);

    if (asJson) {
      client.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
      return 0;
    }

    if (!response.backups.length) {
      output.log('No backups.');
      return 0;
    }

    const tableRows = [
      ['id', 'last modified', 'items', 'bytes'].map(h => gray(h)),
      ...response.backups.map(backup => [
        backup.id,
        formatDate(backup.lastModified),
        formatNumber(backup.metadata?.itemsCount),
        formatNumber(backup.metadata?.itemsBytes),
      ]),
    ];
    client.stderr.write(`${table(tableRows, { hsep: 2 })}\n`);

    if (response.pagination?.hasNext && response.pagination.next) {
      const commandFlags = getCommandFlags(flags, [
        '--format',
        '--next',
        '--restore',
        '--yes',
      ]);
      output.print(
        `${gray(
          `Next page: ${getCommandName(
            `edge-config backups ${idOrSlug}${commandFlags} --next ${response.pagination.next}`
          )}`
        )}\n`
      );
    }
    return 0;
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, { variant: 'edge-config' });
    printError(err);
    return 1;
  }
}

function formatDate(value: number | string | undefined): string {
  if (value === undefined) {
    return '';
  }

  const timestamp = typeof value === 'number' ? value : Date.parse(value);
  if (Number.isFinite(timestamp)) {
    return new Date(timestamp).toISOString();
  }

  return String(value);
}

function formatNumber(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}
