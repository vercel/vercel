import chalk from 'chalk';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import { getCommandNamePlain } from '../../util/pkg-name';
import output from '../../output-manager';
import {
  outputAgentError,
  buildCommandWithYes,
  withGlobalFlags as withClientGlobalFlags,
} from '../../util/agent-output';
import { AGENT_STATUS, AGENT_REASON } from '../../util/agent-output-constants';
import { getGlobalFlagsFromArgs } from '../../util/arg-common';
import type { Command } from '../help';
import {
  parseSubcommandArguments,
  type ParsedSubcommandArguments,
} from '../../util/command-arguments';
import type { FirewallIpRule, FirewallRule } from '../../util/firewall/types';
import type { FirewallScope } from '../../util/firewall/scope';
import listFirewallConfigs from '../../util/firewall/list-firewall-configs';
import activateFirewallConfig from '../../util/firewall/activate-firewall-config';
import getScope from '../../util/get-scope';
import { requireProjectContext } from '../../util/projects/require-project-context';
import stamp from '../../util/output/stamp';

/**
 * Plain suggested command with global flags from argv (--cwd, --non-interactive, etc.).
 * Suggested follow-ups must keep targeting the team config, so team scope appends --team-level.
 */
export function withGlobalFlags(
  client: Client,
  commandTemplate: string,
  scope?: FirewallScope
): string {
  const template =
    scope?.type === 'team'
      ? `${commandTemplate} --team-level`
      : commandTemplate;
  return withClientGlobalFlags(client, template, {
    preserveProject: true,
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
        1
      );
      return 1;
    }
    output.error(message);
    return 1;
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
    displayName: project.name,
  };
}

/**
 * User-facing message for firewall API errors. Team scope maps the two 403
 * causes (plan gate, owner-only ACL) to actionable messages; everything else
 * surfaces the server message so gated-feature errors (e.g. 401 Security Plus)
 * stay verbatim.
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
              when: 'fix flags and retry',
            },
          ],
        },
        1
      );
      return 1;
    }
    printError(err);
    return 1;
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
