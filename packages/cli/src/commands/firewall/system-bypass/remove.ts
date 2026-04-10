import chalk from 'chalk';
import type Client from '../../../util/client';
import output from '../../../output-manager';
import { systemBypassRemoveSubcommand } from '../command';
import {
  parseSubcommandArgs,
  ensureProjectLink,
  confirmAction,
  withGlobalFlags,
} from '../shared';
import removeBypass from '../../../util/firewall/remove-bypass';
import {
  validateBypassIp,
  validateHostname,
} from '../../../util/firewall/validate';
import { getCommandName } from '../../../util/pkg-name';
import stamp from '../../../util/output/stamp';
import { outputAgentError } from '../../../util/agent-output';

export default async function remove(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(
    argv,
    systemBypassRemoveSubcommand,
    client,
    'system-bypass remove'
  );
  if (typeof parsed === 'number') return parsed;

  const ip = parsed.args[0];
  if (!ip) {
    output.error('Missing required argument: <ip>');
    return 1;
  }

  // Validate IP/CIDR
  const ipError = validateBypassIp(ip);
  if (ipError) {
    output.error(ipError);
    return 1;
  }

  const domain = parsed.flags['--domain'] as string | undefined;

  // Validate domain if provided
  if (domain) {
    const domainError = validateHostname(domain);
    if (domainError) {
      output.error(domainError);
      return 1;
    }
  }

  const link = await ensureProjectLink(client);
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;

  const scopeLabel = domain || 'all domains';

  const confirmed = await confirmAction(
    client,
    parsed.flags['--yes'],
    `Remove system bypass for ${chalk.bold(ip)} on ${chalk.bold(scopeLabel)}?`
  );

  if (!confirmed) {
    output.log('Canceled');
    return 0;
  }

  const removeStamp = stamp();
  output.spinner('Removing system bypass rule');

  try {
    await removeBypass(
      client,
      project.id,
      {
        sourceIp: ip,
        ...(domain ? { domain } : { projectScope: true }),
      },
      { teamId }
    );

    output.log(
      `${chalk.cyan('Success!')} Removed system bypass for ${chalk.bold(ip)} ${chalk.gray(removeStamp())}`
    );

    return 0;
  } catch (e: unknown) {
    const error = e as { status?: number; message?: string };
    if (error.status === 404) {
      output.error(
        `No bypass rule found for ${chalk.bold(ip)}. Run ${chalk.cyan(getCommandName('firewall system-bypass list'))} to view all rules.`
      );
      return 1;
    }
    const msg = error.message || 'Failed to remove bypass rule';
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: 'error',
        reason: 'api_error',
        message: msg,
        next: [
          {
            command: withGlobalFlags(
              client,
              `firewall system-bypass remove ${ip}${domain ? ` --domain ${domain}` : ''} --yes`
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
