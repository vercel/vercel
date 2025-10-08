import type { Team } from '@vercel-internals/types';

export function buildSSOLink(team: Team, configurationId: string) {
  const url = new URL('/api/marketplace/sso', 'https://vercel.com');
  url.searchParams.set('teamId', team.id);
  url.searchParams.set('integrationConfigurationId', configurationId);
  return url.href;
}
