import chalk from 'chalk';
import output from '../../output-manager';
import type { IntegrationAddTelemetryClient } from '../telemetry/commands/integration/add';
import type Client from '../client';
import type { Integration } from './types';
import {
  fetchMarketplaceIntegrationsList,
  type IntegrationListItem,
} from './fetch-marketplace-integrations-list';
import didYouMean from '../did-you-mean';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
  shouldEmitNonInteractiveCommandError,
} from '../agent-output';
import { AGENT_REASON } from '../agent-output-constants';
import { packageName } from '../pkg-name';

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
    // A marketplace integration has installable products. A slug can also resolve
    // to a legacy, non-marketplace integration with no products (e.g. `turso`,
    // whose Marketplace slug is `tursocloud`). Treat that like "not found" and fall
    // through to suggest the closest marketplace match instead of dead-ending.
    if (integration.products?.length) {
      telemetry.trackCliArgumentIntegration(slug, true);
      return integration;
    }
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

  if (!matches.length) {
    output.error(
      `No integration found matching "${slug}". Run ${chalk.cyan('vercel integration discover')} to browse available integrations.`
    );
    telemetry.trackCliArgumentIntegration(slug, false);
    return null;
  }

  // Closest match, for "did you mean" copy and the primary suggested command.
  const suggestion =
    didYouMean(
      slug,
      matches.map(m => m.slug)
    ) ?? matches[0].slug;

  // Non-interactive (agents/CI): don't silently install a fuzzy match. Surface the
  // suggestion and the discover command so the caller can decide the next step.
  if (
    client.stdin.isTTY !== true ||
    shouldEmitNonInteractiveCommandError(client)
  ) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.NOT_FOUND,
        message: `"${slug}" is not a Marketplace integration.`,
        hint: `Did you mean "${suggestion}"?`,
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              `integration add ${suggestion}`,
              packageName,
              { prependGlobalFlags: true }
            ),
            when: `Install "${suggestion}" (closest match)`,
          },
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'integration discover',
              packageName,
              { prependGlobalFlags: true }
            ),
            when: 'List available marketplace integrations and slugs',
          },
        ],
      },
      1
    );
    if (matches.length === 1) {
      output.error(
        `"${slug}" is not a Marketplace integration. Did you mean ${chalk.bold(matches[0].name)} (${chalk.bold(matches[0].slug)})?`
      );
    } else {
      output.error(
        `"${slug}" is not a Marketplace integration. Did you mean one of:\n${matches.map(m => `- ${m.slug}: ${m.description}`).join('\n')}`
      );
    }
    output.log(
      `Run ${chalk.cyan('vercel integration discover')} to list all integrations.`
    );
    telemetry.trackCliArgumentIntegration(slug, false);
    return null;
  }

  if (matches.length === 1) {
    const match = matches[0];
    const confirmed = await client.input.confirm(
      `Did you mean ${chalk.bold(match.name)} (${chalk.bold(match.slug)})? Install it?`,
      true
    );
    if (!confirmed) {
      telemetry.trackCliArgumentIntegration(slug, false);
      return null;
    }
    slug = match.slug;
  } else {
    slug = await client.input.select({
      message: `"${slug}" is not an exact match. Did you mean one of these? Pick one to install:`,
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
