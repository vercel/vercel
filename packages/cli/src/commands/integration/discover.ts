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
import { fetchMarketplaceIntegrations } from '../../util/integration/fetch-marketplace-integrations-list';
import { fetchIntegrationCategories } from '../../util/integration/fetch-integration-categories';

type IntegrationListItem = {
  slug: string;
  name: string;
  shortDescription?: string;
  tagIds?: string[];
  products?: { slug: string; name: string }[];
  isMarketplace?: boolean;
  canInstall?: boolean;
};

type IntegrationCategory = {
  id: string;
  title: string;
};

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
      fetchMarketplaceIntegrations(client),
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

  const results = integrations
    .filter(integration => integration.isMarketplace && integration.canInstall)
    .map(integration => {
      const category = (integration.tagIds ?? [])
        .map(tagId => categoryTitleById.get(tagId))
        .filter((title): title is string => Boolean(title));

      return {
        slug: integration.slug,
        name: integration.name,
        description: integration.shortDescription ?? '',
        category,
        products: (integration.products ?? []).map(product => ({
          slug: product.slug,
          name: product.name,
        })),
      };
    });

  output.stopSpinner();

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify(
        {
          integrations: results,
        },
        null,
        2
      )}\n`
    );
    return 0;
  }

  if (results.length === 0) {
    output.log('No marketplace integrations found.');
    return 0;
  }

  output.log('Available marketplace integrations:\n' + formatTable(results));
  return 0;
}

function formatTable(
  integrations: {
    slug: string;
    name: string;
    category: string[];
    products: { name: string }[];
  }[]
) {
  return table(
    [
      ['Name', 'Slug', 'Categories', 'Products'].map(header =>
        chalk.bold(chalk.cyan(header))
      ),
      ...integrations.map(integration => [
        integration.name,
        integration.slug,
        integration.category.length > 0
          ? integration.category.join(', ')
          : chalk.gray('-'),
        integration.products.length > 0
          ? integration.products.map(product => product.name).join(', ')
          : chalk.gray('-'),
      ]),
    ],
    { hsep: 4 }
  );
}
