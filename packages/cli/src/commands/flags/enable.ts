import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import { getFlag } from '../../util/flags/get-flags';
import { updateFlag } from '../../util/flags/update-flag';
import { getFlagDashboardUrl } from '../../util/flags/dashboard-url';
import output from '../../output-manager';
import { FlagsEnableTelemetryClient } from '../../util/telemetry/commands/flags/enable';
import { enableSubcommand } from './command';
import type { FlagEnvironmentConfig } from '../../util/flags/types';

const VALID_ENVIRONMENTS = ['production', 'preview', 'development'];

export default async function enable(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsEnableTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(enableSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags } = parsedArgs;
  const [flagArg] = args;
  let environment = flags['--environment'] as string | undefined;

  if (!flagArg) {
    output.error('Please provide a flag slug or ID to enable');
    output.log(
      `Example: ${getCommandName('flags enable my-feature --environment production')}`
    );
    return 1;
  }

  telemetryClient.trackCliArgumentFlag(flagArg);
  telemetryClient.trackCliOptionEnvironment(environment);

  const link = await getLinkedProject(client);
  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    output.error(
      `Your codebase isn't linked to a project on Vercel. Run ${getCommandName('link')} to begin.`
    );
    return 1;
  }

  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;

  const { project } = link;

  try {
    // Fetch the flag
    output.spinner('Fetching flag...');
    const flag = await getFlag(client, project.id, flagArg);
    output.stopSpinner();

    if (flag.state === 'archived') {
      output.error(
        `Flag ${chalk.bold(flag.slug)} is archived and cannot be enabled`
      );
      return 1;
    }

    // Only boolean flags can be enabled/disabled via CLI
    if (flag.kind !== 'boolean') {
      const dashboardUrl = getFlagDashboardUrl(
        link.org.slug,
        project.name,
        flag.slug
      );
      output.warn(
        `The ${getCommandName('flags enable')} command only works with boolean flags.`
      );
      output.log(
        `Flag ${chalk.bold(flag.slug)} is a ${chalk.cyan(flag.kind)} flag. You can update it on the dashboard:`
      );
      output.log(`  ${chalk.cyan(dashboardUrl)}`);
      return 0;
    }

    // If environment not specified, prompt for it
    if (!environment) {
      const availableEnvs = Object.keys(flag.environments).filter(env =>
        VALID_ENVIRONMENTS.includes(env)
      );

      if (availableEnvs.length === 0) {
        output.error('No valid environments found for this flag');
        return 1;
      }

      environment = await client.input.select({
        message: 'Select an environment to enable the flag in:',
        choices: availableEnvs.map(env => {
          const config = flag.environments[env];
          const status = config?.active
            ? chalk.green('active')
            : chalk.yellow('paused');
          return {
            name: `${env} (${status})`,
            value: env,
          };
        }),
      });
    }

    if (!VALID_ENVIRONMENTS.includes(environment)) {
      output.error(
        `Invalid environment: ${environment}. Must be one of: ${VALID_ENVIRONMENTS.join(', ')}`
      );
      return 1;
    }

    const envConfig = flag.environments[environment];
    if (!envConfig) {
      output.error(`Environment ${environment} not found for this flag`);
      return 1;
    }

    if (envConfig.active) {
      output.warn(
        `Flag ${chalk.bold(flag.slug)} is already enabled in ${environment}`
      );
      return 0;
    }

    // Build the update request - merge with existing config to preserve required fields
    const updatedEnvConfig: FlagEnvironmentConfig = {
      ...envConfig,
      active: true,
    };

    output.spinner(`Enabling flag in ${environment}...`);
    await updateFlag(client, project.id, flagArg, {
      environments: {
        [environment]: updatedEnvConfig,
      },
      message: `Enabled in ${environment} via CLI`,
    });
    output.stopSpinner();

    output.success(
      `Feature flag ${chalk.bold(flag.slug)} has been enabled in ${chalk.bold(environment)}`
    );
    output.log(
      `  ${chalk.dim('The flag will now evaluate rules and serve variants based on its configuration.')}`
    );
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}
