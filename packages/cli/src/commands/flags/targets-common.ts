import chalk from 'chalk';
import { resolveTargetingLabel } from '../../util/flags/format-flag-details';
import { formatFlagVariantSummary } from '../../util/flags/format-flag-outcome';
import { formatFlagTargetSelector } from '../../util/flags/targets';
import type { FlagTargetSelector } from '../../util/flags/targets';
import type { Flag, FlagSettings } from '../../util/flags/types';

export function formatTargetValue(
  target: FlagTargetSelector,
  settings: FlagSettings | undefined
): string {
  const label =
    target.label ??
    resolveTargetingLabel(
      settings,
      target.entity,
      target.attribute,
      target.value
    );
  const selector = formatFlagTargetSelector(target);
  return label ? `${selector} ${chalk.gray(label)}` : selector;
}

export function formatTargetVariant(flag: Flag, variantId: string): string {
  const variant = flag.variants.find(candidate => candidate.id === variantId);
  return formatFlagVariantSummary(variant, variantId);
}
