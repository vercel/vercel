import chalk from 'chalk';
import type Client from '../../../util/client';
import output from '../../../output-manager';
import { systemMitigationsPauseSubcommand } from '../command';
import {
  parseSubcommandArgs,
  ensureProjectLink,
  confirmAction,
  withGlobalFlags,
} from '../shared';
import addBypass from '../../../util/firewall/add-bypass';
import stamp from '../../../util/output/stamp';
import { outputAgentError } from '../../../util/agent-output';

export default async function pause(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(
    argv,
    systemMitigationsPauseSubcommand,
    client,
    'system-mitigations pause'
  );
  if (typeof parsed === 'number') return parsed;

  // Block agents from pausing system mitigations — this disables DDoS protection
  if (client.nonInteractive) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: 'dangerous_operation_requires_user',
        message:
          'Pausing system mitigations disables DDoS protection and cannot be performed non-interactively. ' +
          'Agents must not make this change on behalf of a user. ' +
          'The user must run this command interactively in a terminal to review the impact and confirm.',
        next: [
          {
            command: withGlobalFlags(
              client,
              'firewall system-mitigations pause'
            ),
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
      'Pausing system mitigations requires interactive confirmation. Please run this command in an interactive terminal.'
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
    `Pause system mitigations for ${chalk.bold(project.name)}?`,
    `${chalk.yellow('Warning:')} This disables automatic DDoS protection, bot mitigation, and system-level traffic filtering for 24 hours. Your project will be unprotected from automated attacks during this period. Auto-resumes after 24 hours.`
  );

  if (!confirmed) {
    output.log('Canceled');
    return 0;
  }

  const pauseStamp = stamp();
  output.spinner('Pausing system mitigations');

  try {
    await addBypass(
      client,
      project.id,
      {
        allSources: true,
        projectScope: true,
      },
      { teamId }
    );

    output.log(
      `${chalk.cyan('Success!')} System mitigations paused for ${chalk.bold(project.name)}. Auto-resumes in 24 hours. ${chalk.gray(pauseStamp())}`
    );

    return 0;
  } catch (e: unknown) {
    const error = e as { message?: string };
    const msg = error.message || 'Failed to pause system mitigations';
    output.error(msg);
    return 1;
  }
}
