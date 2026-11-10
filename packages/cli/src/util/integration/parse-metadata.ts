import didYouMean from '../did-you-mean';
import { remoteText } from '../output/remote-text';
import {
  getAllOptionValues,
  getVisibleOptions,
  isServerHandledRegion,
  isHiddenOnCreate,
} from './format-schema-help';
import type { Metadata, MetadataSchema, MetadataSchemaProperty } from './types';

/**
 * Why a `--meta` flag was rejected: the key is not in the schema, the value
 * does not fit the key's type or options, or the flag is not `KEY=VALUE`.
 */
export type MetadataParseErrorKind =
  | 'unknown_key'
  | 'invalid_value'
  | 'invalid_format';

export interface MetadataParseError {
  kind: MetadataParseErrorKind;
  /**
   * The key as typed (the whole flag for `invalid_format`). It is user input,
   * so check it against the schema before recording it anywhere.
   */
  key: string;
  message: string;
}

interface ParseMetadataResult {
  metadata: Metadata;
  errors: MetadataParseError[];
}

const SUGGESTION_THRESHOLD = 0.7;

/**
 * Option values as strings. Remote schemas are not validated, so an option can
 * be a number or lack its value.
 */
function optionStrings(values: readonly unknown[]): string[] {
  return values.flatMap(v =>
    v === undefined || v === null || v === '' ? [] : [String(v)]
  );
}

/** The closest candidate to `input`, ignoring case, if any is close enough. */
function closestMatch(
  input: string,
  candidates: readonly string[]
): string | undefined {
  const lowered = input.toLowerCase();
  const exact = candidates.find(c => c.toLowerCase() === lowered);
  if (exact !== undefined) {
    return exact;
  }
  const match = didYouMean(
    lowered,
    candidates.map(c => c.toLowerCase()),
    SUGGESTION_THRESHOLD
  ) as string | undefined;
  return match === undefined
    ? undefined
    : candidates.find(c => c.toLowerCase() === match);
}

function didYouMeanHint(
  input: string,
  candidates: readonly string[]
): string | undefined {
  const match = closestMatch(input, candidates);
  return match === undefined
    ? undefined
    : `Did you mean "${remoteText(match)}"?`;
}

function formatList(values: readonly string[]): string {
  return values.map(remoteText).join(', ');
}

/** Joins sentences, adding a period only where one is missing. */
function sentences(...parts: (string | undefined)[]): string {
  let text = '';
  for (const part of parts) {
    if (!part) continue;
    text = !text
      ? part
      : /[.?!]$/.test(text)
        ? `${text} ${part}`
        : `${text}. ${part}`;
  }
  return text;
}

/** The keys to offer: those shown in `--help`, or every key if all are hidden. */
function listedKeys(schema: MetadataSchema): string[] {
  const keys = Object.keys(schema.properties).filter(key =>
    getProperty(schema, key)
  );
  const visible = keys.filter(key => !isHiddenOnCreate(schema.properties[key]));
  return visible.length > 0 ? visible : keys;
}

function validKeysHint(schema: MetadataSchema): string {
  const keys = listedKeys(schema);
  return keys.length > 0
    ? `Valid keys: ${formatList(keys)}`
    : 'This product does not accept metadata.';
}

function unknownKeyHint(key: string, schema: MetadataSchema): string {
  return sentences(
    didYouMeanHint(key, listedKeys(schema)),
    validKeysHint(schema)
  );
}

/** The values to offer: those shown in `--help`, or every value if all are hidden. */
function listedOptions(
  prop: MetadataSchemaProperty,
  validValues: readonly string[]
): string[] {
  return optionStrings(getVisibleOptions(prop) ?? validValues);
}

function getProperty(
  schema: MetadataSchema,
  key: string
): MetadataSchemaProperty | undefined {
  // `Object.hasOwn`, so keys like "constructor" are not read off the prototype
  const prop = Object.hasOwn(schema.properties, key)
    ? schema.properties[key]
    : undefined;
  return prop ?? undefined;
}

/**
 * The warning shown when an unknown key is dropped instead of failing the
 * command.
 */
export function formatIgnoredMetadataKeyWarning(
  error: MetadataParseError,
  schema: MetadataSchema
): string {
  return sentences(
    `Ignoring unknown metadata key: "${error.key}"`,
    unknownKeyHint(error.key, schema)
  );
}

/**
 * Parse metadata flags from CLI arguments (KEY=VALUE format)
 */
export function parseMetadataFlags(
  rawMetadata: string[] | undefined,
  schema: MetadataSchema
): ParseMetadataResult {
  const metadata: Metadata = {};
  const errors: MetadataParseError[] = [];

  if (!rawMetadata?.length) {
    return { metadata, errors };
  }

  for (const item of rawMetadata) {
    const eqIndex = item.indexOf('=');
    const key = eqIndex === -1 ? item.trim() : item.slice(0, eqIndex).trim();
    if (eqIndex === -1 || key === '') {
      errors.push({
        kind: 'invalid_format',
        key,
        message: sentences(
          `Invalid metadata format: "${item}". Expected KEY=VALUE`,
          validKeysHint(schema)
        ),
      });
      continue;
    }

    const value = item.slice(eqIndex + 1).trim();
    const invalidValue = (message: string) => {
      errors.push({ kind: 'invalid_value', key, message });
    };

    const propSchema = getProperty(schema, key);
    if (!propSchema) {
      errors.push({
        kind: 'unknown_key',
        key,
        message: sentences(
          `Unknown metadata key: "${key}"`,
          unknownKeyHint(key, schema)
        ),
      });
      continue;
    }

    // Type coercion and validation
    if (propSchema.type === 'boolean') {
      if (value === 'true') {
        metadata[key] = true;
      } else if (value === 'false') {
        metadata[key] = false;
      } else {
        invalidValue(
          `Metadata "${key}" must be "true" or "false", got: "${value}"`
        );
      }
    } else if (propSchema.type === 'number') {
      if (value === '') {
        invalidValue(`Metadata "${key}" must be a number, got: ""`);
        continue;
      }
      const num = Number(value);
      if (Number.isNaN(num) || !Number.isFinite(num)) {
        invalidValue(`Metadata "${key}" must be a number, got: "${value}"`);
        continue;
      }
      if (propSchema.minimum !== undefined && num < propSchema.minimum) {
        invalidValue(`Metadata "${key}" must be >= ${propSchema.minimum}`);
        continue;
      }
      if (propSchema.maximum !== undefined && num > propSchema.maximum) {
        invalidValue(`Metadata "${key}" must be <= ${propSchema.maximum}`);
        continue;
      }
      metadata[key] = num;
    } else if (propSchema.type === 'array') {
      const items = value
        .split(',')
        .map(v => v.trim())
        .filter(v => v.length > 0);
      const itemType = propSchema.items?.type;

      if (itemType === 'number') {
        const nums: number[] = [];
        let hasError = false;
        for (const item of items) {
          if (item === '') {
            invalidValue(`Metadata "${key}" contains invalid number: ""`);
            hasError = true;
            break;
          }
          const num = Number(item);
          if (Number.isNaN(num) || !Number.isFinite(num)) {
            invalidValue(
              `Metadata "${key}" contains invalid number: "${item}"`
            );
            hasError = true;
            break;
          }
          if (propSchema.minimum !== undefined && num < propSchema.minimum) {
            invalidValue(
              `Metadata "${key}" contains number ${num} below minimum ${propSchema.minimum}`
            );
            hasError = true;
            break;
          }
          if (propSchema.maximum !== undefined && num > propSchema.maximum) {
            invalidValue(
              `Metadata "${key}" contains number ${num} above maximum ${propSchema.maximum}`
            );
            hasError = true;
            break;
          }
          nums.push(num);
        }
        if (!hasError) {
          metadata[key] = nums;
        }
      } else {
        // Validate each item against ui:options if present. Hidden options
        // are accepted, but only the visible ones are listed and suggested.
        const validValues = getAllOptionValues(propSchema);
        if (validValues) {
          const listed = listedOptions(propSchema, validValues);
          const prevErrorCount = errors.length;
          for (const item of items) {
            if (!validValues.includes(item)) {
              invalidValue(
                sentences(
                  `Metadata "${key}" contains invalid value: "${item}". Must be one of: ${formatList(listed)}`,
                  didYouMeanHint(item, listed)
                )
              );
            }
          }
          if (errors.length > prevErrorCount) {
            continue;
          }
        }
        metadata[key] = items;
      }
    } else {
      // Validate select options if present. Hidden options are accepted,
      // but only the visible ones are listed and suggested.
      const validValues = getAllOptionValues(propSchema);
      if (validValues) {
        if (!validValues.includes(value)) {
          const listed = listedOptions(propSchema, validValues);
          invalidValue(
            sentences(
              `Metadata "${key}" must be one of: ${formatList(listed)}, got: "${value}"`,
              didYouMeanHint(value, listed)
            )
          );
          continue;
        }
      }
      metadata[key] = value;
    }
  }

  return { metadata, errors };
}

/**
 * Validate that all required metadata fields are provided.
 * Region fields (vercel-region / multi-vercel-region) are always skipped
 * because the server handles region selection automatically.
 *
 * `failedKeys` are keys that were passed but failed to parse; they already
 * have their own error, so they are not also reported as missing.
 */
export function validateRequiredMetadata(
  metadata: Metadata,
  schema: MetadataSchema,
  failedKeys: ReadonlySet<string> = new Set()
): string[] {
  const errors: string[] = [];
  const required = schema.required ?? [];

  for (const key of required) {
    const propSchema = getProperty(schema, key);

    // Skip hidden fields (they use defaults server-side)
    if (propSchema && isHiddenOnCreate(propSchema)) {
      continue;
    }

    // Skip vercel-region fields (server handles region selection)
    if (propSchema && isServerHandledRegion(propSchema)) {
      continue;
    }

    // Check if value is provided or has a default
    const provided =
      Object.hasOwn(metadata, key) && metadata[key] !== undefined;
    if (
      !provided &&
      !failedKeys.has(key) &&
      propSchema?.default === undefined
    ) {
      errors.push(`Required metadata missing: "${key}"`);
    }
  }

  return errors;
}
