import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { fetchIntegration } from '../../util/integration/fetch-integration';
import table from '../../util/output/table';

export async function products(client: Client, args: string[]) {
  if (args.length > 1) {
    output.error(
      'Cannot list products for more than one integration at a time'
    );
    return 1;
  }

  const integrationSlug = args[0];

  if (!integrationSlug) {
    output.error('You must pass an integration slug');
    return 1;
  }

  let integration;
  try {
    output.spinner('Fetching integration...', 500);
    integration = await fetchIntegration(client, integrationSlug);
  } catch (error) {
    output.error(
      `Failed to get integration "${integrationSlug}": ${(error as Error).message}`
    );
    return 1;
  } finally {
    output.stopSpinner();
  }

  if (!integration.products?.length) {
    output.log(`Integration "${integrationSlug}" has no products available.`);
    return 0;
  }

  output.log(
    `Products for ${chalk.bold(integration.name)}:\n${table(
      [
        ['Slug', 'Name', 'Description'].map(header =>
          chalk.bold(chalk.cyan(header))
        ),
        ...integration.products.map(product => [
          chalk.bold(product.slug),
          product.name,
          chalk.gray(product.shortDescription || '–'),
        ]),
      ],
      { hsep: 4 }
    )}`
  );

  output.log(
    `\nTo install a product, run: ${chalk.cyan(`vercel integration add ${integrationSlug}/<product-slug>`)}`
  );

  return 0;
}
