import { helpHeading, wrapHelpText } from '../output/help-format';
import type { MetadataSchema, MetadataSchemaProperty } from './types';
import { createHelpTheme } from '../output/help-theme';
import { remoteText } from '../output/remote-text';

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

/** Remote schema data must never introduce shell syntax into a suggestion. */
export function formatMetadataExample(
  key: string,
  value: string,
  array = false
): string {
  const safeKey = /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(key) ? key : '<KEY>';
  const safeValue = /^[A-Za-z0-9_][A-Za-z0-9_.,:/@+-]*$/.test(value)
    ? value
    : '<VALUE>';
  const argument = `${safeKey}=${safeValue}`;
  return `--meta ${array ? `"${argument}"` : argument}`;
}

function generateExample(
  key: string,
  prop: MetadataSchemaProperty
): string | undefined {
  if (prop.type === 'boolean') {
    return formatMetadataExample(key, 'true');
  }

  if (prop.type === 'array') {
    const options = getVisibleOptions(prop);
    if (options && options.length >= 2) {
      return formatMetadataExample(key, `${options[0]},${options[1]}`, true);
    }
    if (options && options.length === 1) {
      return formatMetadataExample(key, options[0], true);
    }
    if (prop.items?.type === 'number') {
      if (prop.default !== undefined) {
        return formatMetadataExample(key, String(prop.default));
      }
      return formatMetadataExample(key, '<VALUE>', true);
    }
    return formatMetadataExample(key, '<VALUE>', true);
  }

  if (prop.type === 'number') {
    if (prop.default !== undefined) {
      return formatMetadataExample(key, String(prop.default));
    }
    if (prop.minimum !== undefined) {
      return formatMetadataExample(key, String(prop.minimum));
    }
    return formatMetadataExample(key, '<VALUE>');
  }

  // string type
  const options = getVisibleOptions(prop);
  if (options && options.length > 0) {
    return formatMetadataExample(key, options[0]);
  }
  return formatMetadataExample(key, '<VALUE>');
}

/**
 * Whether a field uses a vercel-region control where the server handles region selection.
 */
export function isServerHandledRegion(prop: MetadataSchemaProperty): boolean {
  const control = prop['ui:control'];
  return control === 'vercel-region' || control === 'multi-vercel-region';
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
  productSlug?: string,
  columns = 80,
  theme = createHelpTheme()
): string {
  const lines: string[] = [];
  lines.push('');
  const header = productSlug
    ? `Metadata options for "${integrationName}/${productSlug}":`
    : `Metadata options for "${integrationName}":`;
  lines.push(helpHeading(header.slice(0, -1), theme));

  const required = new Set(schema.required ?? []);
  const entries = Object.entries(schema.properties);

  if (entries.length === 0) {
    lines.push('  No metadata options available.');
    return lines.join('\n') + (lines.at(-1) === '' ? '' : '\n');
  }

  for (const [key, prop] of entries) {
    // Skip hidden fields
    if (isHiddenOnCreate(prop)) {
      continue;
    }

    const isRequired = required.has(key);
    const requiredSuffix =
      isRequired && !isServerHandledRegion(prop) ? ' (required)' : '';

    const typeHint =
      prop.type === 'boolean'
        ? ' (true/false)'
        : prop.type === 'array'
          ? ' (comma-separated)'
          : '';
    lines.push(`  ${remoteText(key)}${requiredSuffix}${typeHint}`);

    if (prop.description) {
      lines.push(wrapHelpText(prop.description, columns, '    '));
    }

    // Show options for select fields
    const visibleOptions = getVisibleOptions(prop);
    if (visibleOptions) {
      lines.push(
        wrapHelpText(`Options: ${visibleOptions.join(', ')}`, columns, '    ')
      );
    }

    // Show range for number fields
    if (prop.minimum !== undefined || prop.maximum !== undefined) {
      const range = [];
      if (prop.minimum !== undefined) range.push(`min: ${prop.minimum}`);
      if (prop.maximum !== undefined) range.push(`max: ${prop.maximum}`);
      lines.push(wrapHelpText(`Range: ${range.join(', ')}`, columns, '    '));
    }

    // Show default value
    if (prop.default !== undefined) {
      lines.push(wrapHelpText(`Default: ${prop.default}`, columns, '    '));
    }

    // Show usage example
    const example = generateExample(key, prop);
    if (example) {
      lines.push(
        `    Example: ${theme.reference('--meta')}${remoteText(example.slice('--meta'.length))}`
      );
    }

    lines.push('');
  }

  return lines.join('\n') + (lines.at(-1) === '' ? '' : '\n');
}

/**
 * Merges integration-level metadata schema (e.g. org name, region) with
 * product-level metadata schema (e.g. platform) into a single schema.
 * Installation-level fields appear first, followed by product-level fields.
 * Product properties win on key collision.
 */
export function mergeMetadataSchemas(
  productSchema?: MetadataSchema,
  integrationSchema?: MetadataSchema
): MetadataSchema | undefined {
  if (!productSchema && !integrationSchema) return undefined;
  if (!integrationSchema) return productSchema;
  if (!productSchema) return integrationSchema;
  return {
    type: 'object',
    properties: {
      ...integrationSchema.properties,
      ...productSchema.properties,
    },
    required: [
      ...new Set([
        ...(integrationSchema.required ?? []),
        ...(productSchema.required ?? []),
      ]),
    ],
  };
}
