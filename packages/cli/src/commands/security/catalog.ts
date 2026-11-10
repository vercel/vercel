export interface SecurityCheck {
  slug: string;
  description: string;
  risk: 'high' | 'medium';
}

export const SECURITY_CHECKS: readonly SecurityCheck[] = [
  {
    slug: 'members-no-mfa',
    description: 'Team members without multi-factor authentication',
    risk: 'high',
  },
  {
    slug: 'members-too-many-owners',
    description: 'Team owners to review',
    risk: 'high',
  },
  {
    slug: 'pats-no-expiration',
    description: 'PATs that never expire',
    risk: 'high',
  },
  {
    slug: 'env-vars-creds-instead-of-oidc',
    description: 'Long-lived credentials where OIDC is available',
    risk: 'high',
  },
  {
    slug: 'depl-no-git-fork-protection',
    description: 'Projects without Git fork deploy prevention',
    risk: 'high',
  },
  {
    slug: 'proj-no-preview-depl-protection',
    description: 'Projects without preview deployment protection',
    risk: 'high',
  },
  {
    slug: 'env-vars-non-sensitive',
    description: 'Environment variables not marked Sensitive',
    risk: 'medium',
  },
  {
    slug: 'env-vars-non-sensitive-stale',
    description: 'Environment variables older than 90 days',
    risk: 'medium',
  },
  {
    slug: 'env-vars-exposed-web-app-fwk',
    description: 'Environment variables exposed via web application framework',
    risk: 'medium',
  },
];

export function isKnownCheck(slug: string): boolean {
  return SECURITY_CHECKS.some(check => check.slug === slug);
}
