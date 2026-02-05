import chalk from 'chalk';
import type { MetadataSchema } from './types';

/**
 * Format metadata schema as help text for CLI display
 */
export function formatMetadataSchemaHelp(
  schema: MetadataSchema,
  integrationName: string
): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(chalk.bold(`  Metadata options for "${integrationName}":`));
  lines.push('');

  const required = new Set(schema.required ?? []);
  const entries = Object.entries(schema.properties);

  if (entries.length === 0) {
    lines.push('    No metadata options available.');
    return lines.join('\n');
  }

  for (const [key, prop] of entries) {
    // Skip hidden fields
    if (prop['ui:hidden'] === true || prop['ui:hidden'] === 'create') {
      continue;
    }

    const isRequired = required.has(key);
    const requiredSuffix = isRequired ? chalk.red(' (required)') : '';

    lines.push(`    ${chalk.cyan(key)}${requiredSuffix}`);

    if (prop.description) {
      lines.push(`      ${prop.description}`);
    }

    // Show options for select fields
    if (prop['ui:options']) {
      const rawOptions = prop['ui:options'];
      const options: string[] = [];
      for (const opt of rawOptions) {
        if (typeof opt === 'string') {
          options.push(opt);
        } else if (!opt.hidden) {
          options.push(opt.value);
        }
      }
      if (options.length > 0) {
        lines.push(`      Options: ${options.join(', ')}`);
      }
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

    lines.push('');
  }

  return lines.join('\n');
}
