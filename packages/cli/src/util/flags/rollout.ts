import chalk from 'chalk';
import ms from 'ms';
import type { FlagSettings } from './types';
import {
  formatFlagBucketingBaseSelector,
  resolveFlagBucketingBase,
} from './bucketing-base';
import {
  resolveVariantByIdOrThrow,
  resolveVariantOrThrow,
} from './resolve-variant';
import type {
  Flag,
  FlagRolloutOutcome,
  FlagVariant,
  FlagSplitOutcome,
} from './types';

interface ResolveRolloutOptions {
  stageInputs: string[];
  baseSelector: string | undefined;
  rollFromVariantSelector: string | undefined;
  rollToVariantSelector: string | undefined;
  defaultVariantSelector: string | undefined;
  start: string | undefined;
  currentOutcome?: FlagOutcomeForRollout;
}

type FlagOutcomeForRollout =
  | FlagRolloutOutcome
  | FlagSplitOutcome
  | { type: 'variant'; variantId: string };

export interface ResolvedFlagRollout {
  outcome: FlagRolloutOutcome;
  defaultVariant: FlagVariant;
  rollFromVariant: FlagVariant;
  rollToVariant: FlagVariant;
  baseLabel: string;
  summary: string;
  startLabel: string;
}

export function resolveFlagRollout(
  flag: Flag,
  settings: FlagSettings,
  options: ResolveRolloutOptions
): ResolvedFlagRollout {
  const currentRollout =
    options.currentOutcome?.type === 'rollout'
      ? options.currentOutcome
      : undefined;

  const baseSelector =
    options.baseSelector ||
    formatFlagBucketingBaseSelector(currentRollout?.base);
  if (!baseSelector) {
    throw new Error(
      'Missing required flag --by. Use --by <entity.attribute> to choose how users are bucketed.'
    );
  }
  const base = resolveFlagBucketingBase(settings, baseSelector);

  const rollFromVariant = resolveRollFromVariant(
    flag,
    options.rollFromVariantSelector,
    currentRollout
  );
  const rollToVariant = resolveRollToVariant(
    flag,
    options.rollToVariantSelector,
    currentRollout
  );

  if (rollFromVariant.id === rollToVariant.id) {
    throw new Error(
      '`--from-variant` and `--to-variant` must resolve to different variants.'
    );
  }

  const defaultVariant = resolveDefaultVariant(
    flag,
    options.defaultVariantSelector,
    currentRollout,
    rollFromVariant
  );

  const slots =
    options.stageInputs.length > 0
      ? parseStageInputs(options.stageInputs)
      : currentRollout?.slots;

  if (!slots || slots.length === 0) {
    throw new Error(
      'At least one --stage is required. Use --stage <PERCENTAGE,DURATION>, for example --stage 5,6h.'
    );
  }

  const startTimestamp = resolveRolloutStartTimestamp(
    options.start,
    currentRollout?.startTimestamp
  );

  return {
    outcome: {
      type: 'rollout',
      base,
      startTimestamp,
      rollFromVariantId: rollFromVariant.id,
      rollToVariantId: rollToVariant.id,
      defaultVariantId: defaultVariant.id,
      slots,
    },
    defaultVariant,
    rollFromVariant,
    rollToVariant,
    baseLabel: `${base.kind}.${base.attribute}`,
    summary: formatRolloutStages(slots),
    startLabel: formatStartLabel(options.start, currentRollout?.startTimestamp),
  };
}

function resolveRollFromVariant(
  flag: Flag,
  selector: string | undefined,
  currentRollout: FlagRolloutOutcome | undefined
): FlagVariant {
  if (selector) {
    return resolveVariantOrThrow(selector, flag.variants, '--from-variant');
  }

  if (currentRollout) {
    return resolveVariantByIdOrThrow(
      currentRollout.rollFromVariantId,
      flag.variants,
      '--from-variant'
    );
  }

  return inferBooleanVariant(flag, false, '--from-variant');
}

function resolveRollToVariant(
  flag: Flag,
  selector: string | undefined,
  currentRollout: FlagRolloutOutcome | undefined
): FlagVariant {
  if (selector) {
    return resolveVariantOrThrow(selector, flag.variants, '--to-variant');
  }

  if (currentRollout) {
    return resolveVariantByIdOrThrow(
      currentRollout.rollToVariantId,
      flag.variants,
      '--to-variant'
    );
  }

  return inferBooleanVariant(flag, true, '--to-variant');
}

function resolveDefaultVariant(
  flag: Flag,
  selector: string | undefined,
  currentRollout: FlagRolloutOutcome | undefined,
  rollFromVariant: FlagVariant
): FlagVariant {
  if (selector) {
    return resolveVariantOrThrow(selector, flag.variants, '--default-variant');
  }

  if (currentRollout) {
    return resolveVariantByIdOrThrow(
      currentRollout.defaultVariantId,
      flag.variants,
      '--default-variant'
    );
  }

  return rollFromVariant;
}

function inferBooleanVariant(
  flag: Flag,
  value: boolean,
  optionName: string
): FlagVariant {
  if (flag.kind !== 'boolean') {
    throw new Error(
      `Missing required flag ${optionName}. Use ${optionName} <VARIANT> for non-boolean rollouts.`
    );
  }

  const variant = flag.variants.find(candidate => candidate.value === value);
  if (!variant) {
    throw new Error(
      `Flag ${chalk.bold(flag.slug)} is missing the standard boolean variants`
    );
  }

  return variant;
}

function parseStageInputs(stageInputs: string[]) {
  const slots = stageInputs.map(parseStageInput);

  for (let index = 1; index < slots.length; index++) {
    if (slots[index].promille <= slots[index - 1].promille) {
      throw new Error('Stage percentages must be in ascending order.');
    }
  }

  return slots;
}

function parseStageInput(input: string): FlagRolloutOutcome['slots'][number] {
  const parts = input.split(',').map(part => part.trim());
  if (parts.length !== 2) {
    throw new Error(
      `Invalid stage ${chalk.bold(input)}. Use --stage <PERCENTAGE,DURATION>, for example --stage 5,6h.`
    );
  }

  const percentage = Number(parts[0]);
  if (
    !Number.isFinite(percentage) ||
    percentage <= 0 ||
    percentage >= 100 ||
    !Number.isInteger(percentage * 1000)
  ) {
    throw new Error(
      `Invalid stage percentage "${parts[0]}". Use a number greater than 0 and less than 100 with up to 3 decimal places.`
    );
  }

  const durationMs = parseStageDuration(parts[1]);
  if (durationMs === undefined) {
    throw new Error(
      `Invalid duration "${parts[1]}". Use minutes (e.g. "30m"), hours (e.g. "6h"), or days (e.g. "1d"). Seconds are not supported.`
    );
  }

  return {
    durationMs,
    promille: Math.round(percentage * 1000),
  };
}

function parseStageDuration(value: string): number | undefined {
  if (!value) {
    return undefined;
  }

  if (/^\d+(s|ms)$/i.test(value)) {
    return undefined;
  }

  const durationMs = ms(/^\d+$/.test(value) ? `${value}m` : value);
  if (durationMs === undefined || durationMs <= 0) {
    return undefined;
  }

  const roundedMinutes = Math.round(durationMs / 60000);
  if (roundedMinutes <= 0) {
    return undefined;
  }

  return roundedMinutes * 60000;
}

function resolveRolloutStartTimestamp(
  start: string | undefined,
  currentStartTimestamp: number | undefined
): number {
  if (start === undefined) {
    return currentStartTimestamp ?? Date.now();
  }

  if (start === 'now') {
    return Date.now();
  }

  const relativeDurationMs = ms(start);
  if (relativeDurationMs !== undefined) {
    if (relativeDurationMs <= 0) {
      throw new Error(
        `Invalid start time "${start}". Use "now", a future relative duration such as "1h", or an ISO 8601 datetime.`
      );
    }
    return Date.now() + relativeDurationMs;
  }

  const absoluteTime = new Date(start).getTime();
  if (Number.isNaN(absoluteTime)) {
    throw new Error(
      `Invalid start time "${start}". Use "now", a future relative duration such as "1h", or an ISO 8601 datetime.`
    );
  }

  return absoluteTime;
}

function formatRolloutStages(slots: FlagRolloutOutcome['slots']): string {
  return `${slots
    .map(
      slot =>
        `${formatPromille(slot.promille)} for ${ms(slot.durationMs, { long: true })}`
    )
    .join(', ')}, then 100% indefinitely`;
}

function formatPromille(promille: number): string {
  const percentage = promille / 1000;
  return Number.isInteger(percentage)
    ? `${percentage}%`
    : `${Number(percentage.toFixed(3))}%`;
}

function formatStartLabel(
  start: string | undefined,
  currentStartTimestamp: number | undefined
): string {
  if (start === undefined) {
    return currentStartTimestamp
      ? 'preserve current start time'
      : 'immediately';
  }
  if (start === 'now') {
    return 'immediately';
  }
  return `start at ${start}`;
}
