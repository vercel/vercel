import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import output from '../../output-manager';
import { outputAgentError, buildCommandWithYes } from '../../util/agent-output';
import { AGENT_STATUS, AGENT_REASON } from '../../util/agent-output-constants';
import { getGlobalFlagsOnlyFromArgs } from '../../util/arg-common';
import type { Command } from '../help';
import type { FirewallIpRule, FirewallRule } from '../../util/firewall/types';
import listFirewallConfigs from '../../util/firewall/list-firewall-configs';
import activateFirewallConfig from '../../util/firewall/activate-firewall-config';
import stamp from '../../util/output/stamp';

export interface ParsedSubcommand {
  args: string[];
  flags: { [key: string]: any };
}

/**
 * Plain suggested command with global flags from argv (--cwd, --non-interactive, etc.).
 */
export function withGlobalFlags(
  client: Client,
  commandTemplate: string
): string {
  const flags = getGlobalFlagsOnlyFromArgs(client.argv.slice(2));
  return getCommandNamePlain(`${commandTemplate} ${flags.join(' ')}`.trim());
}

export async function parseSubcommandArgs(
  argv: string[],
  command: Command,
  client?: Client,
  commandPath?: string
): Promise<ParsedSubcommand | number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(command.options);
  const fullPath = commandPath || command.name;

  try {
    // @ts-expect-error - TypeScript complains about the flags specification type
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    if (client?.nonInteractive) {
      const rawMessage = err instanceof Error ? err.message : String(err);
      const flags = getGlobalFlagsOnlyFromArgs(client.argv.slice(2));
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

export async function ensureProjectLink(client: Client) {
  const link = await getLinkedProject(client);

  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    if (client.nonInteractive) {
      const flags = getGlobalFlagsOnlyFromArgs(client.argv.slice(2));
      const cmd = getCommandNamePlain(`link ${flags.join(' ')}`.trim());
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.NOT_LINKED,
          userActionRequired: true,
          message:
            'Your codebase is not linked to a Vercel project. Run link first, then retry firewall commands.',
          next: [
            {
              command: cmd,
              when: 'to link this directory to a project',
            },
          ],
        },
        1
      );
      return 1;
    }
    output.error(
      `Your codebase isn't linked to a project on Vercel. Run ${getCommandName('link')} to begin.`
    );
    return 1;
  }

  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;

  return link;
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
  projectId: string,
  teamId?: string
): Promise<boolean> {
  const { draft } = await listFirewallConfigs(client, projectId, { teamId });
  return draft !== null && draft.changes.length > 0;
}

/**
 * After a draft mutation, offer to publish immediately.
 * Mirrors routes' offerAutoPromote pattern.
 */
export async function offerAutoPublish(
  client: Client,
  projectId: string,
  hadExistingDraft: boolean,
  opts: { teamId?: string; skipPrompts?: boolean }
): Promise<void> {
  output.print(
    `\n  ${chalk.gray(`This change is staged. Run ${chalk.cyan(getCommandName('firewall publish'))} to make it live, or ${chalk.cyan(getCommandName('firewall discard'))} to undo.`)}\n`
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
        await activateFirewallConfig(client, projectId, 'draft', {
          teamId: opts.teamId,
        });
        output.log(
          `${chalk.cyan('Published')} to production ${chalk.gray(publishStamp())}`
        );
      } catch (e: unknown) {
        const err = e as { message?: string };
        output.error(
          `Failed to publish to production: ${err.message || 'Unknown error'}`
        );
      }
    }
  } else if (hadExistingDraft) {
    output.warn(
      `There are other draft changes. Review with ${chalk.cyan(getCommandName('firewall diff'))} before publishing.`
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
