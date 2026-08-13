import chalk from 'chalk';
import type Client from '../../util/client';
import { requireProjectContext } from '../../util/projects/require-project-context';
import output from '../../output-manager';
import { restoreSubcommand } from './command';
import { parseSubcommandArgs, confirmAction, withGlobalFlags } from './shared';
import getFirewallConfig from '../../util/firewall/get-firewall-config';
import activateFirewallConfig from '../../util/firewall/activate-firewall-config';
import formatDate from '../../util/format-date';
import stamp from '../../util/output/stamp';
import { outputAgentError } from '../../util/agent-output';

export default async function restore(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, restoreSubcommand, client);
  if (typeof parsed === 'number') return parsed;

  const configVersion = parsed.args[0];

  // Validate the version argument locally before any remote calls.
  if (!configVersion) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'missing_arguments',
          message: 'A configuration version is required.',
          next: [
            {
              command: withGlobalFlags(
                client,
                'firewall restore <config-version>'
              ),
              when: 'replace <config-version>',
            },
          ],
        },
        1
      );
      return 1;
    }
    output.error(
      `A configuration version is required. Usage: ${withGlobalFlags(client, 'firewall restore <config-version>')}`
    );
    return 1;
  }

  if (!/^\d+$/.test(configVersion) || Number(configVersion) < 1) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'invalid_arguments',
          message: `Invalid configuration version "${configVersion}". Expected a positive integer.`,
          next: [
            {
              command: withGlobalFlags(
                client,
                'firewall restore <config-version>'
              ),
              when: 'provide a valid version number',
            },
          ],
        },
        1
      );
      return 1;
    }
    output.error(
      `Invalid configuration version "${configVersion}". Expected a positive integer.`
    );
    return 1;
  }

  const link = await requireProjectContext(
    client,
    'firewall',
    parsed.flags['--project']
  );
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;

  output.spinner(
    `Fetching configuration version ${chalk.bold(configVersion)} for ${chalk.bold(project.name)}`
  );

  let config;
  try {
    config = await getFirewallConfig(client, project.id, configVersion, {
      teamId,
    });
  } catch (e: unknown) {
    output.stopSpinner();
    const error = e as { status?: number; message?: string };
    const notFound = error.status === 404;
    const msg = notFound
      ? `Firewall configuration version ${configVersion} was not found for ${chalk.bold(project.name)}.`
      : error.message || 'Failed to fetch firewall configuration';
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: 'error',
        reason: notFound ? 'not_found' : 'api_error',
        message: msg,
        next: [{ command: withGlobalFlags(client, 'firewall overview') }],
      });
      process.exit(1);
      return 1;
    }
    output.error(msg);
    return 1;
  }

  output.stopSpinner();

  output.print(
    `\n${chalk.bold(`Restore firewall configuration version ${configVersion}`)}\n`
  );
  if (config.updatedAt) {
    output.print(`  Published ${formatDate(config.updatedAt)}\n`);
  }
  output.print('\n');

  const confirmed = await confirmAction(
    client,
    parsed.flags['--yes'],
    `Restore version ${configVersion} to production?`,
    `This will replace the active firewall configuration for ${chalk.bold(project.name)}.`
  );

  if (!confirmed) {
    output.log('Canceled');
    return 0;
  }

  const updateStamp = stamp();
  output.spinner('Restoring configuration to production');

  try {
    await activateFirewallConfig(client, project.id, configVersion, {
      teamId,
    });
  } catch (e: unknown) {
    const error = e as { message?: string };
    const msg = error.message || 'Failed to restore firewall configuration';
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: 'error',
        reason: 'api_error',
        message: msg,
        next: [
          {
            command: withGlobalFlags(
              client,
              `firewall restore ${configVersion} --yes`
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

  output.log(
    `${chalk.cyan('Success!')} Firewall configuration version ${configVersion} restored to production ${chalk.gray(updateStamp())}`
  );

  return 0;
}
