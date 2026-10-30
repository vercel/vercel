import {
  formatFlagAttributeTypeList,
  isFlagAttributeType,
  type FlagAttributeType,
} from './attribute-types';
import type { FlagSettingsAttribute, FlagSettingsEntity } from './types';

// Mirrors the dashboard entity editor rules for kinds and attribute keys.
const IDENTIFIER_PATTERN = /^[a-zA-Z0-9_-]+$/;
const MAX_ENTITIES = 32;
const MAX_ATTRIBUTES = 32;
const MAX_IDENTIFIER_LENGTH = 128;

export interface ParsedAttributeInput {
  key: string;
  type: FlagAttributeType;
}

export function validateEntityKind(kind: string): void {
  if (!IDENTIFIER_PATTERN.test(kind) || kind.length > MAX_IDENTIFIER_LENGTH) {
    throw new Error(
      `Invalid entity kind "${kind}". Use up to ${MAX_IDENTIFIER_LENGTH} letters, numbers, dashes, and underscores, for example user.`
    );
  }
}

export function validateEntityLabel(label: string): void {
  if (label.trim().length === 0) {
    throw new Error('Entity label can not be empty.');
  }
  if (label.length > MAX_IDENTIFIER_LENGTH) {
    throw new Error(
      `Entity label can not be longer than ${MAX_IDENTIFIER_LENGTH} characters.`
    );
  }
}

export function validateAttributeKey(key: string): void {
  if (!IDENTIFIER_PATTERN.test(key) || key.length > MAX_IDENTIFIER_LENGTH) {
    throw new Error(
      `Invalid attribute key "${key}". Use up to ${MAX_IDENTIFIER_LENGTH} letters, numbers, dashes, and underscores, for example plan.`
    );
  }
}

export function parseAttributeType(
  type: string,
  key: string
): FlagAttributeType {
  if (!isFlagAttributeType(type)) {
    throw new Error(
      `Invalid type "${type}" for attribute "${key}". Valid types: ${formatFlagAttributeTypeList()}.`
    );
  }
  return type;
}

/**
 * Parses `KEY:TYPE`, for example `plan:string`.
 */
export function parseAttributeInput(input: string): ParsedAttributeInput {
  const parts = input
    .trim()
    .split(':')
    .map(part => part.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `Invalid attribute "${input}". Use KEY:TYPE, for example plan:string. Valid types: ${formatFlagAttributeTypeList()}.`
    );
  }

  const [key, type] = parts;
  validateAttributeKey(key);

  return { key, type: parseAttributeType(type, key) };
}

export function parseAttributeInputs(inputs: string[]): ParsedAttributeInput[] {
  const attributes = inputs.map(parseAttributeInput);
  const seen = new Set<string>();
  for (const attribute of attributes) {
    if (seen.has(attribute.key)) {
      throw new Error(`Attribute "${attribute.key}" is specified twice.`);
    }
    seen.add(attribute.key);
  }
  return attributes;
}

export function defaultEntityLabel(kind: string): string {
  return kind
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function findEntity(
  entities: FlagSettingsEntity[],
  kind: string
): FlagSettingsEntity | undefined {
  return entities.find(entity => entity.kind === kind);
}

export function findAttribute(
  entity: FlagSettingsEntity,
  key: string
): FlagSettingsAttribute | undefined {
  return entity.attributes.find(attribute => attribute.key === key);
}

/**
 * Validates the cross-entity constraints the API does not enforce itself.
 */
export function validateEntities(entities: FlagSettingsEntity[]): void {
  if (entities.length > MAX_ENTITIES) {
    throw new Error(
      `A project can have at most ${MAX_ENTITIES} entities. Remove one before adding another.`
    );
  }

  const kinds = new Set<string>();
  const labels = new Set<string>();
  for (const entity of entities) {
    if (kinds.has(entity.kind)) {
      throw new Error(`Entity kind "${entity.kind}" already exists.`);
    }
    if (labels.has(entity.label.trim())) {
      throw new Error(
        `Entity label "${entity.label}" is already used by another entity.`
      );
    }
    kinds.add(entity.kind);
    labels.add(entity.label.trim());

    if (entity.attributes.length > MAX_ATTRIBUTES) {
      throw new Error(
        `Entity "${entity.kind}" can have at most ${MAX_ATTRIBUTES} attributes.`
      );
    }
    const keys = new Set<string>();
    for (const attribute of entity.attributes) {
      if (keys.has(attribute.key)) {
        throw new Error(
          `Attribute "${attribute.key}" already exists on entity "${entity.kind}".`
        );
      }
      keys.add(attribute.key);
    }
  }
}
