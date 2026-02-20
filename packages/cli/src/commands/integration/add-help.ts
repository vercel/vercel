import type Client from '../../util/client';
import type { Command } from '../help';
import output from '../../output-manager';
import { fetchIntegration } from '../../util/integration/fetch-integration';
import { formatProductHelp } from '../../util/integration/format-product-help';
import { formatBillingPlansHelp } from '../../util/integration/format-billing-plans-help';
import { formatDynamicExamples } from '../../util/integration/format-dynamic-examples';
import { formatMetadataSchemaHelp } from '../../util/integration/format-schema-help';
import { fetchBillingPlans } from '../../util/integration/fetch-billing-plans';

/**
 * Prints dynamic, integration-specific help for the `integration add` / `install` command.
 * If a slug is provided and the integration can be fetched, prints dynamic help
 * (examples, products, metadata schemas, billing plans) and returns true.
 * Otherwise returns false, and the caller should print static help as a fallback.
 */
export async function printAddDynamicHelp(
  client: Client,
  rawArg: string | undefined,
  baseCommand: Command,
  printHelp: (command: Command) => void,
  commandName: string
): Promise<boolean> {
  if (!rawArg) {
    return false;
  }

  const integrationSlug = rawArg.split('/')[0];
  const productSlug = rawArg.includes('/') ? rawArg.split('/')[1] : undefined;

  try {
    const integration = await fetchIntegration(client, integrationSlug);
    const products = integration.products ?? [];

    // Print help without static examples — we'll show dynamic ones instead
    printHelp({ ...baseCommand, examples: [] });
    output.print(formatDynamicExamples(integrationSlug, products, commandName));

    if (products.length > 1) {
      output.print(formatProductHelp(integrationSlug, products, commandName));
    }

    // Show metadata schema for ALL products
    for (const product of products) {
      if (product.metadataSchema) {
        // For single-product integrations, don't show product slug
        // For multi-product integrations, show product slug for slash syntax
        const metadataProductSlug =
          products.length > 1 ? product.slug : undefined;
        output.print(
          formatMetadataSchemaHelp(
            product.metadataSchema,
            integrationSlug,
            metadataProductSlug
          )
        );
      }
    }

    // Show billing plans for each product (or just the specified one)
    const productsToShow = productSlug
      ? products.filter(p => p.slug === productSlug)
      : products;
    for (const product of productsToShow) {
      try {
        const { plans } = await fetchBillingPlans(
          client,
          integration,
          product,
          {}
        );
        output.print(formatBillingPlansHelp(product.name, plans));
      } catch (err: unknown) {
        output.debug(
          `Failed to fetch billing plans for ${product.slug}: ${err}`
        );
      }
    }

    return true;
  } catch (err: unknown) {
    output.debug(`Failed to fetch integration for dynamic help: ${err}`);
    return false;
  }
}
