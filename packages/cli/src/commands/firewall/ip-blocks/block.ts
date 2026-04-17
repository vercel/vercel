import chalk from 'chalk';
import type Client from '../../../util/client';
import output from '../../../output-manager';
import { ipBlocksBlockSubcommand } from '../command';
import {
  parseSubcommandArgs,
  ensureProjectLink,
  confirmAction,
  detectExistingDraft,
  offerAutoPublish,
  withGlobalFlags,
} from '../shared';
import patchFirewallDraft from '../../../util/firewall/patch-firewall-draft';
import {
  validateBlockingIp,
  validateHostname,
  validateNote,
} from '../../../util/firewall/validate';
import stamp from '../../../util/output/stamp';
import { outputAgentError } from '../../../util/agent-output';

export default async function block(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(
    argv,
    ipBlocksBlockSubcommand,
    client,
    'ip-blocks block'
  );
  if (typeof parsed === 'number') return parsed;

  const ip = parsed.args[0];
  if (!ip) {
    output.error('Missing required argument: <ip>');
    return 1;
  }

  // Validate IP/CIDR
  const ipError = validateBlockingIp(ip);
  if (ipError) {
    output.error(ipError);
    return 1;
  }

  const hostnameFlag = parsed.flags['--hostname'] as string | undefined;
  const hostname = hostnameFlag && hostnameFlag !== '' ? hostnameFlag : '*';
  const notes = parsed.flags['--notes'] as string | undefined;

  // Validate hostname if not wildcard
  if (hostname !== '*') {
    const hostnameError = validateHostname(hostname);
    if (hostnameError) {
      output.error(hostnameError);
      return 1;
    }
  }

  // Validate note length
  if (notes) {
    const noteError = validateNote(notes);
    if (noteError) {
      output.error(noteError);
      return 1;
    }
  }

  const link = await ensureProjectLink(client);
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;

  const hostnameLabel =
    hostname === '*' || hostname === '' ? 'all hosts' : hostname;
  const confirmed = await confirmAction(
    client,
    parsed.flags['--yes'],
    `Block ${chalk.bold(ip)} on ${chalk.bold(hostnameLabel)}?`
  );

  if (!confirmed) {
    output.log('Canceled');
    return 0;
  }

  const blockStamp = stamp();
  output.spinner('Staging IP block rule');

  try {
    const hadExistingDraft = await detectExistingDraft(
      client,
      project.id,
      teamId
    );

    await patchFirewallDraft(
      client,
      project.id,
      {
        action: 'ip.insert',
        id: null,
        value: {
          ip,
          hostname,
          action: 'deny',
          ...(notes ? { notes } : {}),
        },
      },
      { teamId }
    );

    output.log(
      `${chalk.cyan('Success!')} IP block for ${chalk.bold(ip)} on ${chalk.bold(hostnameLabel)} staged ${chalk.gray(blockStamp())}`
    );

    await offerAutoPublish(client, project.id, hadExistingDraft, {
      teamId,
      skipPrompts: parsed.flags['--yes'],
    });

    return 0;
  } catch (e: unknown) {
    const error = e as { message?: string };
    const msg = error.message || 'Failed to stage IP block rule';
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: 'error',
        reason: 'api_error',
        message: msg,
        next: [
          {
            command: withGlobalFlags(
              client,
              `firewall ip-blocks block ${ip}${hostname !== '*' ? ` --hostname ${hostname}` : ''} --yes`
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
