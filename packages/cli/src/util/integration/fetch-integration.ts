import chalk from 'chalk';
import output from '../../output-manager';
import type { IntegrationAddTelemetryClient } from '../telemetry/commands/integration/add';
import type Client from '../client';
import type { Integration } from './types';
import {
  fetchMarketplaceIntegrationsList,
  type IntegrationListItem,
} from './fetch-marketplace-integrations-list';

export async function fetchIntegration(client: Client, slug: string) {
  return client.fetch<Integration>(`/v2/integrations/integration/${slug}`, {
    json: true,
  });
}

/**
 * Fetch an integration by slug, print errors, and track telemetry.
 * Returns the integration on success, or null on failure (after printing the error).
 */
export async function fetchIntegrationWithTelemetry(
  client: Client,
  integrationSlug: string,
  telemetry: IntegrationAddTelemetryClient
): Promise<Integration | null> {
  let knownIntegrationSlug = false;
  try {
    const integration = await fetchIntegration(client, integrationSlug);
    knownIntegrationSlug = true;
    return integration;
  } catch (error) {
    output.error(
      `Failed to get integration "${integrationSlug}": ${(error as Error).message}`
    );
    return null;
  } finally {
    telemetry.trackCliArgumentIntegration(
      integrationSlug,
      knownIntegrationSlug
    );
  }
}

type DiscoverEntry = {
  name: string;
  slug: string;
  provider: string;
  description: string;
  tags: string[];
};

function toDiscoverEntries(
  integrations: IntegrationListItem[]
): DiscoverEntry[] {
  const entries: DiscoverEntry[] = [];

  for (const integration of integrations) {
    if (!integration.isMarketplace || !integration.canInstall) {
      continue;
    }

    const integrationTags = integration.tagIds ?? [];
    const products = integration.products ?? [];
    if (products.length === 0) {
      entries.push({
        name: integration.name,
        slug: integration.slug,
        provider: integration.name,
        description: integration.shortDescription ?? '',
        tags: integrationTags,
      });
      continue;
    }

    for (const product of products) {
      const needsCompoundSlug =
        products.length > 1 || product.slug !== integration.slug;
      entries.push({
        name: product.name,
        slug: needsCompoundSlug
          ? `${integration.slug}/${product.slug}`
          : integration.slug,
        provider: integration.name,
        description:
          product.shortDescription ?? integration.shortDescription ?? '',
        tags: [...integrationTags, ...(product.tags ?? [])],
      });
    }
  }

  return entries;
}

function matchesSearchTerm(entry: DiscoverEntry, term: string): boolean {
  const lower = term.toLowerCase();
  return (
    entry.name.toLowerCase().includes(lower) ||
    entry.slug.toLowerCase().includes(lower) ||
    entry.provider.toLowerCase().includes(lower) ||
    entry.description.toLowerCase().includes(lower) ||
    entry.tags.some(tag => tag.toLowerCase().includes(lower))
  );
}

/**
 * Fetch an integration by slug. If the slug is not found, discover matching
 * marketplace products and prompt the user to pick one.
 */
export async function resolveAndFetchIntegration(
  client: Client,
  rawSlug: string,
  telemetry: IntegrationAddTelemetryClient
): Promise<{
  integration: Integration;
  integrationSlug: string;
  productSlug?: string;
} | null> {
  // Try direct fetch first
  let directError: Error | undefined;
  try {
    const integration = await fetchIntegration(client, rawSlug);
    telemetry.trackCliArgumentIntegration(rawSlug, true);
    return { integration, integrationSlug: rawSlug };
  } catch (error) {
    directError = error as Error;
  }

  output.spinner('Searching marketplace integrations...', 500);

  let entries: DiscoverEntry[];
  try {
    const integrations = await fetchMarketplaceIntegrationsList(client);
    entries = toDiscoverEntries(integrations);
  } catch (_discoverError) {
    output.stopSpinner();
    output.error(
      `Failed to get integration "${rawSlug}": ${directError?.message ?? (_discoverError as Error).message}`
    );
    telemetry.trackCliArgumentIntegration(rawSlug, false);
    return null;
  }

  output.stopSpinner();

  const matches = entries.filter(entry => matchesSearchTerm(entry, rawSlug));

  if (matches.length === 0) {
    output.error(
      `No integration found matching "${rawSlug}". Run ${chalk.cyan('vercel integration discover')} to browse available integrations.`
    );
    telemetry.trackCliArgumentIntegration(rawSlug, false);
    return null;
  }

  if (client.stdin.isTTY !== true) {
    output.error(
      `Found multiple integrations matching "${rawSlug}". Available integrations:\n${matches.map(m => `- ${m.slug}: ${m.description}`).join('\n')}`
    );
    telemetry.trackCliArgumentIntegration(rawSlug, false);
    return null;
  }

  let selectedSlug: string;

  if (matches.length === 1) {
    const match = matches[0];
    const confirmed = await client.input.confirm(
      `Install ${chalk.bold(match.name)} (${match.slug})?`,
      true
    );
    if (!confirmed) {
      return null;
    }
    selectedSlug = match.slug;
  } else {
    selectedSlug = await client.input.select({
      message: `Found ${matches.length} integrations matching "${rawSlug}". Pick one to install:`,
      choices: matches.map(m => ({
        name: `${m.name} (${m.slug})${m.description ? ` - ${m.description}` : ''}`,
        value: m.slug,
      })),
    });
  }

  // Parse compound slug (integration/product)
  let integrationSlug: string;
  let productSlug: string | undefined;
  const slashIndex = selectedSlug.indexOf('/');
  if (slashIndex !== -1) {
    integrationSlug = selectedSlug.substring(0, slashIndex);
    productSlug = selectedSlug.substring(slashIndex + 1);
  } else {
    integrationSlug = selectedSlug;
  }

  try {
    const integration = await fetchIntegration(client, integrationSlug);
    telemetry.trackCliArgumentIntegration(integrationSlug, true);
    return { integration, integrationSlug, productSlug };
  } catch (error) {
    output.error(
      `Failed to get integration "${integrationSlug}": ${(error as Error).message}`
    );
    telemetry.trackCliArgumentIntegration(integrationSlug, false);
    return null;
  }
}
