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
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: 'error',
        reason: 'api_error',
        message: msg,
        next: [
          {
            command: withGlobalFlags(
              client,
              'firewall system-mitigations resume --yes'
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
