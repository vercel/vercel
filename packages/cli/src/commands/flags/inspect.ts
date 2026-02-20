import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import { getFlag, getFlagSettings } from '../../util/flags/get-flags';
import { getFlagDashboardUrl } from '../../util/flags/dashboard-url';
import output from '../../output-manager';
import { FlagsInspectTelemetryClient } from '../../util/telemetry/commands/flags/inspect';
import { inspectSubcommand } from './command';
import type {
  Flag,
  FlagCondition,
  FlagOutcome,
  FlagSettings,
  FlagSplitOutcome,
  FlagVariant,
} from '../../util/flags/types';
import { formatProject } from '../../util/projects/format-project';
import formatDate from '../../util/format-date';

export default async function inspect(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsInspectTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(inspectSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args } = parsedArgs;
  const [flagArg] = args;

  if (!flagArg) {
    output.error(
      `Missing required argument: flag. Usage: ${getCommandName('flags inspect <flag>')}`
    );
    return 1;
  }

  telemetryClient.trackCliArgumentFlag(flagArg);

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

  const { project, org } = link;
  const projectSlugLink = formatProject(org.slug, project.name);

  try {
    // Fetch both flag and settings in parallel
    const [flag, settings] = await Promise.all([
      getFlag(client, project.id, flagArg),
      getFlagSettings(client, project.id),
    ]);
    printFlagDetails(flag, settings, projectSlugLink, org.slug, project.name);
  } catch (err) {
    printError(err);
    return 1;
  }

  return 0;
}

/**
 * Resolves a targeting value to its label from flag settings.
 * Labels are stored at the project settings level, not on individual flags.
 */
function resolveTargetingLabel(
  settings: FlagSettings,
  entityKind: string,
  attribute: string,
  value: string
): string | undefined {
  const entity = settings.entities.find(e => e.kind === entityKind);
  if (!entity) return undefined;

  const attr = entity.attributes.find(a => a.key === attribute);
  if (!attr?.labels) return undefined;

  const labelEntry = attr.labels.find(l => l.value === value);
  return labelEntry?.label;
}

/**
 * Formats a rule outcome for display.
 */
function formatRuleOutcome(
  outcome: FlagOutcome | FlagSplitOutcome,
  variants: FlagVariant[]
): string {
  if (outcome.type === 'variant') {
    const variant = variants.find(v => v.id === outcome.variantId);
    return variant?.label || outcome.variantId;
  } else if (outcome.type === 'split') {
    const weights = Object.entries(outcome.weights)
      .map(([id, weight]) => {
        const variant = variants.find(v => v.id === id);
        const label = variant?.label || id;
        return `${label}: ${weight}%`;
      })
      .join(', ');
    return `split (${weights})`;
  }
  return 'unknown';
}

/**
 * Formats a rule condition for display.
 * Returns an object with the condition string and optional list items for multi-line display.
 */
function formatCondition(
  condition: FlagCondition,
  settings: FlagSettings
): { text: string; listItems?: string[] } {
  let lhs: string;
  if (condition.lhs.type === 'segment') {
    lhs = 'segment';
  } else {
    lhs = `${condition.lhs.kind}.${condition.lhs.attribute}`;
  }

  const cmp = chalk.dim(formatComparison(condition.cmp));

  if (condition.rhs === undefined || condition.rhs === null) {
    return { text: `${lhs} ${cmp}` };
  }

  if (typeof condition.rhs === 'object') {
    if (condition.rhs.type === 'list' && Array.isArray(condition.rhs.items)) {
      const items = condition.rhs.items.map(item => {
        // Extract value from item - it may be a string or an object with a value property
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

      // Return as list items for multi-line display
      return { text: `${lhs} ${cmp}`, listItems: items };
    }
    return { text: `${lhs} ${cmp} ${JSON.stringify(condition.rhs)}` };
  }

  // Simple value - check for label
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

/**
 * Formats a comparison operator for display.
 */
function formatComparison(cmp: string): string {
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
  return operators[cmp] || cmp;
}

function printFlagDetails(
  flag: Flag,
  settings: FlagSettings,
  projectSlugLink: string,
  orgSlug: string,
  projectName: string
) {
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

  output.print(
    `  ${chalk.dim('Created:')}      ${formatDate(flag.createdAt)}\n`
  );
  output.print(
    `  ${chalk.dim('Updated:')}      ${formatDate(flag.updatedAt)}\n`
  );

  // Print variants
  output.print(`\n  ${chalk.dim('Variants:')}\n`);
  for (const variant of flag.variants) {
    output.print(`    ${chalk.cyan(variant.id)}\n`);
    if (variant.label) {
      output.print(`      ${chalk.dim('Label:')} ${variant.label}\n`);
    }
    output.print(
      `      ${chalk.dim('Value:')} ${chalk.yellow(JSON.stringify(variant.value))}\n`
    );
  }

  // Print environment configurations in preferred order: production, preview, development
  const envOrder = ['production', 'preview', 'development'];
  const sortedEnvs = Object.entries(flag.environments).sort(([a], [b]) => {
    const aIndex = envOrder.indexOf(a);
    const bIndex = envOrder.indexOf(b);
    // Known environments sorted by order, unknown environments at the end
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  output.print(`\n  ${chalk.dim('Environments:')}\n`);
  for (const [envName, envConfig] of sortedEnvs) {
    if (envConfig.active) {
      // If this environment reuses another, just show that and skip details
      if (envConfig.reuse?.active) {
        output.print(
          `    ${chalk.bold(envName)}: reuses ${chalk.cyan(envConfig.reuse.environment)} environment\n`
        );
        continue;
      }

      output.print(`    ${chalk.bold(envName)}: ${chalk.green('active')}\n`);

      // Show custom targeting first
      if (envConfig.targets && Object.keys(envConfig.targets).length > 0) {
        output.print(`      ${chalk.dim('Targeting:')}\n`);
        for (const [variantId, entityKinds] of Object.entries(
          envConfig.targets
        )) {
          const variant = flag.variants.find(v => v.id === variantId);
          const variantLabel = variant?.label || variantId;
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
                `        ${chalk.dim(`${entityKind}.${attribute}:`)} ${valueList} ${chalk.dim('→')} ${variantLabel}\n`
              );
            }
          }
        }
      }

      // Show rules
      if (envConfig.rules && envConfig.rules.length > 0) {
        output.print(`      ${chalk.dim('Rules:')}\n`);
        for (const rule of envConfig.rules) {
          const outcome = formatRuleOutcome(rule.outcome, flag.variants);
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

      // Show default/fallthrough last (when nothing else matches)
      if (envConfig.fallthrough) {
        const fallthrough = envConfig.fallthrough;
        if (fallthrough.type === 'variant') {
          const defaultVariant = flag.variants.find(
            v => v.id === fallthrough.variantId
          );
          const defaultLabel = defaultVariant?.label || fallthrough.variantId;
          output.print(`      ${chalk.dim('Default:')} ${defaultLabel}\n`);
        } else if (fallthrough.type === 'split') {
          const weights = Object.entries(fallthrough.weights)
            .map(([id, weight]) => {
              const variant = flag.variants.find(v => v.id === id);
              const label = variant?.label || id;
              return `${label}: ${weight}%`;
            })
            .join(', ');
          output.print(`      ${chalk.dim('Default split:')} ${weights}\n`);
        }
      }
    } else {
      output.print(`    ${chalk.bold(envName)}: ${chalk.yellow('paused')}\n`);
    }
  }

  output.print('\n');
}
