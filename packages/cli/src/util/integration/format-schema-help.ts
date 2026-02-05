import chalk from 'chalk';
import type { MetadataSchema, MetadataSchemaProperty } from './types';

/**
 * Whether a field is hidden during resource creation.
 * Expression-based `ui:hidden` is NOT treated as hidden (CLI can't evaluate expressions).
 */
export function isHiddenOnCreate(prop: MetadataSchemaProperty): boolean {
  return prop['ui:hidden'] === true || prop['ui:hidden'] === 'create';
}

/**
 * Get ALL option values from a field's `ui:options` (including hidden ones).
 * Used for validation — hidden options are still valid values.
 */
export function getAllOptionValues(
  prop: MetadataSchemaProperty
): string[] | undefined {
  const raw = prop['ui:options'];
  if (!raw) return undefined;
  const values = raw.map((opt: string | { value: string }) =>
    typeof opt === 'string' ? opt : opt.value
  );
  return values.length > 0 ? values : undefined;
}

export function getVisibleOptions(
  prop: MetadataSchemaProperty
): string[] | undefined {
  const raw = prop['ui:options'];
  if (!raw) return undefined;
  const options: string[] = [];
  for (const opt of raw) {
    if (typeof opt === 'string') {
      if (opt) options.push(opt);
    } else if (!opt.hidden && opt.value) {
      options.push(opt.value);
    }
  }
  return options.length > 0 ? options : undefined;
}

function generateExample(
  key: string,
  prop: MetadataSchemaProperty
): string | undefined {
  if (prop.type === 'boolean') {
    return `-m ${key}=true`;
  }

  if (prop.type === 'array') {
    const options = getVisibleOptions(prop);
    if (options && options.length >= 2) {
      return `-m "${key}=${options[0]},${options[1]}"`;
    }
    if (options && options.length === 1) {
      return `-m "${key}=${options[0]}"`;
    }
    if (prop.items?.type === 'number') {
      if (prop.default !== undefined) {
        return `-m ${key}=${prop.default}`;
      }
      return `-m ${key}=N,N`;
    }
    return `-m "${key}=value1,value2"`;
  }

  if (prop.type === 'number') {
    if (prop.default !== undefined) {
      return `-m ${key}=${prop.default}`;
    }
    if (prop.minimum !== undefined) {
      return `-m ${key}=${prop.minimum}`;
    }
    return `-m ${key}=N`;
  }

  // string type
  const options = getVisibleOptions(prop);
  if (options && options.length > 0) {
    return `-m ${key}=${options[0]}`;
  }
  return `-m ${key}=<value>`;
}

/**
 * Format metadata schema as help text for CLI display
 * @param schema The metadata schema to format
 * @param integrationName The integration slug/name
 * @param productSlug Optional product slug (for multi-product integrations, shown as integration/product)
 */
export function formatMetadataSchemaHelp(
  schema: MetadataSchema,
  integrationName: string,
  productSlug?: string
): string {
  const lines: string[] = [];
  lines.push('');
  const header = productSlug
    ? `  Metadata options for "${integrationName}/${productSlug}":`
    : `  Metadata options for "${integrationName}":`;
  lines.push(chalk.bold(header));
  lines.push('');

  const required = new Set(schema.required ?? []);
  const entries = Object.entries(schema.properties);

  if (entries.length === 0) {
    lines.push('    No metadata options available.');
    return lines.join('\n');
  }

  for (const [key, prop] of entries) {
    // Skip hidden fields
    if (isHiddenOnCreate(prop)) {
      continue;
    }

    const isRequired = required.has(key);
    const requiredSuffix = isRequired ? chalk.red(' (required)') : '';

    const typeHint =
      prop.type === 'boolean'
        ? chalk.dim(' (true/false)')
        : prop.type === 'array'
          ? chalk.dim(' (comma-separated)')
          : '';
    lines.push(`    ${chalk.cyan(key)}${requiredSuffix}${typeHint}`);

    if (prop.description) {
      lines.push(`      ${prop.description}`);
    }

    // Show options for select fields
    const visibleOptions = getVisibleOptions(prop);
    if (visibleOptions) {
      lines.push(`      Options: ${visibleOptions.join(', ')}`);
    }

    // Show range for number fields
    if (prop.minimum !== undefined || prop.maximum !== undefined) {
      const range = [];
      if (prop.minimum !== undefined) range.push(`min: ${prop.minimum}`);
      if (prop.maximum !== undefined) range.push(`max: ${prop.maximum}`);
      lines.push(`      Range: ${range.join(', ')}`);
    }

    // Show default value
    if (prop.default !== undefined) {
      lines.push(`      Default: ${prop.default}`);
    }

    // Show usage example
    const example = generateExample(key, prop);
    if (example) {
      lines.push(`      Example: ${chalk.dim(example)}`);
    }

    lines.push('');
  }

  return lines.join('\n');
}
