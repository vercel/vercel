import chalk from 'chalk';
import type Client from '../../../util/client';
import output from '../../../output-manager';
import { systemBypassAddSubcommand } from '../command';
import {
  parseSubcommandArgs,
  ensureProjectLink,
  confirmAction,
  withGlobalFlags,
} from '../shared';
import addBypass from '../../../util/firewall/add-bypass';
import stamp from '../../../util/output/stamp';
import { outputAgentError } from '../../../util/agent-output';

export default async function add(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(
    argv,
    systemBypassAddSubcommand,
    client
  );
  if (typeof parsed === 'number') return parsed;

  const ip = parsed.args[0];
  if (!ip) {
    output.error('Missing required argument: <ip>');
    return 1;
  }

  const link = await ensureProjectLink(client);
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;

  const domain = parsed.flags['--domain'] as string | undefined;
  const notes = parsed.flags['--notes'] as string | undefined;

  const scopeLabel = domain || 'all domains';
  const confirmed = await confirmAction(
    client,
    parsed.flags['--yes'],
    `Add system bypass for ${chalk.bold(ip)} on ${chalk.bold(scopeLabel)}?`
  );

  if (!confirmed) {
    output.log('Canceled');
    return 0;
  }

  const addStamp = stamp();
  output.spinner('Adding system bypass rule');

  try {
    await addBypass(
      client,
      project.id,
      {
        sourceIp: ip,
        ...(domain ? { domain } : { projectScope: true }),
        ...(notes ? { note: notes } : {}),
      },
      { teamId }
    );

    output.log(
      `${chalk.cyan('Success!')} Added system bypass for ${chalk.bold(ip)} on ${chalk.bold(scopeLabel)} ${chalk.gray(addStamp())}`
    );

    return 0;
  } catch (e: unknown) {
    const error = e as { message?: string };
    const msg = error.message || 'Failed to add bypass rule';
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: 'error',
        reason: 'api_error',
        message: msg,
        next: [
          {
            command: withGlobalFlags(
              client,
              `firewall system-bypass add ${ip} --yes`
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
