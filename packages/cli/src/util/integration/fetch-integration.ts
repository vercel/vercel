import chalk from 'chalk';
import output from '../../output-manager';
import didYouMean from '../did-you-mean';
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
  slug: string,
  telemetry: IntegrationAddTelemetryClient
): Promise<(Integration & { productSlug?: string }) | null> {
  // Try direct fetch first
  let directError: Error | undefined;
  try {
    const integration = await fetchIntegration(client, slug);
    telemetry.trackCliArgumentIntegration(slug, true);
    return integration;
  } catch (error) {
    directError = error as Error;
  }

  output.spinner('Searching marketplace integrations...', 500);

  let entries: DiscoverEntry[];
  try {
    const integrations = await fetchMarketplaceIntegrationsList(client);
    entries = toDiscoverEntries(integrations);
  } catch (discoverError) {
    output.stopSpinner();
    output.error(
      `Failed to get integration "${slug}": ${directError?.message ?? (discoverError as Error).message}`
    );
    telemetry.trackCliArgumentIntegration(slug, false);
    return null;
  }

  output.stopSpinner();

  const matches = entries.filter(entry => matchesSearchTerm(entry, slug));

  const discoverHint = `Run ${chalk.cyan('vercel integration discover')} to browse available integrations.`;

  if (!matches.length) {
    // No substring match — fall back to a fuzzy "did you mean" search against
    // known slugs to catch typos (e.g. "noen" -> "neon").
    const slugCandidates = [...new Set(entries.map(entry => entry.slug))];
    const suggestion = didYouMean(slug.toLowerCase(), slugCandidates, 0.7);

    if (!suggestion) {
      output.error(`No integration found matching "${slug}". ${discoverHint}`);
      telemetry.trackCliArgumentIntegration(slug, false);
      return null;
    }

    const suggested = entries.find(entry => entry.slug === suggestion);
    const suggestionLabel = suggested
      ? `${chalk.bold(suggested.name)} (${suggestion})`
      : chalk.bold(suggestion);

    // Non-interactive (agent/CI): surface the suggestion plus discover hint and stop.
    if (client.stdin.isTTY !== true) {
      output.error(
        `No integration found matching "${slug}". Did you mean "${suggestion}"? ${discoverHint}`
      );
      telemetry.trackCliArgumentIntegration(slug, false);
      return null;
    }

    // Interactive: offer to install the closest match, but still point at discover.
    output.log(`No integration found matching "${slug}". ${discoverHint}`);
    const confirmed = await client.input.confirm(
      `Did you mean ${suggestionLabel}? Install it?`,
      true
    );
    if (!confirmed) {
      telemetry.trackCliArgumentIntegration(slug, false);
      return null;
    }
    slug = suggestion;
  } else if (matches.length === 1) {
    const match = matches[0];
    if (client.stdin.isTTY === true) {
      const confirmed = await client.input.confirm(
        `Install ${chalk.bold(match.name)} (${match.slug})?`,
        true
      );
      if (!confirmed) {
        telemetry.trackCliArgumentIntegration(slug, false);
        return null;
      }
    }
    slug = match.slug;
  } else if (client.stdin.isTTY !== true) {
    output.error(
      `Found ${matches.length} integrations matching "${slug}". Available integrations:\n${matches.map(m => `- ${m.slug}: ${m.description}`).join('\n')}`
    );
    telemetry.trackCliArgumentIntegration(slug, false);
    return null;
  } else {
    slug = await client.input.select({
      message: `Found ${matches.length} integrations matching "${slug}". Pick one to install:`,
      choices: matches.map(m => ({
        name: `${m.name} (${m.slug})${m.description ? ` - ${m.description}` : ''}`,
        value: m.slug,
      })),
    });
  }

  // Parse compound slug (integration/product)
  let integrationSlug: string;
  let productSlug: string | undefined;
  const slashIndex = slug.indexOf('/');
  if (slashIndex !== -1) {
    integrationSlug = slug.substring(0, slashIndex);
    productSlug = slug.substring(slashIndex + 1);
  } else {
    integrationSlug = slug;
  }

  try {
    const integration = await fetchIntegration(client, integrationSlug);
    telemetry.trackCliArgumentIntegration(integrationSlug, true);
    return { ...integration, productSlug };
  } catch (error) {
    output.error(
      `Failed to get integration "${integrationSlug}": ${(error as Error).message}`
    );
    telemetry.trackCliArgumentIntegration(integrationSlug, false);
    return null;
  }
}
