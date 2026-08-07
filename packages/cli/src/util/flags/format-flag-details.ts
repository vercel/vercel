import chalk from 'chalk';
import { formatFlagConditionComparator } from './comparators';
import type { FlagCondition, FlagSettings } from './types';

export function resolveTargetingLabel(
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

export function formatFlagCondition(
  condition: FlagCondition,
  settings: FlagSettings | undefined
): { text: string; listItems?: string[] } {
  let lhs: string;
  if (condition.lhs.type === 'segment') {
    lhs = 'segment';
  } else {
    lhs = `${condition.lhs.kind}.${condition.lhs.attribute}`;
  }

  const cmp = chalk.dim(
    formatFlagConditionComparator(condition.cmp, condition.cmpOptions)
  );

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
