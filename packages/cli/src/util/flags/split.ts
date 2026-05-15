import chalk from 'chalk';
import {
  formatVariantForDisplay,
  formatVariantValue,
  resolveVariantByIdOrThrow,
  resolveVariantOrThrow,
} from './resolve-variant';
import {
  formatFlagBucketingBaseSelector,
  resolveFlagBucketingBase,
} from './bucketing-base';
import { getBooleanVariant } from './environment-variant';
import type {
  Flag,
  FlagRolloutOutcome,
  FlagSettings,
  FlagSplitOutcome,
  FlagVariant,
} from './types';

interface ResolveSplitOptions {
  weightInputs: string[];
  baseSelector: string | undefined;
  defaultVariantSelector: string | undefined;
  currentOutcome?: FlagOutcomeForSplit;
}

type FlagOutcomeForSplit =
  | FlagSplitOutcome
  | FlagRolloutOutcome
  | { type: 'variant'; variantId: string };

export interface ResolvedFlagSplit {
  outcome: FlagSplitOutcome;
  defaultVariant: FlagVariant;
  baseLabel: string;
  summary: string;
}

export function resolveFlagSplit(
  flag: Flag,
  settings: FlagSettings,
  options: ResolveSplitOptions
): ResolvedFlagSplit {
  const currentSplit =
    options.currentOutcome?.type === 'split'
      ? options.currentOutcome
      : undefined;

  const baseSelector =
    options.baseSelector || formatFlagBucketingBaseSelector(currentSplit?.base);
  if (!baseSelector) {
    throw new Error(
      'Missing required flag --by. Use --by <entity.attribute> to choose how users are bucketed.'
    );
  }
  const base = resolveFlagBucketingBase(settings, baseSelector);

  const weights = resolveSplitWeights(flag, options.weightInputs, currentSplit);

  const defaultVariant = resolveDefaultVariant(
    flag,
    options.defaultVariantSelector,
    currentSplit
  );

  return {
    outcome: {
      type: 'split',
      base,
      weights,
      defaultVariantId: defaultVariant.id,
    },
    defaultVariant,
    baseLabel: `${base.kind}.${base.attribute}`,
    summary: formatSplitSummary(flag.variants, weights),
  };
}

function resolveSplitWeights(
  flag: Flag,
  weightInputs: string[],
  currentSplit: FlagSplitOutcome | undefined
): Record<string, number> {
  if (weightInputs.length === 0 && currentSplit) {
    return validateAndNormalizeWeights(flag, currentSplit.weights);
  }

  if (weightInputs.length === 0) {
    throw new Error(
      'At least one --weight is required. Use --weight <VARIANT=WEIGHT> for each variant, or run interactively in a terminal.'
    );
  }

  const weights: Record<string, number> = {};
  const seen = new Set<string>();

  for (const input of weightInputs) {
    const { variantSelector, weight } = parseWeightInput(input);
    const variant = resolveVariantOrThrow(
      variantSelector,
      flag.variants,
      '--weight'
    );

    if (seen.has(variant.id)) {
      throw new Error(
        `Duplicate weight for variant ${chalk.bold(formatVariantForDisplay(variant))}.`
      );
    }

    seen.add(variant.id);
    weights[variant.id] = weight;
  }

  const missingVariants = flag.variants.filter(
    variant => !seen.has(variant.id)
  );
  if (missingVariants.length > 0) {
    throw new Error(
      `Missing weights for variants: ${missingVariants
        .map(variant => formatVariantForDisplay(variant))
        .join(
          ', '
        )}. Use --weight <VARIANT=WEIGHT> for each variant, including 0 for variants that should receive no traffic.`
    );
  }

  return validateAndNormalizeWeights(flag, weights);
}

function parseWeightInput(input: string) {
  const separatorIndex = input.lastIndexOf('=');
  if (separatorIndex <= 0 || separatorIndex === input.length - 1) {
    throw new Error(
      `Invalid weight ${chalk.bold(input)}. Use --weight <VARIANT=WEIGHT>, for example --weight on=5.`
    );
  }

  const variantSelector = input.slice(0, separatorIndex).trim();
  const rawWeight = input.slice(separatorIndex + 1).trim();

  if (!variantSelector) {
    throw new Error(
      `Invalid weight ${chalk.bold(input)}. Variant cannot be empty.`
    );
  }

  if (!rawWeight) {
    throw new Error(
      `Invalid weight ${chalk.bold(input)}. Weight cannot be empty.`
    );
  }

  const weight = Number(rawWeight);

  if (!Number.isFinite(weight) || weight < 0) {
    throw new Error(
      `Invalid weight "${rawWeight}". Use a number greater than or equal to 0.`
    );
  }

  return { variantSelector, weight };
}

function validateAndNormalizeWeights(
  flag: Flag,
  weights: Record<string, number>
): Record<string, number> {
  const normalizedWeights = Object.fromEntries(
    flag.variants.map(variant => [variant.id, weights[variant.id] ?? 0])
  );
  const totalWeight = Object.values(normalizedWeights).reduce(
    (sum, weight) => sum + weight,
    0
  );

  if (totalWeight <= 0) {
    throw new Error('At least one weight must be greater than 0.');
  }

  return normalizedWeights;
}

function resolveDefaultVariant(
  flag: Flag,
  selector: string | undefined,
  currentSplit: FlagSplitOutcome | undefined
): FlagVariant {
  if (selector) {
    return resolveVariantOrThrow(selector, flag.variants, '--default-variant');
  }

  if (currentSplit) {
    return resolveVariantByIdOrThrow(
      currentSplit.defaultVariantId,
      flag.variants,
      '--default-variant'
    );
  }

  if (flag.kind === 'boolean') {
    return getBooleanVariant(flag, false);
  }

  throw new Error(
    'Missing required flag --default-variant. Use --default-variant <VARIANT> for non-boolean splits.'
  );
}

function formatSplitSummary(
  variants: FlagVariant[],
  weights: Record<string, number>
): string {
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);

  return variants
    .map(variant => {
      const weight = weights[variant.id] ?? 0;
      const percentage = total > 0 ? (weight / total) * 100 : 0;

      return `${formatPlainVariant(variant)}: ${formatPercentage(percentage)}`;
    })
    .join(', ');
}

function formatPlainVariant(variant: FlagVariant): string {
  const value = formatVariantValue(variant.value);
  return variant.label ? `${value} ${variant.label}` : value;
}

function formatPercentage(percentage: number): string {
  return Number.isInteger(percentage)
    ? `${percentage}%`
    : `${Number(percentage.toFixed(2))}%`;
}
