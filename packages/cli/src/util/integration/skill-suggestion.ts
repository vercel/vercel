import output from '../../output-manager';
import type Client from '../client';
import { fetchOwnedIntegration } from './fetch-owned-integration';

export interface SkillSuggestion {
  name: string;
  url: string;
  command: string;
}

/**
 * Look up the agent skill (if any) associated with a freshly-provisioned
 * product and return a ready-to-run `npx skills add` command.
 *
 * Returns null when:
 *   - the /owned fetch fails for any reason (404, network, parse)
 *   - the product is not found in the response
 *   - either `agentSkillName` or `agentSkillUrl` is missing/empty
 *
 * Failure is silent by design: the install itself already succeeded, this
 * is purely an additive suggestion.
 */
export async function getSkillSuggestionForProduct(
  client: Client,
  integrationSlugOrId: string,
  productSlug: string
): Promise<SkillSuggestion | null> {
  let owned;
  try {
    owned = await fetchOwnedIntegration(client, integrationSlugOrId);
  } catch (err) {
    output.debug(
      `Failed to fetch owned integration for skill lookup: ${(err as Error).message}`
    );
    return null;
  }

  const product = owned.products?.find(p => p.slug === productSlug);
  if (!product) {
    return null;
  }

  const url = product.agentSkillUrl?.trim();
  const name = product.agentSkillName?.trim();
  if (!url || !name) {
    return null;
  }

  return {
    name,
    url,
    command: buildSkillInstallCommand(url, name),
  };
}

function buildSkillInstallCommand(url: string, name: string): string {
  // Single-quote the name to survive spaces; escape any embedded single quotes
  // using the standard '\'' POSIX trick.
  const quotedName = `'${name.replace(/'/g, "'\\''")}'`;
  return `npx skills add ${url} --skill ${quotedName}`;
}
