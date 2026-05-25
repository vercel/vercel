import chalk from 'chalk';
import type Client from '../../../util/client';
import output from '../../../output-manager';
import { attackModeEnableSubcommand } from '../command';
import {
  parseSubcommandArgs,
  ensureProjectLink,
  confirmAction,
  withGlobalFlags,
} from '../shared';
import updateAttackMode from '../../../util/firewall/update-attack-mode';
import stamp from '../../../util/output/stamp';
import { outputAgentError } from '../../../util/agent-output';

const DURATION_MAP: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};

const VALID_DURATIONS = Object.keys(DURATION_MAP);

export default async function enable(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(
    argv,
    attackModeEnableSubcommand,
    client,
    'attack-mode enable'
  );
  if (typeof parsed === 'number') return parsed;

  // Block agents from enabling attack mode — this challenges ALL visitors
  if (client.nonInteractive) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: 'dangerous_operation_requires_user',
        message:
          'Enabling attack mode challenges all visitors and cannot be performed non-interactively. ' +
          'Agents must not make this change on behalf of a user. ' +
          'The user must run this command interactively in a terminal to review the impact and confirm.',
        next: [
          {
            command: withGlobalFlags(client, 'firewall attack-mode enable'),
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
      'Enabling attack mode requires interactive confirmation. Please run this command in an interactive terminal.'
    );
    return 1;
  }

  const duration = (parsed.flags['--duration'] as string) || '1h';

  if (!DURATION_MAP[duration]) {
    output.error(
      `Invalid duration "${duration}". Valid options: ${VALID_DURATIONS.join(', ')}`
    );
    return 1;
  }

  const link = await ensureProjectLink(client);
  if (typeof link === 'number') return link;

  const { project } = link;

  const confirmed = await confirmAction(
    client,
    parsed.flags['--yes'],
    `Enable attack mode for ${chalk.bold(project.name)} (${chalk.bold(duration)})?`,
    `${chalk.yellow('Warning:')} Every visitor will be shown a verification challenge before accessing your site. This may impact legitimate traffic and SEO. Attack mode automatically expires after ${duration}.`
  );

  if (!confirmed) {
    output.log('Canceled');
    return 0;
  }

  const updateStamp = stamp();
  output.spinner('Enabling attack mode');

  try {
    await updateAttackMode(client, {
      projectId: project.id,
      attackModeEnabled: true,
      attackModeActiveUntil: Date.now() + DURATION_MAP[duration],
    });

    output.log(
      `${chalk.cyan('Success!')} Attack mode enabled for ${chalk.bold(duration)} ${chalk.gray(updateStamp())}`
    );

    return 0;
  } catch (e: unknown) {
    const error = e as { message?: string };
    const msg = error.message || 'Failed to enable attack mode';
    output.error(msg);
    return 1;
  }
}
