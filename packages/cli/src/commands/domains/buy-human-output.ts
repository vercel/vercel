import chalk from 'chalk';
import table from '../../util/output/table';
import code from '../../util/output/code';
import type { ContactInformation } from '../../util/domains/collect-contact-information';
import { formatTerm, type NextStep, type PurchaseOrder } from './buy-plan';

/**
 * Renders the order summary shown before the single purchase confirmation.
 * Everything the purchase will do, in one glance.
 */
export function renderOrderSummary(
  order: PurchaseOrder & { autoRenew: boolean },
  contact: ContactInformation
): string {
  const registrant = contact.companyName
    ? `${contact.firstName} ${contact.lastName} <${contact.email}>, ${contact.companyName}`
    : `${contact.firstName} ${contact.lastName} <${contact.email}>`;
  const rows = [
    [chalk.cyan('Domain'), order.domain],
    [chalk.cyan('Term'), formatTerm(order.years)],
    [chalk.cyan('Price'), `$${order.purchasePrice}`],
    [
      chalk.cyan('Renewal'),
      order.autoRenew
        ? `$${order.renewalPrice} (auto-renews)`
        : `$${order.renewalPrice} (does not auto-renew)`,
    ],
    [chalk.cyan('Registrant'), registrant],
    [chalk.cyan('Scope'), order.contextName],
  ];
  return `\n${chalk.bold('  Order summary')}\n\n${indent(
    table(rows, { hsep: 4 })
  )}\n\n`;
}

/**
 * Renders suggested follow-up commands for human output — the same next[]
 * the structured renderer emits, so the two surfaces never diverge.
 */
export function renderNextSteps(next: NextStep[]): string | null {
  if (!next.length) {
    return null;
  }
  const lines = next.map(step =>
    step.when
      ? `  ${step.when}: ${code(step.command)}`
      : `  ${code(step.command)}`
  );
  return `${lines.join('\n')}\n`;
}

function indent(block: string): string {
  return block
    .split('\n')
    .map(line => `    ${line}`)
    .join('\n');
}
