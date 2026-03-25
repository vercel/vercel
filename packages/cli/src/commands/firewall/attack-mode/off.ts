import chalk from 'chalk';
import type Client from '../../../util/client';
import output from '../../../output-manager';
import { attackModeOffSubcommand } from '../command';
import {
  parseSubcommandArgs,
  ensureProjectLink,
  confirmAction,
  withGlobalFlags,
} from '../shared';
import updateAttackMode from '../../../util/firewall/update-attack-mode';
import stamp from '../../../util/output/stamp';
import { outputAgentError } from '../../../util/agent-output';

export default async function off(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(
    argv,
    attackModeOffSubcommand,
    client
  );
  if (typeof parsed === 'number') return parsed;

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
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: 'error',
        reason: 'api_error',
        message: msg,
        next: [
          {
            command: withGlobalFlags(client, 'firewall attack-mode off --yes'),
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
