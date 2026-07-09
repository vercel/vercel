import chalk from 'chalk';
import type { FlagSettings } from './types';

export interface FlagBucketingBase {
  type: 'entity';
  kind: string;
  attribute: string;
}

export function resolveFlagBucketingBase(
  settings: FlagSettings,
  selector: string
): FlagBucketingBase {
  const separatorIndex = selector.indexOf('.');
  if (separatorIndex <= 0 || separatorIndex === selector.length - 1) {
    throw new Error(
      'Invalid value for --by. Use the format <entity.attribute>, for example --by user.userId.'
    );
  }

  const kind = selector.slice(0, separatorIndex);
  const attribute = selector.slice(separatorIndex + 1);
  const entity = settings.entities.find(candidate => candidate.kind === kind);

  if (!entity) {
    const availableKinds = settings.entities.map(candidate => candidate.kind);
    throw new Error(
      `Unknown entity ${chalk.bold(kind)}. Available entities: ${availableKinds.join(', ')}`
    );
  }

  const matchingAttribute = entity.attributes.find(
    candidate => candidate.key === attribute
  );
  if (!matchingAttribute) {
    const availableAttributes = entity.attributes.map(
      candidate => candidate.key
    );
    throw new Error(
      `Unknown attribute ${chalk.bold(selector)}. Available attributes for ${kind}: ${availableAttributes.join(', ')}`
    );
  }

  return {
    type: 'entity',
    kind,
    attribute,
  };
}

export function formatFlagBucketingBaseSelector(
  base: FlagBucketingBase | undefined
): string | undefined {
  if (!base) {
    return undefined;
  }

  return `${base.kind}.${base.attribute}`;
}
