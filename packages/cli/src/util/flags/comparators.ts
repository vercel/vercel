export const FLAG_CONDITION_COMPARATORS = [
  'eq',
  '!eq',
  'oneOf',
  '!oneOf',
  'containsAllOf',
  'containsAnyOf',
  'containsNoneOf',
  'startsWith',
  'endsWith',
  'contains',
  '!contains',
  'ex',
  '!ex',
  'gt',
  'gte',
  'lt',
  'lte',
] as const;

export type FlagConditionComparator =
  (typeof FLAG_CONDITION_COMPARATORS)[number];

export const FLAG_CONDITION_LIST_COMPARATORS = [
  'oneOf',
  '!oneOf',
  'containsAllOf',
  'containsAnyOf',
  'containsNoneOf',
] as const satisfies readonly FlagConditionComparator[];

export const FLAG_CONDITION_RHS_OPTIONAL_COMPARATORS = [
  'ex',
  '!ex',
] as const satisfies readonly FlagConditionComparator[];

export function formatFlagConditionComparatorList(): string {
  return FLAG_CONDITION_COMPARATORS.join(', ');
}

const FLAG_CONDITION_COMPARATOR_LABELS = {
  eq: 'is',
  '!eq': 'is not',
  oneOf: 'is in',
  '!oneOf': 'is not in',
  containsAllOf: 'contains all of',
  containsAnyOf: 'contains any of',
  containsNoneOf: 'contains none of',
  startsWith: 'starts with',
  endsWith: 'ends with',
  contains: 'contains',
  '!contains': 'does not contain',
  ex: 'has any value',
  '!ex': 'has no value',
  gt: 'is greater than',
  gte: 'is greater than or equal to',
  lt: 'is less than',
  lte: 'is less than or equal to',
} as const satisfies Record<FlagConditionComparator, string>;

const LEGACY_FLAG_CONDITION_COMPARATOR_LABELS: Record<string, string> = {
  notContains: FLAG_CONDITION_COMPARATOR_LABELS['!contains'],
};

export function formatFlagConditionComparator(
  comparator: string,
  options?: { ignoreCase?: boolean }
): string {
  const label =
    FLAG_CONDITION_COMPARATOR_LABELS[comparator as FlagConditionComparator] ??
    LEGACY_FLAG_CONDITION_COMPARATOR_LABELS[comparator] ??
    comparator;

  if (options?.ignoreCase) {
    return `${label} (case-insensitive)`;
  }

  return label;
}
