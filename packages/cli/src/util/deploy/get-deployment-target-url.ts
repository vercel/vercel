interface DeploymentAliasFields {
  // Widened to `string` because custom environments use arbitrary target slugs.
  target?: string | null;
  alias?: string[];
  automaticAliases?: string[];
}

/**
 * The publicly shareable URL for a finished deployment, plus the label to
 * print for it ("Production" or "Preview").
 *
 * A deployment record exposes several hostnames:
 *   - `url`              – the immutable, commit-specific deployment URL
 *   - `automaticAliases` – auto-generated system aliases (e.g.
 *                          `<project>-<scope>` and
 *                          `<project>-git-<branch>-<scope>`)
 *   - `alias`            – everything assigned to the deployment, which also
 *                          includes the project's production domains
 *
 * The dashboard surfaces the project's production domain (not the
 * auto-generated alias) because, with Deployment Protection enabled, the
 * auto-generated aliases are gated behind Vercel Authentication while the
 * project domain is publicly accessible. We mirror that here: the project
 * domains are the entries in `alias` that are not auto-generated.
 *
 * Returns `undefined` when no suitable alias has been assigned yet.
 */
export function getDeploymentTargetUrl(
  deployment: DeploymentAliasFields
): { label: string; url: string } | undefined {
  const automaticAliases = deployment.automaticAliases ?? [];
  const assignedAliases = deployment.alias ?? [];

  if (deployment.target === 'production') {
    // Project / custom production domains are the assigned aliases that are
    // not auto-generated system aliases. Prefer a real custom domain over the
    // Vercel-provided `*.vercel.app` domain when both are present.
    const productionDomains = assignedAliases.filter(
      alias => !automaticAliases.includes(alias)
    );
    const url = preferCustomDomain(productionDomains);
    return url ? { label: 'Production', url } : undefined;
  }

  // Preview deployments: surface the stable branch ("preview") alias rather
  // than the commit-specific deployment URL.
  const branchDomain = automaticAliases.find(alias => alias.includes('-git-'));
  return branchDomain ? { label: 'Preview', url: branchDomain } : undefined;
}

function preferCustomDomain(domains: string[]): string | undefined {
  if (domains.length === 0) {
    return undefined;
  }
  const customDomain = domains.find(domain => !domain.endsWith('.vercel.app'));
  return customDomain ?? domains[0];
}
