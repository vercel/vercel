import chalk from 'chalk';
import type Client from '../../../util/client';
import output from '../../../output-manager';
import { attackModeOnSubcommand } from '../command';
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

export default async function on(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(
    argv,
    attackModeOnSubcommand,
    client
  );
  if (typeof parsed === 'number') return parsed;

  const duration = (parsed.flags['--duration'] as string) || '1h';

  if (!DURATION_MAP[duration]) {
    output.error(
      `Invalid duration "${duration}". Valid options: ${VALID_DURATIONS.join(', ')}`
    );
    return 1;
  }

  const link = await ensureProjectLink(client);
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;

  const confirmed = await confirmAction(
    client,
    parsed.flags['--yes'],
    `Enable attack mode for ${chalk.bold(duration)}? All requests will be challenged.`
  );

  if (!confirmed) {
    output.log('Canceled');
    return 0;
  }

  const updateStamp = stamp();
  output.spinner('Enabling attack mode');

  try {
    // Set currentTeam for the API call (attack-mode uses team context from client)
    client.config.currentTeam = teamId;

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
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: 'error',
        reason: 'api_error',
        message: msg,
        next: [
          {
            command: withGlobalFlags(client, 'firewall attack-mode on --yes'),
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
