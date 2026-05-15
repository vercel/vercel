import chalk from 'chalk';
import type Client from '../../../util/client';
import output from '../../../output-manager';
import { ipBlocksUnblockSubcommand } from '../command';
import {
  parseSubcommandArgs,
  ensureProjectLink,
  confirmAction,
  offerAutoPublish,
  resolveIpRule,
  withGlobalFlags,
} from '../shared';
import listFirewallConfigs from '../../../util/firewall/list-firewall-configs';
import patchFirewallDraft from '../../../util/firewall/patch-firewall-draft';
import { getCommandName } from '../../../util/pkg-name';
import stamp from '../../../util/output/stamp';
import { outputAgentError } from '../../../util/agent-output';

export default async function unblock(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(
    argv,
    ipBlocksUnblockSubcommand,
    client,
    'ip-blocks unblock'
  );
  if (typeof parsed === 'number') return parsed;

  const identifier = parsed.args[0];
  if (!identifier) {
    output.error('Missing required argument: <id-or-ip>');
    return 1;
  }

  const link = await ensureProjectLink(client);
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;

  output.spinner(`Fetching IP blocking rules for ${chalk.bold(project.name)}`);

  try {
    const { active, draft } = await listFirewallConfigs(client, project.id, {
      teamId,
    });

    // Resolve against draft (if exists) or active — draft includes draft-added rules
    const currentIps = draft?.ips || active?.ips || [];
    const hostnameFlag = parsed.flags['--hostname'] as string | undefined;
    let matches = resolveIpRule(currentIps, identifier);

    // If --hostname provided, narrow matches by hostname
    if (hostnameFlag && matches.length > 1) {
      const filtered = matches.filter(
        r => r.hostname.toLowerCase() === hostnameFlag.toLowerCase()
      );
      if (filtered.length > 0) {
        matches = filtered;
      }
    }

    if (matches.length === 0) {
      output.error(
        `No IP block found for "${identifier}". Run ${chalk.cyan(getCommandName('firewall ip-blocks list'))} to view all rules.`
      );
      return 1;
    }

    let rule = matches[0];

    // Disambiguate if multiple matches
    if (matches.length > 1) {
      output.stopSpinner();
      if (client.nonInteractive || !client.stdin.isTTY) {
        if (client.nonInteractive) {
          outputAgentError(
            client,
            {
              status: 'error',
              reason: 'ambiguous_match',
              message: `Multiple IP blocks match "${identifier}". Use --hostname to narrow the match or specify the full rule ID.`,
              next: matches.map(r => ({
                command: withGlobalFlags(
                  client,
                  `firewall ip-blocks unblock "${identifier}" --hostname "${r.hostname}" --yes`
                ),
                when: `unblock on ${r.hostname === '*' ? 'all hosts' : r.hostname}`,
              })),
            },
            1
          );
        }
        output.error(
          `Multiple IP blocks match "${identifier}". Use --hostname to narrow the match or specify the full rule ID.`
        );
        return 1;
      }

      const selectedId = await client.input.select({
        message: `Multiple IP blocks match "${identifier}". Select one:`,
        choices: matches.map(r => ({
          value: r.id,
          name: `${r.ip} on ${r.hostname === '*' ? 'all hosts' : r.hostname} (${r.action})${r.notes ? ` — ${r.notes}` : ''}`,
        })),
      });

      const selected = matches.find(r => r.id === selectedId);
      if (!selected) {
        output.error('No rule selected');
        return 1;
      }
      rule = selected;
    }

    const hostnameLabel =
      rule.hostname === '*' || rule.hostname === ''
        ? 'all hosts'
        : rule.hostname;

    output.stopSpinner();

    const confirmed = await confirmAction(
      client,
      parsed.flags['--yes'],
      `Remove IP block for ${chalk.bold(rule.ip)} on ${chalk.bold(hostnameLabel)}?`
    );

    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }

    const unblockStamp = stamp();
    output.spinner('Staging IP block removal');

    // Use the draft data we already fetched (avoid a second API call)
    const hadExistingDraft = draft !== null && draft.changes.length > 0;

    await patchFirewallDraft(
      client,
      project.id,
      {
        action: 'ip.remove',
        id: rule.id,
        value: null,
      },
      { teamId }
    );

    output.log(
      `${chalk.cyan('Success!')} IP block removal for ${chalk.bold(rule.ip)} staged ${chalk.gray(unblockStamp())}`
    );

    await offerAutoPublish(client, project.id, hadExistingDraft, {
      teamId,
      skipPrompts: parsed.flags['--yes'],
    });

    return 0;
  } catch (e: unknown) {
    const error = e as { message?: string };
    const msg = error.message || 'Failed to stage IP block removal';
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: 'error',
        reason: 'api_error',
        message: msg,
        next: [
          {
            command: withGlobalFlags(
              client,
              `firewall ip-blocks unblock ${identifier} --yes`
            ),
          },
        ],
      });
      process.exit(1);
      return 1;
    }
    output.error(msg);
    return 1;
  }
}
