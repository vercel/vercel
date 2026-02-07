import chalk from 'chalk';
import { packageName } from '../pkg-name';
import type { IntegrationProduct } from './types';

/**
 * Format available products as help text for CLI display.
 * Only shown for multi-product integrations.
 */
export function formatProductHelp(
  integrationSlug: string,
  products: IntegrationProduct[]
): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(
    `  ${chalk.dim('Available products for')} "${chalk.bold(integrationSlug)}"${chalk.dim(':')}`
  );
  lines.push('');

  // Find longest slug for alignment
  const maxSlugLen = Math.max(...products.map(p => p.slug.length));

  for (const product of products) {
    const paddedSlug = product.slug.padEnd(maxSlugLen);
    lines.push(`    ${chalk.cyan(paddedSlug)}  ${product.name}`);
  }

  lines.push('');
  lines.push(`  ${chalk.dim('Usage:')}`);
  lines.push('');
  lines.push(
    `    ${chalk.cyan(`$ ${packageName} integration add ${integrationSlug}/<product-slug>`)}`
  );
  lines.push('');

  return lines.join('\n');
}
