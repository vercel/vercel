import { packageName } from '../pkg-name';
import { helpUsage, helpRows, helpSection } from '../output/help-format';
import type { IntegrationProduct } from './types';
import { createHelpTheme } from '../output/help-theme';
import { formatHelpSelector } from './format-help-selector';

/** Product IDs remain complete and copyable in narrow terminals. */
export function formatProductHelp(
  integrationSlug: string,
  products: IntegrationProduct[],
  commandName = 'integration add',
  columns = 80,
  theme = createHelpTheme()
): string {
  return `\n${helpSection(
    `Available products for "${integrationSlug}"`,
    helpRows(
      products.map(product => ({
        syntax: product.slug,
        description: product.name,
      })),
      columns,
      theme
    ),
    theme
  )}\n\n${helpUsage(theme)} ${theme.reference(`${packageName} ${commandName}`)} ${formatHelpSelector(integrationSlug, '<INTEGRATION>')}/<product-slug>\n`;
}
