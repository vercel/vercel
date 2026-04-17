import chalk from 'chalk';
import ms from 'ms';
import output from '../../output-manager';
import formatDate from '../format-date';
import { getFlagDashboardUrl } from './dashboard-url';
import { formatVariantValue } from './resolve-variant';
import type {
  Flag,
  FlagCondition,
  FlagEnvironmentConfig,
  FlagOutcome,
  FlagRolloutOutcome,
  FlagSettings,
  FlagSplitOutcome,
  FlagVariant,
} from './types';

interface PrintFlagDetailsOptions {
  flag: Flag;
  settings?: FlagSettings;
  projectSlugLink: string;
  orgSlug: string;
  projectName: string;
  showTimestamps?: boolean;
}

export function printFlagDetails({
  flag,
  settings,
  projectSlugLink,
  orgSlug,
  projectName,
  showTimestamps = true,
}: PrintFlagDetailsOptions) {
  const dashboardUrl = getFlagDashboardUrl(orgSlug, projectName, flag.slug);

  output.log(
    `\nFeature flag ${chalk.bold(flag.slug)} for ${projectSlugLink}\n`
  );
  output.print(`  ${chalk.cyan(dashboardUrl)}\n\n`);

  output.print(`  ${chalk.dim('ID:')}           ${flag.id}\n`);
  output.print(`  ${chalk.dim('Kind:')}         ${flag.kind}\n`);
  output.print(
    `  ${chalk.dim('State:')}        ${flag.state === 'active' ? chalk.green(flag.state) : chalk.gray(flag.state)}\n`
  );

  if (flag.description) {
    output.print(`  ${chalk.dim('Description:')}  ${flag.description}\n`);
  }

  if (showTimestamps) {
    output.print(
      `  ${chalk.dim('Created:')}      ${formatDate(flag.createdAt)}\n`
    );
    output.print(
      `  ${chalk.dim('Updated:')}      ${formatDate(flag.updatedAt)}\n`
    );
  }

  output.print(`\n  ${chalk.dim('Variants:')}\n`);
  for (const [index, variant] of flag.variants.entries()) {
    output.print(`    ${formatVariantListSummary(variant)}\n`);
    output.print(`      ${chalk.dim(`id: ${variant.id}`)}\n`);
    if (index < flag.variants.length - 1) {
      output.print('\n');
    }
  }

  printFlagEnvironmentDetails(flag, settings);
}

export function printFlagEnvironmentDetails(
  flag: Flag,
  settings?: FlagSettings,
  environments?: string[]
) {
  const sortedEnvs = getSortedEnvironmentEntries(flag, environments);

  output.print(`\n  ${chalk.dim('Environments:')}\n`);
  for (const [envName, envConfig] of sortedEnvs) {
    if (envConfig.reuse?.active) {
      output.print(
        `    ${chalk.bold(envName)}: reuses ${chalk.cyan(envConfig.reuse.environment)} environment\n`
      );
      continue;
    }

    if (envConfig.active) {
      const hasCustomConfiguration = hasCustomConfigurationEnabled(envConfig);
      const envSummary = hasCustomConfiguration
        ? 'custom'
        : formatEnvironmentOutcome(envConfig.fallthrough, flag.variants);

      output.print(`    ${chalk.bold(envName)}: ${envSummary}\n`);

      if (envConfig.targets && Object.keys(envConfig.targets).length > 0) {
        output.print(`      ${chalk.dim('Targeting:')}\n`);
        for (const [variantId, entityKinds] of Object.entries(
          envConfig.targets
        )) {
          const variant = flag.variants.find(v => v.id === variantId);
          const variantSummary = formatEnvironmentVariantSummary(
            variant,
            variantId
          );
          for (const [entityKind, attributes] of Object.entries(entityKinds)) {
            for (const [attribute, values] of Object.entries(attributes)) {
              const valueList = values
                .map(v => {
                  const label = resolveTargetingLabel(
                    settings,
                    entityKind,
                    attribute,
                    v.value
                  );
                  return label ? `${v.value} ${chalk.gray(label)}` : v.value;
                })
                .join(', ');
              output.print(
                `        ${chalk.dim(`${entityKind}.${attribute}:`)} ${valueList} ${chalk.dim('→')} ${variantSummary}\n`
              );
            }
          }
        }
      }

      if (envConfig.rules && envConfig.rules.length > 0) {
        output.print(`      ${chalk.dim('Rules:')}\n`);
        for (const rule of envConfig.rules) {
          const outcome = formatEnvironmentOutcome(rule.outcome, flag.variants);
          output.print(`        ${chalk.dim('→')} ${outcome}\n`);
          for (const condition of rule.conditions) {
            const { text, listItems } = formatCondition(condition, settings);
            output.print(`          ${chalk.dim('if')} ${text}\n`);
            if (listItems && listItems.length > 0) {
              for (const item of listItems) {
                output.print(`             ${chalk.dim('-')} ${item}\n`);
              }
            }
          }
        }
      }

      if (hasCustomConfiguration && envConfig.fallthrough) {
        const fallthrough = envConfig.fallthrough;
        if (fallthrough.type === 'variant') {
          const defaultVariant = flag.variants.find(
            v => v.id === fallthrough.variantId
          );
          const defaultSummary = formatEnvironmentVariantSummary(
            defaultVariant,
            fallthrough.variantId
          );
          output.print(`      ${chalk.dim('Default:')} ${defaultSummary}\n`);
        } else if (fallthrough.type === 'split') {
          const weights = formatSplitWeights(
            fallthrough.weights,
            flag.variants
          );
          output.print(`      ${chalk.dim('Default split:')} ${weights}\n`);
        } else if (fallthrough.type === 'rollout') {
          output.print(
            `      ${chalk.dim('Rollout:')} ${formatRolloutOutcome(
              fallthrough,
              flag.variants
            )}\n`
          );
        }
      }
    } else {
      const pausedVariant = flag.variants.find(
        v => v.id === envConfig.pausedOutcome?.variantId
      );
      const pausedSummary = formatEnvironmentVariantSummary(
        pausedVariant,
        envConfig.pausedOutcome?.variantId || 'paused'
      );
      output.print(`    ${chalk.bold(envName)}: ${pausedSummary}\n`);
    }
  }

  output.print('\n');
}

function getSortedEnvironmentEntries(
  flag: Flag,
  environments?: string[]
): [string, FlagEnvironmentConfig][] {
  const envOrder = ['production', 'preview', 'development'];
  const selectedEnvironments = environments ? new Set(environments) : undefined;

  return Object.entries(flag.environments)
    .filter(([envName]) =>
      selectedEnvironments ? selectedEnvironments.has(envName) : true
    )
    .sort(([a], [b]) => {
      const aIndex = envOrder.indexOf(a);
      const bIndex = envOrder.indexOf(b);

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
    });
}
function resolveTargetingLabel(
  settings: FlagSettings | undefined,
  entityKind: string,
  attribute: string,
  value: string
): string | undefined {
  if (!settings) {
    return undefined;
  }

  const entity = settings.entities.find(e => e.kind === entityKind);
  if (!entity) {
    return undefined;
  }

  const attr = entity.attributes.find(a => a.key === attribute);
  if (!attr?.labels) {
    return undefined;
  }

  const labelEntry = attr.labels.find(l => l.value === value);
  return labelEntry?.label;
}

function hasCustomConfigurationEnabled(
  envConfig: FlagEnvironmentConfig
): boolean {
  return (
    Boolean(envConfig.targets && Object.keys(envConfig.targets).length > 0) ||
    envConfig.rules.length > 0 ||
    envConfig.fallthrough.type === 'split' ||
    envConfig.fallthrough.type === 'rollout'
  );
}

function formatEnvironmentOutcome(
  outcome: FlagOutcome | FlagSplitOutcome | FlagRolloutOutcome,
  variants: FlagVariant[]
): string {
  if (outcome.type === 'variant') {
    const variant = variants.find(v => v.id === outcome.variantId);
    return formatEnvironmentVariantSummary(variant, outcome.variantId);
  }

  if (outcome.type === 'split') {
    const weights = formatSplitWeights(outcome.weights, variants);
    return `split (${weights})`;
  }

  if (outcome.type === 'rollout') {
    return formatRolloutOutcome(outcome, variants);
  }

  return 'unknown';
}

function formatSplitWeights(
  weights: Record<string, number>,
  variants: FlagVariant[]
): string {
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);

  return Object.entries(weights)
    .map(([id, weight]) => {
      const variant = variants.find(v => v.id === id);
      const summary = formatEnvironmentVariantSummary(variant, id);
      const percentage = total > 0 ? (weight / total) * 100 : 0;
      const formattedPercentage = Number.isInteger(percentage)
        ? String(percentage)
        : String(Number(percentage.toFixed(2)));

      return `${summary}: ${formattedPercentage}%`;
    })
    .join(', ');
}

function formatEnvironmentVariantSummary(
  variant: FlagVariant | undefined,
  fallback: string
): string {
  if (!variant) {
    return chalk.bold(fallback);
  }

  if (variant.label) {
    return chalk.bold(variant.label);
  }

  return chalk.bold(formatVariantValue(variant.value));
}

function formatRolloutOutcome(
  outcome: FlagRolloutOutcome,
  variants: FlagVariant[]
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

  return `${formatEnvironmentVariantSummary(
    fromVariant,
    outcome.rollFromVariantId
  )} -> ${formatEnvironmentVariantSummary(
    toVariant,
    outcome.rollToVariantId
  )}; ${stages}; then 100%; Fallback: ${formatEnvironmentVariantSummary(
    defaultVariant,
    outcome.defaultVariantId
  )}`;
}

function formatVariantListSummary(variant: FlagVariant): string {
  const value = formatVariantValue(variant.value);
  if (!variant.label) {
    return value;
  }

  return `${value}: ${chalk.gray(variant.label)}`;
}

function formatCondition(
  condition: FlagCondition,
  settings: FlagSettings | undefined
): { text: string; listItems?: string[] } {
  let lhs: string;
  if (condition.lhs.type === 'segment') {
    lhs = 'segment';
  } else {
    lhs = `${condition.lhs.kind}.${condition.lhs.attribute}`;
  }

  const cmp = chalk.dim(formatComparison(condition));

  if (condition.rhs === undefined || condition.rhs === null) {
    return { text: `${lhs} ${cmp}` };
  }

  if (typeof condition.rhs === 'object') {
    if (
      (condition.rhs.type === 'list' || condition.rhs.type === 'list/inline') &&
      Array.isArray(condition.rhs.items)
    ) {
      const items = condition.rhs.items.map(item => {
        const itemValue =
          typeof item === 'object' && item !== null && 'value' in item
            ? String((item as { value: unknown }).value)
            : String(item);

        if (condition.lhs.type === 'entity') {
          const label = resolveTargetingLabel(
            settings,
            condition.lhs.kind,
            condition.lhs.attribute,
            itemValue
          );
          return label ? `${itemValue} ${chalk.gray(label)}` : itemValue;
        }

        return itemValue;
      });

      return { text: `${lhs} ${cmp}`, listItems: items };
    }

    return { text: `${lhs} ${cmp} ${JSON.stringify(condition.rhs)}` };
  }

  let rhs: string;
  if (condition.lhs.type === 'entity') {
    const label = resolveTargetingLabel(
      settings,
      condition.lhs.kind,
      condition.lhs.attribute,
      String(condition.rhs)
    );
    rhs = label
      ? `${condition.rhs} ${chalk.gray(label)}`
      : String(condition.rhs);
  } else {
    rhs = String(condition.rhs);
  }

  return { text: `${lhs} ${cmp} ${rhs}` };
}

function formatComparison(condition: FlagCondition): string {
  const operators: Record<string, string> = {
    eq: 'is',
    oneOf: 'is in',
    gt: 'is greater than',
    gte: 'is greater than or equal to',
    lt: 'is less than',
    lte: 'is less than or equal to',
    ex: 'has any value',
    '!ex': 'has no value',
    startsWith: 'starts with',
    endsWith: 'ends with',
    containsAnyOf: 'contains any of',
    containsAllOf: 'contains all of',
    containsNoneOf: 'contains none of',
  };
  const label = operators[condition.cmp] || condition.cmp;

  if (condition.cmpOptions?.ignoreCase) {
    return `${label} (case-insensitive)`;
  }

  return label;
}
