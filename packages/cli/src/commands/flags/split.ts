import chalk from 'chalk';
import deepEqual from 'fast-deep-equal';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import { getFlag, getFlagSettings } from '../../util/flags/get-flags';
import { updateFlag } from '../../util/flags/update-flag';
import { normalizeOptionalInput } from '../../util/flags/normalize-optional-input';
import {
  buildOutcomeEnvConfig,
  resolveFlagEnvironment,
  resolveFlagUpdateMessage,
} from '../../util/flags/environment-variant';
import {
  resolveFlagSplit,
  type ResolvedFlagSplit,
} from '../../util/flags/split';
import { formatFlagBucketingBaseSelector } from '../../util/flags/bucketing-base';
import { canPrompt } from '../../util/flags/can-prompt';
import { formatVariantForDisplay } from '../../util/flags/resolve-variant';
import type {
  Flag,
  FlagSettings,
  FlagSplitOutcome,
} from '../../util/flags/types';
import output from '../../output-manager';
import { FlagsSplitTelemetryClient } from '../../util/telemetry/commands/flags/split';
import { splitSubcommand } from './command';

export default async function split(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsSplitTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(splitSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags } = parsedArgs;
  const [flagArg] = args;
  const environment = flags['--environment'] as string | undefined;
  const baseSelector = normalizeOptionalInput(
    flags['--by'] as string | undefined
  );
  const defaultVariantSelector = normalizeOptionalInput(
    flags['--default-variant'] as string | undefined
  );
  const weightInputs = (flags['--weight'] as string[] | undefined) || [];
  const message = normalizeOptionalInput(
    flags['--message'] as string | undefined
  );

  if (!flagArg) {
    output.error('Please provide a flag slug or ID to split');
    output.log(
      `Example: ${getCommandName('flags split my-feature --environment production --by user.userId --weight off=95 --weight on=5')}`
    );
    return 1;
  }

  telemetryClient.trackCliArgumentFlag(flagArg);
  telemetryClient.trackCliOptionEnvironment(environment);
  telemetryClient.trackCliOptionBy(baseSelector);
  telemetryClient.trackCliOptionWeight(
    weightInputs.length > 0 ? [weightInputs[0]] : undefined
  );
  telemetryClient.trackCliOptionDefaultVariant(defaultVariantSelector);
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
    output.spinner('Fetching flag...');
    const [flag, settings] = await Promise.all([
      getFlag(client, project.id, flagArg),
      getFlagSettings(client, project.id),
    ]);
    output.stopSpinner();

    if (flag.state === 'archived') {
      output.error(
        `Flag ${chalk.bold(flag.slug)} is archived and cannot be split`
      );
      return 1;
    }

    const selectedEnvironment = await resolveFlagEnvironment(
      client,
      flag,
      environment,
      'Select an environment to split traffic in:',
      {
        showEnvironmentDetails: true,
        decorateChoices: false,
      }
    );
    const envConfig = flag.environments[selectedEnvironment];
    const currentSplit =
      envConfig.fallthrough.type === 'split'
        ? envConfig.fallthrough
        : undefined;
    const shouldPromptCurrentSplit =
      canPrompt(client) &&
      currentSplit !== undefined &&
      !baseSelector &&
      weightInputs.length === 0 &&
      !defaultVariantSelector &&
      !message;

    const resolvedBaseSelector = await resolveBaseSelector(
      client,
      settings,
      baseSelector,
      currentSplit,
      shouldPromptCurrentSplit
    );
    const resolvedWeightInputs = await resolveWeightInputs(
      client,
      flag,
      weightInputs,
      currentSplit,
      shouldPromptCurrentSplit
    );
    const resolvedDefaultVariantSelector = await resolveDefaultVariantSelector(
      client,
      flag,
      defaultVariantSelector,
      currentSplit,
      shouldPromptCurrentSplit
    );

    const splitConfig = resolveFlagSplit(flag, settings, {
      baseSelector: resolvedBaseSelector,
      weightInputs: resolvedWeightInputs,
      defaultVariantSelector: resolvedDefaultVariantSelector,
      currentOutcome: envConfig.fallthrough,
    });
    const nextEnvironmentConfig = buildOutcomeEnvConfig(envConfig, {
      outcome: splitConfig.outcome,
      defaultVariantId: splitConfig.defaultVariant.id,
    });

    if (
      !message &&
      envConfig.active &&
      deepEqual(envConfig.fallthrough, splitConfig.outcome) &&
      deepEqual(envConfig, nextEnvironmentConfig)
    ) {
      output.warn(
        `Flag ${chalk.bold(flag.slug)} is already configured with this split in ${selectedEnvironment}`
      );
      return 0;
    }

    const updateMessage = await resolveFlagUpdateMessage(
      client,
      message,
      getDefaultSplitMessage(selectedEnvironment, splitConfig)
    );

    output.spinner(`Updating split in ${selectedEnvironment}...`);
    await updateFlag(client, project.id, flagArg, {
      environments: {
        [selectedEnvironment]: nextEnvironmentConfig,
      },
      message: updateMessage,
    });
    output.stopSpinner();

    output.success(
      `Feature flag ${chalk.bold(flag.slug)} split has been updated in ${chalk.bold(selectedEnvironment)}`
    );
    output.log(`  ${chalk.dim('Based on:')} ${splitConfig.baseLabel}`);
    output.log(
      `  ${chalk.dim('Fallback:')} ${formatVariantForDisplay(splitConfig.defaultVariant)}`
    );
    output.log(`  ${chalk.dim('Weights:')} ${splitConfig.summary}`);
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}

function getDefaultSplitMessage(
  environment: string,
  splitConfig: ResolvedFlagSplit
): string {
  return `Configure split for ${environment}: ${splitConfig.summary}`;
}

async function resolveBaseSelector(
  client: Client,
  settings: FlagSettings,
  baseSelector: string | undefined,
  currentSplit: FlagSplitOutcome | undefined,
  shouldPromptCurrentSplit: boolean
): Promise<string | undefined> {
  if (baseSelector || (currentSplit && !shouldPromptCurrentSplit)) {
    return baseSelector;
  }

  if (!canPrompt(client)) {
    return undefined;
  }

  const choices = settings.entities.flatMap(entity =>
    entity.attributes.map(attribute => ({
      name: `${entity.label} › ${attribute.key}`,
      value: `${entity.kind}.${attribute.key}`,
    }))
  );
  const currentBaseSelector = formatFlagBucketingBaseSelector(
    currentSplit?.base
  );
  const defaultChoice = choices.find(
    choice => choice.value === currentBaseSelector
  )?.value;

  if (choices.length === 0) {
    throw new Error('No entities are configured for weighted splits.');
  }

  return client.input.select({
    message: 'Select an attribute to split by:',
    choices,
    default: defaultChoice,
  });
}

async function resolveWeightInputs(
  client: Client,
  flag: Flag,
  weightInputs: string[],
  currentSplit: FlagSplitOutcome | undefined,
  shouldPromptCurrentSplit: boolean
): Promise<string[]> {
  if (weightInputs.length > 0 || (currentSplit && !shouldPromptCurrentSplit)) {
    return weightInputs;
  }

  if (!canPrompt(client)) {
    return weightInputs;
  }

  output.log(
    'Enter weights for each variant. Weights are ratios; use 0 for variants that should receive no traffic.'
  );

  const promptedWeights: string[] = [];
  for (const variant of flag.variants) {
    const defaultWeight =
      currentSplit?.weights[variant.id] !== undefined
        ? String(currentSplit.weights[variant.id])
        : currentSplit
          ? '0'
          : '1';
    const weight = await client.input.text({
      message: `Weight for ${formatVariantForDisplay(variant)}:`,
      default: defaultWeight,
      validate: value => {
        const trimmed = value.trim();
        if (!trimmed) {
          return 'Enter a weight';
        }
        const parsed = Number(trimmed);
        if (!Number.isFinite(parsed) || parsed < 0) {
          return 'Enter a number greater than or equal to 0';
        }
        return true;
      },
    });
    promptedWeights.push(`${variant.id}=${weight.trim()}`);
  }

  return promptedWeights;
}

async function resolveDefaultVariantSelector(
  client: Client,
  flag: Flag,
  defaultVariantSelector: string | undefined,
  currentSplit: FlagSplitOutcome | undefined,
  shouldPromptCurrentSplit: boolean
): Promise<string | undefined> {
  if (
    defaultVariantSelector ||
    (currentSplit && !shouldPromptCurrentSplit) ||
    (flag.kind === 'boolean' && !canPrompt(client))
  ) {
    return defaultVariantSelector;
  }

  if (!canPrompt(client)) {
    return undefined;
  }

  return client.input.select({
    message: 'Select a fallback variant:',
    choices: flag.variants.map(variant => ({
      name: formatVariantForDisplay(variant),
      value: variant.id,
    })),
    default:
      flag.variants.find(
        variant => variant.id === currentSplit?.defaultVariantId
      )?.id || getBooleanFallbackVariantId(flag),
  });
}

function getBooleanFallbackVariantId(flag: Flag): string | undefined {
  if (flag.kind !== 'boolean') {
    return undefined;
  }

  return flag.variants.find(variant => variant.value === false)?.id;
}
