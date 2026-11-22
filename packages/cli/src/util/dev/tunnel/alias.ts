import { createHash } from 'node:crypto';
import type { Org } from '@vercel-internals/types';
import type Client from '../../client';
import { isAPIError } from '../../errors-ts';

/** The most a DNS label holds. */
const MAX_LABEL = 63;

/**
 * The first label of the developer's tunnel URL for a project, the same in
 * every session, shaped like a branch alias: `<project>-tunnel-<user>-<team>`.
 * Each proxy that replaces the last takes it over, so the URL, and the logins
 * a browser holds for it, outlive the proxy's deploys.
 */
export function tunnelAliasLabel(
  projectName: string,
  username: string,
  org: Pick<Org, 'slug' | 'type'>
): string {
  const label = toLabel(
    [projectName, 'tunnel', username, org.type === 'team' ? org.slug : '']
      .filter(Boolean)
      .join('-')
  );
  if (label.length <= MAX_LABEL) return label;
  // A long one keeps its start, and a hash of the whole keeps it distinct.
  const hash = createHash('sha256').update(label).digest('hex').slice(0, 8);
  const start = label.slice(0, MAX_LABEL - hash.length - 1).replace(/-+$/, '');
  return `${start}-${hash}`;
}

/**
 * The alias under the suffix of a deployment's own URL: the team's or
 * project's Preview Deployment Suffix, or `vercel.app` without one. Only the
 * team can create names under its own suffix.
 */
export function aliasUnder(label: string, deploymentUrl: string): string {
  const { hostname } = new URL(deploymentUrl);
  return `${label}.${hostname.slice(hostname.indexOf('.') + 1)}`;
}

/** Whether a name from `--tunnel=<label>` can be the URL's first label. */
export function isAliasLabel(value: string): boolean {
  return (
    value.length <= MAX_LABEL && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(value)
  );
}

function toLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Point the alias at a proxy deployment. One of the team's other deployments
 * gives it up, which is how it follows each new proxy.
 */
export async function assignAlias(
  client: Client,
  org: Org,
  deploymentId: string,
  alias: string
): Promise<void> {
  try {
    await client.fetch(
      `/v2/deployments/${encodeURIComponent(deploymentId)}/aliases`,
      { method: 'POST', accountId: org.id, body: { alias } }
    );
  } catch (err) {
    // A 409 is either "already assigned to this deployment" or "the domain
    // can't be used", so only a lookup that finds it here makes it the first.
    if (
      isAPIError(err) &&
      err.status === 409 &&
      (await aliasDeployment(client, org, alias)) === deploymentId
    ) {
      return;
    }
    throw err;
  }
}

/**
 * The deployment the alias points at, as the team sees it: null for one that
 * points at none (a redirect), undefined for one the team has no alias by,
 * which includes one another account holds.
 */
export async function aliasDeployment(
  client: Client,
  org: Org,
  alias: string
): Promise<string | null | undefined> {
  try {
    const { deploymentId } = await client.fetch<{
      deploymentId?: string | null;
    }>(`/v4/aliases/${encodeURIComponent(alias)}`, { accountId: org.id });
    return deploymentId ?? null;
  } catch (err) {
    if (isAPIError(err) && err.status === 404) return undefined;
    throw err;
  }
}

/** Marks a tunnel proxy among a project's deployments. */
export const PROXY_META = { vcDevTunnel: 'proxy' } as const;

/**
 * Whether assigning the alias would take it from something else: a teammate's
 * tunnel, a branch's preview, any deployment but this developer's own tunnel
 * proxies. Assigning moves an alias, so that URL would then reach this
 * machine's dev server. One pointing at a deleted deployment is free; one
 * pointing at no deployment, a redirect, is not.
 *
 * With `leased`, api-dev-tunnel's lease on the name is this tunnel's, so a
 * teammate's tunnel proxy gives it up too: their lease was released or lapsed.
 */
export async function aliasHeldElsewhere(
  client: Client,
  org: Org,
  alias: string,
  {
    userId,
    ours,
    leased = false,
  }: { userId: string; ours: ReadonlySet<string>; leased?: boolean }
): Promise<boolean> {
  const deploymentId = await aliasDeployment(client, org, alias);
  // One another account holds looks free here too: assignAlias() refuses it.
  if (deploymentId === undefined) return false;
  if (deploymentId === null) return true;
  if (ours.has(deploymentId)) return false;
  let deployment: { creator?: { uid?: string }; meta?: Record<string, string> };
  try {
    deployment = await client.fetch(
      `/v13/deployments/${encodeURIComponent(deploymentId)}`,
      { accountId: org.id }
    );
  } catch (err) {
    if (isAPIError(err) && err.status === 404) return false;
    throw err;
  }
  return !(
    deployment.meta?.vcDevTunnel === PROXY_META.vcDevTunnel &&
    (leased || deployment.creator?.uid === userId)
  );
}
