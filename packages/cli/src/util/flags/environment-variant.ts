import chalk from 'chalk';
import type Client from '../client';
import { STANDARD_ENVIRONMENTS } from '../target/standard-environments';
import { normalizeOptionalInput } from './normalize-optional-input';
import type { Flag, FlagEnvironmentConfig, FlagVariant } from './types';

type StandardEnvironment = (typeof STANDARD_ENVIRONMENTS)[number];

export async function resolveFlagEnvironment(
  client: Client,
  flag: Flag,
  environment: string | undefined,
  promptMessage: string
): Promise<string> {
  let nextEnvironment = environment;

  if (!nextEnvironment) {
    if (!client.stdin.isTTY) {
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

    nextEnvironment = await client.input.select({
      message: promptMessage,
      choices: availableEnvironments.map(env => {
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

  if (!client.stdin.isTTY) {
    return defaultMessage;
  }

  const response = await client.input.text({
    message: 'Enter a message for this update:',
    default: defaultMessage,
  });

  return normalizeOptionalInput(response) || defaultMessage;
}
