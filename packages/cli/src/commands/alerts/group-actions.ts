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
import { getMuteCoverage, getMuteRuleIds, isAcknowledged } from './group-state';
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
/** `PATCH` accepts at most 100 rule IDs per `unmute` or `updateMute`. */
const MAX_RULE_IDS_PER_REQUEST = 100;
/**
 * Kept between the requested expiry and the API's 1m–365d bounds, which it
 * checks against its own clock when the request arrives.
 */
const EXPIRY_SLACK_MS = 10 * 1000;

/** The request that failed, so its error can say what may already be done. */
type RequestPhase = 'read' | 'ack' | 'mute' | 'updateMute' | 'unmute';

interface FailureContext {
  verb: GroupActionVerb;
  phase: RequestPhase;
  /** For batched requests: how many rule IDs were already handled. */
  progress?: { done: number; total: number };
}

interface GroupActionFlags {
  '--duration'?: string;
  '--detection'?: string;
  '--format'?: string;
  '--json'?: boolean;
}

interface MuteRule {
  ruleId: string;
  expiresAt?: number | null;
  [key: string]: unknown;
}

interface PatchResponse {
  type: 'ack' | 'mute' | 'unmute' | 'updateMute';
  group: AlertGroup;
  mutes?: MuteRule[];
  removedRuleIds?: string[];
}

/**
 * The `expiresAt` to send for a duration: kept inside the API's bounds with
 * some slack, and on a whole second, which is how the API stores it. Mutes
 * with the same group, target, and expiry are reused, so a whole second lets
 * a mute match the expiry just set on existing mutes.
 */
export function getMuteExpiresAt(
  durationMs: number | null,
  now = Date.now()
): number | null {
  if (durationMs === null) {
    return null;
  }
  const clamped = Math.min(
    Math.max(durationMs, MIN_MUTE_MS + EXPIRY_SLACK_MS),
    MAX_MUTE_MS - EXPIRY_SLACK_MS
  );
  return Math.ceil((now + clamped) / 1000) * 1000;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
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
  groupId: string,
  err: { status: number; code?: string; serverMessage?: string },
  { verb, phase, progress }: FailureContext
): number {
  const inspectCommand = `${packageName} alerts inspect ${groupId}`;
  const changesMutes =
    phase === 'mute' || phase === 'updateMute' || phase === 'unmute';
  // The request may have been applied before the error, so repeating it could
  // apply it twice.
  const outcomeUnknown =
    changesMutes && (err.status === 409 || err.status >= 500);
  let message =
    err.status === 403
      ? `You don't have permission to ${verb} alert group ${groupId}. ${
          verb === 'mute' || verb === 'unmute'
            ? 'Muting needs permission to manage alert rules in the project.'
            : 'Acknowledging needs permission to update alerts.'
        }`
      : err.status === 404 && (phase === 'unmute' || phase === 'updateMute')
        ? `Some mutes on alert group ${groupId} were already removed or have expired. Run \`${inspectCommand}\` to see its current mutes.`
        : err.status === 404
          ? `Alert group ${groupId} was not found in this team.`
          : err.status === 409 && changesMutes
            ? `A mute change for alert group ${groupId} is still in progress. Run \`${inspectCommand}\` before running this again, so it isn't applied twice.`
            : err.status === 409
              ? `Alert group ${groupId} is already being updated. Try again in a moment.`
              : err.status === 412
                ? `Alert group ${groupId} changed while it was being muted. Run the command again.`
                : outcomeUnknown
                  ? `The alerts API failed (${err.status}), and the change may have been applied. Run \`${inspectCommand}\` before running this again.`
                  : err.serverMessage || `API error (${err.status}).`;
  if (progress && progress.done > 0) {
    const verbed = phase === 'unmute' ? 'removed' : 'updated';
    message += ` ${progress.done} of ${progress.total} mutes were already ${verbed}.`;
  }
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
  const inspectStep = {
    command: buildCommandWithGlobalFlags(
      client.argv,
      `alerts inspect ${groupId}`
    ),
    when: 'Check the alert group before retrying',
  };
  outputAgentError(
    client,
    {
      status: 'error',
      reason,
      message,
      ...(err.status === 403 ||
      (err.status === 404 && phase !== 'unmute' && phase !== 'updateMute')
        ? {
            hint: 'Confirm team scope; use --scope <team-slug> if the group belongs to another team.',
            next: [
              {
                command: buildCommandWithGlobalFlags(client.argv, 'whoami'),
                when: 'See current user and team',
              },
              inspectStep,
            ],
          }
        : outcomeUnknown || err.status === 404
          ? { next: [inspectStep] }
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

  const failure: FailureContext = { verb, phase: 'read' };
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
      failure.phase = 'ack';
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
      const detection = flags['--detection']?.trim();
      const expiresAt = getMuteExpiresAt(muteMs);
      // Mutes already created from this group get the new expiry, so muting
      // again changes how long the group stays muted instead of leaving the
      // earlier, shorter mutes in charge.
      const existingRuleIds = detection ? [] : getMuteRuleIds(current);
      const mutesById = new Map<string, MuteRule>();
      let group = current;

      if (existingRuleIds.length > 0) {
        if (showProgress) output.spinner('Updating mutes…');
        failure.phase = 'updateMute';
        failure.progress = { done: 0, total: existingRuleIds.length };
        for (const ruleIds of chunk(
          existingRuleIds,
          MAX_RULE_IDS_PER_REQUEST
        )) {
          const result = await client.fetch<PatchResponse>(path, {
            method: 'PATCH',
            body: { type: 'updateMute', ruleIds, expiresAt },
          });
          for (const mute of result.mutes ?? []) {
            mutesById.set(mute.ruleId, mute);
          }
          group = result.group ?? group;
          failure.progress.done += ruleIds.length;
        }
        // Left set, so a failed mute below still reports these updates.
      }

      // Create mutes for the detections the existing ones don't cover. Those
      // the existing mutes already target are reused, since they now have the
      // same expiry.
      const createsMutes =
        Boolean(detection) ||
        existingRuleIds.length === 0 ||
        getMuteCoverage(current) !== 'all';
      if (createsMutes) {
        const revision = group.revision ?? current.revision;
        if (!revision) {
          return outputError(
            client,
            jsonOutput,
            'API_ERROR',
            `The API did not return a revision for alert group ${id}, so it can't be muted.`
          );
        }
        if (showProgress) output.spinner('Muting alert group…');
        failure.phase = 'mute';
        const result = await client.fetch<PatchResponse>(path, {
          method: 'PATCH',
          headers: {
            'If-Match': revision,
            // Reused on retries so a request that already succeeded is replayed
            // instead of creating its mutes again.
            'Idempotency-Key': randomUUID(),
          },
          body: {
            type: 'mute',
            expiresAt,
            ...(detection ? { detectionId: detection } : {}),
          },
          // Safe to retry: the same key replays the first result.
          retry: { retries: 3 },
        });
        for (const mute of result.mutes ?? []) {
          mutesById.set(mute.ruleId, mute);
        }
        group = result.group ?? group;
      }
      output.stopSpinner();

      const mutes = [...mutesById.values()];
      const outcome = createsMutes ? 'muted' : 'updated';
      if (jsonOutput) {
        return printJson(client, {
          group,
          mutes,
          outcome,
          next: inspectNext(client, id),
        });
      }
      // The receipt shows the expiry of the mutes this command set, not the
      // earliest expiry on the group, which can include unrelated mutes.
      const returnedExpiry = mutes.find(
        mute => mute.expiresAt !== undefined
      )?.expiresAt;
      printAlignedLabel(createsMutes ? 'Muted' : 'Mute updated', id, {
        gutter: '✓',
      });
      printAlignedLabel('Title', getGroupTitle(group));
      printAlignedLabel(
        'Until',
        formatExpiry(returnedExpiry !== undefined ? returnedExpiry : expiresAt)
      );
      if (detection) {
        printAlignedLabel('Detection', detection);
      }
      if (existingRuleIds.length > 0) {
        printAlignedLabel(
          'Updated',
          `${existingRuleIds.length} existing ${existingRuleIds.length === 1 ? 'mute' : 'mutes'}`
        );
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
    failure.phase = 'unmute';
    failure.progress = { done: 0, total: ruleIds.length };
    let group = current;
    const removedRuleIds: string[] = [];
    for (const batch of chunk(ruleIds, MAX_RULE_IDS_PER_REQUEST)) {
      // Not retried: a retry after a removal that landed would fail with 404
      // because its rules no longer exist.
      const result = await client.fetch<PatchResponse>(path, {
        method: 'PATCH',
        body: { type: 'unmute', ruleIds: batch },
        retry: { retries: 0 },
      });
      removedRuleIds.push(...(result.removedRuleIds ?? batch));
      group = result.group ?? group;
      failure.progress.done = removedRuleIds.length;
    }
    output.stopSpinner();
    if (jsonOutput) {
      return printJson(client, {
        group,
        removedRuleIds,
        outcome: 'unmuted',
        next: inspectNext(client, id),
      });
    }
    printAlignedLabel('Unmuted', id, { gutter: '✓' });
    printAlignedLabel('Title', getGroupTitle(group));
    printAlignedLabel(
      'Removed',
      `${removedRuleIds.length} ${removedRuleIds.length === 1 ? 'mute' : 'mutes'}`
    );
    printStdoutIdentifier(client, id);
    return 0;
  } catch (err) {
    output.stopSpinner();
    if (isAPIError(err)) {
      return handleApiError(client, jsonOutput, groupId, err, failure);
    }
    throw err;
  }
}
