import output from '../../output-manager';
import { getAllOptionValues, isHiddenOnCreate } from './format-schema-help';
import type { Metadata, MetadataSchema } from './types';

export interface ParseMetadataResult {
  metadata: Metadata;
  errors: string[];
}

/**
 * Parse metadata flags from CLI arguments (KEY=VALUE format)
 */
export function parseMetadataFlags(
  rawMetadata: string[] | undefined,
  schema: MetadataSchema
): ParseMetadataResult {
  const metadata: Metadata = {};
  const errors: string[] = [];

  if (!rawMetadata?.length) {
    return { metadata, errors };
  }

  for (const item of rawMetadata) {
    const eqIndex = item.indexOf('=');
    if (eqIndex === -1) {
      errors.push(`Invalid metadata format: "${item}". Expected KEY=VALUE`);
      continue;
    }

    const key = item.slice(0, eqIndex);
    const value = item.slice(eqIndex + 1);

    const propSchema = schema.properties[key];
    if (!propSchema) {
      errors.push(`Unknown metadata key: "${key}"`);
      continue;
    }

    // Type coercion and validation
    if (propSchema.type === 'boolean') {
      if (value === 'true') {
        metadata[key] = true;
      } else if (value === 'false') {
        metadata[key] = false;
      } else {
        errors.push(
          `Metadata "${key}" must be "true" or "false", got: "${value}"`
        );
        continue;
      }
    } else if (propSchema.type === 'number') {
      if (value === '') {
        errors.push(`Metadata "${key}" must be a number, got: ""`);
        continue;
      }
      const num = Number(value);
      if (Number.isNaN(num) || !Number.isFinite(num)) {
        errors.push(`Metadata "${key}" must be a number, got: "${value}"`);
        continue;
      }
      if (propSchema.minimum !== undefined && num < propSchema.minimum) {
        errors.push(`Metadata "${key}" must be >= ${propSchema.minimum}`);
        continue;
      }
      if (propSchema.maximum !== undefined && num > propSchema.maximum) {
        errors.push(`Metadata "${key}" must be <= ${propSchema.maximum}`);
        continue;
      }
      metadata[key] = num;
    } else if (propSchema.type === 'array') {
      const items = value.split(',').map(v => v.trim());
      const itemType = propSchema.items?.type;

      if (itemType === 'number') {
        const nums: number[] = [];
        let hasError = false;
        for (const item of items) {
          if (item === '') {
            errors.push(`Metadata "${key}" contains invalid number: ""`);
            hasError = true;
            break;
          }
          const num = Number(item);
          if (Number.isNaN(num) || !Number.isFinite(num)) {
            errors.push(`Metadata "${key}" contains invalid number: "${item}"`);
            hasError = true;
            break;
          }
          if (propSchema.minimum !== undefined && num < propSchema.minimum) {
            errors.push(
              `Metadata "${key}" contains number ${num} below minimum ${propSchema.minimum}`
            );
            hasError = true;
            break;
          }
          if (propSchema.maximum !== undefined && num > propSchema.maximum) {
            errors.push(
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
        // Validate each item against ui:options if present
        const validValues = getAllOptionValues(propSchema);
        if (validValues) {
          const prevErrorCount = errors.length;
          for (const item of items) {
            if (!validValues.includes(item)) {
              errors.push(
                `Metadata "${key}" contains invalid value: "${item}". Must be one of: ${validValues.join(', ')}`
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
      // Validate select options if present
      const validValues = getAllOptionValues(propSchema);
      if (validValues) {
        if (!validValues.includes(value)) {
          errors.push(
            `Metadata "${key}" must be one of: ${validValues.join(', ')}`
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
 */
export function validateRequiredMetadata(
  metadata: Metadata,
  schema: MetadataSchema
): string[] {
  const errors: string[] = [];
  const required = schema.required ?? [];

  for (const key of required) {
    const propSchema = schema.properties[key];

    // Skip hidden fields (they use defaults server-side)
    if (propSchema && isHiddenOnCreate(propSchema)) {
      continue;
    }

    // Check if value is provided or has a default
    if (metadata[key] === undefined && propSchema?.default === undefined) {
      errors.push(`Required metadata missing: "${key}"`);
    }
  }

  return errors;
}

/**
 * Validate required metadata and print errors.
 * Returns true if validation passed, false if there were errors.
 */
export function validateAndPrintRequiredMetadata(
  metadata: Metadata,
  schema: MetadataSchema
): boolean {
  const errors = validateRequiredMetadata(metadata, schema);
  for (const error of errors) {
    output.error(error);
  }
  return errors.length === 0;
}
