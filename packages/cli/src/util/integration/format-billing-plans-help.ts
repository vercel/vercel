import { helpUsage, helpRows, helpSection } from '../output/help-format';
import type { BillingPlan } from './types';
import { createHelpTheme } from '../output/help-theme';
import { formatHelpSelector } from './format-help-selector';

export function formatBillingPlansHelp(
  productName: string,
  plans: BillingPlan[],
  columns = 80,
  theme = createHelpTheme()
): string {
  const enabled = plans.filter(plan => !plan.disabled);
  if (!enabled.length) return '';
  return `\n${helpSection(
    `Available billing plans for "${productName}"`,
    helpRows(
      enabled.map(plan => ({
        syntax: plan.id,
        description: `${plan.name}${plan.cost ? ` (${plan.cost})` : ''}`,
      })),
      columns,
      theme
    ),
    theme
  )}\n\n${helpUsage(theme)} ${theme.reference('--billing-plan')} ${formatHelpSelector(enabled[0].id, '<PLAN>')}\n`;
}
