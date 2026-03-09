import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import { getFlag } from '../../util/flags/get-flags';
import { formatVariantForDisplay } from '../../util/flags/resolve-variant';
import { updateFlag } from '../../util/flags/update-flag';
import { getFlagDashboardUrl } from '../../util/flags/dashboard-url';
import output from '../../output-manager';
import { FlagsEnableTelemetryClient } from '../../util/telemetry/commands/flags/enable';
import { enableSubcommand } from './command';
import type {
  Flag,
  FlagEnvironmentConfig,
  FlagVariant,
} from '../../util/flags/types';

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
  const message = normalizeOptionalInput(
    flags['--message'] as string | undefined
  );

  if (!flagArg) {
    output.error('Please provide a flag slug or ID to enable');
    output.log(
      `Example: ${getCommandName('flags enable my-feature --environment production')}`
    );
    return 1;
  }

  telemetryClient.trackCliArgumentFlag(flagArg);
  telemetryClient.trackCliOptionEnvironment(environment);
  telemetryClient.trackCliOptionMessage(message);

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
      if (!client.stdin.isTTY) {
        output.error(
          'Missing required flag --environment. Use --environment <ENV>, or run interactively in a terminal.'
        );
        return 1;
      }

      const availableEnvs = VALID_ENVIRONMENTS.filter(env =>
        Object.prototype.hasOwnProperty.call(flag.environments, env)
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

    const { onVariant } = getBooleanVariants(flag);

    if (
      !envConfig.active &&
      envConfig.pausedOutcome?.variantId === onVariant.id
    ) {
      output.warn(
        `Flag ${chalk.bold(flag.slug)} is already enabled in ${environment}`
      );
      return 0;
    }

    const updatedEnvConfig: FlagEnvironmentConfig = {
      ...envConfig,
      active: false,
      pausedOutcome: {
        type: 'variant',
        variantId: onVariant.id,
      },
      fallthrough: {
        type: 'variant',
        variantId: onVariant.id,
      },
    };
    const updateMessage = await resolveEnableMessage(
      client,
      environment,
      message
    );

    output.spinner(`Enabling flag in ${environment}...`);
    await updateFlag(client, project.id, flagArg, {
      environments: {
        [environment]: updatedEnvConfig,
      },
      message: updateMessage,
    });
    output.stopSpinner();

    output.success(
      `Feature flag ${chalk.bold(flag.slug)} has been enabled in ${chalk.bold(environment)}`
    );
    output.log(
      `  ${chalk.dim('Serving variant:')} ${formatVariantForDisplay(onVariant)}`
    );
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}

function normalizeOptionalInput(input: string | undefined): string | undefined {
  const value = input?.trim();
  return value ? value : undefined;
}

function getDefaultEnableMessage(environment: string): string {
  return `Enabled for ${environment} via CLI`;
}

function getBooleanVariants(flag: Flag): {
  onVariant: FlagVariant;
} {
  const onVariant = flag.variants.find(variant => variant.value === true);

  if (!onVariant) {
    throw new Error(
      `Flag ${chalk.bold(flag.slug)} is missing the standard boolean variants`
    );
  }

  return { onVariant };
}

async function resolveEnableMessage(
  client: Client,
  environment: string,
  message: string | undefined
): Promise<string> {
  if (message !== undefined) {
    return message;
  }

  const defaultMessage = getDefaultEnableMessage(environment);
  if (!client.stdin.isTTY) {
    return defaultMessage;
  }

  const response = await client.input.text({
    message: 'Enter a message for this update:',
    default: defaultMessage,
  });

  return normalizeOptionalInput(response) || defaultMessage;
}
