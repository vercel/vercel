import chalk from 'chalk';
import ms from 'ms';
import { formatVariantValue } from './resolve-variant';
import type {
  FlagOutcome,
  FlagRolloutOutcome,
  FlagSplitOutcome,
  FlagVariant,
} from './types';

export function formatFlagOutcome(
  outcome: FlagOutcome | FlagSplitOutcome | FlagRolloutOutcome,
  variants: FlagVariant[],
  includeVariantId = false
): string {
  if (outcome.type === 'variant') {
    const variant = variants.find(v => v.id === outcome.variantId);
    return formatFlagVariantSummary(
      variant,
      outcome.variantId,
      includeVariantId
    );
  }

  if (outcome.type === 'split') {
    const weights = formatFlagSplitWeights(
      outcome.weights,
      variants,
      includeVariantId
    );
    return `split (${weights})`;
  }

  return formatRolloutOutcome(outcome, variants, includeVariantId);
}

export function formatFlagVariantSummary(
  variant: FlagVariant | undefined,
  fallback: string,
  includeVariantId = false
): string {
  if (!variant) {
    return chalk.bold(fallback);
  }

  const summary = variant.label
    ? chalk.bold(variant.label)
    : chalk.bold(formatVariantValue(variant.value));

  return includeVariantId
    ? `${summary} ${chalk.dim(`(${variant.id})`)}`
    : summary;
}

export function formatFlagSplitWeights(
  weights: Record<string, number>,
  variants: FlagVariant[],
  includeVariantId = false
): string {
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);

  return Object.entries(weights)
    .map(([id, weight]) => {
      const variant = variants.find(v => v.id === id);
      const summary = formatFlagVariantSummary(variant, id, includeVariantId);
      const percentage = total > 0 ? (weight / total) * 100 : 0;
      const formattedPercentage = Number.isInteger(percentage)
        ? String(percentage)
        : String(Number(percentage.toFixed(2)));

      return `${summary}: ${formattedPercentage}%`;
    })
    .join(', ');
}

function formatRolloutOutcome(
  outcome: FlagRolloutOutcome,
  variants: FlagVariant[],
  includeVariantId = false
): string {
  const fromVariant = variants.find(v => v.id === outcome.rollFromVariantId);
  const toVariant = variants.find(v => v.id === outcome.rollToVariantId);
  const defaultVariant = variants.find(v => v.id === outcome.defaultVariantId);
  const stages = outcome.slots
    .map(slot => {
      const percentage = slot.promille / 1000;
      const formattedPercentage = Number.isInteger(percentage)
        ? String(percentage)
        : String(Number(percentage.toFixed(3)));
      return `${formattedPercentage}% for ${ms(slot.durationMs, { long: true })}`;
    })
    .join(', ');

  return `${formatFlagVariantSummary(
    fromVariant,
    outcome.rollFromVariantId,
    includeVariantId
  )} -> ${formatFlagVariantSummary(
    toVariant,
    outcome.rollToVariantId,
    includeVariantId
  )}; ${stages}; then 100%; Fallback: ${formatFlagVariantSummary(
    defaultVariant,
    outcome.defaultVariantId,
    includeVariantId
  )}`;
}
