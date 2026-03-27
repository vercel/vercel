import type Client from '../client';
import {
  fetchMarketplaceIntegrationsList,
  type IntegrationListItem,
} from './fetch-marketplace-integrations-list';
import {
  fetchIntegrationCategories,
  type IntegrationCategory,
} from './fetch-integration-categories';

export type IntegrationRequirementsConfig = {
  integrations?: Record<string, string[]>;
};

export type IntegrationRequirement = {
  group: string;
  token: string;
};

export type IntegrationRequirementCandidate = {
  name: string;
  slug: string;
  provider: string;
  description: string;
  tags: string[];
  score: number;
};

export type IntegrationRequirementResolution = {
  requirement: IntegrationRequirement;
  candidates: IntegrationRequirementCandidate[];
};

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

const GROUP_ALIASES: Record<string, string[]> = {
  storage: ['storage', 'databases', 'database'],
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeGroup(group: string): string {
  const normalized = normalize(group);
  if (normalized === 'databases' || normalized === 'database') {
    return 'storage';
  }
  return normalized;
}

function titleCase(value: string): string {
  if (!value) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function resolveTags(
  productTags: string[] | undefined,
  integrationTagIds: string[] | undefined,
  categoryTitleById: Map<string, string>
): string[] {
  const result = new Set<string>();
  const allTags = [...(integrationTagIds ?? []), ...(productTags ?? [])];

  for (const tag of allTags) {
    if (tag.startsWith('tag_')) {
      const title = categoryTitleById.get(tag);
      result.add(title ?? tag.substring(4));
    } else if (!KNOWN_PROTOCOL_TYPES.has(tag)) {
      result.add(titleCase(tag));
    }
  }

  return [...result];
}

function toProductEntries(
  integrations: IntegrationListItem[],
  categories: IntegrationCategory[]
): ProductEntry[] {
  const entries: ProductEntry[] = [];
  const categoryTitleById = new Map<string, string>(
    categories.map(category => [category.id, category.title])
  );

  for (const integration of integrations) {
    if (!integration.isMarketplace || !integration.canInstall) {
      continue;
    }

    const products = integration.products ?? [];
    if (products.length === 0) {
      entries.push({
        name: integration.name,
        slug: integration.slug,
        provider: integration.name,
        description: integration.shortDescription ?? '',
        tags: resolveTags(undefined, integration.tagIds, categoryTitleById),
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
        tags: resolveTags(product.tags, integration.tagIds, categoryTitleById),
      });
    }
  }

  return entries;
}

function tokenMatches(entry: ProductEntry, token: string): number {
  const normalizedToken = normalize(token);
  const normalizedTags = entry.tags.map(normalize);

  if (normalizedTags.includes(normalizedToken)) {
    return 100;
  }

  if (entry.slug.toLowerCase() === normalizedToken) {
    return 95;
  }

  const haystack = [
    entry.name,
    entry.slug,
    entry.provider,
    entry.description,
    ...entry.tags,
  ]
    .join(' ')
    .toLowerCase();

  if (haystack.includes(normalizedToken)) {
    return 60;
  }

  return -1;
}

function groupMatches(entry: ProductEntry, group: string): boolean {
  const allowed = GROUP_ALIASES[group] ?? [group];
  const normalizedAllowed = new Set(allowed.map(normalize));
  const normalizedTags = entry.tags.map(normalize);
  return normalizedTags.some(tag => normalizedAllowed.has(tag));
}

function uniqueRequirements(
  requirements: IntegrationRequirement[]
): IntegrationRequirement[] {
  const seen = new Set<string>();
  const deduped: IntegrationRequirement[] = [];

  for (const requirement of requirements) {
    const key = `${requirement.group}:${requirement.token}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(requirement);
  }

  return deduped;
}

export function parseIntegrationRequirements(
  config: IntegrationRequirementsConfig | null | undefined
): {
  requirements: IntegrationRequirement[];
  errors: string[];
} {
  const requirements: IntegrationRequirement[] = [];
  const errors: string[] = [];

  if (!config || typeof config !== 'object') {
    return { requirements, errors };
  }

  const append = (groupKey: string, tokens: unknown) => {
    if (!Array.isArray(tokens)) {
      errors.push(
        `Expected "${groupKey}" integration requirements to be an array of strings.`
      );
      return;
    }

    for (const token of tokens) {
      if (typeof token !== 'string' || token.trim() === '') {
        errors.push(
          `Expected "${groupKey}" integration requirements to contain non-empty strings.`
        );
        continue;
      }
      requirements.push({
        group: normalizeGroup(groupKey),
        token: normalize(token),
      });
    }
  };

  if (config.integrations !== undefined) {
    if (
      !config.integrations ||
      typeof config.integrations !== 'object' ||
      Array.isArray(config.integrations)
    ) {
      errors.push('Expected "integrations" to be an object map.');
    } else {
      for (const [group, tokens] of Object.entries(config.integrations)) {
        append(group, tokens);
      }
    }
  }

  return {
    requirements: uniqueRequirements(requirements),
    errors,
  };
}

export async function resolveIntegrationRequirements(
  client: Client,
  requirements: IntegrationRequirement[]
): Promise<IntegrationRequirementResolution[]> {
  if (requirements.length === 0) {
    return [];
  }

  const [integrationsResult, categoriesResult] = await Promise.allSettled([
    fetchMarketplaceIntegrationsList(client),
    fetchIntegrationCategories(client),
  ]);

  if (integrationsResult.status === 'rejected') {
    throw integrationsResult.reason;
  }

  const entries = toProductEntries(
    integrationsResult.value,
    categoriesResult.status === 'fulfilled' ? categoriesResult.value : []
  );

  return requirements.map(requirement => {
    const candidates = entries
      .filter(entry => groupMatches(entry, requirement.group))
      .map(entry => ({
        ...entry,
        score: tokenMatches(entry, requirement.token),
      }))
      .filter(entry => entry.score >= 0)
      .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));

    return {
      requirement,
      candidates,
    };
  });
}
