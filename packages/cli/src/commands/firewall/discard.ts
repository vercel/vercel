import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { discardSubcommand } from './command';
import {
  parseSubcommandArgs,
  confirmAction,
  withGlobalFlags,
  resolveFirewallScope,
  mapFirewallApiError,
} from './shared';
import listFirewallConfigs from '../../util/firewall/list-firewall-configs';
import deleteFirewallDraft from '../../util/firewall/delete-firewall-draft';
import { formatDiffOutput } from '../../util/firewall/format';
import stamp from '../../util/output/stamp';
import { outputAgentError } from '../../util/agent-output';

export default async function discard(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, discardSubcommand, client);
  if (typeof parsed === 'number') return parsed;

  const scope = await resolveFirewallScope(client, parsed.flags);
  if (typeof scope === 'number') return scope;

  output.spinner(`Fetching draft changes for ${chalk.bold(scope.displayName)}`);

  try {
    const { active, draft } = await listFirewallConfigs(client, scope);

    if (!draft || draft.changes.length === 0) {
      output.warn('No draft changes to discard.');
      return 0;
    }

    const activeRulesMap = new Map((active?.rules || []).map(r => [r.id, r]));

    output.print(
      `\n${chalk.bold(`Changes to be discarded (${draft.changes.length}):`)}\n\n`
    );
    output.print(formatDiffOutput(draft.changes, activeRulesMap));
    output.print('\n\n');

    const confirmed = await confirmAction(
      client,
      parsed.flags['--yes'],
      'Discard all draft changes?',
      'This action cannot be undone.'
    );

    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }

    const updateStamp = stamp();
    output.spinner('Discarding draft changes');

    await deleteFirewallDraft(client, scope);

    output.log(
      `${chalk.cyan('Success!')} Draft changes discarded ${chalk.gray(updateStamp())}`
    );

    return 0;
  } catch (e: unknown) {
    const msg = mapFirewallApiError(
      e,
      scope,
      'Failed to discard draft changes'
    );
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: 'error',
        reason: 'api_error',
        message: msg,
        next: [
          { command: withGlobalFlags(client, 'firewall discard --yes', scope) },
        ],
      });
      process.exit(1);
      return 1;
    }
    output.error(msg);
    return 1;
  }
}
