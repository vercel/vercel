import chalk from 'chalk';
import type Client from '../../../util/client';
import output from '../../../output-manager';
import { systemMitigationsResumeSubcommand } from '../command';
import {
  parseSubcommandArgs,
  ensureProjectLink,
  confirmAction,
  withGlobalFlags,
} from '../shared';
import removeBypass from '../../../util/firewall/remove-bypass';
import stamp from '../../../util/output/stamp';
import { outputAgentError } from '../../../util/agent-output';

export default async function resume(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(
    argv,
    systemMitigationsResumeSubcommand,
    client,
    'system-mitigations resume'
  );
  if (typeof parsed === 'number') return parsed;

  // Block agents from resuming system mitigations
  if (client.nonInteractive) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: 'dangerous_operation_requires_user',
        message:
          'Resuming system mitigations affects traffic protection and cannot be performed non-interactively. ' +
          'Agents must not make this change on behalf of a user. ' +
          'The user must run this command interactively in a terminal.',
        next: [
          {
            command: withGlobalFlags(
              client,
              'firewall system-mitigations resume'
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
      'Resuming system mitigations requires interactive confirmation. Please run this command in an interactive terminal.'
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
    `Resume system mitigations for ${chalk.bold(project.name)}?`,
    'Automatic DDoS protection and system-level traffic filtering will be re-enabled immediately.'
  );

  if (!confirmed) {
    output.log('Canceled');
    return 0;
  }

  const resumeStamp = stamp();
  output.spinner('Resuming system mitigations');

  try {
    await removeBypass(
      client,
      project.id,
      {
        allSources: true,
        projectScope: true,
      },
      { teamId }
    );

    output.log(
      `${chalk.cyan('Success!')} System mitigations resumed for ${chalk.bold(project.name)} ${chalk.gray(resumeStamp())}`
    );

    return 0;
  } catch (e: unknown) {
    const error = e as { message?: string };
    const msg = error.message || 'Failed to resume system mitigations';
    output.error(msg);
    return 1;
  }
}
