import type Client from '../../util/client';

export interface EdgeConfigListEntry {
  id: string;
  slug: string;
}

/**
 * Resolves an Edge Config id (`ecfg_…`) or slug to an id by listing configs in the current team.
 */
export async function resolveEdgeConfigId(
  client: Client,
  idOrSlug: string
): Promise<string | null> {
  if (!idOrSlug) {
    return null;
  }
  if (idOrSlug.startsWith('ecfg_')) {
    return idOrSlug;
  }
  const list = await client.fetch<EdgeConfigListEntry[]>('/v1/edge-config');
  const match = list.find(c => c.slug === idOrSlug);
  return match?.id ?? null;
}
