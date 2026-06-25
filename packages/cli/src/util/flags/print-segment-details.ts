import chalk from 'chalk';
import output from '../../output-manager';
import formatDate from '../format-date';
import { formatFlagConditionComparator } from './comparators';
import type {
  Segment,
  SegmentCondition,
  SegmentConditionValue,
  SegmentMembershipMap,
  SegmentRuleOutcome,
} from './types';

interface PrintSegmentDetailsOptions {
  segment: Segment;
  projectSlugLink: string;
  showTimestamps?: boolean;
}

export function printSegmentDetails({
  segment,
  projectSlugLink,
  showTimestamps = true,
}: PrintSegmentDetailsOptions) {
  output.log(
    `\nFeature flag segment ${chalk.bold(segment.slug)} for ${projectSlugLink}\n`
  );

  output.print(`  ${chalk.dim('ID:')}           ${segment.id}\n`);
  output.print(`  ${chalk.dim('Label:')}        ${segment.label}\n`);
  if (segment.description) {
    output.print(`  ${chalk.dim('Description:')}  ${segment.description}\n`);
  }
  if (segment.usedByFlags) {
    output.print(
      `  ${chalk.dim('Used by flags:')} ${segment.usedByFlags.length}\n`
    );
  }
  if (segment.usedBySegments) {
    output.print(
      `  ${chalk.dim('Used by segments:')} ${segment.usedBySegments.length}\n`
    );
  }

  if (showTimestamps) {
    output.print(
      `  ${chalk.dim('Created:')}      ${formatDate(segment.createdAt)}\n`
    );
    output.print(
      `  ${chalk.dim('Updated:')}      ${formatDate(segment.updatedAt)}\n`
    );
  }

  printSegmentData(segment);
}

function printSegmentData(segment: Segment) {
  const { rules = [], include = {}, exclude = {} } = segment.data;

  output.print(`\n  ${chalk.dim('Rules:')}\n`);
  if (rules.length === 0) {
    output.print(`    ${chalk.dim('-')}\n`);
  } else {
    for (const rule of rules) {
      output.print(`    ${chalk.dim('Rule ID:')} ${rule.id}\n`);
      output.print(`    ${chalk.dim('→')} ${formatOutcome(rule.outcome)}\n`);
      for (const condition of rule.conditions) {
        output.print(
          `      ${chalk.dim('if')} ${formatCondition(condition)}\n`
        );
      }
    }
  }

  printMembership('Include', include);
  printMembership('Exclude', exclude);
  output.print('\n');
}

function printMembership(label: string, map: SegmentMembershipMap) {
  output.print(`\n  ${chalk.dim(`${label}:`)}\n`);
  const entries = getMembershipEntries(map);
  if (entries.length === 0) {
    output.print(`    ${chalk.dim('-')}\n`);
    return;
  }

  for (const entry of entries) {
    const note = entry.note ? chalk.gray(` (${entry.note})`) : '';
    output.print(
      `    ${chalk.dim(`${entry.entity}.${entry.attribute}:`)} ${entry.value}${note}\n`
    );
  }
}

function getMembershipEntries(map: SegmentMembershipMap) {
  return Object.entries(map).flatMap(([entity, attributes]) =>
    Object.entries(attributes).flatMap(([attribute, values]) =>
      values.map(value => ({
        entity,
        attribute,
        value: value.value,
        note: value.note,
      }))
    )
  );
}

function formatOutcome(outcome: SegmentRuleOutcome): string {
  if (outcome.type === 'all') {
    return 'match all conditions';
  }

  return `match ${outcome.passPromille / 10}% by ${outcome.base.kind}.${outcome.base.attribute}`;
}

function formatCondition(condition: SegmentCondition): string {
  const lhs =
    condition.lhs.type === 'entity'
      ? `${condition.lhs.kind}.${condition.lhs.attribute}`
      : 'segment';
  const rhs =
    condition.rhs === undefined ? '' : ` ${formatValue(condition.rhs)}`;
  return `${lhs} ${formatFlagConditionComparator(condition.cmp)}${rhs}`;
}

function formatValue(value: SegmentConditionValue): string {
  if (typeof value !== 'object' || value === null) {
    return JSON.stringify(value);
  }

  if (value.type === 'list' || value.type === 'list/inline') {
    return value.items.map(item => JSON.stringify(item.value)).join(', ');
  }

  if (value.type === 'regex') {
    return `/${value.pattern}/${value.flags}`;
  }

  return JSON.stringify(value);
}
