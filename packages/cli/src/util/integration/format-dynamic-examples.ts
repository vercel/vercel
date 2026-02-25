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
  products: IntegrationProduct[],
  commandName = 'integration add'
): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(`  ${chalk.dim('Examples:')}`);

  // Basic install
  lines.push('');
  lines.push(`  ${chalk.dim('-')} Install ${integrationSlug}`);
  lines.push('');
  lines.push(
    `    ${chalk.cyan(`$ ${packageName} ${commandName} ${integrationSlug}`)}`
  );

  // Slash syntax for multi-product
  if (products.length > 1) {
    const firstProduct = products[0];
    lines.push('');
    lines.push(`  ${chalk.dim('-')} Install a specific product`);
    lines.push('');
    lines.push(
      `    ${chalk.cyan(`$ ${packageName} ${commandName} ${integrationSlug}/${firstProduct.slug}`)}`
    );
  }

  // Custom name
  lines.push('');
  lines.push(`  ${chalk.dim('-')} Install with a custom resource name`);
  lines.push('');
  lines.push(
    `    ${chalk.cyan(`$ ${packageName} ${commandName} ${integrationSlug} --name my-resource`)}`
  );

  // Metadata example — pick the first product with a schema and build a real example
  const metadataExample = buildMetadataExample(
    integrationSlug,
    products,
    commandName
  );
  if (metadataExample) {
    lines.push('');
    lines.push(`  ${chalk.dim('-')} Install with metadata`);
    lines.push('');
    lines.push(`    ${chalk.cyan(`$ ${metadataExample}`)}`);
  }

  // Billing plan
  lines.push('');
  lines.push(`  ${chalk.dim('-')} Install with a specific billing plan`);
  lines.push('');
  lines.push(
    `    ${chalk.cyan(`$ ${packageName} ${commandName} ${integrationSlug} --plan pro`)}`
  );

  // Environment
  lines.push('');
  lines.push(
    `  ${chalk.dim('-')} Install and connect to specific environments only`
  );
  lines.push('');
  lines.push(
    `    ${chalk.cyan(`$ ${packageName} ${commandName} ${integrationSlug} -e production -e preview`)}`
  );

  // No-connect
  lines.push('');
  lines.push(
    `  ${chalk.dim('-')} Install without connecting to the current project`
  );
  lines.push('');
  lines.push(
    `    ${chalk.cyan(`$ ${packageName} ${commandName} ${integrationSlug} --no-connect`)}`
  );

  // No-env-pull
  lines.push('');
  lines.push(
    `  ${chalk.dim('-')} Install without pulling environment variables`
  );
  lines.push('');
  lines.push(
    `    ${chalk.cyan(`$ ${packageName} ${commandName} ${integrationSlug} --no-env-pull`)}`
  );

  // Prefix
  lines.push('');
  lines.push(
    `  ${chalk.dim('-')} Install with a prefix for environment variable names`
  );
  lines.push('');
  lines.push(
    `    ${chalk.cyan(`$ ${packageName} ${commandName} ${integrationSlug} --prefix NEON2_`)}`
  );

  // JSON output
  lines.push('');
  lines.push(`  ${chalk.dim('-')} Output as JSON`);
  lines.push('');
  lines.push(
    `    ${chalk.cyan(`$ ${packageName} ${commandName} ${integrationSlug} --format=json`)}`
  );

  // Installation ID (only when auto-provision FF is enabled)
  if (process.env.FF_AUTO_PROVISION_INSTALL === '1') {
    lines.push('');
    lines.push(`  ${chalk.dim('-')} Install using a specific installation`);
    lines.push('');
    lines.push(
      `    ${chalk.cyan(`$ ${packageName} ${commandName} ${integrationSlug} --installation-id <id>`)}`
    );
  }

  lines.push('');

  return lines.join('\n');
}

function buildMetadataExample(
  integrationSlug: string,
  products: IntegrationProduct[],
  commandName: string
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
      return `${packageName} ${commandName} ${slug} ${flags.join(' ')}`;
    }
  }

  return undefined;
}
