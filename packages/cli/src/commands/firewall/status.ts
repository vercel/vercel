import chalk from 'chalk';
import type Client from '../../util/client';
import { requireProjectContext } from '../../util/projects/require-project-context';
import output from '../../output-manager';
import { statusSubcommand } from './command';
import { parseSubcommandArgs, outputJson, failFirewallApi } from './shared';
import listFirewallConfigs from '../../util/firewall/list-firewall-configs';
import { projectScope } from '../../util/firewall/scope';
import getBypass from '../../util/firewall/get-bypass';
import {
  formatStatusOutput,
  getFirewallPipeline,
  getBotProtectionConfig,
  owaspJsonStatus,
  type AttackModeStatus,
} from '../../util/firewall/format';
import { fetchPlanInfo } from '../../util/firewall/interactive-helpers';
import {
  readBypassResult,
  resolveFirewallEntitlements,
} from '../../util/firewall/plan-gate';
import type { ProjectSecurityResponse } from '../../util/firewall/types';

/** Return a settled result's value, rethrowing if it rejected. */
function unwrap<T>(result: PromiseSettledResult<T>): T {
  if (result.status === 'rejected') throw result.reason;
  return result.value;
}

export default async function status(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, statusSubcommand, client);
  if (typeof parsed === 'number') return parsed;

  const asJson = Boolean(parsed.flags['--json']);
  const suggestedCommand = `firewall status${asJson ? ' --json' : ''}`;

  const link = await requireProjectContext(
    client,
    'firewall',
    parsed.flags['--project']
  );
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;

  output.spinner(`Fetching firewall status for ${chalk.bold(project.name)}`);

  try {
    const [configResult, bypassResult, projectResult, planResult] =
      await Promise.allSettled([
        listFirewallConfigs(client, projectScope(project, teamId)),
        getBypass(client, project.id, { teamId }),
        client.fetch<ProjectSecurityResponse>(
          `/v9/projects/${encodeURIComponent(project.id)}`,
          { accountId: teamId }
        ),
        fetchPlanInfo(client),
      ]);

    // The firewall config and project are required to render anything
    // meaningful, so their failures remain fatal.
    const { active, draft } = unwrap(configResult);
    const freshProject = unwrap(projectResult);

    // Bypass is plan-gated. When it is unavailable the rest of the status is
    // still useful, so degrade to `null` rather than failing the command.
    const { bypass, unavailable: bypassUnavailable } =
      readBypassResult(bypassResult);

    // Plan info only decides how OWASP is labelled, so a failure here should
    // not fail the command; `fetchPlanInfo` already defaults on its own errors.
    // Security+ can be enabled on this project alone, which the team-scoped
    // plan info cannot see.
    const planInfo = resolveFirewallEntitlements(
      planResult.status === 'fulfilled' ? planResult.value : undefined,
      freshProject
    );

    const attackMode: AttackModeStatus = {
      enabled: freshProject.security?.attackModeEnabled ?? false,
      activeUntil: freshProject.security?.attackModeActiveUntil,
    };

    if (asJson) {
      const botProtection = getBotProtectionConfig(active?.managedRules);
      const aiBots = active?.managedRules?.ai_bots;
      outputJson(client, {
        firewallEnabled: active?.firewallEnabled ?? false,
        attackMode,
        bypass,
        ...(bypassUnavailable ? { bypassUnavailable } : {}),
        botProtection: {
          enabled: botProtection?.active ?? false,
          action: botProtection?.action ?? null,
        },
        aiBots: {
          enabled: aiBots?.active ?? false,
          action: aiBots?.action ?? null,
        },
        owasp: owaspJsonStatus(active?.managedRules?.owasp, planInfo),
        ...getFirewallPipeline({
          active,
          bypass,
          attackMode,
          planInfo,
          firewallBypassIps: freshProject.security?.firewallBypassIps,
        }),
        rules: {
          active: active?.rules.filter(r => r.active).length ?? 0,
          inactive: active?.rules.filter(r => !r.active).length ?? 0,
          total: active?.rules.length ?? 0,
        },
        ipBlocks: active?.ips.length ?? 0,
        draftChanges: draft?.changes.length ?? 0,
      });
      return 0;
    }

    output.print('\n');
    output.print(
      formatStatusOutput({
        active,
        draft,
        bypass,
        attackMode,
        planInfo,
        firewallBypassIps: freshProject.security?.firewallBypassIps,
      })
    );
    output.print('\n\n');

    return 0;
  } catch (e: unknown) {
    return failFirewallApi(client, e, {
      fallback: 'Failed to fetch firewall status',
      nextCommand: suggestedCommand,
      permissionAction: 'read firewall status',
      projectName: project.name,
      timeoutJob: 'firewall status',
    });
  } finally {
    output.stopSpinner();
  }
}
