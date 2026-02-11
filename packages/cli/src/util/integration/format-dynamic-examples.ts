import chalk from 'chalk';
import { packageName } from '../pkg-name';
import { getVisibleOptions, isHiddenOnCreate } from './format-schema-help';
import type { IntegrationProduct } from './types';

/**
 * Format dynamic CLI examples using the actual integration slug and product schemas.
 * Replaces the static "acme" examples when we know the real integration.
 */
export function formatDynamicExamples(
  integrationSlug: string,
  products: IntegrationProduct[]
): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(`  ${chalk.dim('Examples:')}`);

  // Basic install
  lines.push('');
  lines.push(`  ${chalk.dim('-')} Install ${integrationSlug}`);
  lines.push('');
  lines.push(
    `    ${chalk.cyan(`$ ${packageName} integration add ${integrationSlug}`)}`
  );

  // Slash syntax for multi-product
  if (products.length > 1) {
    const firstProduct = products[0];
    lines.push('');
    lines.push(`  ${chalk.dim('-')} Install a specific product`);
    lines.push('');
    lines.push(
      `    ${chalk.cyan(`$ ${packageName} integration add ${integrationSlug}/${firstProduct.slug}`)}`
    );
  }

  // Custom name
  lines.push('');
  lines.push(`  ${chalk.dim('-')} Install with a custom resource name`);
  lines.push('');
  lines.push(
    `    ${chalk.cyan(`$ ${packageName} integration add ${integrationSlug} --name my-resource`)}`
  );

  // Metadata example — pick the first product with a schema and build a real example
  const metadataExample = buildMetadataExample(integrationSlug, products);
  if (metadataExample) {
    lines.push('');
    lines.push(`  ${chalk.dim('-')} Install with metadata`);
    lines.push('');
    lines.push(`    ${chalk.cyan(`$ ${metadataExample}`)}`);
  }

  lines.push('');

  return lines.join('\n');
}

function buildMetadataExample(
  integrationSlug: string,
  products: IntegrationProduct[]
): string | undefined {
  // Find first product with a schema that has visible fields
  for (const product of products) {
    const schema = product.metadataSchema;
    if (!schema) continue;

    const flags: string[] = [];
    for (const [key, prop] of Object.entries(schema.properties)) {
      if (isHiddenOnCreate(prop)) {
        continue;
      }

      if (prop.type === 'boolean') {
        flags.push(`-m ${key}=true`);
      } else if (prop.type === 'array') {
        const visible = getVisibleOptions(prop);
        if (visible && visible.length > 0) {
          flags.push(`-m "${key}=${visible.slice(0, 2).join(',')}"`);
        }
      } else {
        const visible = getVisibleOptions(prop);
        if (visible && visible.length > 0) {
          flags.push(`-m ${key}=${visible[0]}`);
        }
      }

      // Show at most 2 flags in the example
      if (flags.length >= 2) break;
    }

    if (flags.length > 0) {
      const slug =
        products.length > 1
          ? `${integrationSlug}/${product.slug}`
          : integrationSlug;
      return `${packageName} integration add ${slug} ${flags.join(' ')}`;
    }
  }

  return undefined;
}
