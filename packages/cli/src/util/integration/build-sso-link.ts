import type { Team } from '@vercel-internals/types';

export function buildSSOLink(team: Team, configurationId: string) {
  const baseUrl = process.env.VERCEL_BASE_URL || 'https://vercel.com';
  const url = new URL('/api/marketplace/sso', baseUrl);
  url.searchParams.set('teamId', team.id);
  url.searchParams.set('integrationConfigurationId', configurationId);
  return url.href;
}
