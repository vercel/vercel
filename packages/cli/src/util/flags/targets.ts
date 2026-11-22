import { parseEntityAttributeSelector } from './entity-attribute';
import { validateLabelString } from './entity-labels';
import type { Flag, FlagEnvironmentConfig, FlagSettings } from './types';

export type FlagTargets = NonNullable<FlagEnvironmentConfig['targets']>;
type FlagTargetValue = FlagTargets[string][string][string][number];

export interface FlagTargetSelector {
  entity: string;
  attribute: string;
  value: string;
  label?: string;
}

export interface FlagTargetEntry extends FlagTargetSelector {
  variantId: string;
  note?: string;
}

export type FlagTargetAddStatus = 'added' | 'moved' | 'unchanged';

export interface FlagTargetAddResult extends FlagTargetSelector {
  status: FlagTargetAddStatus;
  previousVariantId?: string;
}

export interface FlagTargetRemoveResult extends FlagTargetSelector {
  variantId: string;
}

export function formatFlagTargetSelector(target: FlagTargetSelector): string {
  return `${target.entity}.${target.attribute}=${target.value}`;
}

export function parseFlagTargetInput(
  input: string,
  options: { allowLabel?: boolean } = {}
): FlagTargetSelector {
  const separatorIndex = input.indexOf('=');
  if (separatorIndex === -1) {
    throw new Error(
      `Invalid target "${input}". Use ENTITY.ATTRIBUTE=VALUE, for example user.id=user_123.`
    );
  }

  const { kind: entity, attribute } = parseEntityAttributeSelector(
    input.slice(0, separatorIndex)
  );
  const rawValue = input.slice(separatorIndex + 1);
  // `remove` must match stored values exactly; only `add` normalizes input.
  if (!options.allowLabel) {
    if (!rawValue) {
      throw new Error(`Invalid target "${input}". Value cannot be empty.`);
    }
    return { entity, attribute, value: rawValue };
  }

  const labelIndex = rawValue.indexOf('|');
  const value = (
    labelIndex === -1 ? rawValue : rawValue.slice(0, labelIndex)
  ).trim();
  if (!value) {
    throw new Error(`Invalid target "${input}". Value cannot be empty.`);
  }

  if (labelIndex === -1) {
    return { entity, attribute, value };
  }

  const label = rawValue.slice(labelIndex + 1).trim();
  if (!label) {
    throw new Error(
      `Invalid target "${input}". Label cannot be empty; use ENTITY.ATTRIBUTE=VALUE|LABEL or omit the "|".`
    );
  }
  validateLabelString(label, 'label');

  return { entity, attribute, value, label };
}

export function parseFlagTargetInputs(
  inputs: string[],
  settings: FlagSettings
): FlagTargetSelector[] {
  const seen = new Map<string, FlagTargetSelector>();

  for (const input of inputs) {
    const target = parseFlagTargetInput(input, { allowLabel: true });
    assertTargetableAttribute(target, settings);
    const key = formatFlagTargetSelector(target);
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, target);
    } else if (target.label) {
      existing.label = target.label;
    }
  }

  return [...seen.values()];
}

function assertTargetableAttribute(
  target: FlagTargetSelector,
  settings: FlagSettings
): void {
  const entity = settings.entities.find(
    candidate => candidate.kind === target.entity
  );
  if (!entity) {
    const available = settings.entities.map(candidate => candidate.kind);
    throw new Error(
      available.length > 0
        ? `Entity "${target.entity}" does not exist. Available entities: ${available.join(', ')}.`
        : `Entity "${target.entity}" does not exist. Define entities before adding targets.`
    );
  }

  const attribute = entity.attributes.find(
    candidate => candidate.key === target.attribute
  );
  if (!attribute) {
    const available = entity.attributes.map(
      candidate => `${entity.kind}.${candidate.key}`
    );
    throw new Error(
      available.length > 0
        ? `Attribute "${target.entity}.${target.attribute}" does not exist. Available attributes: ${available.join(', ')}.`
        : `Attribute "${target.entity}.${target.attribute}" does not exist.`
    );
  }

  if (attribute.type !== 'string') {
    throw new Error(
      `Only string attributes can be targeted directly. ${target.entity}.${target.attribute} is a ${attribute.type} attribute.`
    );
  }
}

export function listFlagTargets(
  targets: FlagTargets | undefined
): FlagTargetEntry[] {
  const entries: FlagTargetEntry[] = [];
  for (const [variantId, entities] of Object.entries(targets ?? {})) {
    for (const [entity, attributes] of Object.entries(entities)) {
      for (const [attribute, values] of Object.entries(attributes)) {
        for (const item of values) {
          entries.push({
            variantId,
            entity,
            attribute,
            value: item.value,
            ...(item.note ? { note: item.note } : {}),
          });
        }
      }
    }
  }
  return entries;
}

export function findFlagTargetVariantId(
  targets: FlagTargets | undefined,
  target: FlagTargetSelector
): string | undefined {
  for (const [variantId, entities] of Object.entries(targets ?? {})) {
    const values = entities[target.entity]?.[target.attribute];
    if (values?.some(item => item.value === target.value)) {
      return variantId;
    }
  }
  return undefined;
}

export function addFlagTargets(
  targets: FlagTargets | undefined,
  selectors: FlagTargetSelector[],
  variantId: string
): { targets: FlagTargets; results: FlagTargetAddResult[] } {
  const next = structuredClone(targets ?? {});
  const results: FlagTargetAddResult[] = [];

  for (const selector of selectors) {
    const previousVariantId = findFlagTargetVariantId(next, selector);
    if (previousVariantId === variantId) {
      results.push({ ...selector, status: 'unchanged' });
      continue;
    }

    const previous = previousVariantId
      ? deleteTargetValue(next, previousVariantId, selector)
      : undefined;

    const entities = (next[variantId] ??= {});
    const attributes = (entities[selector.entity] ??= {});
    const values = (attributes[selector.attribute] ??= []);
    values.push(
      previous?.note
        ? { value: selector.value, note: previous.note }
        : { value: selector.value }
    );

    results.push(
      previousVariantId
        ? { ...selector, status: 'moved', previousVariantId }
        : { ...selector, status: 'added' }
    );
  }

  return { targets: next, results };
}

export function removeFlagTargets(
  targets: FlagTargets | undefined,
  selectors: FlagTargetSelector[]
): { targets: FlagTargets; results: FlagTargetRemoveResult[] } {
  const next = structuredClone(targets ?? {});
  const results: FlagTargetRemoveResult[] = [];
  const seen = new Set<string>();

  for (const selector of selectors) {
    const key = formatFlagTargetSelector(selector);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const variantId = findFlagTargetVariantId(next, selector);
    if (!variantId) {
      throw new Error(
        `Target "${formatFlagTargetSelector(selector)}" does not exist.`
      );
    }
    deleteTargetValue(next, variantId, selector);
    results.push({ ...selector, variantId });
  }

  return { targets: next, results };
}

function deleteTargetValue(
  targets: FlagTargets,
  variantId: string,
  selector: FlagTargetSelector
): FlagTargetValue | undefined {
  const entities = targets[variantId];
  const attributes = entities?.[selector.entity];
  const values = attributes?.[selector.attribute];
  if (!entities || !attributes || !values) {
    return undefined;
  }

  const removed = values.find(item => item.value === selector.value);
  const remaining = values.filter(item => item.value !== selector.value);
  if (remaining.length > 0) {
    attributes[selector.attribute] = remaining;
    return removed;
  }

  delete attributes[selector.attribute];
  if (Object.keys(attributes).length === 0) {
    delete entities[selector.entity];
  }
  if (Object.keys(entities).length === 0) {
    delete targets[variantId];
  }
  return removed;
}

/**
 * Targets are part of the environment's stored targeting config. A paused or
 * reused environment keeps that config and only overrides what is served, so
 * editing targets never changes the mode; the caller warns instead.
 */
export function buildTargetsEnvironmentConfig(
  flag: Flag,
  environment: string,
  targets: FlagTargets
): FlagEnvironmentConfig {
  return { ...flag.environments[environment], targets };
}
