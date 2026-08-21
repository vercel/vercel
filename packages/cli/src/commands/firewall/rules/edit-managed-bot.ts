import chalk from 'chalk';
import type Client from '../../../util/client';
import output from '../../../output-manager';
import {
  confirmAction,
  detectExistingDraft,
  failFirewall,
  offerAutoPublish,
  withGlobalFlags,
} from '../shared';
import patchFirewallDraft from '../../../util/firewall/patch-firewall-draft';
import getScope from '../../../util/get-scope';
import {
  buildManagedBotPatch,
  formatManagedBotAction,
  getManagedBotRule,
  managedBotNeedsLouderConfirm,
  parseManagedBotAction,
  type ManagedBotRuleId,
} from '../../../util/firewall/managed-bot-rules';
import { formatManagedBotRuleDetail } from '../../../util/firewall/format';
import type { FirewallConfigResponse } from '../../../util/firewall/types';
import stamp from '../../../util/output/stamp';

const UNSUPPORTED_FLAGS = [
  '--ai',
  '--json',
  '--condition',
  '--name',
  '--description',
  '--duration',
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
    project: { id: string; name: string };
    teamId: string | undefined;
    config: FirewallConfigResponse | null | undefined;
  }
): Promise<number> {
  const used = UNSUPPORTED_FLAGS.filter(flag => {
    const value = opts.flags[flag];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  });
  if (used.length > 0) {
    return failFirewall(
      client,
      `Can't use ${used.join(', ')} on managed bot rules. Use --action.`,
      `firewall rules edit ${opts.id} --action <action>`
    );
  }

  const current = getManagedBotRule(opts.config, opts.id);
  const rawAction = opts.flags['--action'] as string | undefined;
  if (!rawAction) {
    return failFirewall(
      client,
      `Specify --action for ${current.name}. Run \`${withGlobalFlags(client, `firewall rules inspect ${opts.id}`)}\` to see the current value.`,
      `firewall rules edit ${opts.id} --action <action>`
    );
  }

  const parsedAction = parseManagedBotAction(opts.id, rawAction);
  if ('error' in parsedAction) {
    return failFirewall(
      client,
      parsedAction.error,
      `firewall rules edit ${opts.id} --action <action>`
    );
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
        return failFirewall(
          client,
          'BotID Deep Analysis is not available on the Hobby plan.',
          'firewall bot-management'
        );
      }
    } catch {
      // If we can't read the plan, the API will reject Hobby.
    }
  }

  output.print(
    `\n${formatManagedBotRuleDetail({ ...current, action: parsedAction.action })}\n\n`
  );

  const warning = managedBotNeedsLouderConfirm(
    opts.id,
    current.action,
    parsedAction.action
  );
  const confirmed = await confirmAction(
    client,
    opts.flags['--yes'] as boolean,
    warning
      ? `${warning} Save ${current.name} → ${formatManagedBotAction(parsedAction.action)}?`
      : `Save ${current.name} → ${formatManagedBotAction(parsedAction.action)}?`
  );
  if (!confirmed) {
    output.log('Canceled');
    return 0;
  }

  const editStamp = stamp();
  output.spinner('Staging changes');

  try {
    const hadExistingDraft = await detectExistingDraft(
      client,
      opts.project.id,
      opts.teamId
    );

    await patchFirewallDraft(
      client,
      opts.project.id,
      buildManagedBotPatch(opts.id, parsedAction.action),
      { teamId: opts.teamId }
    );

    output.log(
      `${chalk.cyan('Success!')} ${current.name} updated to ${chalk.bold(formatManagedBotAction(parsedAction.action))} and staged ${chalk.gray(editStamp())}`
    );

    if (opts.id === 'bot-id' && parsedAction.action === 'deep-analysis') {
      output.print(
        `\n  ${chalk.dim('Install the BotID SDK in your app:')} ${chalk.cyan('npm i botid')}\n`
      );
    }

    await offerAutoPublish(client, opts.project.id, hadExistingDraft, {
      teamId: opts.teamId,
      skipPrompts: opts.flags['--yes'] as boolean,
    });

    return 0;
  } catch (e: unknown) {
    const error = e as { message?: string };
    return failFirewall(
      client,
      error.message || 'Failed to stage bot rule changes',
      `firewall rules edit ${opts.id} --action ${parsedAction.action}`
    );
  }
}
