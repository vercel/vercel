import type { Team } from '@vercel-internals/types';

export function buildSSOLink(
  team: Team,
  configurationId: string,
  resourceExternalId?: string
) {
  const url = new URL('/api/marketplace/sso', 'https://vercel.com');
  url.searchParams.set('teamId', team.id);
  url.searchParams.set('integrationConfigurationId', configurationId);
  if (resourceExternalId) {
    url.searchParams.set('resource_id', resourceExternalId);
  }
  return url.href;
}
