import isWildcardAlias from '../alias/is-wildcard-alias';
import { getCertsForCn } from '../certs/get-certs-for-cn';
import Client from '../client';

/**
 * Tries to find the "best" alias url.
 * @param aliasList
 */
export async function getPreferredPreviewURL(
  client: Client,
  aliasList: string[]
) {
  if (aliasList.length === 0) {
    return null;
  }

  /**
   * First checks for non public aliases and non wildcard domains.
   */
  const preferredAliases = aliasList.filter(
    alias =>
      !alias.endsWith('.now.sh') &&
      !alias.endsWith('.vercel.app') &&
      !isWildcardAlias(alias)
  );
  for (const alias of preferredAliases) {
    const certs = await getCertsForCn(client, alias, { limit: 1 }).catch(() => {
      return null;
    });
    if (certs && certs.length > 0) {
      return { previewUrl: `https://${alias}`, isWildcard: false };
    }
  }

  /**
   * Fallback to first alias
   */
  const [firstAlias] = aliasList;
  if (isWildcardAlias(firstAlias)) {
    return { previewUrl: firstAlias, isWildcard: true };
  }

  if (firstAlias.endsWith('.vercel.app') || firstAlias.endsWith('.now.sh')) {
    return { previewUrl: `https://${firstAlias}`, isWildcard: false };
  }

  return { previewUrl: `http://${firstAlias}`, isWildcard: false };
}
