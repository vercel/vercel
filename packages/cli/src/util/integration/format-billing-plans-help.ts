import chalk from 'chalk';
import type { BillingPlan } from './types';

/**
 * Format available billing plans as help text for CLI display.
 * Shows plan IDs (for use with --plan flag), names, and pricing info.
 */
export function formatBillingPlansHelp(
  productName: string,
  plans: BillingPlan[]
): string {
  const enabledPlans = plans.filter(p => !p.disabled);

  if (enabledPlans.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('');
  lines.push(
    `  ${chalk.dim('Available billing plans for')} "${chalk.bold(productName)}"${chalk.dim(':')}`
  );
  lines.push('');

  // Find longest ID for alignment
  const maxIdLen = Math.max(...enabledPlans.map(p => p.id.length));

  for (const plan of enabledPlans) {
    const paddedId = plan.id.padEnd(maxIdLen);
    const cost = plan.cost ? chalk.dim(` (${plan.cost})`) : '';
    lines.push(`    ${chalk.cyan(paddedId)}  ${plan.name}${cost}`);
  }

  lines.push('');
  lines.push(`  ${chalk.dim('Usage:')}`);
  lines.push('');
  lines.push(`    ${chalk.cyan(`--plan ${enabledPlans[0].id}`)}`);
  lines.push('');

  return lines.join('\n');
}
