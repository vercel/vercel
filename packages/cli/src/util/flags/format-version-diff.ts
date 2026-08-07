import chalk from 'chalk';
import deepEqual from 'fast-deep-equal';
import { formatFlagCondition } from './format-flag-details';
import {
  formatFlagOutcome,
  formatFlagVariantSummary,
} from './format-flag-outcome';
import { formatVariantValue } from './resolve-variant';
import type {
  FlagCondition,
  FlagEnvironmentConfig,
  FlagOutcome,
  FlagRolloutOutcome,
  FlagRule,
  FlagSplitOutcome,
  FlagVariant,
  FlagVersion,
} from './types';

type VersionData = FlagVersion['data'];

type VersionDataForDiff = Omit<VersionData, 'environments'> & {
  environments: Record<string, Omit<FlagEnvironmentConfig, 'revision'>>;
};

export type VersionDiffChange = {
  path: string;
  action: 'added' | 'removed' | 'changed';
  before: unknown;
  after: unknown;
};

type DiffMarker = '+' | '-' | '~';

const ENVIRONMENT_ORDER = ['production', 'preview', 'development'];

export function normalizeVersionDataForDiff(
  data: VersionData
): VersionDataForDiff {
  return {
    ...data,
    permanent: data.permanent ?? false,
    environments: Object.fromEntries(
      Object.entries(data.environments).map(([environment, config]) => {
        const diffConfig = { ...config };
        delete diffConfig.revision;
        return [environment, diffConfig];
      })
    ),
  };
}

export function diffVersionData(
  before: VersionData,
  after: VersionData
): VersionDiffChange[] {
  return diffValues(
    normalizeVersionDataForDiff(before),
    normalizeVersionDataForDiff(after)
  );
}

export function formatVersionDataDiff(
  before: VersionData,
  after: VersionData
): string {
  const beforeData = normalizeVersionDataForDiff(before);
  const afterData = normalizeVersionDataForDiff(after);
  const lines: string[] = [];

  appendGeneralChanges(lines, beforeData, afterData);
  appendEnvironmentChanges(lines, beforeData, afterData);
  appendUnknownChanges(lines, beforeData, afterData);

  return lines.join('\n');
}

function appendGeneralChanges(
  lines: string[],
  before: VersionDataForDiff,
  after: VersionDataForDiff
) {
  const section: string[] = [];

  appendScalarChange(
    section,
    'Description',
    before.description,
    after.description
  );
  appendScalarChange(section, 'State', before.state, after.state);
  appendScalarChange(section, 'Permanent', before.permanent, after.permanent);
  appendListChange(section, 'Tags', before.tags ?? [], after.tags ?? []);
  appendListChange(
    section,
    'Maintainers',
    before.maintainerIds ?? [],
    after.maintainerIds ?? []
  );
  appendScalarChange(section, 'Seed', before.seed, after.seed);
  appendVariantChanges(section, before.variants, after.variants);

  appendSection(lines, 'General', section);
}

function appendEnvironmentChanges(
  lines: string[],
  before: VersionDataForDiff,
  after: VersionDataForDiff
) {
  const environments = new Set([
    ...Object.keys(before.environments),
    ...Object.keys(after.environments),
  ]);

  for (const environment of Array.from(environments).sort(sortEnvironments)) {
    const beforeEnvironment = before.environments[environment];
    const afterEnvironment = after.environments[environment];
    const section: string[] = [];

    if (!beforeEnvironment && afterEnvironment) {
      section.push(diffLine('+', 'Environment added', 4));
      appendEnvironmentSummary(section, afterEnvironment, after.variants, 6);
      appendSection(lines, formatEnvironmentName(environment), section);
      continue;
    }

    if (beforeEnvironment && !afterEnvironment) {
      section.push(diffLine('-', 'Environment removed', 4));
      appendEnvironmentSummary(section, beforeEnvironment, before.variants, 6);
      appendSection(lines, formatEnvironmentName(environment), section);
      continue;
    }

    if (
      !beforeEnvironment ||
      !afterEnvironment ||
      deepEqual(beforeEnvironment, afterEnvironment)
    ) {
      continue;
    }

    appendScalarChange(
      section,
      'Status',
      formatEnvironmentStatus(beforeEnvironment, before.variants),
      formatEnvironmentStatus(afterEnvironment, after.variants)
    );
    appendReuseChange(section, beforeEnvironment, afterEnvironment);
    appendOutcomeChange(
      section,
      'Paused outcome',
      beforeEnvironment.pausedOutcome,
      afterEnvironment.pausedOutcome,
      before.variants,
      after.variants
    );
    appendOutcomeChange(
      section,
      'Fallthrough',
      beforeEnvironment.fallthrough,
      afterEnvironment.fallthrough,
      before.variants,
      after.variants
    );
    appendRuleChanges(
      section,
      beforeEnvironment.rules ?? [],
      afterEnvironment.rules ?? [],
      before.variants,
      after.variants
    );
    appendTargetChanges(
      section,
      beforeEnvironment.targets,
      afterEnvironment.targets,
      before.variants,
      after.variants
    );
    appendUnknownEnvironmentChanges(
      section,
      beforeEnvironment,
      afterEnvironment
    );

    appendSection(lines, formatEnvironmentName(environment), section);
  }
}

function appendUnknownChanges(
  lines: string[],
  before: VersionDataForDiff,
  after: VersionDataForDiff
) {
  const beforeUnknown = omitKeys(before, [
    'description',
    'environments',
    'maintainerIds',
    'permanent',
    'seed',
    'state',
    'tags',
    'variants',
  ]);
  const afterUnknown = omitKeys(after, [
    'description',
    'environments',
    'maintainerIds',
    'permanent',
    'seed',
    'state',
    'tags',
    'variants',
  ]);
  const changes = diffValues(beforeUnknown, afterUnknown);
  if (changes.length > 0) {
    appendFallbackChanges(lines, 'Other', changes);
  }
}

function appendUnknownEnvironmentChanges(
  section: string[],
  before: Omit<FlagEnvironmentConfig, 'revision'>,
  after: Omit<FlagEnvironmentConfig, 'revision'>
) {
  const beforeUnknown = omitKeys(before, [
    'active',
    'fallthrough',
    'pausedOutcome',
    'reuse',
    'rules',
    'targets',
  ]);
  const afterUnknown = omitKeys(after, [
    'active',
    'fallthrough',
    'pausedOutcome',
    'reuse',
    'rules',
    'targets',
  ]);
  const changes = diffValues(beforeUnknown, afterUnknown);

  if (changes.length > 0) {
    section.push(line(chalk.bold('Other'), 4));
    appendFallbackChangeLines(section, changes, 6);
  }
}

function appendVariantChanges(
  section: string[],
  beforeVariants: FlagVariant[],
  afterVariants: FlagVariant[]
) {
  if (deepEqual(beforeVariants, afterVariants)) {
    return;
  }

  const beforeById = new Map(
    beforeVariants.map(variant => [variant.id, variant])
  );
  const afterById = new Map(
    afterVariants.map(variant => [variant.id, variant])
  );
  const variantLines: string[] = [];
  const beforeOrder = beforeVariants.map(variant => variant.id);
  const afterOrder = afterVariants.map(variant => variant.id);
  const commonBeforeOrder = beforeOrder.filter(id => afterById.has(id));
  const commonAfterOrder = afterOrder.filter(id => beforeById.has(id));

  if (
    commonBeforeOrder.length > 1 &&
    !deepEqual(commonBeforeOrder, commonAfterOrder)
  ) {
    variantLines.push(line(chalk.bold('Order'), 6));
    variantLines.push(diffLine('-', formatItemOrder(beforeOrder), 8));
    variantLines.push(diffLine('+', formatItemOrder(afterOrder), 8));
  }

  for (const id of Array.from(
    new Set([...beforeById.keys(), ...afterById.keys()])
  ).sort()) {
    const before = beforeById.get(id);
    const after = afterById.get(id);

    if (!before && after) {
      variantLines.push(diffLine('+', formatVariantSummary(after), 6));
      continue;
    }

    if (before && !after) {
      variantLines.push(diffLine('-', formatVariantSummary(before), 6));
      continue;
    }

    if (!before || !after || deepEqual(before, after)) {
      continue;
    }

    variantLines.push(
      diffLine('~', formatVariantChangeTitle(before, after), 6)
    );
    appendScalarChange(variantLines, 'Value', before.value, after.value, 8);
    appendScalarChange(variantLines, 'Label', before.label, after.label, 8);
    appendScalarChange(
      variantLines,
      'Description',
      before.description,
      after.description,
      8
    );
  }

  if (variantLines.length > 0) {
    section.push(line(chalk.bold('Variants'), 4));
    section.push(...variantLines);
  }
}

function appendRuleChanges(
  section: string[],
  beforeRules: FlagRule[],
  afterRules: FlagRule[],
  beforeVariants: FlagVariant[],
  afterVariants: FlagVariant[]
) {
  if (deepEqual(beforeRules, afterRules)) {
    return;
  }

  const beforeById = new Map(beforeRules.map(rule => [rule.id, rule]));
  const afterById = new Map(afterRules.map(rule => [rule.id, rule]));
  const ruleLines: string[] = [];
  const beforeOrder = beforeRules.map(rule => rule.id);
  const afterOrder = afterRules.map(rule => rule.id);
  const commonBeforeOrder = beforeOrder.filter(id => afterById.has(id));
  const commonAfterOrder = afterOrder.filter(id => beforeById.has(id));

  if (
    commonBeforeOrder.length > 1 &&
    !deepEqual(commonBeforeOrder, commonAfterOrder)
  ) {
    ruleLines.push(line(chalk.bold('Order'), 6));
    ruleLines.push(diffLine('-', formatItemOrder(beforeOrder), 8));
    ruleLines.push(diffLine('+', formatItemOrder(afterOrder), 8));
  }

  for (const id of Array.from(
    new Set([...beforeById.keys(), ...afterById.keys()])
  ).sort()) {
    const before = beforeById.get(id);
    const after = afterById.get(id);

    if (!before && after) {
      ruleLines.push(
        diffLine(
          '+',
          formatRuleTitle(after.id, afterOrder.indexOf(after.id), afterOrder),
          6
        )
      );
      ruleLines.push(...formatRuleDetails(after, afterVariants, 8));
      continue;
    }

    if (before && !after) {
      ruleLines.push(
        diffLine(
          '-',
          formatRuleTitle(
            before.id,
            beforeOrder.indexOf(before.id),
            beforeOrder
          ),
          6
        )
      );
      ruleLines.push(...formatRuleDetails(before, beforeVariants, 8));
      continue;
    }

    if (!before || !after || deepEqual(before, after)) {
      continue;
    }

    ruleLines.push(diffLine('~', after.id, 6));
    appendConditionChanges(ruleLines, before.conditions, after.conditions, 8);
    appendOutcomeChange(
      ruleLines,
      'Serve',
      before.outcome,
      after.outcome,
      beforeVariants,
      afterVariants,
      8,
      false
    );
  }

  if (ruleLines.length > 0) {
    section.push(line(chalk.bold('Rules'), 4));
    section.push(...ruleLines);
  }
}

function appendConditionChanges(
  lines: string[],
  beforeConditions: FlagCondition[],
  afterConditions: FlagCondition[],
  indent: number
) {
  const before = beforeConditions.map(condition => ({
    condition,
    key: JSON.stringify(condition),
  }));
  const after = afterConditions.map(condition => ({
    condition,
    key: JSON.stringify(condition),
  }));
  const removed = before.filter(
    beforeCondition =>
      !after.some(afterCondition => afterCondition.key === beforeCondition.key)
  );
  const added = after.filter(
    afterCondition =>
      !before.some(
        beforeCondition => beforeCondition.key === afterCondition.key
      )
  );

  if (removed.length === 0 && added.length === 0) {
    return;
  }

  lines.push(line(chalk.bold('Conditions'), indent));
  for (const { condition } of removed) {
    appendConditionDiff(lines, '-', condition, indent + 2);
  }
  for (const { condition } of added) {
    appendConditionDiff(lines, '+', condition, indent + 2);
  }
}

function appendTargetChanges(
  section: string[],
  beforeTargets: FlagEnvironmentConfig['targets'],
  afterTargets: FlagEnvironmentConfig['targets'],
  beforeVariants: FlagVariant[],
  afterVariants: FlagVariant[]
) {
  if (deepEqual(beforeTargets, afterTargets)) {
    return;
  }

  let before = formatTargets(beforeTargets, beforeVariants);
  let after = formatTargets(afterTargets, afterVariants);
  if (deepEqual(before, after)) {
    before = formatTargets(beforeTargets, beforeVariants, true);
    after = formatTargets(afterTargets, afterVariants, true);
  }
  appendStringSetChange(section, 'Targeting', before, after);
}

function appendOutcomeChange(
  lines: string[],
  label: string,
  before: FlagOutcome | FlagSplitOutcome | FlagRolloutOutcome | undefined,
  after: FlagOutcome | FlagSplitOutcome | FlagRolloutOutcome | undefined,
  beforeVariants: FlagVariant[],
  afterVariants: FlagVariant[],
  indent = 4,
  includeServe = true
) {
  if (deepEqual(before, after)) {
    return;
  }

  let beforeSummary = before
    ? formatOutcome(before, beforeVariants, includeServe)
    : undefined;
  let afterSummary = after
    ? formatOutcome(after, afterVariants, includeServe)
    : undefined;

  if (deepEqual(beforeSummary, afterSummary)) {
    beforeSummary = before
      ? formatOutcome(before, beforeVariants, includeServe, true)
      : undefined;
    afterSummary = after
      ? formatOutcome(after, afterVariants, includeServe, true)
      : undefined;
  }

  appendScalarChange(lines, label, beforeSummary, afterSummary, indent);
}

function appendReuseChange(
  section: string[],
  before: Omit<FlagEnvironmentConfig, 'revision'>,
  after: Omit<FlagEnvironmentConfig, 'revision'>
) {
  appendScalarChange(
    section,
    'Reuse',
    formatReuse(before.reuse),
    formatReuse(after.reuse)
  );
}

function appendEnvironmentSummary(
  lines: string[],
  environment: Omit<FlagEnvironmentConfig, 'revision'>,
  variants: FlagVariant[],
  indent: number
) {
  lines.push(
    line(
      `${chalk.dim('Status:')} ${formatEnvironmentStatus(environment, variants)}`,
      indent
    )
  );
  if (environment.reuse?.active) {
    lines.push(
      line(`${chalk.dim('Reuse:')} ${formatReuse(environment.reuse)}`, indent)
    );
    return;
  }
  if (!environment.active && environment.pausedOutcome) {
    lines.push(
      line(
        `${chalk.dim('Paused outcome:')} ${formatOutcome(
          environment.pausedOutcome,
          variants
        )}`,
        indent
      )
    );
    return;
  }
  lines.push(
    line(
      `${chalk.dim('Fallthrough:')} ${formatOutcome(
        environment.fallthrough,
        variants
      )}`,
      indent
    )
  );
  const ruleCount = environment.rules?.length ?? 0;
  if (ruleCount > 0) {
    lines.push(
      line(`${chalk.dim('Rules:')} ${chalk.bold(String(ruleCount))}`, indent)
    );
  }
  const targets = formatTargets(environment.targets, variants);
  if (targets.length > 0) {
    lines.push(
      line(
        `${chalk.dim('Targets:')} ${chalk.bold(String(targets.length))}`,
        indent
      )
    );
  }
}

function appendScalarChange(
  lines: string[],
  label: string,
  before: unknown,
  after: unknown,
  indent = 4
) {
  if (deepEqual(before, after)) {
    return;
  }

  lines.push(line(chalk.bold(label), indent));
  lines.push(diffLine('-', formatScalarValue(before), indent + 2));
  lines.push(diffLine('+', formatScalarValue(after), indent + 2));
}

function appendListChange(
  lines: string[],
  label: string,
  before: string[],
  after: string[],
  indent = 4
) {
  appendStringSetChange(lines, label, before, after, indent);
}

function appendStringSetChange(
  lines: string[],
  label: string,
  before: string[],
  after: string[],
  indent = 4
) {
  const removed = before.filter(item => !after.includes(item)).sort();
  const added = after.filter(item => !before.includes(item)).sort();

  if (removed.length === 0 && added.length === 0) {
    return;
  }

  lines.push(line(chalk.bold(label), indent));
  for (const item of removed) {
    lines.push(diffLine('-', item, indent + 2));
  }
  for (const item of added) {
    lines.push(diffLine('+', item, indent + 2));
  }
}

function appendSection(lines: string[], title: string, section: string[]) {
  if (section.length === 0) {
    return;
  }

  if (lines.length > 0) {
    lines.push('');
  }
  lines.push(line(chalk.bold(title), 2));
  lines.push(...section);
}

function appendFallbackChanges(
  lines: string[],
  title: string,
  changes: VersionDiffChange[]
) {
  const section: string[] = [];
  appendFallbackChangeLines(section, changes, 4);
  appendSection(lines, title, section);
}

function appendFallbackChangeLines(
  lines: string[],
  changes: VersionDiffChange[],
  indent: number
) {
  for (const change of changes) {
    lines.push(line(chalk.bold(change.path || 'value'), indent));
    if (change.action !== 'added') {
      lines.push(diffLine('-', formatScalarValue(change.before), indent + 2));
    }
    if (change.action !== 'removed') {
      lines.push(diffLine('+', formatScalarValue(change.after), indent + 2));
    }
  }
}

function formatRuleDetails(
  rule: FlagRule,
  variants: FlagVariant[],
  indent: number
): string[] {
  const lines: string[] = [];
  lines.push(
    line(
      `${chalk.dim('→')} ${formatOutcome(rule.outcome, variants, false)}`,
      indent
    )
  );
  for (const condition of rule.conditions) {
    appendConditionDetails(lines, condition, indent + 2);
  }
  return lines;
}

function appendConditionDetails(
  lines: string[],
  condition: FlagCondition,
  indent: number
) {
  const { text, listItems } = formatFlagCondition(condition, undefined);
  lines.push(line(`${chalk.dim('if')} ${text}`, indent));
  for (const item of listItems ?? []) {
    lines.push(line(`${chalk.dim('-')} ${item}`, indent + 3));
  }
}

function appendConditionDiff(
  lines: string[],
  marker: DiffMarker,
  condition: FlagCondition,
  indent: number
) {
  const { text, listItems } = formatFlagCondition(condition, undefined);
  lines.push(diffLine(marker, `${chalk.dim('if')} ${text}`, indent));
  for (const item of listItems ?? []) {
    lines.push(line(`${chalk.dim('-')} ${item}`, indent + 3));
  }
}

function formatTargets(
  targets: FlagEnvironmentConfig['targets'],
  variants: FlagVariant[],
  includeVariantId = false
): string[] {
  const lines: string[] = [];

  for (const [variantId, entityKinds] of Object.entries(targets ?? {})) {
    for (const [entityKind, attributes] of Object.entries(entityKinds)) {
      for (const [attribute, values] of Object.entries(attributes)) {
        for (const target of values) {
          const variant = variants.find(
            candidate => candidate.id === variantId
          );
          lines.push(
            `${chalk.dim(`${entityKind}.${attribute}:`)} ${formatTargetValue(
              target
            )} ${chalk.dim('→')} ${formatFlagVariantSummary(
              variant,
              variantId,
              includeVariantId
            )}`
          );
        }
      }
    }
  }

  return lines.sort();
}

function formatTargetValue(target: { value: string; note?: string }): string {
  if (!target.note) {
    return target.value;
  }
  return `${target.value} ${chalk.gray(`(${target.note})`)}`;
}

function formatEnvironmentStatus(
  environment: Omit<FlagEnvironmentConfig, 'revision'>,
  variants: FlagVariant[]
): string {
  if (environment.active) {
    return chalk.green('active');
  }

  if (!environment.pausedOutcome) {
    return chalk.gray('paused');
  }

  return `${chalk.gray('paused')}, ${chalk.dim('serving')} ${formatOutcome(
    environment.pausedOutcome,
    variants,
    false
  )}`;
}

function formatReuse(reuse: FlagEnvironmentConfig['reuse']): string {
  if (!reuse?.active) {
    return chalk.gray('none');
  }
  return `${chalk.dim('reusing')} ${chalk.cyan(
    formatEnvironmentName(reuse.environment)
  )}`;
}

function formatOutcome(
  outcome: FlagOutcome | FlagSplitOutcome | FlagRolloutOutcome,
  variants: FlagVariant[],
  includeServe = true,
  includeVariantId = false
): string {
  const prefix = includeServe ? `${chalk.dim('Serve')} ` : '';
  const summary = formatFlagOutcome(outcome, variants, includeVariantId);

  if (outcome.type === 'split') {
    const defaultVariant = variants.find(
      variant => variant.id === outcome.defaultVariantId
    );
    return `${prefix}${summary}; ${chalk.dim('by')} ${formatBucketingBase(
      outcome.base
    )}; ${chalk.dim('Fallback:')} ${formatFlagVariantSummary(
      defaultVariant,
      outcome.defaultVariantId,
      includeVariantId
    )}`;
  }

  if (outcome.type === 'rollout') {
    return `${prefix}${summary}; ${chalk.dim('by')} ${formatBucketingBase(
      outcome.base
    )}; ${chalk.dim('Starts:')} ${formatTimestamp(outcome.startTimestamp)}`;
  }

  return `${prefix}${summary}`;
}

function formatBucketingBase(base: {
  kind: string;
  attribute: string;
}): string {
  return `${base.kind}.${base.attribute}`;
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? String(timestamp) : date.toISOString();
}

function formatItemOrder(ids: string[]): string {
  return ids.join(` ${chalk.dim('→')} `);
}

function formatRuleTitle(
  ruleId: string,
  index: number,
  ruleOrder: string[]
): string {
  if (ruleOrder.length === 1) {
    return ruleId;
  }
  return `${ruleId} ${chalk.dim(`(position ${index + 1})`)}`;
}

function formatVariantChangeTitle(
  before: FlagVariant,
  after: FlagVariant
): string {
  const label = after.label ?? before.label;
  return label ? `${chalk.bold(label)} (${chalk.dim(after.id)})` : after.id;
}

function formatVariantSummary(variant: FlagVariant): string {
  const details = [
    `${chalk.dim('id:')} ${variant.id}`,
    `${chalk.dim('value:')} ${chalk.bold(formatVariantValue(variant.value))}`,
  ];
  if (variant.label) {
    details.unshift(chalk.bold(variant.label));
  }
  return details.join(', ');
}

function formatScalarValue(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return '-';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  return JSON.stringify(sortObjectKeys(value), null, 2);
}

function formatEnvironmentName(environment: string): string {
  return environment.charAt(0).toUpperCase() + environment.slice(1);
}

function line(text: string, indent: number): string {
  return `${' '.repeat(indent)}${text}`;
}

function diffLine(marker: DiffMarker, text: string, indent: number): string {
  const color =
    marker === '+' ? chalk.green : marker === '-' ? chalk.red : chalk.yellow;
  return line(color(`${marker} ${text}`), indent);
}

function sortEnvironments(a: string, b: string): number {
  const aIndex = ENVIRONMENT_ORDER.indexOf(a);
  const bIndex = ENVIRONMENT_ORDER.indexOf(b);
  if (aIndex === -1 && bIndex === -1) {
    return a.localeCompare(b);
  }
  if (aIndex === -1) {
    return 1;
  }
  if (bIndex === -1) {
    return -1;
  }
  return aIndex - bIndex;
}

function omitKeys<T extends Record<string, unknown>>(
  value: T,
  keys: string[]
): Record<string, unknown> {
  const omitted = { ...value };
  for (const key of keys) {
    delete omitted[key];
  }
  return omitted;
}

function diffValues(
  before: unknown,
  after: unknown,
  path = ''
): VersionDiffChange[] {
  if (deepEqual(before, after)) {
    return [];
  }

  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = Array.from(
      new Set([...Object.keys(before), ...Object.keys(after)])
    ).sort();
    return keys.flatMap(key =>
      diffValues(before[key], after[key], joinPath(path, key))
    );
  }

  return [
    {
      path,
      action:
        before === undefined
          ? 'added'
          : after === undefined
            ? 'removed'
            : 'changed',
      before,
      after,
    },
  ];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function joinPath(path: string, key: string): string {
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) {
    return path ? `${path}.${key}` : key;
  }
  return `${path}[${JSON.stringify(key)}]`;
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, sortObjectKeys(value[key])])
    );
  }
  return value;
}
