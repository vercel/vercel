import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import { getFlag } from '../../util/flags/get-flags';
import { updateFlag } from '../../util/flags/update-flag';
import {
  formatVariantForDisplay,
  resolveVariant,
} from '../../util/flags/resolve-variant';
import { getFlagDashboardUrl } from '../../util/flags/dashboard-url';
import {
  normalizeOptionalInput,
  resolveOptionalInput,
} from '../../util/flags/normalize-optional-input';
import output from '../../output-manager';
import { FlagsDisableTelemetryClient } from '../../util/telemetry/commands/flags/disable';
import { disableSubcommand } from './command';

const VALID_ENVIRONMENTS = ['production', 'preview', 'development'];

export default async function disable(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsDisableTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(disableSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags } = parsedArgs;
  const [flagArg] = args;
  let environment = flags['--environment'] as string | undefined;
  const variantId = flags['--variant'] as string | undefined;
  const message = normalizeOptionalInput(
    flags['--message'] as string | undefined
  );

  if (!flagArg) {
    output.error('Please provide a flag slug or ID to disable');
    output.log(
      `Example: ${getCommandName('flags disable my-feature --environment production')}`
    );
    return 1;
  }

  telemetryClient.trackCliArgumentFlag(flagArg);
  telemetryClient.trackCliOptionEnvironment(environment);
  telemetryClient.trackCliOptionVariant(variantId);
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
        `Flag ${chalk.bold(flag.slug)} is archived and cannot be disabled`
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
        `The ${getCommandName('flags disable')} command only works with boolean flags.`
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
        message: 'Select an environment to disable the flag in:',
        choices: availableEnvs.map(env => {
          const config = flag.environments[env];
          const isActive = config?.active ?? false;
          const status = isActive
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

    const defaultDisabledVariantId = getDefaultDisabledVariantId(flag);
    let selectedVariantId = variantId;

    if (selectedVariantId) {
      // Resolve the variant from user input (can be ID, value, or label)
      const result = resolveVariant(selectedVariantId, flag.variants);
      if (result.error) {
        output.error(result.error);
        return 1;
      }
      selectedVariantId = result.variant!.id;
    } else {
      selectedVariantId = defaultDisabledVariantId;
    }

    if (
      !envConfig.active &&
      envConfig.pausedOutcome?.variantId === selectedVariantId
    ) {
      output.warn(
        `Flag ${chalk.bold(flag.slug)} is already disabled in ${environment}`
      );
      return 0;
    }

    envConfig.active = false;
    envConfig.pausedOutcome = {
      type: 'variant' as const,
      variantId: selectedVariantId,
    };
    const updateMessage = await resolveOptionalInput(
      client,
      message,
      getDefaultDisableMessage(environment),
      'Enter a message for this update:'
    );

    output.spinner(`Disabling flag in ${environment}...`);
    await updateFlag(client, project.id, flagArg, {
      environments: {
        [environment]: envConfig,
      },
      message: updateMessage,
    });
    output.stopSpinner();

    const variant = flag.variants.find(v => v.id === selectedVariantId);

    output.success(
      `Feature flag ${chalk.bold(flag.slug)} has been disabled in ${chalk.bold(environment)}`
    );
    output.log(
      `  ${chalk.dim('Serving variant:')} ${variant ? formatVariantForDisplay(variant) : selectedVariantId}`
    );
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}

function getDefaultDisableMessage(environment: string): string {
  return `Disabled for ${environment} via CLI`;
}

function getDefaultDisabledVariantId(flag: {
  slug: string;
  variants: Array<{ id: string; value: string | number | boolean }>;
}): string {
  const falseVariant = flag.variants.find(variant => variant.value === false);

  if (!falseVariant) {
    throw new Error(
      `Flag ${chalk.bold(flag.slug)} is missing the standard boolean variants`
    );
  }

  return falseVariant.id;
}
