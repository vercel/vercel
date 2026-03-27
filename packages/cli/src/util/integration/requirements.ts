export type IntegrationRequirementsConfig = {
  integrations?: string[];
};

export function parseIntegrationRequirements(
  config: IntegrationRequirementsConfig | null | undefined
): {
  slugs: string[];
  errors: string[];
} {
  const errors: string[] = [];

  if (!config || typeof config !== 'object') {
    return { slugs: [], errors };
  }

  if (config.integrations === undefined) {
    return { slugs: [], errors };
  }

  if (!Array.isArray(config.integrations)) {
    errors.push('Expected "integrations" to be an array of strings.');
    return { slugs: [], errors };
  }

  const seen = new Set<string>();
  const slugs: string[] = [];

  for (const item of config.integrations) {
    if (typeof item !== 'string' || item.trim() === '') {
      errors.push('Expected "integrations" to contain non-empty strings.');
      continue;
    }

    const slug = item.trim().toLowerCase();
    if (!seen.has(slug)) {
      seen.add(slug);
      slugs.push(slug);
    }
  }

  return { slugs, errors };
}
