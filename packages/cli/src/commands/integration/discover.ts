import chalk from 'chalk';
import type Client from '../../util/client';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';
import table from '../../util/output/table';
import output from '../../output-manager';
import { discoverSubcommand } from './command';
import { IntegrationDiscoverTelemetryClient } from '../../util/telemetry/commands/integration/discover';
import {
  fetchMarketplaceIntegrationsList,
  type IntegrationListItem,
} from '../../util/integration/fetch-marketplace-integrations-list';
import {
  fetchIntegrationCategories,
  type IntegrationCategory,
} from '../../util/integration/fetch-integration-categories';

type ProductEntry = {
  name: string;
  slug: string;
  provider: string;
  description: string;
  tags: string[];
};

const KNOWN_PROTOCOL_TYPES = new Set([
  'storage',
  'ai',
  'observability',
  'messaging',
  'compute',
]);

function resolveTags(
  productTags: string[] | undefined,
  integrationTagIds: string[] | undefined,
  categoryTitleById: Map<string, string>
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  const allTags = [...(integrationTagIds ?? []), ...(productTags ?? [])];

  for (const tag of allTags) {
    if (tag.startsWith('tag_')) {
      const title = categoryTitleById.get(tag);
      if (title && !seen.has(title)) {
        seen.add(title);
        result.push(title);
      }
    } else if (!KNOWN_PROTOCOL_TYPES.has(tag)) {
      const capitalized = tag.charAt(0).toUpperCase() + tag.slice(1);
      if (!seen.has(capitalized)) {
        seen.add(capitalized);
        result.push(capitalized);
      }
    }
  }

  return result;
}

export async function discover(client: Client, args: string[]) {
  let parsedArguments = null;
  const flagsSpecification = getFlagsSpecification(discoverSubcommand.options);

  try {
    parsedArguments = parseArguments(args, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const telemetry = new IntegrationDiscoverTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  if (parsedArguments.args.length > 0) {
    output.error(
      'Invalid number of arguments. Usage: `vercel integration discover`'
    );
    return 1;
  }

  const formatResult = validateJsonOutput(parsedArguments.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;
  telemetry.trackCliFlagJson(parsedArguments.flags['--json']);

  output.spinner('Fetching marketplace integrations...', 500);

  let integrations: IntegrationListItem[];
  let categories: IntegrationCategory[] = [];
  try {
    const [integrationsResult, categoriesResult] = await Promise.allSettled([
      fetchMarketplaceIntegrationsList(client),
      fetchIntegrationCategories(client),
    ]);

    if (integrationsResult.status === 'rejected') {
      throw integrationsResult.reason;
    }
    integrations = integrationsResult.value;

    if (categoriesResult.status === 'fulfilled') {
      categories = categoriesResult.value;
    } else {
      output.warn(
        `Failed to fetch integration categories. Continuing without categories: ${categoriesResult.reason instanceof Error ? categoriesResult.reason.message : String(categoriesResult.reason)}`
      );
    }
  } catch (error) {
    output.error(
      `Failed to fetch marketplace integrations: ${(error as Error).message}`
    );
    return 1;
  }

  const categoryTitleById = new Map<string, string>(
    categories.map(category => [category.id, category.title])
  );

  const results: ProductEntry[] = [];

  for (const integration of integrations) {
    if (!integration.isMarketplace || !integration.canInstall) {
      continue;
    }

    const products = integration.products ?? [];

    if (products.length === 0) {
      results.push({
        name: integration.name,
        slug: integration.slug,
        provider: integration.name,
        description: integration.shortDescription ?? '',
        tags: resolveTags(undefined, integration.tagIds, categoryTitleById),
      });
    } else {
      const isMultiProduct = products.length > 1;
      for (const product of products) {
        results.push({
          name: product.name,
          slug: isMultiProduct
            ? `${integration.slug}/${product.slug}`
            : integration.slug,
          provider: integration.name,
          description:
            product.shortDescription ?? integration.shortDescription ?? '',
          tags: resolveTags(
            product.tags,
            integration.tagIds,
            categoryTitleById
          ),
        });
      }
    }
  }

  output.stopSpinner();

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify(
        {
          products: results,
        },
        null,
        2
      )}\n`
    );
    return 0;
  }

  if (results.length === 0) {
    output.log('No marketplace products found.');
    return 0;
  }

  const useCompactFormat =
    client.stderr.columns > 0 && client.stderr.columns < 120;
  const formattedOutput = useCompactFormat
    ? formatCompactList(results)
    : formatTable(results);
  output.log('Available marketplace products:\n' + formattedOutput);
  return 0;
}

function formatTable(products: ProductEntry[]) {
  return table(
    [
      ['Product Name', 'Slug', 'Provider', 'Description', 'Tags'].map(header =>
        chalk.bold(chalk.cyan(header))
      ),
      ...products.map(product => [
        product.name,
        product.slug,
        product.provider,
        product.description || chalk.gray('-'),
        product.tags.length > 0 ? product.tags.join(', ') : chalk.gray('-'),
      ]),
    ],
    { hsep: 4 }
  );
}

function formatCompactList(products: ProductEntry[]) {
  return products
    .map(product => {
      return [
        `${chalk.bold(product.name)} (${product.slug})`,
        `  Provider: ${product.provider}`,
        `  Description: ${product.description || '-'}`,
        `  Tags: ${product.tags.length > 0 ? product.tags.join(', ') : '-'}`,
      ].join('\n');
    })
    .join('\n\n');
}
