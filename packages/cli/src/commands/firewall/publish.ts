import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { publishSubcommand } from './command';
import {
  parseSubcommandArgs,
  confirmAction,
  withGlobalFlags,
  resolveFirewallScope,
  mapFirewallApiError,
} from './shared';
import listFirewallConfigs from '../../util/firewall/list-firewall-configs';
import activateFirewallConfig from '../../util/firewall/activate-firewall-config';
import { formatDiffOutput } from '../../util/firewall/format';
import stamp from '../../util/output/stamp';
import { outputAgentError } from '../../util/agent-output';

export default async function publish(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, publishSubcommand, client);
  if (typeof parsed === 'number') return parsed;

  const scope = await resolveFirewallScope(client, parsed.flags);
  if (typeof scope === 'number') return scope;

  output.spinner(`Fetching draft changes for ${chalk.bold(scope.displayName)}`);

  try {
    const { active, draft } = await listFirewallConfigs(client, scope);

    if (!draft || draft.changes.length === 0) {
      output.warn('No draft changes to publish.');
      return 0;
    }

    const activeRulesMap = new Map((active?.rules || []).map(r => [r.id, r]));

    output.print(
      `\n${chalk.bold(`Changes to be published (${draft.changes.length}):`)}\n\n`
    );
    output.print(formatDiffOutput(draft.changes, activeRulesMap));
    output.print('\n\n');

    const confirmed = await confirmAction(
      client,
      parsed.flags['--yes'],
      'Publish these changes to production?',
      scope.type === 'team'
        ? `This will make them live team-wide for ${chalk.bold(scope.displayName)}.`
        : `This will make them live for ${chalk.bold(scope.displayName)}.`
    );

    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }

    const updateStamp = stamp();
    output.spinner('Publishing to production');

    await activateFirewallConfig(client, scope, 'draft');

    output.log(
      `${chalk.cyan('Success!')} Firewall config published to production ${chalk.gray(updateStamp())}`
    );

    return 0;
  } catch (e: unknown) {
    const msg = mapFirewallApiError(
      e,
      scope,
      'Failed to publish firewall config'
    );
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: 'error',
        reason: 'api_error',
        message: msg,
        next: [
          { command: withGlobalFlags(client, 'firewall publish --yes', scope) },
        ],
      });
      process.exit(1);
      return 1;
    }
    output.error(msg);
    return 1;
  }
}
