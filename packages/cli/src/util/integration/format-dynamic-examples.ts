import { createHelpTheme } from '../output/help-theme';
import { packageName } from '../pkg-name';
import {
  buildCommandExampleLines,
  type CommandExample,
} from '../../commands/help';
import {
  formatMetadataExample,
  getVisibleOptions,
  isHiddenOnCreate,
} from './format-schema-help';
import type { IntegrationProduct } from './types';
import { formatHelpSelector } from './format-help-selector';

/** Examples use the fetched integration's real product slugs and schema. */
export function formatDynamicExamples(
  integrationSlug: string,
  products: IntegrationProduct[],
  commandName = 'integration add',
  columns = 80,
  theme = createHelpTheme()
): string {
  const invocation = `${packageName} ${commandName} ${formatHelpSelector(integrationSlug, '<INTEGRATION>')}`;
  const examples: CommandExample[] = [
    { name: `Install ${integrationSlug}`, value: invocation },
  ];
  if (products.length > 1)
    examples.push({
      name: 'Install a specific product',
      value: `${invocation}/${formatHelpSelector(products[0].slug, '<PRODUCT>')}`,
    });
  examples.push({
    name: 'Install with a custom resource name',
    value: `${invocation} --name my-resource`,
  });
  const metadata = buildMetadataExample(integrationSlug, products, commandName);
  if (metadata)
    examples.push({ name: 'Install with metadata', value: metadata });
  for (const [name, flags] of [
    ['Install with a specific billing plan', '--billing-plan <PLAN>'],
    [
      'Install and connect to specific environments only',
      '-e production -e preview',
    ],
    ['Install without connecting to the current project', '--no-connect'],
    ['Install without pulling environment variables', '--no-env-pull'],
    ['Install with a prefix for environment variable names', '--prefix NEON2_'],
    ['Output as JSON', '--json'],
    [
      'Install using a specific installation',
      '--installation <INSTALLATION_ID>',
    ],
    ['Claim a sandbox resource immediately after provisioning', '--claim'],
    ['Skip the offer to claim a sandbox resource', '--no-claim'],
  ])
    examples.push({
      name,
      value: `${invocation} ${flags}`,
    });
  const placeholders = [
    '<INTEGRATION>',
    '<PRODUCT>',
    '<KEY>',
    '<VALUE>',
    '<PLAN>',
    '<INSTALLATION_ID>',
  ];
  return `\n${buildCommandExampleLines(
    { examples: examples.map(example => ({ ...example, placeholders })) },
    columns,
    theme
  )}\n`;
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
        flags.push(formatMetadataExample(key, 'true'));
      } else if (prop.type === 'array') {
        const visible = getVisibleOptions(prop);
        if (visible && visible.length > 0) {
          flags.push(
            formatMetadataExample(key, visible.slice(0, 2).join(','), true)
          );
        }
      } else {
        const visible = getVisibleOptions(prop);
        if (visible && visible.length > 0) {
          flags.push(formatMetadataExample(key, visible[0]));
        }
      }

      // Show at most 2 flags in the example
      if (flags.length >= 2) break;
    }

    if (flags.length > 0) {
      const slug =
        products.length > 1
          ? `${formatHelpSelector(integrationSlug, '<INTEGRATION>')}/${formatHelpSelector(product.slug, '<PRODUCT>')}`
          : formatHelpSelector(integrationSlug, '<INTEGRATION>');
      return `${packageName} ${commandName} ${slug} ${flags.join(' ')}`;
    }
  }

  return undefined;
}
