import chalk from 'chalk';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import {
  getCommandName,
  getCommandNamePlain,
  packageName,
} from '../../util/pkg-name';
import output from '../../output-manager';
import {
  outputAgentError,
  writeAgentError,
  buildCommandWithYes,
  buildCommandWithGlobalFlags,
  shouldEmitNonInteractiveCommandError,
  type AgentErrorPayload,
} from '../../util/agent-output';
import {
  AGENT_STATUS,
  AGENT_REASON,
  getExitCodeForReason,
} from '../../util/agent-output-constants';
import { getGlobalFlagsFromArgs } from '../../util/arg-common';
import { isAPIError } from '../../util/errors-ts';
import { FIREWALL_ACTIVITY_PLAN_MESSAGE } from '../../util/firewall/get-firewall-alerts';
import { apiServerMessage } from '../../util/firewall/server-message';
import { clientObservabilityPlanRecovery } from '../../util/metrics/plan-gate';
import type { Command } from '../help';
import {
  parseSubcommandArguments,
  type ParsedSubcommandArguments,
} from '../../util/command-arguments';
import type { FirewallIpRule, FirewallRule } from '../../util/firewall/types';
import type { FirewallScope } from '../../util/firewall/scope';
import { resolveManagedBotRuleId } from '../../util/firewall/managed-bot-rules';
import listFirewallConfigs from '../../util/firewall/list-firewall-configs';
import activateFirewallConfig from '../../util/firewall/activate-firewall-config';
import getScope from '../../util/get-scope';
import { requireProjectContext } from '../../util/projects/require-project-context';
import stamp from '../../util/output/stamp';
import { quoteArg } from '../../util/flags/quote-arg';
import { teamCache } from '../../util/teams/get-team-by-id-or-slug';

const PRIORITY_PROJECT_ENABLE_COMMAND = 'project priority enable';
const BUY_PRO_COMMAND = 'buy pro';

/**
 * Plain suggested command with global flags from argv (--cwd, --non-interactive, etc.).
 * Suggested follow-ups must keep targeting the team config, so team scope appends --team-level.
 */
export function withGlobalFlags(
  client: Client,
  commandTemplate: string,
  scope?: FirewallScope,
  options: { excludeFlags?: string[]; preserveProject?: boolean } = {}
): string {
  const template =
    scope?.type === 'team'
      ? `${commandTemplate} --team-level`
      : commandTemplate;
  return buildCommandWithGlobalFlags(client.argv, template, undefined, {
    globalFlags: 'all',
    preserveProject: options.preserveProject ?? true,
    excludeFlags: options.excludeFlags,
  });
}

/**
 * Resolves the firewall config to operate on: the team-level config when
 * --team-level is passed (no linked project required), else the linked or
 * --project project. Returns an exit code on failure.
 */
export async function resolveFirewallScope(
  client: Client,
  flags: { '--project'?: string; '--team-level'?: boolean }
): Promise<FirewallScope | number> {
  if (flags['--team-level'] && flags['--project']) {
    const message =
      'Cannot specify both --team-level and --project. Use one or the other.';
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message,
        },
        2
      );
      return 2;
    }
    output.error(message);
    return 2;
  }

  if (flags['--team-level']) {
    const { team } = await getScope(client);
    if (!team) {
      const message =
        'Team-level firewall requires a team scope. Personal accounts are not supported. Run `vercel switch` to select a team or pass --scope <team>.';
      if (client.nonInteractive) {
        outputAgentError(
          client,
          {
            status: AGENT_STATUS.ERROR,
            reason: AGENT_REASON.MISSING_SCOPE,
            message,
          },
          1
        );
        return 1;
      }
      output.error(message);
      return 1;
    }
    return { type: 'team', teamId: team.id, displayName: team.slug };
  }

  const link = await requireProjectContext(
    client,
    'firewall',
    flags['--project']
  );
  if (typeof link === 'number') return link;
  const { project, org } = link;
  return {
    type: 'project',
    projectId: project.id,
    teamId: org.type === 'team' ? org.id : undefined,
    teamSlug: org.type === 'team' ? org.slug : undefined,
    displayName: project.name,
  };
}

/** Whether the refusal named Priority project (or the leftover Priority Tier copy). */
export function mentionsPriorityProject(message: string): boolean {
  return (
    /priority\s+project/i.test(message) || /priority\s+tier/i.test(message)
  );
}

function teamPlan(scope: FirewallScope): string | undefined {
  return scope.teamId ? teamCache.get(scope.teamId)?.billing?.plan : undefined;
}

/**
 * The team the refused request ran against. `buy pro` and
 * `project priority enable` otherwise use the globally selected team, which
 * can be a different one, so the recovery always names this team as `--scope`.
 * The slug is never used as the project name.
 */
function priorityTeam(scope: FirewallScope): {
  id: string;
  slug: string | null;
  name: string | null;
  scopeArg: string;
} | null {
  const cached = scope.teamId ? teamCache.get(scope.teamId) : undefined;
  if (scope.type === 'team') {
    return {
      id: scope.teamId,
      slug: scope.displayName,
      name: cached?.name ?? null,
      scopeArg: scope.displayName,
    };
  }
  if (!scope.teamId) return null;
  const slug = scope.teamSlug ?? cached?.slug ?? null;
  return {
    id: scope.teamId,
    slug,
    name: cached?.name ?? null,
    scopeArg: slug ?? scope.teamId,
  };
}

/** Same labeling as `project priority`: slug, plus the team name when it differs. */
function teamLabel(team: { slug: string; name: string | null }): string {
  return team.name && team.name !== team.slug
    ? `${team.slug} (${team.name})`
    : team.slug;
}

type PriorityProjectFix = {
  command: string;
  hint: string;
  plainHint: string;
  when: string;
  excludeFlags: string[];
  preserveProject: false;
  reason: string;
  /** Value of `--scope` on the recovery. Absent for a personal account. */
  scope?: string;
  data: {
    project: { id: string; name: string } | null;
    team: { id: string; slug: string | null; name: string | null } | null;
    plan: string | null;
  };
};

function styledCommand(command: string, plain: boolean): string {
  return plain ? getCommandNamePlain(command) : getCommandName(command);
}

/**
 * Recovery for a Priority project refusal.
 *
 * The project is a positional argument. The team is only `--scope`. A
 * preserved `--project` or the globally selected team would name the wrong
 * target. On a personal account there is no team to upgrade.
 */
export function priorityProjectFix(scope: FirewallScope): PriorityProjectFix {
  const excludeFlags = [
    '--non-interactive',
    '--project',
    '--yes',
    '--scope',
    '--team',
  ];
  const project =
    scope.type === 'project'
      ? { id: scope.projectId, name: scope.displayName }
      : null;
  const team = priorityTeam(scope);
  const plan = teamPlan(scope) ?? null;
  const data = {
    project,
    team: team && { id: team.id, slug: team.slug, name: team.name },
    plan,
  };
  const projectToken = project ? quoteArg(project.name) : '<project>';
  const scopeFlag = team ? ` --scope ${quoteArg(team.scopeArg)}` : '';
  const enable = `${PRIORITY_PROJECT_ENABLE_COMMAND} ${projectToken}${scopeFlag}`;

  if (!team) {
    const hint =
      'Priority projects are only available on team accounts. Use --scope to specify one.';
    return {
      command: '',
      hint,
      plainHint: hint,
      when: hint,
      excludeFlags,
      preserveProject: false,
      reason: AGENT_REASON.MISSING_SCOPE,
      data,
    };
  }

  if (plan === 'hobby' || plan === 'oss') {
    const upgrade = `${BUY_PRO_COMMAND}${scopeFlag}`;
    const hint = (plain: boolean) =>
      `Priority Projects are only available on Pro or Enterprise team plans. Upgrade with ${styledCommand(upgrade, plain)}, then run ${styledCommand(enable, plain)}.`;
    return {
      command: upgrade,
      hint: hint(false),
      plainHint: hint(true),
      when: 'a person has approved upgrading the plan',
      excludeFlags,
      preserveProject: false,
      reason: AGENT_REASON.PLAN_UPGRADE_REQUIRED,
      scope: team.scopeArg,
      data,
    };
  }

  const shown = styledCommand(enable, false);
  const plain = styledCommand(enable, true);
  const placeholder = 'Replace <project> with a project on this team.';
  return {
    command: enable,
    hint: project ? shown : `${shown} ${placeholder}`,
    plainHint: project ? plain : `${plain} ${placeholder}`,
    when: project
      ? 'user runs this command in an interactive terminal'
      : 'Replace <project> with a project on this team.',
    excludeFlags,
    preserveProject: false,
    reason: AGENT_REASON.PLAN_UPGRADE_REQUIRED,
    scope: team.scopeArg,
    data,
  };
}

/**
 * User-facing message for firewall API errors. Team scope maps the two 403
 * causes (plan gate, owner-only ACL) to actionable messages; everything else
 * surfaces the server message so gated-feature errors (e.g. 401 Security Plus)
 * stay verbatim. A Priority project refusal is reported separately, with
 * `project priority enable` as the recovery.
 */
export function mapFirewallApiError(
  e: unknown,
  scope: FirewallScope,
  fallback: string
): string {
  const err = e as { status?: number; code?: string; message?: string };
  if (scope.type === 'team' && err.status === 403) {
    if (err.code === 'plan_not_supported') {
      return `Team-level firewall requires an Enterprise plan (current team: "${scope.displayName}"). Pass --scope <team> or run \`vercel switch\` to target a different team.`;
    }
    return `You need to be a team owner to manage the team-level firewall for "${scope.displayName}".${err.message ? ` (${err.message})` : ''}`;
  }
  return err.message || fallback;
}

/**
 * A Priority project 401 is a plan gate, not a credential failure and not a
 * retry of the command that just failed. Returns an exit code when that is
 * the case, otherwise null so the caller reports the error itself.
 */
function priorityProjectMessage(
  scope: FirewallScope,
  fix: PriorityProjectFix
): string {
  const team = fix.data.team;
  const label =
    team?.slug != null
      ? teamLabel({ slug: team.slug, name: team.name })
      : undefined;
  if (scope.type === 'project') {
    if (!label) {
      return `This rule requires a Priority project. ${fix.hint}`;
    }
    return `This rule requires a Priority project for ${scope.displayName} on team ${label}.`;
  }
  return label
    ? `This rule requires a Priority project on team ${label}.`
    : 'This rule requires a Priority project.';
}

/**
 * A Priority project 401 is a plan gate, not a credential failure and not a
 * retry of the command that just failed. Returns an exit code when that is
 * the case, otherwise null so the caller reports the error itself.
 *
 * `--json` writes one error document and no human line, matching
 * `project priority`. The document's `scope` and `--scope` are the team the
 * request ran against, never the project name and never a different
 * globally selected team.
 */
export function failPriorityProjectGate(
  client: Client,
  error: unknown,
  scope: FirewallScope,
  opts?: { json?: boolean }
): number | null {
  const serverMessage = apiServerMessage(error);
  if (!serverMessage || !mentionsPriorityProject(serverMessage)) return null;
  const fix = priorityProjectFix(scope);
  const message = priorityProjectMessage(scope, fix);
  const payload: AgentErrorPayload = {
    status: AGENT_STATUS.ERROR,
    reason: fix.reason,
    message,
    userActionRequired: true,
    hint: fix.plainHint,
    retryable: false,
    ...(fix.scope ? { scope: fix.scope } : {}),
    data: fix.data,
    ...(fix.command
      ? {
          next: [
            {
              command: buildCommandWithGlobalFlags(
                client.argv,
                fix.command,
                packageName,
                {
                  globalFlags: 'all',
                  preserveProject: false,
                  excludeFlags: fix.excludeFlags,
                }
              ),
              when: fix.when,
            },
          ],
        }
      : {}),
  };
  if (shouldEmitNonInteractiveCommandError(client)) {
    outputAgentError(client, payload, 1);
  }
  if (opts?.json) {
    output.stopSpinner();
    writeAgentError(client, payload);
    return 1;
  }
  output.error(message);
  if (fix.command) {
    output.log(fix.hint);
  }
  return 1;
}

/**
 * The rule payload from `--data`, or from `--json`, its deprecated old name.
 * Returns an exit code when both are given.
 */
export function getRulePayload(flags: {
  '--data'?: string;
  '--json'?: string;
}): string | undefined | number {
  const legacy = flags['--json'];
  if (legacy !== undefined && flags['--data'] !== undefined) {
    output.error("Can't use --data with --json.");
    return 2;
  }
  if (legacy !== undefined) {
    output.warning('--json is deprecated for rule payloads. Use --data.');
  }
  return flags['--data'] ?? legacy;
}

export async function parseSubcommandArgs(
  argv: string[],
  command: Command,
  client?: Client,
  commandPath?: string
): Promise<ParsedSubcommandArguments | number> {
  let parsedArgs;
  const fullPath = commandPath || command.name;

  try {
    parsedArgs = parseSubcommandArguments(argv, command);
  } catch (err) {
    if (client?.nonInteractive) {
      const rawMessage = err instanceof Error ? err.message : String(err);
      const flags = getGlobalFlagsFromArgs(client.argv.slice(2), {
        preserveProject: true,
      });
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message: rawMessage,
          next: [
            {
              command: getCommandNamePlain(
                `firewall ${fullPath} ${flags.join(' ')}`.trim()
              ),
              when: 'fix options and retry',
            },
          ],
        },
        2
      );
      return 2;
    }
    printError(err);
    return 2;
  }

  return parsedArgs;
}

export async function confirmAction(
  client: Client,
  skipConfirmation: boolean,
  message: string,
  details?: string
): Promise<boolean> {
  if (skipConfirmation) return true;

  if (client.nonInteractive || !client.stdin.isTTY) {
    outputAgentError(client, {
      status: AGENT_STATUS.ERROR,
      reason: AGENT_REASON.CONFIRMATION_REQUIRED,
      message: `${message} Re-run with --yes to confirm.`,
      next: [
        {
          command: buildCommandWithYes(client.argv),
          when: 're-run with --yes to confirm',
        },
      ],
    });
    process.exit(1);
    return false;
  }

  if (details) {
    output.print(`  ${details}\n`);
  }

  return await client.input.confirm(message, false);
}

export function firewallPermissionMessage(
  action: string,
  projectName: string
): string {
  return `You don't have permission to ${action} for ${projectName}. Ask a team owner to grant access.`;
}

/**
 * Human error, or a JSON agent payload when non-interactive.
 *
 * `nextCommand` is offered only when re-running could plausibly succeed, so
 * omit it for failures a retry cannot clear.
 *
 * `fix` is for a failure with a known remedy, which is a different thing: a
 * command that clears the cause rather than one to run afterwards. It is the
 * only part of this that a person sees, because `nextCommand` reaches the
 * agent payload alone, and an error stating no recovery leaves a reader
 * nowhere to go. Both ride along in `next[]` for an agent, the fix first
 * since it is what unblocks the command.
 */
export function failFirewall(
  client: Client,
  opts: {
    message: string;
    nextCommand?: string;
    fix?: {
      command?: string;
      excludeFlags?: string[];
      hint: string;
      preserveProject?: boolean;
      when?: string;
    };
    reason?: string;
  }
): number {
  const reason = opts.reason ?? AGENT_REASON.INVALID_ARGUMENTS;
  const exitCode = getExitCodeForReason(reason);
  if (client.nonInteractive) {
    outputAgentError(
      client,
      {
        status: AGENT_STATUS.ERROR,
        reason,
        message: opts.message,
        ...(opts.fix?.hint ? { hint: opts.fix.hint } : {}),
        next: [
          ...(opts.fix?.command
            ? [
                {
                  command: withGlobalFlags(
                    client,
                    opts.fix.command,
                    undefined,
                    {
                      excludeFlags: opts.fix.excludeFlags,
                      preserveProject: opts.fix.preserveProject,
                    }
                  ),
                  ...(opts.fix.when ? { when: opts.fix.when } : {}),
                },
              ]
            : []),
          ...(opts.nextCommand
            ? [{ command: withGlobalFlags(client, opts.nextCommand) }]
            : []),
        ],
      },
      exitCode
    );
    return exitCode;
  }
  output.error(opts.message);
  // Last, because it is the most actionable line.
  if (opts.fix) {
    output.log(opts.fix.hint);
  }
  return exitCode;
}

/**
 * A 402 from the observability query used for traffic, alerts, and
 * persistent-action charts. Same recovery as `vercel metrics`: buy Plus
 * when that is what the API named, or hand Priority enable to a person
 * when it named Priority project. Hobby follows the same product, but the
 * command is `buy pro` — Plus cannot be purchased there, and enable would
 * only restate the plan gate.
 */
export function failFirewallObservabilityPlan(
  client: Client,
  error: unknown,
  projectName?: string
): number {
  const message = apiServerMessage(error) ?? FIREWALL_ACTIVITY_PLAN_MESSAGE;
  // `requireProjectContext` pointed `currentTeam` at the project's team for
  // this run only; the recovery command has to carry it.
  const fix = clientObservabilityPlanRecovery(
    client,
    error,
    message,
    projectName
  );
  return failFirewall(client, {
    message,
    fix,
    reason: AGENT_REASON.API_ERROR,
  });
}

/**
 * Refuse an operation that names a managed bot rule, which the custom-rule
 * mutations cannot carry out: the three settings are not rows in the rule
 * list, so there is nothing to add, remove, reorder, enable or disable. Only
 * their action is editable, and the message says so rather than reporting the
 * slug as an unknown rule.
 *
 * Returns `null` when the identifier is not reserved, so callers continue.
 * The reservation is project-scope only — the team-level config holds custom
 * rules and IP blocks alone, and has no managed bot settings to collide with.
 */
export function refuseManagedBotMutation(
  client: Client,
  scope: FirewallScope,
  identifier: string | undefined,
  verb: string
): number | null {
  if (scope.type !== 'project') return null;
  const id = resolveManagedBotRuleId(identifier);
  if (!id) return null;

  const command = `firewall rules update ${id} --action <action>`;
  return failFirewall(client, {
    message: `Can't ${verb} "${identifier}". That's a managed bot rule.`,
    reason: AGENT_REASON.INVALID_ARGUMENTS,
    fix: {
      command,
      hint: `Use ${chalk.cyan(withGlobalFlags(client, command, scope))} to change it.`,
      when: 'change the managed bot rule instead',
    },
  });
}

/**
 * Whether re-running could plausibly succeed. Suggesting a retry for a
 * permission or validation failure sends an agent round a loop it cannot
 * escape, so only transient failures get one.
 */
export function isRetryableApiError(error: unknown): boolean {
  return isAPIError(error) && (error.status >= 500 || error.status === 429);
}

/**
 * Report a failed firewall request, keeping permission denials and timeouts
 * distinct from generic API failures so an agent can tell what to do next.
 *
 * Shared by `firewall status` and `firewall overview` so the two cannot drift
 * on how a failure is classified, or on which failures are worth retrying.
 */
export function failFirewallApi(
  client: Client,
  e: unknown,
  opts: {
    fallback: string;
    nextCommand: string;
    permissionAction: string;
    projectName: string;
    timeoutJob?: string;
  }
): number {
  if (isAPIError(e) && (e.status === 401 || e.status === 403)) {
    // No retry: the same credentials will be refused again.
    return failFirewall(client, {
      message: firewallPermissionMessage(
        opts.permissionAction,
        opts.projectName
      ),
      reason: AGENT_REASON.PERMISSION_DENIED,
    });
  }
  if (
    e instanceof Error &&
    (e.name === 'TimeoutError' || e.name === 'AbortError')
  ) {
    const job = opts.timeoutJob ?? 'firewall data';
    return failFirewall(client, {
      message: `Timed out waiting for ${job}. Re-run the command — the next try is usually faster.`,
      nextCommand: opts.nextCommand,
      reason: AGENT_REASON.API_ERROR,
    });
  }
  const msg = e instanceof Error && e.message ? e.message : opts.fallback;
  return failFirewall(client, {
    message: msg,
    nextCommand: isRetryableApiError(e) ? opts.nextCommand : undefined,
    reason: AGENT_REASON.API_ERROR,
  });
}

export function outputJson(client: Client, data: unknown): void {
  output.stopSpinner();
  client.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

/**
 * Check if the project has an existing draft with changes.
 * Returns true if a draft exists with at least one change.
 */
export async function detectExistingDraft(
  client: Client,
  scope: FirewallScope
): Promise<boolean> {
  const { draft } = await listFirewallConfigs(client, scope);
  return draft !== null && draft.changes.length > 0;
}

/**
 * After a draft mutation, offer to publish immediately.
 * Mirrors routes' offerAutoPromote pattern.
 */
export async function offerAutoPublish(
  client: Client,
  scope: FirewallScope,
  hadExistingDraft: boolean,
  opts: { skipPrompts?: boolean }
): Promise<void> {
  output.print(
    `\n  ${chalk.gray(`This change is staged. Run ${chalk.cyan(withGlobalFlags(client, 'firewall publish', scope))} to make it live, or ${chalk.cyan(withGlobalFlags(client, 'firewall discard', scope))} to undo.`)}\n`
  );

  if (
    !hadExistingDraft &&
    !opts.skipPrompts &&
    client.stdin.isTTY &&
    !client.nonInteractive
  ) {
    output.print('\n');
    const shouldPublish = await client.input.confirm(
      'This is the only draft change. Publish to production now?',
      false
    );

    if (shouldPublish) {
      const publishStamp = stamp();
      output.spinner('Publishing to production');

      try {
        await activateFirewallConfig(client, scope, 'draft');
        output.log(
          `${chalk.cyan('Published')} to production ${chalk.gray(publishStamp())}`
        );
      } catch (e: unknown) {
        output.error(
          `Failed to publish to production: ${mapFirewallApiError(e, scope, 'Unknown error')}`
        );
      }
    }
  } else if (hadExistingDraft) {
    output.warn(
      `There are other draft changes. Review with ${chalk.cyan(withGlobalFlags(client, 'firewall diff', scope))} before publishing.`
    );
  }
}

/**
 * Resolve an IP rule by ID or IP address.
 * Returns all matching rules (caller handles disambiguation).
 */
export function resolveIpRule(
  ips: FirewallIpRule[],
  identifier: string
): FirewallIpRule[] {
  if (!identifier) return [];

  // Exact ID match
  const byId = ips.find(r => r.id === identifier);
  if (byId) return [byId];

  // Exact IP match (case-insensitive)
  const query = identifier.toLowerCase();
  const byIp = ips.filter(r => r.ip.toLowerCase() === query);
  if (byIp.length > 0) return byIp;

  // Partial ID match
  const byPartialId = ips.filter(r => r.id.toLowerCase().includes(query));
  return byPartialId;
}

/**
 * Resolve a custom rule by name or ID.
 * Returns all matching rules (caller handles disambiguation).
 */
export function resolveRule(
  rules: FirewallRule[],
  identifier: string
): FirewallRule[] {
  if (!identifier) return [];

  // Exact ID match
  const byId = rules.find(r => r.id === identifier);
  if (byId) return [byId];

  // Exact name match (case-insensitive)
  const query = identifier.toLowerCase();
  const byName = rules.filter(r => r.name.toLowerCase() === query);
  if (byName.length > 0) return byName;

  // Partial name match (case-insensitive substring)
  const byPartialName = rules.filter(r => r.name.toLowerCase().includes(query));
  if (byPartialName.length > 0) return byPartialName;

  // Partial ID match
  const byPartialId = rules.filter(r => r.id.toLowerCase().includes(query));
  return byPartialId;
}

/**
 * Print a warning about the potential impact of a rule's action.
 * Called after staging adds, edits, and enables for deny/challenge/rate_limit actions.
 */
export function printActionImpactWarning(action: FirewallRule['action']): void {
  const actionType = action.mitigate?.action;
  if (!actionType) return;

  switch (actionType) {
    case 'deny':
      output.warn(
        'This rule will deny matching requests. Legitimate traffic may be blocked if conditions are too broad.'
      );
      break;
    case 'challenge':
      output.warn(
        'This rule will challenge matching requests with a verification page. Some legitimate users or automated clients may be unable to complete the challenge.'
      );
      break;
    case 'rate_limit':
      output.warn(
        'This rule will rate limit matching requests. Legitimate traffic may be throttled if the limit is too low or keys are too broad.'
      );
      break;
    default:
      break;
  }
}
