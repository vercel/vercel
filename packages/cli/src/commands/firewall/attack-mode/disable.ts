import chalk from 'chalk';
import type Client from '../../../util/client';
import output from '../../../output-manager';
import { attackModeDisableSubcommand } from '../command';
import {
  parseSubcommandArgs,
  ensureProjectLink,
  confirmAction,
  withGlobalFlags,
} from '../shared';
import updateAttackMode from '../../../util/firewall/update-attack-mode';
import stamp from '../../../util/output/stamp';
import { outputAgentError } from '../../../util/agent-output';

export default async function disable(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(
    argv,
    attackModeDisableSubcommand,
    client,
    'attack-mode disable'
  );
  if (typeof parsed === 'number') return parsed;

  // Block agents from disabling attack mode
  if (client.nonInteractive) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: 'dangerous_operation_requires_user',
        message:
          'Disabling attack mode affects traffic handling and cannot be performed non-interactively. ' +
          'Agents must not make this change on behalf of a user. ' +
          'The user must run this command interactively in a terminal.',
        next: [
          {
            command: withGlobalFlags(client, 'firewall attack-mode disable'),
            when: 'user runs this command interactively',
          },
        ],
      },
      1
    );
    return 1;
  }

  if (!client.stdin.isTTY) {
    output.error(
      'Disabling attack mode requires interactive confirmation. Please run this command in an interactive terminal.'
    );
    return 1;
  }

  const link = await ensureProjectLink(client);
  if (typeof link === 'number') return link;

  const { project } = link;

  const confirmed = await confirmAction(
    client,
    parsed.flags['--yes'],
    `Disable attack mode for ${chalk.bold(project.name)}?`,
    'Visitors will no longer be shown a verification challenge.'
  );

  if (!confirmed) {
    output.log('Canceled');
    return 0;
  }

  const updateStamp = stamp();
  output.spinner('Disabling attack mode');

  try {
    await updateAttackMode(client, {
      projectId: project.id,
      attackModeEnabled: false,
    });

    output.log(
      `${chalk.cyan('Success!')} Attack mode disabled ${chalk.gray(updateStamp())}`
    );

    return 0;
  } catch (e: unknown) {
    const error = e as { message?: string };
    const msg = error.message || 'Failed to disable attack mode';
    output.error(msg);
    return 1;
  }
}
