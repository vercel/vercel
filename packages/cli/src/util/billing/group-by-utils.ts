import type { GroupByDimension } from '../../commands/usage/types';

export const VALID_GROUP_BY_DIMENSIONS: GroupByDimension[] = [
  'project',
  'region',
];

export function isValidGroupByDimension(
  value: string | undefined
): value is GroupByDimension {
  return (
    value !== undefined &&
    VALID_GROUP_BY_DIMENSIONS.includes(value as GroupByDimension)
  );
}
