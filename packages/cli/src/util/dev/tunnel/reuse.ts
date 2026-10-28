import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import getGlobalPathConfig from '../../config/global-path';

/** The proxy deployment a project's tunnel last used. */
export interface DeployedProxy {
  /** proxyKey() of what it was built from. */
  key: string;
  id: string;
  url: string;
  /**
   * The proxies this one replaces, until they're deleted. Set while this one
   * deploys, so a run stopped mid-deploy leaves the next one to delete them,
   * once the alias one of them may still hold has moved.
   */
  replaces?: string[];
}

/**
 * Identifies a proxy deployment by everything it's built from. A new server
 * token (the tunnel's record lapsed), dev port or proxy source changes it.
 * Hashed, so the record never holds the token.
 */
export function proxyKey(parts: unknown): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

/** Where the CLI remembers a project's proxy deployment on this machine. */
export function proxyRecordPath(
  orgId: string,
  projectId: string,
  globalDir: string = getGlobalPathConfig()
): string {
  return join(globalDir, 'dev-tunnels', `${orgId}.${projectId}.json`);
}

/**
 * How long a proxy is reused before the CLI deploys a new one and deletes it.
 * Deployments have no expiry of their own, only the project's preview
 * retention, which defaults to 180 days.
 */
export const PROXY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** The proxy deployment remembered for the project, if there is one. */
export async function readProxy(
  path: string
): Promise<DeployedProxy | undefined> {
  try {
    const proxy: Omit<Partial<DeployedProxy>, 'replaces'> & {
      replaces?: unknown;
    } = JSON.parse(await readFile(path, 'utf8'));
    if (!proxy.key || !proxy.id || !proxy.url) return undefined;
    // An earlier version recorded one.
    const replaces = (
      Array.isArray(proxy.replaces) ? proxy.replaces : [proxy.replaces]
    ).filter((id): id is string => typeof id === 'string');
    return {
      key: proxy.key,
      id: proxy.id,
      url: proxy.url,
      ...(replaces.length > 0 && { replaces }),
    };
  } catch {
    return undefined;
  }
}

/** What the API reports about a deployment. */
export interface ProxyDeployment {
  readyState?: string;
  createdAt?: number;
  target?: string | null;
}

/**
 * Whether the remembered proxy was built from the same key, is ready to serve
 * and is young enough to keep.
 */
export async function isReusable(
  proxy: DeployedProxy,
  key: string,
  getDeployment: (id: string) => Promise<ProxyDeployment>,
  now = Date.now()
): Promise<boolean> {
  if (proxy.key !== key) return false;
  try {
    const { readyState, createdAt, target } = await getDeployment(proxy.id);
    return (
      // A project's first deployment becomes production, as a proxy could
      // before the CLI checked; the tunnel never serves from one.
      target !== 'production' &&
      readyState === 'READY' &&
      createdAt !== undefined &&
      now - createdAt < PROXY_MAX_AGE_MS
    );
  } catch {
    // Deleted, or no longer visible to this user: deploy a new one.
    return false;
  }
}

/** Best effort: a record that can't be written only costs the next run a deploy. */
export async function rememberProxy(
  path: string,
  proxy: DeployedProxy
): Promise<void> {
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(proxy, null, 2)}\n`);
  } catch {}
}
