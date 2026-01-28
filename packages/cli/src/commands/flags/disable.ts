import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import { getFlag } from '../../util/flags/get-flags';
import { updateFlag } from '../../util/flags/update-flag';
import { resolveVariant } from '../../util/flags/resolve-variant';
import { getFlagDashboardUrl } from '../../util/flags/dashboard-url';
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
      const availableEnvs = Object.keys(flag.environments).filter(env =>
        VALID_ENVIRONMENTS.includes(env)
      );

      if (availableEnvs.length === 0) {
        output.error('No valid environments found for this flag');
        return 1;
      }

      environment = await client.input.select({
        message: 'Select an environment to disable the flag in:',
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

    if (!envConfig.active) {
      output.warn(
        `Flag ${chalk.bold(flag.slug)} is already disabled in ${environment}`
      );
      return 0;
    }

    // Determine which variant to serve while disabled
    let selectedVariantId = variantId;
    if (selectedVariantId) {
      // Resolve the variant from user input (can be ID, value, or label)
      const result = resolveVariant(selectedVariantId, flag.variants);
      if (result.error) {
        output.error(result.error);
        return 1;
      }
      selectedVariantId = result.variant!.id;
    } else if (flag.variants.length === 1) {
      // Only one variant available, use it
      selectedVariantId = flag.variants[0].id;
    } else if (flag.kind === 'boolean') {
      // For boolean flags, default to the false variant (the "off" value)
      const falseVariant = flag.variants.find(v => v.value === false);
      selectedVariantId = falseVariant?.id ?? flag.variants[0].id;
    } else {
      // Multiple variants available for non-boolean flags, prompt user to select
      selectedVariantId = await client.input.select({
        message: 'Select which variant to serve while the flag is disabled:',
        choices: flag.variants.map(v => ({
          name: `${v.id} (${chalk.yellow(JSON.stringify(v.value))})${v.label ? ` - ${v.label}` : ''}`,
          value: v.id,
        })),
      });
    }

    const updatedEnvConfig = {
      active: false,
      fallthrough: envConfig.fallthrough,
      rules: envConfig.rules,
      pausedOutcome: {
        type: 'variant' as const,
        variantId: selectedVariantId,
      },
    };

    output.spinner(`Disabling flag in ${environment}...`);
    await updateFlag(client, project.id, flagArg, {
      environments: {
        [environment]: updatedEnvConfig,
      },
      message: `Disabled in ${environment} via CLI`,
    });
    output.stopSpinner();

    const variant = flag.variants.find(v => v.id === selectedVariantId);
    const variantValue = variant
      ? JSON.stringify(variant.value)
      : selectedVariantId;

    output.success(
      `Feature flag ${chalk.bold(flag.slug)} has been disabled in ${chalk.bold(environment)}`
    );
    output.log(
      `  ${chalk.dim('Serving variant:')} ${selectedVariantId} (${chalk.yellow(variantValue)})`
    );
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}
