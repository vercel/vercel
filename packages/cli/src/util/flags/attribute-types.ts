import type { FlagSettings, FlagSettingsAttribute } from './types';

export const TIMESTAMP_IDENTIFY_HELP =
  'Pass Timestamp values as epoch milliseconds in identify() / evaluation context';

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
