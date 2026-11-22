import type { FlagSettings, FlagSettingsAttribute } from './types';

export const TIMESTAMP_IDENTIFY_HELP =
  'Pass Timestamp values as epoch milliseconds in identify() / evaluation context';

export const FLAG_ATTRIBUTE_TYPES = [
  'string',
  'number',
  'boolean',
  'stringArray',
  'timestamp',
] as const;

export type FlagAttributeType = (typeof FLAG_ATTRIBUTE_TYPES)[number];

export function isFlagAttributeType(type: string): type is FlagAttributeType {
  return (FLAG_ATTRIBUTE_TYPES as readonly string[]).includes(type);
}

export function formatFlagAttributeTypeList(): string {
  return FLAG_ATTRIBUTE_TYPES.join(', ');
}

export function isTimestampAttributeType(type: string | undefined): boolean {
  return type === 'timestamp';
}

export function isBucketingAttribute(
  attribute: Pick<FlagSettingsAttribute, 'type'>
): boolean {
  return !isTimestampAttributeType(attribute.type);
}

export function getFlagAttributeType(
  settings: FlagSettings | undefined,
  kind: string,
  attribute: string
): string | undefined {
  return settings?.entities
    .find(entity => entity.kind === kind)
    ?.attributes.find(candidate => candidate.key === attribute)?.type;
}
