import { randomBytes } from 'node:crypto';
import {
  FLAG_CONDITION_RHS_OPTIONAL_COMPARATORS,
  formatFlagConditionComparator,
} from './comparators';
import { parseComparator, parseConditionValue } from './segment-input';
import { resolveVariantOrThrow } from './resolve-variant';
import { resolveFlagSplit } from './split';
import { resolveFlagRollout } from './rollout';
import { formatFlagOutcome } from './format-flag-outcome';
import type {
  Flag,
  FlagCondition,
  FlagEnvironmentConfig,
  FlagRule,
  FlagSettings,
} from './types';

const RHS_OPTIONAL_OPERATORS = new Set<string>(
  FLAG_CONDITION_RHS_OPTIONAL_COMPARATORS
);

export interface FlagRuleOutcomeOptions {
  variantSelector?: string;
  baseSelector?: string;
  defaultVariantSelector?: string;
  weightInputs: string[];
  rollFromVariantSelector?: string;
  rollToVariantSelector?: string;
  stageInputs: string[];
  start?: string;
}

export function parseFlagRuleConditions(inputs: string[]): FlagCondition[] {
  const conditionInputs = inputs.flatMap(input => {
    const trimmed = input.trim();
    if (!trimmed || trimmed.startsWith('{')) {
      return [trimmed];
    }
    return trimmed
      .split(';')
      .map(part => part.trim())
      .filter(Boolean);
  });

  if (conditionInputs.length === 0) {
    throw new Error(
      'At least one --condition is required. Use --condition <ENTITY.ATTRIBUTE:OPERATOR:VALUE>.'
    );
  }

  return conditionInputs.map(parseFlagRuleConditionInput);
}

export function parseFlagRuleConditionInput(input: string): FlagCondition {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Flag rule condition cannot be empty');
  }

  if (trimmed.startsWith('{')) {
    const value = parseJson(trimmed, 'flag rule condition');
    if (!isRecord(value)) {
      throw new Error('Flag rule condition JSON must be an object');
    }
    return value as unknown as FlagCondition;
  }

  const [field, operator, ...valueParts] = trimmed.split(':');
  if (!field || !operator) {
    throw new Error(
      `Invalid flag rule condition "${input}". Use ENTITY.ATTRIBUTE:OPERATOR:VALUE or segment:OPERATOR:SEGMENT.`
    );
  }

  const cmp = parseComparator(operator, 'flag rule');
  const rawValue = valueParts.join(':');
  if (!rawValue && !RHS_OPTIONAL_OPERATORS.has(cmp)) {
    throw new Error(`Flag rule condition "${input}" is missing a value`);
  }

  return {
    lhs: parseFlagConditionLhs(field),
    cmp,
    ...(rawValue
      ? {
          rhs: parseConditionValue(rawValue, cmp) as FlagCondition['rhs'],
        }
      : {}),
  };
}

export function hasFlagRuleOutcomeOptions(
  options: FlagRuleOutcomeOptions
): boolean {
  return Boolean(
    options.variantSelector ||
      options.baseSelector ||
      options.defaultVariantSelector ||
      options.weightInputs.length > 0 ||
      options.rollFromVariantSelector ||
      options.rollToVariantSelector ||
      options.stageInputs.length > 0 ||
      options.start
  );
}

export function needsFlagRuleOutcomeSettings(
  options: FlagRuleOutcomeOptions
): boolean {
  if (options.variantSelector) {
    return false;
  }

  return Boolean(
    options.baseSelector ||
      options.defaultVariantSelector ||
      options.weightInputs.length > 0 ||
      options.rollFromVariantSelector ||
      options.rollToVariantSelector ||
      options.stageInputs.length > 0 ||
      options.start
  );
}

export function resolveFlagRuleOutcome(
  flag: Flag,
  settings: FlagSettings | undefined,
  options: FlagRuleOutcomeOptions & {
    currentOutcome?: FlagRule['outcome'];
    requireOutcome?: boolean;
  }
): FlagRule['outcome'] {
  const hasVariant = Boolean(options.variantSelector);
  const hasRolloutOnlyOptions = Boolean(
    options.rollFromVariantSelector ||
      options.rollToVariantSelector ||
      options.stageInputs.length > 0 ||
      options.start
  );
  const hasSplitOnlyOptions = options.weightInputs.length > 0;
  const hasCommonOptions = Boolean(
    options.baseSelector || options.defaultVariantSelector
  );

  if (
    hasVariant &&
    (hasRolloutOnlyOptions || hasSplitOnlyOptions || hasCommonOptions)
  ) {
    throw new Error(
      'Cannot combine --variant with split or rollout outcome options.'
    );
  }

  if (hasRolloutOnlyOptions && hasSplitOnlyOptions) {
    throw new Error('Cannot combine --weight with rollout outcome options.');
  }

  if (options.variantSelector) {
    const variant = resolveVariantOrThrow(
      options.variantSelector,
      flag.variants,
      '--variant'
    );
    return {
      type: 'variant',
      variantId: variant.id,
    };
  }

  const shouldResolveRollout =
    hasRolloutOnlyOptions ||
    (hasCommonOptions && options.currentOutcome?.type === 'rollout');
  if (shouldResolveRollout) {
    const rollout = resolveFlagRollout(flag, requireFlagSettings(settings), {
      stageInputs: options.stageInputs,
      baseSelector: options.baseSelector,
      rollFromVariantSelector: options.rollFromVariantSelector,
      rollToVariantSelector: options.rollToVariantSelector,
      defaultVariantSelector: options.defaultVariantSelector,
      start: options.start,
      currentOutcome: options.currentOutcome,
    });

    return rollout.outcome;
  }

  const shouldResolveSplit = hasSplitOnlyOptions || hasCommonOptions;
  if (shouldResolveSplit) {
    const split = resolveFlagSplit(flag, requireFlagSettings(settings), {
      weightInputs: options.weightInputs,
      baseSelector: options.baseSelector,
      defaultVariantSelector: options.defaultVariantSelector,
      currentOutcome: options.currentOutcome,
    });

    return split.outcome;
  }

  if (options.currentOutcome && !options.requireOutcome) {
    return options.currentOutcome;
  }

  throw new Error(
    'Missing rule outcome. Use --variant <VARIANT>, split options such as --weight, or rollout options such as --stage.'
  );
}

export function createFlagRule(
  conditions: FlagCondition[],
  outcome: FlagRule['outcome']
): FlagRule {
  return {
    id: shortId('rule_'),
    conditions,
    outcome,
  };
}

export function addFlagRule(
  envConfig: FlagEnvironmentConfig,
  rule: FlagRule,
  position?: number
): FlagEnvironmentConfig {
  const rules = structuredClone(envConfig.rules ?? []);
  const insertionIndex = resolvePosition(position, rules.length + 1) - 1;
  rules.splice(insertionIndex, 0, rule);
  return buildRulesEnvironmentConfig(envConfig, rules);
}

export function removeFlagRule(
  envConfig: FlagEnvironmentConfig,
  ruleId: string
): FlagEnvironmentConfig {
  const rules = structuredClone(envConfig.rules ?? []);
  const ruleIndex = findFlagRuleIndex(rules, ruleId);
  rules.splice(ruleIndex, 1);
  return buildRulesEnvironmentConfig(envConfig, rules);
}

export function updateFlagRule(
  envConfig: FlagEnvironmentConfig,
  ruleId: string,
  updates: {
    conditions?: FlagCondition[];
    outcome?: FlagRule['outcome'];
  }
): FlagEnvironmentConfig {
  const rules = structuredClone(envConfig.rules ?? []);
  const ruleIndex = findFlagRuleIndex(rules, ruleId);
  rules[ruleIndex] = {
    ...rules[ruleIndex],
    ...(updates.conditions ? { conditions: updates.conditions } : {}),
    ...(updates.outcome ? { outcome: updates.outcome } : {}),
  };
  return buildRulesEnvironmentConfig(envConfig, rules);
}

export function moveFlagRule(
  envConfig: FlagEnvironmentConfig,
  ruleId: string,
  position: number
): FlagEnvironmentConfig {
  const rules = structuredClone(envConfig.rules ?? []);
  const targetPosition = resolvePosition(position, rules.length);
  const ruleIndex = findFlagRuleIndex(rules, ruleId);
  const [rule] = rules.splice(ruleIndex, 1);
  rules.splice(targetPosition - 1, 0, rule);
  return buildRulesEnvironmentConfig(envConfig, rules);
}

export function resolveEffectiveFlagRulesEnvironment(
  flag: Flag,
  environment: string
): {
  environment: string;
  envConfig: FlagEnvironmentConfig;
  inheritedFrom?: string;
} {
  const envConfig = flag.environments[environment];
  const inheritedFrom = envConfig.reuse?.active
    ? envConfig.reuse.environment
    : undefined;

  if (!inheritedFrom) {
    return { environment, envConfig };
  }

  const inheritedConfig = flag.environments[inheritedFrom];
  if (!inheritedConfig) {
    return { environment, envConfig };
  }

  return {
    environment,
    envConfig: inheritedConfig,
    inheritedFrom,
  };
}

export function getFlagRulesEnvironmentConfig(
  flag: Flag,
  environment: string
): FlagEnvironmentConfig {
  const envConfig = flag.environments[environment];
  const effectiveEnvironment = resolveEffectiveFlagRulesEnvironment(
    flag,
    environment
  );

  return {
    ...envConfig,
    rules: structuredClone(effectiveEnvironment.envConfig.rules ?? []),
  };
}

export function findFlagRule(rules: FlagRule[], ruleId: string): FlagRule {
  const rule = rules.find(rule => rule.id === ruleId);
  if (!rule) {
    throw new Error(`Rule "${ruleId}" does not exist.`);
  }
  return rule;
}

export function formatFlagRuleCondition(condition: FlagCondition): string {
  const lhs =
    condition.lhs.type === 'segment'
      ? 'segment'
      : `${condition.lhs.kind}.${condition.lhs.attribute}`;
  const comparator = formatFlagConditionComparator(
    condition.cmp,
    condition.cmpOptions
  );

  if (condition.rhs === undefined || condition.rhs === null) {
    return `${lhs} ${comparator}`;
  }

  if (isRecord(condition.rhs)) {
    if (
      Array.isArray(condition.rhs.items) &&
      (condition.rhs.type === 'list' || condition.rhs.type === 'list/inline')
    ) {
      return `${lhs} ${comparator} ${condition.rhs.items
        .map(formatListItem)
        .join(', ')}`;
    }

    return `${lhs} ${comparator} ${JSON.stringify(condition.rhs)}`;
  }

  return `${lhs} ${comparator} ${String(condition.rhs)}`;
}

export function formatFlagRuleOutcome(
  outcome: FlagRule['outcome'],
  variants: Parameters<typeof formatFlagOutcome>[1]
): string {
  return formatFlagOutcome(outcome, variants);
}

function buildRulesEnvironmentConfig(
  envConfig: FlagEnvironmentConfig,
  rules: FlagRule[]
): FlagEnvironmentConfig {
  const nextConfig: FlagEnvironmentConfig = {
    ...envConfig,
    active: true,
    rules,
  };

  if (envConfig.reuse) {
    nextConfig.reuse = {
      ...envConfig.reuse,
      active: false,
    };
  }

  return nextConfig;
}

function parseFlagConditionLhs(input: string): FlagCondition['lhs'] {
  const trimmed = input.trim();
  if (trimmed === 'segment') {
    return { type: 'segment' };
  }

  const [kind, ...attributeParts] = trimmed.split('.');
  const attribute = attributeParts.join('.');
  if (!kind || !attribute) {
    throw new Error(
      `Invalid condition target "${input}". Use ENTITY.ATTRIBUTE or segment.`
    );
  }

  return {
    type: 'entity',
    kind,
    attribute,
  };
}

function resolvePosition(position: number | undefined, max: number): number {
  if (position === undefined) {
    return max;
  }

  if (!Number.isInteger(position) || position < 1 || position > max) {
    throw new Error(`Position must be an integer between 1 and ${max}.`);
  }

  return position;
}

function findFlagRuleIndex(rules: FlagRule[], ruleId: string): number {
  const ruleIndex = rules.findIndex(rule => rule.id === ruleId);
  if (ruleIndex === -1) {
    throw new Error(`Rule "${ruleId}" does not exist.`);
  }
  return ruleIndex;
}

function shortId(prefix: string): string {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(12);
  let id = prefix;
  for (let i = 0; i < bytes.length; i++) {
    id += alphabet[bytes[i] % alphabet.length];
  }
  return id;
}

function requireFlagSettings(settings: FlagSettings | undefined): FlagSettings {
  if (!settings) {
    throw new Error('Flag settings are required to resolve this rule outcome.');
  }

  return settings;
}

function formatListItem(item: unknown): string {
  if (isRecord(item) && 'value' in item) {
    return String(item.value);
  }
  return String(item);
}

function parseJson(input: string, label: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    throw new Error(`Invalid JSON for ${label}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
