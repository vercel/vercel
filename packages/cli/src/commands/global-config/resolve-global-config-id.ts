import type Client from '../../util/client';

export interface GlobalConfigListEntry {
  id: string;
  slug: string;
}

/**
 * Resolves a Global Config id (`ecfg_…`) or slug to an id by listing configs in the current team.
 */
export async function resolveGlobalConfigId(
  client: Client,
  idOrSlug: string
): Promise<string | null> {
  if (!idOrSlug) {
    return null;
  }
  if (idOrSlug.startsWith('ecfg_')) {
    return idOrSlug;
  }
  const list = await client.fetch<GlobalConfigListEntry[]>('/v1/global-config');
  const match = list.find(c => c.slug === idOrSlug);
  return match?.id ?? null;
}
