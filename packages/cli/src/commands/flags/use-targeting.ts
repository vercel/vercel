import chalk from 'chalk';
import deepEqual from 'fast-deep-equal';
import type Client from '../../util/client';
import { canPrompt } from '../../util/can-prompt';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import { getFlag } from '../../util/flags/get-flags';
import { formatFlagOutcome } from '../../util/flags/format-flag-outcome';
import {
  formatVariantForDisplay,
  resolveVariant,
} from '../../util/flags/resolve-variant';
import { updateFlag } from '../../util/flags/update-flag';
import { normalizeOptionalInput } from '../../util/flags/normalize-optional-input';
import {
  buildResumeTargetingEnvironmentConfig,
  buildTargetingVariantEnvironmentConfig,
  isUsableFallthrough,
  resolveEffectiveFallthrough,
  resolveFlagEnvironment,
  resolveFlagUpdateMessage,
} from '../../util/flags/environment-variant';
import output from '../../output-manager';
import { FlagsUseTargetingTelemetryClient } from '../../util/telemetry/commands/flags/use-targeting';
import { useTargetingSubcommand } from './command';
import type {
  Flag,
  FlagEnvironmentConfig,
  FlagVariant,
} from '../../util/flags/types';
import { getLinkedFlagsProject, getProjectNameFromFlags } from './project';

export default async function useTargeting(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsUseTargetingTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    useTargetingSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags } = parsedArgs;
  const [flagArg] = args;
  const environment = flags['--environment'] as string | undefined;
  const defaultVariantSelector = normalizeOptionalInput(
    flags['--default-variant'] as string | undefined
  );
  const message = normalizeOptionalInput(
    flags['--message'] as string | undefined
  );
  const projectName = getProjectNameFromFlags(flags);

  if (!flagArg) {
    output.error('Please provide a flag slug or ID to use targeting for');
    output.log(
      `Example: ${getCommandName('flags use-targeting my-feature --environment production')}`
    );
    return 1;
  }

  telemetryClient.trackCliArgumentFlag(flagArg);
  telemetryClient.trackCliOptionProject(projectName);
  telemetryClient.trackCliOptionEnvironment(environment);
  telemetryClient.trackCliOptionDefaultVariant(defaultVariantSelector);
  telemetryClient.trackCliOptionMessage(message);

  const link = await getLinkedFlagsProject(client, projectName);
  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    output.error(
      `Your codebase isn't linked to a project on Vercel. Pass --project <name>, or run ${getCommandName('link')} to link it.`
    );
    return 1;
  }

  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;

  const { project } = link;

  try {
    output.spinner('Fetching flag...');
    const flag = await getFlag(client, project.id, flagArg);
    output.stopSpinner();

    if (flag.state === 'archived') {
      output.error(
        `Flag ${chalk.bold(flag.slug)} is archived and cannot use targeting`
      );
      return 1;
    }

    const selectedEnvironment = await resolveFlagEnvironment(
      client,
      flag,
      environment,
      'Select an environment to use targeting in:',
      {
        showEnvironmentDetails: true,
        decorateChoices: false,
      }
    );
    const envConfig = flag.environments[selectedEnvironment];
    const nextEnvConfig = await resolveNextTargetingEnvironmentConfig(
      client,
      flag,
      selectedEnvironment,
      defaultVariantSelector
    );

    if (deepEqual(envConfig, nextEnvConfig)) {
      output.warn(
        formatAlreadyUsingTargetingWarning(
          flag,
          selectedEnvironment,
          nextEnvConfig
        )
      );
      return 0;
    }

    const updateMessage = await resolveFlagUpdateMessage(
      client,
      message,
      `Activated targeting for ${selectedEnvironment} via CLI`
    );

    output.spinner(`Activating targeting in ${selectedEnvironment}...`);
    await updateFlag(client, project.id, flagArg, {
      environments: {
        [selectedEnvironment]: nextEnvConfig,
      },
      message: updateMessage,
    });
    output.stopSpinner();

    output.success(
      `Feature flag ${chalk.bold(flag.slug)} now uses targeting in ${chalk.bold(selectedEnvironment)}`
    );
    output.log(
      `  ${chalk.dim('Fallthrough:')} ${formatFlagOutcome(nextEnvConfig.fallthrough, flag.variants)}`
    );
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}

async function resolveNextTargetingEnvironmentConfig(
  client: Client,
  flag: Flag,
  environment: string,
  defaultVariantSelector: string | undefined
): Promise<FlagEnvironmentConfig> {
  if (defaultVariantSelector) {
    const variant = resolveDefaultVariantOrThrow(flag, defaultVariantSelector);
    return buildTargetingVariantEnvironmentConfig(
      flag.environments[environment],
      variant.id
    );
  }

  const fallthrough = resolveEffectiveFallthrough(flag, environment);
  if (isUsableFallthrough(fallthrough, flag.variants)) {
    return buildResumeTargetingEnvironmentConfig(flag, environment);
  }

  const selectedVariant = await resolveReplacementDefaultVariant(
    client,
    flag,
    fallthrough
  );
  return buildTargetingVariantEnvironmentConfig(
    flag.environments[environment],
    selectedVariant.id
  );
}

function resolveDefaultVariantOrThrow(
  flag: Flag,
  selector: string
): FlagVariant {
  const result = resolveVariant(selector, flag.variants);
  if (result.error || !result.variant) {
    throw new Error(result.error || `Variant "${selector}" not found`);
  }

  return result.variant;
}

async function resolveReplacementDefaultVariant(
  client: Client,
  flag: Flag,
  fallthrough: FlagEnvironmentConfig['fallthrough']
): Promise<FlagVariant> {
  if (!canPrompt(client)) {
    throw new Error(
      `Couldn't resume targeting because the current fallthrough references a missing variant. Pass --default-variant <VARIANT>${describeUnusableFallthrough(fallthrough)}.`
    );
  }

  output.warn(
    `Current fallthrough references a missing variant${describeUnusableFallthrough(fallthrough)}. Choose a new default variant.`
  );

  const selectedVariantId = await client.input.select({
    message: 'Select a default variant when no rules match:',
    choices: flag.variants.map(variant => ({
      name: formatVariantForDisplay(variant),
      value: variant.id,
    })),
  });

  const selectedVariant = flag.variants.find(
    variant => variant.id === selectedVariantId
  );
  if (!selectedVariant) {
    throw new Error('No variant selected');
  }

  return selectedVariant;
}

function describeUnusableFallthrough(
  fallthrough: FlagEnvironmentConfig['fallthrough']
): string {
  if (fallthrough.type === 'variant') {
    return ` (${fallthrough.variantId})`;
  }

  return ` (${fallthrough.type} default ${fallthrough.defaultVariantId})`;
}

function formatAlreadyUsingTargetingWarning(
  flag: Flag,
  environment: string,
  envConfig: FlagEnvironmentConfig
): string {
  const { fallthrough } = envConfig;
  if (fallthrough.type === 'variant') {
    const variant = flag.variants.find(
      candidate => candidate.id === fallthrough.variantId
    );
    const label = variant
      ? formatVariantForDisplay(variant)
      : fallthrough.variantId;
    return `Flag ${chalk.bold(flag.slug)} already uses targeting with default ${label} in ${environment}`;
  }

  return `Flag ${chalk.bold(flag.slug)} already uses targeting in ${environment}`;
}
