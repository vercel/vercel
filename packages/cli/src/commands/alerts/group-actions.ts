import { randomUUID } from 'node:crypto';
import ms from 'ms';
import type Client from '../../util/client';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';
import { isAPIError } from '../../util/errors-ts';
import { outputError } from '../../util/command-validation';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { packageName } from '../../util/pkg-name';
import formatDate from '../../util/format-date';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import {
  acknowledgeSubcommand,
  muteSubcommand,
  unacknowledgeSubcommand,
  unmuteSubcommand,
} from './command';
import { resolveGroupScope } from './resolve-group-scope';
import { getGroupTitle } from './format';
import { getMuteExpiry, getMuteRuleIds, isAcknowledged } from './group-state';
import type { AlertGroup } from './types';
import type { AlertsTelemetryClient } from '../../util/telemetry/commands/alerts';

export type GroupActionVerb =
  | 'acknowledge'
  | 'unacknowledge'
  | 'mute'
  | 'unmute';

const SUBCOMMANDS = {
  acknowledge: acknowledgeSubcommand,
  unacknowledge: unacknowledgeSubcommand,
  mute: muteSubcommand,
  unmute: unmuteSubcommand,
} as const;

const DEFAULT_MUTE_DURATION = '24h';
const MIN_MUTE_MS = 60 * 1000;
const MAX_MUTE_MS = 365 * 24 * 60 * 60 * 1000;
/** `PATCH` accepts at most 100 rule IDs per `unmute`. */
const MAX_RULE_IDS_PER_REQUEST = 100;

interface GroupActionFlags {
  '--duration'?: string;
  '--detection'?: string;
  '--format'?: string;
  '--json'?: boolean;
}

interface PatchResponse {
  type: 'ack' | 'mute' | 'unmute' | 'updateMute';
  group: AlertGroup;
  mutes?: unknown[];
  removedRuleIds?: string[];
}

function usageError(
  client: Client,
  jsonOutput: boolean,
  verb: GroupActionVerb,
  code: string,
  message: string
): number {
  outputAgentError(
    client,
    {
      status: 'error',
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message,
      next: [
        {
          command: buildCommandWithGlobalFlags(
            client.argv,
            `alerts ${verb} --help`
          ),
          when: `See valid \`alerts ${verb}\` usage`,
        },
      ],
    },
    2
  );
  outputError(client, jsonOutput, code, message);
  return 2;
}

/**
 * Parses `--duration` into the API's `expiresAt` offset: milliseconds from
 * now, or `null` for a mute that lasts until it is removed.
 */
export function parseMuteDuration(
  input: string
): { valid: true; ms: number | null } | { valid: false; message: string } {
  const value = input.trim().toLowerCase();
  if (value === 'forever') {
    return { valid: true, ms: null };
  }
  const duration = /^\d+(\.\d+)?$/.test(value) ? undefined : ms(value);
  if (typeof duration !== 'number' || !Number.isFinite(duration)) {
    return {
      valid: false,
      message: `Invalid --duration "${input}". Use a duration such as 1h, 8h, or 7d, or \`forever\`.`,
    };
  }
  if (duration < MIN_MUTE_MS || duration > MAX_MUTE_MS) {
    return {
      valid: false,
      message: `--duration must be between 1m and 365d, or \`forever\`. Received "${input}".`,
    };
  }
  return { valid: true, ms: duration };
}

function groupPath(groupId: string, teamId: string): string {
  const query = new URLSearchParams({ teamId });
  return `/alerts/v4/groups/${encodeURIComponent(groupId)}?${query.toString()}`;
}

function handleApiError(
  client: Client,
  jsonOutput: boolean,
  verb: GroupActionVerb,
  groupId: string,
  err: { status: number; code?: string; serverMessage?: string }
): number {
  const message =
    err.status === 403
      ? `You don't have permission to ${verb} alert group ${groupId}. ${
          verb === 'mute' || verb === 'unmute'
            ? 'Muting needs permission to manage alert rules in the project.'
            : 'Acknowledging needs permission to update alerts.'
        }`
      : err.status === 404
        ? `Alert group ${groupId} was not found in this team.`
        : err.status === 409
          ? `Alert group ${groupId} is already being updated. Try again in a moment.`
          : err.status === 412
            ? `Alert group ${groupId} changed while it was being muted. Run the command again.`
            : err.serverMessage || `API error (${err.status}).`;
  const reason =
    err.status === 401
      ? 'not_authorized'
      : err.status === 403
        ? 'forbidden'
        : err.status === 404
          ? AGENT_REASON.NOT_FOUND
          : err.status === 429
            ? 'rate_limited'
            : AGENT_REASON.API_ERROR;
  outputAgentError(
    client,
    {
      status: 'error',
      reason,
      message,
      ...(err.status === 403 || err.status === 404
        ? {
            hint: 'Confirm team scope; use --scope <team-slug> if the group belongs to another team.',
            next: [
              {
                command: buildCommandWithGlobalFlags(client.argv, 'whoami'),
                when: 'See current user and team',
              },
              {
                command: buildCommandWithGlobalFlags(
                  client.argv,
                  `alerts inspect ${groupId}`
                ),
                when: 'Check the alert group',
              },
            ],
          }
        : {}),
    },
    1
  );
  return outputError(client, jsonOutput, err.code || 'API_ERROR', message);
}

function printJson(client: Client, document: unknown): number {
  client.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
  return 0;
}

/**
 * Writes the group ID to stdout so scripts can capture it. An interactive
 * terminal already shows it in the receipt.
 */
function printStdoutIdentifier(client: Client, id: string): void {
  if (client.stdout.isTTY && !client.nonInteractive) return;
  client.stdout.write(`${id}\n`);
}

function inspectNext(client: Client, groupId: string) {
  return [
    {
      command: buildCommandWithGlobalFlags(
        client.argv,
        `alerts inspect ${groupId}`
      ),
      when: 'Inspect the alert group',
    },
  ];
}

function formatExpiry(expiresAt: number | null | undefined): string {
  return typeof expiresAt === 'number'
    ? formatDate(expiresAt)
    : 'until unmuted';
}

export default async function groupAction(
  client: Client,
  argv: string[],
  verb: GroupActionVerb,
  tracking: { telemetry: AlertsTelemetryClient; subcommandOriginal: string }
): Promise<number> {
  const { telemetry, subcommandOriginal } = tracking;
  if (verb === 'acknowledge') {
    telemetry.trackCliSubcommandAcknowledge(subcommandOriginal);
  } else if (verb === 'unacknowledge') {
    telemetry.trackCliSubcommandUnacknowledge(subcommandOriginal);
  } else if (verb === 'mute') {
    telemetry.trackCliSubcommandMute(subcommandOriginal);
  } else {
    telemetry.trackCliSubcommandUnmute(subcommandOriginal);
  }

  const subcommand = SUBCOMMANDS[verb];
  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(subcommand.options)
    );
  } catch (err) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: err instanceof Error ? err.message : String(err),
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              `alerts ${verb} --help`
            ),
            when: `See valid \`alerts ${verb}\` usage`,
          },
        ],
      },
      2
    );
    printError(err);
    return 2;
  }

  const flags = parsedArgs.flags as GroupActionFlags;
  telemetry.trackCliArgumentGroup(parsedArgs.args[0]);
  telemetry.trackCliOptionDuration(flags['--duration']);
  telemetry.trackCliOptionDetection(flags['--detection']);
  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);
  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    return usageError(
      client,
      false,
      verb,
      'INVALID_FORMAT',
      formatResult.error
    );
  }
  const jsonOutput = formatResult.jsonOutput;

  const groupId = parsedArgs.args[0];
  if (!groupId) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        message: `Missing group. Example: ${packageName} alerts ${verb} <group>`,
        next: [
          {
            command: buildCommandWithGlobalFlags(client.argv, 'alerts'),
            when: 'List alert groups to find a group ID',
          },
        ],
      },
      2
    );
    return outputError(
      client,
      jsonOutput,
      'MISSING_ARGUMENTS',
      `Missing group. Usage: \`${packageName} alerts ${verb} <group>\``
    );
  }
  if (parsedArgs.args.length > 1) {
    return usageError(
      client,
      jsonOutput,
      verb,
      'INVALID_ARGUMENTS',
      `\`alerts ${verb}\` takes one group. Received: ${parsedArgs.args.join(' ')}`
    );
  }

  // Validate local input before any remote call.
  let muteMs: number | null = null;
  if (verb === 'mute') {
    const duration = parseMuteDuration(
      flags['--duration'] ?? DEFAULT_MUTE_DURATION
    );
    if (!duration.valid) {
      return usageError(
        client,
        jsonOutput,
        verb,
        'INVALID_DURATION',
        duration.message
      );
    }
    muteMs = duration.ms;
    if (flags['--detection'] !== undefined && !flags['--detection'].trim()) {
      return usageError(
        client,
        jsonOutput,
        verb,
        'INVALID_ARGUMENTS',
        '`--detection` requires a detection ID.'
      );
    }
  }

  const scope = await resolveGroupScope(client, {
    jsonOutput,
    command: `alerts ${verb} ${groupId}`,
  });
  if (typeof scope === 'number') {
    return scope;
  }
  const path = groupPath(groupId, scope.teamId);
  const showProgress = !jsonOutput && !client.nonInteractive;

  try {
    if (showProgress) output.spinner('Fetching alert group…');
    const current = await client.fetch<AlertGroup>(path);
    output.stopSpinner();
    const id = current.id || groupId;

    if (verb === 'acknowledge' || verb === 'unacknowledge') {
      const ack = verb === 'acknowledge';
      if (isAcknowledged(current) === ack) {
        if (jsonOutput) {
          return printJson(client, { group: current, outcome: 'unchanged' });
        }
        output.print(
          `  Alert group ${id} is already ${ack ? 'acknowledged' : 'not acknowledged'}.\n`
        );
        printStdoutIdentifier(client, id);
        return 0;
      }

      if (showProgress) {
        output.spinner(
          ack ? 'Acknowledging alert group…' : 'Unacknowledging alert group…'
        );
      }
      const result = await client.fetch<PatchResponse>(path, {
        method: 'PATCH',
        body: { type: 'ack', ack },
      });
      output.stopSpinner();
      const outcome = ack ? 'acknowledged' : 'unacknowledged';
      if (jsonOutput) {
        return printJson(client, {
          group: result.group,
          outcome,
          next: inspectNext(client, id),
        });
      }
      printAlignedLabel(ack ? 'Acknowledged' : 'Unacknowledged', id, {
        gutter: '✓',
      });
      printAlignedLabel('Title', getGroupTitle(result.group ?? current));
      printStdoutIdentifier(client, id);
      return 0;
    }

    if (verb === 'mute') {
      if (!current.revision) {
        return outputError(
          client,
          jsonOutput,
          'API_ERROR',
          `The API did not return a revision for alert group ${id}, so it can't be muted.`
        );
      }
      const detection = flags['--detection']?.trim();
      if (showProgress) output.spinner('Muting alert group…');
      const result = await client.fetch<PatchResponse>(path, {
        method: 'PATCH',
        headers: {
          'If-Match': current.revision,
          // Reused on retries so a request that already succeeded is replayed
          // instead of creating its mutes again.
          'Idempotency-Key': randomUUID(),
        },
        body: {
          type: 'mute',
          expiresAt: muteMs === null ? null : Date.now() + muteMs,
          ...(detection ? { detectionId: detection } : {}),
        },
      });
      output.stopSpinner();
      if (jsonOutput) {
        return printJson(client, {
          group: result.group,
          mutes: result.mutes ?? [],
          outcome: 'muted',
          next: inspectNext(client, id),
        });
      }
      printAlignedLabel('Muted', id, { gutter: '✓' });
      printAlignedLabel('Title', getGroupTitle(result.group ?? current));
      printAlignedLabel('Until', formatExpiry(getMuteExpiry(result.group)));
      if (detection) {
        printAlignedLabel('Detection', detection);
      }
      output.print(
        '\n  Matching future detections in the project are suppressed, including in other alert groups.\n'
      );
      printStdoutIdentifier(client, id);
      return 0;
    }

    // unmute
    const ruleIds = getMuteRuleIds(current);
    if (ruleIds.length === 0) {
      if (jsonOutput) {
        return printJson(client, {
          group: current,
          removedRuleIds: [],
          outcome: 'unchanged',
        });
      }
      output.print(
        `  Alert group ${id} has no mutes created from it that you can read.\n`
      );
      printStdoutIdentifier(client, id);
      return 0;
    }

    if (showProgress) output.spinner('Unmuting alert group…');
    let result: PatchResponse | undefined;
    const removedRuleIds: string[] = [];
    for (let i = 0; i < ruleIds.length; i += MAX_RULE_IDS_PER_REQUEST) {
      result = await client.fetch<PatchResponse>(path, {
        method: 'PATCH',
        body: {
          type: 'unmute',
          ruleIds: ruleIds.slice(i, i + MAX_RULE_IDS_PER_REQUEST),
        },
      });
      removedRuleIds.push(...(result.removedRuleIds ?? []));
    }
    output.stopSpinner();
    if (jsonOutput) {
      return printJson(client, {
        group: result?.group,
        removedRuleIds,
        outcome: 'unmuted',
        next: inspectNext(client, id),
      });
    }
    printAlignedLabel('Unmuted', id, { gutter: '✓' });
    printAlignedLabel('Title', getGroupTitle(result?.group ?? current));
    printAlignedLabel(
      'Removed',
      `${removedRuleIds.length} ${removedRuleIds.length === 1 ? 'mute' : 'mutes'}`
    );
    printStdoutIdentifier(client, id);
    return 0;
  } catch (err) {
    output.stopSpinner();
    if (isAPIError(err)) {
      return handleApiError(client, jsonOutput, verb, groupId, err);
    }
    throw err;
  }
}
