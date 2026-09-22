import chalk from 'chalk';
import { canPrompt } from '../can-prompt';
import type Client from '../client';
import { STANDARD_ENVIRONMENTS } from '../target/standard-environments';
import { normalizeOptionalInput } from './normalize-optional-input';
import { printFlagEnvironmentDetails } from './print-flag-details';
import type { Flag, FlagEnvironmentConfig, FlagVariant } from './types';

type StandardEnvironment = (typeof STANDARD_ENVIRONMENTS)[number];

interface ResolveFlagEnvironmentOptions {
  showEnvironmentDetails?: boolean;
  decorateChoices?: boolean;
}

export async function resolveFlagEnvironment(
  client: Client,
  flag: Flag,
  environment: string | undefined,
  promptMessage: string,
  options: ResolveFlagEnvironmentOptions = {}
): Promise<string> {
  let nextEnvironment = environment;

  if (!nextEnvironment) {
    if (!canPrompt(client)) {
      throw new Error(
        'Missing required flag --environment. Use --environment <ENV>, or run interactively in a terminal.'
      );
    }

    const availableEnvironments = STANDARD_ENVIRONMENTS.filter(env =>
      Object.prototype.hasOwnProperty.call(flag.environments, env)
    );

    if (availableEnvironments.length === 0) {
      throw new Error('No valid environments found for this flag');
    }

    if (options.showEnvironmentDetails) {
      printFlagEnvironmentDetails(flag, undefined, availableEnvironments);
    }

    nextEnvironment = await client.input.select({
      message: promptMessage,
      choices: availableEnvironments.map(env => {
        return {
          name:
            options.decorateChoices === false
              ? env
              : formatEnvironmentChoiceLabel(env, flag.environments[env]),
          value: env,
        };
      }),
    });
  }

  if (!STANDARD_ENVIRONMENTS.includes(nextEnvironment as StandardEnvironment)) {
    throw new Error(
      `Invalid environment: ${nextEnvironment}. Must be one of: ${STANDARD_ENVIRONMENTS.join(', ')}`
    );
  }

  if (!flag.environments[nextEnvironment]) {
    throw new Error(`Environment ${nextEnvironment} not found for this flag`);
  }

  return nextEnvironment;
}

function formatEnvironmentChoiceLabel(
  envName: string,
  envConfig: FlagEnvironmentConfig | undefined
): string {
  const status = envConfig?.active
    ? chalk.green('active')
    : chalk.yellow('paused');
  return `${envName} (${status})`;
}

export function isOverridingEnvironmentToVariant(
  envConfig: FlagEnvironmentConfig,
  variantId: string
): boolean {
  return (
    !envConfig.active &&
    envConfig.pausedOutcome?.variantId === variantId &&
    envConfig.fallthrough.type === 'variant' &&
    envConfig.fallthrough.variantId === variantId
  );
}

export function isServingVariantViaTargeting(
  envConfig: FlagEnvironmentConfig,
  variantId: string
): boolean {
  return (
    envConfig.active &&
    !envConfig.reuse?.active &&
    envConfig.fallthrough.type === 'variant' &&
    envConfig.fallthrough.variantId === variantId
  );
}

export function isPausingEnvironmentToVariant(
  envConfig: FlagEnvironmentConfig,
  variantId: string
): boolean {
  return !envConfig.active && envConfig.pausedOutcome?.variantId === variantId;
}

export function buildVariantOverrideEnvironmentConfig(
  envConfig: FlagEnvironmentConfig,
  variantId: string
): FlagEnvironmentConfig {
  return {
    ...envConfig,
    active: false,
    pausedOutcome: {
      type: 'variant',
      variantId,
    },
    fallthrough: {
      type: 'variant',
      variantId,
    },
  };
}

export function buildTargetingVariantEnvironmentConfig(
  envConfig: FlagEnvironmentConfig,
  variantId: string
): FlagEnvironmentConfig {
  return buildOutcomeEnvConfig(envConfig, {
    outcome: {
      type: 'variant',
      variantId,
    },
    defaultVariantId: variantId,
  });
}

/**
 * Enable targeting while keeping the effective fallthrough (variant, split, or
 * rollout). When the environment reuses another environment, the inherited
 * fallthrough is materialized locally and reuse is disabled.
 */
export function buildResumeTargetingEnvironmentConfig(
  flag: Flag,
  environment: string
): FlagEnvironmentConfig {
  const envConfig = flag.environments[environment];
  const fallthrough = resolveEffectiveFallthrough(flag, environment);
  const defaultVariantId = getFallthroughDefaultVariantId(fallthrough);

  return buildOutcomeEnvConfig(envConfig, {
    outcome: fallthrough,
    defaultVariantId,
  });
}

export function resolveEffectiveFallthrough(
  flag: Flag,
  environment: string
): FlagEnvironmentConfig['fallthrough'] {
  const envConfig = flag.environments[environment];
  const inheritedFrom = envConfig.reuse?.active
    ? envConfig.reuse.environment
    : undefined;

  if (inheritedFrom) {
    const inheritedConfig = flag.environments[inheritedFrom];
    if (inheritedConfig) {
      return structuredClone(inheritedConfig.fallthrough);
    }
  }

  return structuredClone(envConfig.fallthrough);
}

export function isUsableFallthrough(
  fallthrough: FlagEnvironmentConfig['fallthrough'],
  variants: FlagVariant[]
): boolean {
  const variantIds = new Set(variants.map(variant => variant.id));

  if (fallthrough.type === 'variant') {
    return variantIds.has(fallthrough.variantId);
  }

  if (fallthrough.type === 'split') {
    return variantIds.has(fallthrough.defaultVariantId);
  }

  return (
    variantIds.has(fallthrough.defaultVariantId) &&
    variantIds.has(fallthrough.rollFromVariantId) &&
    variantIds.has(fallthrough.rollToVariantId)
  );
}

function getFallthroughDefaultVariantId(
  fallthrough: FlagEnvironmentConfig['fallthrough']
): string {
  if (fallthrough.type === 'variant') {
    return fallthrough.variantId;
  }

  return fallthrough.defaultVariantId;
}

export function buildPausedEnvironmentConfig(
  envConfig: FlagEnvironmentConfig,
  variantId: string
): FlagEnvironmentConfig {
  return {
    ...envConfig,
    active: false,
    pausedOutcome: {
      type: 'variant',
      variantId,
    },
  };
}

export function buildOutcomeEnvConfig(
  envConfig: FlagEnvironmentConfig,
  options: {
    outcome: FlagEnvironmentConfig['fallthrough'];
    defaultVariantId: string;
  }
): FlagEnvironmentConfig {
  const { reuse, ...restConfig } = envConfig;
  const nextConfig: FlagEnvironmentConfig = {
    ...restConfig,
    active: true,
    pausedOutcome: envConfig.pausedOutcome ?? {
      type: 'variant',
      variantId: options.defaultVariantId,
    },
    fallthrough: options.outcome,
  };

  if (reuse) {
    nextConfig.reuse = {
      ...reuse,
      active: false,
    };
  }

  return nextConfig;
}

export function getBooleanVariant(flag: Flag, value: boolean): FlagVariant {
  const variant = flag.variants.find(candidate => candidate.value === value);

  if (!variant) {
    throw new Error(
      `Flag ${chalk.bold(flag.slug)} is missing the standard boolean variants`
    );
  }

  return variant;
}

export async function resolveFlagUpdateMessage(
  client: Client,
  message: string | undefined,
  defaultMessage: string
): Promise<string> {
  if (message !== undefined) {
    return message;
  }

  if (!canPrompt(client)) {
    return defaultMessage;
  }

  const response = await client.input.text({
    message: 'Enter a message for this update:',
    default: defaultMessage,
  });

  return normalizeOptionalInput(response) || defaultMessage;
}
