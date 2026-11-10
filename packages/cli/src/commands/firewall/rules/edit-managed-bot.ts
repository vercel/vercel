import chalk from 'chalk';
import type Client from '../../../util/client';
import output from '../../../output-manager';
import { AGENT_REASON } from '../../../util/agent-output-constants';
import {
  confirmAction,
  detectExistingDraft,
  failFirewall,
  failPriorityProjectGate,
  mapFirewallApiError,
  offerAutoPublish,
  withGlobalFlags,
} from '../shared';
import patchFirewallDraft from '../../../util/firewall/patch-firewall-draft';
import getScope from '../../../util/get-scope';
import {
  buildManagedBotPatch,
  formatManagedBotAction,
  getManagedBotRule,
  managedBotActions,
  managedBotTrafficWarning,
  parseManagedBotAction,
  type ManagedBotRuleId,
} from '../../../util/firewall/managed-bot-rules';
import { formatManagedBotRuleDetail } from '../../../util/firewall/format';
import type { FirewallConfigResponse } from '../../../util/firewall/types';
import type { FirewallScope } from '../../../util/firewall/scope';
import stamp from '../../../util/output/stamp';

const UNSUPPORTED_FLAGS = [
  '--ai',
  '--data',
  '--json',
  '--condition',
  '--name',
  '--description',
  '--duration',
  '--enable',
  '--no-enable',
  '--enabled',
  '--disabled',
  '--rate-limit-algo',
  '--rate-limit-window',
  '--rate-limit-requests',
  '--rate-limit-keys',
  '--rate-limit-action',
  '--redirect-url',
  '--redirect-permanent',
  '--or',
] as const;

export async function editManagedBotRule(
  client: Client,
  opts: {
    id: ManagedBotRuleId;
    flags: Record<string, unknown>;
    scope: FirewallScope;
    config: FirewallConfigResponse | null | undefined;
  }
): Promise<number> {
  const used = UNSUPPORTED_FLAGS.filter(flag => {
    const value = opts.flags[flag];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  });
  if (used.length > 0) {
    const command = `firewall rules update ${opts.id} --action <action>`;
    return failFirewall(client, {
      message: `Can't use ${used.join(', ')} on managed bot rules. Use --action.`,
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      fix: {
        command,
        hint: `Use ${chalk.cyan(withGlobalFlags(client, command, opts.scope))} to change it.`,
        when: 'edit with --action',
      },
    });
  }

  const current = getManagedBotRule(opts.config, opts.id);
  let rawAction = opts.flags['--action'] as string | undefined;
  const hasActionFlag = Boolean(rawAction);
  if (!rawAction) {
    if (client.nonInteractive || !client.stdin.isTTY) {
      const command = `firewall rules update ${opts.id} --action <action>`;
      return failFirewall(client, {
        message: `Specify --action for ${current.name}. Run ${chalk.cyan(withGlobalFlags(client, `firewall rules inspect ${opts.id}`, opts.scope))} to see the current value.`,
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        fix: {
          command,
          hint: `Use ${chalk.cyan(withGlobalFlags(client, command, opts.scope))}.`,
          when: 'set --action',
        },
      });
    }
    output.print(`\n${formatManagedBotRuleDetail(current)}\n\n`);
    rawAction = await client.input.select({
      message: 'Action?',
      choices: managedBotActions(opts.id).map(action => ({
        value: action,
        name: formatManagedBotAction(action),
      })),
    });
  }

  const parsedAction = parseManagedBotAction(opts.id, rawAction);
  if ('error' in parsedAction) {
    const command = `firewall rules update ${opts.id} --action <action>`;
    return failFirewall(client, {
      message: parsedAction.error,
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      fix: {
        command,
        hint: `Use ${chalk.cyan(withGlobalFlags(client, command, opts.scope))}.`,
        when: 'set a valid --action',
      },
    });
  }

  if (parsedAction.action === current.action) {
    output.log(
      `No changes detected. ${current.name} is already ${formatManagedBotAction(current.action)}.`
    );
    return 0;
  }

  if (opts.id === 'bot-id' && parsedAction.action === 'deep-analysis') {
    try {
      const { team } = await getScope(client);
      if (team?.billing?.plan === 'hobby') {
        return failFirewall(client, {
          message: 'BotID Deep Analysis is not available on the Hobby plan.',
          reason: AGENT_REASON.PLAN_UPGRADE_REQUIRED,
        });
      }
    } catch {
      // If we can't read the plan, the API will reject Hobby.
    }
  }

  const warning = managedBotTrafficWarning(
    opts.id,
    current.action,
    parsedAction.action
  );

  // Flag path has not shown the resolved rule yet. Interactive already
  // printed the current detail before Action?, so reprinting Rule/ID here
  // would restate them.
  if (hasActionFlag) {
    output.print(
      `\n${formatManagedBotRuleDetail({ ...current, action: parsedAction.action })}\n\n`
    );
  }

  const confirmed = await confirmAction(
    client,
    opts.flags['--yes'] as boolean,
    `Save ${current.name} → ${formatManagedBotAction(parsedAction.action)}?`,
    warning
  );
  if (!confirmed) {
    output.log('Canceled');
    return 0;
  }

  const editStamp = stamp();
  output.spinner('Staging changes');

  try {
    const hadExistingDraft = await detectExistingDraft(client, opts.scope);

    await patchFirewallDraft(
      client,
      opts.scope,
      buildManagedBotPatch(opts.id, parsedAction.action)
    );

    output.log(
      `${chalk.cyan('Success!')} ${current.name} updated to ${chalk.bold(formatManagedBotAction(parsedAction.action))} and staged ${chalk.gray(editStamp())}`
    );

    if (opts.id === 'bot-id' && parsedAction.action === 'deep-analysis') {
      output.print(
        `\n  ${chalk.dim('Install the BotID SDK in your app:')} ${chalk.cyan('npm i botid')}\n`
      );
    }

    await offerAutoPublish(client, opts.scope, hadExistingDraft, {
      skipPrompts: opts.flags['--yes'] as boolean,
    });

    return 0;
  } catch (e: unknown) {
    output.stopSpinner();
    const priority = failPriorityProjectGate(client, e, opts.scope);
    if (priority !== null) return priority;
    const command = `firewall rules update ${opts.id} --action ${parsedAction.action}`;
    return failFirewall(client, {
      message: mapFirewallApiError(
        e,
        opts.scope,
        'Failed to stage bot rule changes'
      ),
      nextCommand: command,
      reason: AGENT_REASON.API_ERROR,
    });
  }
}
