import chalk from 'chalk';
import type Client from '../../util/client';
import { requireProjectContext } from '../../util/projects/require-project-context';
import output from '../../output-manager';
import { overviewSubcommand } from './command';
import { parseSubcommandArgs, outputJson, withGlobalFlags } from './shared';
import listFirewallConfigs from '../../util/firewall/list-firewall-configs';
import getBypass from '../../util/firewall/get-bypass';
import {
  formatStatusOutput,
  type AttackModeStatus,
} from '../../util/firewall/format';
import { outputAgentError } from '../../util/agent-output';
import { isAPIError } from '../../util/errors-ts';
import type {
  BypassRule,
  ProjectSecurityResponse,
} from '../../util/firewall/types';

/**
 * Whether an error indicates the endpoint is gated behind the account's plan
 * rather than having genuinely failed. The bypass API responds 404 with
 * "IP Bypass is unavailable for this plan." on plans without the feature.
 *
 * Deliberately narrow: that endpoint checks permissions only after the plan
 * gate, so a 403 means the user lacks access rather than the plan lacking the
 * feature, and must still surface as an error.
 */
function isPlanGatedError(error: unknown): boolean {
  return isAPIError(error) && error.status === 404;
}

/** Return a settled result's value, rethrowing if it rejected. */
function unwrap<T>(result: PromiseSettledResult<T>): T {
  if (result.status === 'rejected') throw result.reason;
  return result.value;
}

export default async function overview(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, overviewSubcommand, client);
  if (typeof parsed === 'number') return parsed;

  const link = await requireProjectContext(
    client,
    'firewall',
    parsed.flags['--project']
  );
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;

  output.spinner(`Fetching firewall overview for ${chalk.bold(project.name)}`);

  try {
    const [configResult, bypassResult, projectResult] =
      await Promise.allSettled([
        listFirewallConfigs(client, project.id, { teamId }),
        getBypass(client, project.id, { teamId }),
        client.fetch<ProjectSecurityResponse>(
          `/v9/projects/${encodeURIComponent(project.id)}`,
          { accountId: teamId }
        ),
      ]);

    // The firewall config and project are required to render anything
    // meaningful, so their failures remain fatal.
    const { active, draft } = unwrap(configResult);
    const freshProject = unwrap(projectResult);

    // Bypass is plan-gated. When it is unavailable the rest of the overview is
    // still useful, so degrade to `null` rather than failing the command.
    let bypass: BypassRule[] | null = null;
    if (bypassResult.status === 'fulfilled') {
      bypass = bypassResult.value.result;
    } else if (!isPlanGatedError(bypassResult.reason)) {
      throw bypassResult.reason;
    }

    const attackMode: AttackModeStatus = {
      enabled: freshProject.security?.attackModeEnabled ?? false,
      activeUntil: freshProject.security?.attackModeActiveUntil,
    };

    if (parsed.flags['--json']) {
      outputJson(client, {
        active,
        draft,
        bypass,
        attackMode,
      });
      return 0;
    }

    output.print('\n');
    output.print(
      formatStatusOutput(
        active,
        draft,
        bypass,
        attackMode,
        freshProject.security?.firewallBypassIps
      )
    );
    output.print('\n\n');

    return 0;
  } catch (e: unknown) {
    const error = e as { message?: string };
    const msg = error.message || 'Failed to fetch firewall overview';
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: 'error',
        reason: 'api_error',
        message: msg,
        next: [{ command: withGlobalFlags(client, 'firewall overview') }],
      });
      process.exit(1);
      return 1;
    }
    output.error(msg);
    return 1;
  }
}
