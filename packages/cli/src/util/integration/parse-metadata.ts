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
    if (propSchema.type === 'number') {
      const num = Number(value);
      if (Number.isNaN(num)) {
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
    } else {
      // Validate select options if present
      if (propSchema['ui:options']) {
        const options = propSchema['ui:options'];
        const validValues = options.map((opt: string | { value: string }) =>
          typeof opt === 'string' ? opt : opt.value
        );
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
 * Used by OLD path where server doesn't fill defaults.
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
    if (
      propSchema?.['ui:hidden'] === true ||
      propSchema?.['ui:hidden'] === 'create'
    ) {
      continue;
    }

    // Check if value is provided or has a default
    if (metadata[key] === undefined && propSchema?.default === undefined) {
      errors.push(`Required metadata missing: "${key}"`);
    }
  }

  return errors;
}
