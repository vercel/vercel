import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Org } from '@vercel-internals/types';
import { createDeployment } from '@vercel/client';
import type { Route } from '@vercel/routing-utils';
import { getFetchDispatcher } from '../../fetch';
import ua from '../../ua';
import type Client from '../../client';
import { isAPIError } from '../../errors-ts';
import output from '../../../output-manager';
import {
  aliasHeldElsewhere,
  aliasUnder,
  assignAlias,
  PROXY_META,
} from './alias';
import { tunnelDeploymentFiles } from './deployment-source';
import { formatTunnelError, TunnelError } from './errors';
import { releaseAlias, reserveAlias } from './lease';
import {
  type DeployedProxy,
  isReusable,
  type ProxyDeployment,
  proxyKey,
  proxyRecordPath,
  readProxy,
  rememberProxy,
} from './reuse';

export interface ProxyDeployerOptions {
  client: Client;
  org: Org;
  projectId: string;
  projectName: string;
  /** The project's Root Directory, if it has one. */
  rootDirectory?: string | null;
  /** The function's env: the relay, server token and port it dials. */
  env: Record<string, string>;
  /** Where the proxy is remembered; proxyRecordPath() by default. */
  record?: string;
  /** Stops waiting on a deploy. The deployment itself carries on. */
  signal?: AbortSignal;
  /** The tunnel's URL across proxies. */
  alias?: TunnelAlias;
}

export interface TunnelAlias {
  /**
   * The URL's first label, under each proxy's own suffix: each proxy takes it
   * over before the one it replaces is deleted.
   */
  label: string;
  /**
   * Named with `--tunnel=<label>`: leased from api-dev-tunnel, and one that's
   * taken stops `vc dev` before the tunnel first comes up.
   */
  chosen?: boolean;
  /**
   * The tunnel came up earlier this session, so a chosen alias someone took
   * since falls back rather than stopping it.
   */
  resumed?: boolean;
  /** The developer, whose own tunnel proxies may give the alias up. */
  userId: string;
}

/** Finds the proxy for a project's routes; see proxyDeployer(). */
export interface ProxyDeployer {
  (routes: Route[]): Promise<string>;
  /** Give up the lease on a chosen alias, e.g. on shutdown. */
  release(): Promise<void>;
}

/**
 * Finds the proxy deployment for a project's routes: the one in use, the last
 * run's while it fits (the server token stays the same while the tunnel is
 * renewed), or a new one, which deletes the one it replaces. Resolves with the
 * tunnel's URL: the alias, or the proxy's own URL when the alias can't be
 * assigned. Always a preview deployment, never the project's production.
 */
export function proxyDeployer(options: ProxyDeployerOptions): ProxyDeployer {
  const {
    client,
    org,
    projectId,
    projectName,
    rootDirectory,
    env,
    signal,
    alias: tunnelAlias,
  } = options;
  const record = options.record ?? proxyRecordPath(org.id, projectId);
  let current: DeployedProxy | undefined;
  // The URL `current` is reached at.
  let currentUrl = '';
  // The proxies this run has used or replaced, which may give up the alias.
  const ours = new Set<string>();
  let claimed = false;
  // Whether the project has a deployment, so a new proxy won't be its first.
  let deployedBefore = false;
  // The chosen alias this tunnel holds a lease on, to release.
  let leased: string | undefined;
  const urlOf = async ({ id, url }: DeployedProxy) => {
    if (!tunnelAlias) return url;
    const alias = aliasUnder(tunnelAlias.label, url);
    try {
      // Renews the lease too. Each time: someone may have taken the name since
      // this run's lease lapsed.
      const lease = tunnelAlias.chosen
        ? await reserveAlias(client, org, projectId, alias)
        : 'unsupported';
      if (lease === 'held') {
        throw new TunnelError(
          `Can't use ${alias} for the tunnel. Another developer's tunnel holds it.`
        );
      }
      if (lease === 'reserved') leased = alias;
      if (
        await aliasHeldElsewhere(client, org, alias, {
          userId: tunnelAlias.userId,
          ours,
          leased: lease === 'reserved',
        })
      ) {
        // Leased for nothing, so a teammate needn't wait for it to lapse.
        if (lease === 'reserved') {
          await releaseAlias(client, org, projectId, alias);
          leased = undefined;
        }
        throw new TunnelError(
          `Can't use ${alias} for the tunnel. It points at another deployment.`
        );
      }
      await assignAlias(client, org, id, alias);
      claimed = true;
      return `https://${alias}`;
    } catch (err) {
      // The developer chose it, so no other URL will do.
      if (tunnelAlias.chosen && !tunnelAlias.resumed && !claimed) {
        // vc dev stops, so a teammate needn't wait for the lease to lapse.
        if (leased) {
          await releaseAlias(client, org, projectId, leased);
          leased = undefined;
        }
        throw err instanceof TunnelError
          ? err
          : new TunnelError(`Couldn't use ${alias} for the tunnel.`, {
              remote: {
                source: 'Vercel API',
                message: isAPIError(err)
                  ? err.serverMessage
                  : err instanceof Error
                    ? err.message
                    : String(err),
              },
            });
      }
      output.warning(
        err instanceof TunnelError
          ? `${err.message} The tunnel's URL changes with each deploy.`
          : formatTunnelError(
              `Couldn't point ${alias} at the tunnel's proxy, so its URL changes with each deploy.`,
              err
            )
      );
      return url;
    }
  };
  const proxyFor = async (routes: Route[]) => {
    const files = tunnelDeploymentFiles(routes);
    const key = proxyKey({
      files,
      env,
      rootDirectory: rootDirectory ?? null,
    });
    if (current?.key === key) return currentUrl;
    const previous = current ?? (await readProxy(record));
    // A run stopped mid-deploy, or a move of the alias that failed, left
    // proxies to replace. One of them may still hold the alias, so they're
    // deleted only once it has moved.
    const stale = previous?.replaces ?? [];
    if (previous) ours.add(previous.id);
    for (const id of stale) ours.add(id);
    // Whether `current` holds the alias, or there's none to hold.
    const moved = () => !tunnelAlias || currentUrl !== current?.url;
    const replaceAll = async (ids: string[]) => {
      const leftover = [...new Set(ids)].filter(old => old !== current?.id);
      if (moved()) {
        for (const old of leftover) void deleteProxy(client, org, old);
      } else if (current && leftover.length > 0) {
        current = { ...current, replaces: leftover };
      }
      if (current) await rememberProxy(record, current);
    };
    if (
      previous &&
      (await isReusable(previous, key, id =>
        client.fetch<ProxyDeployment>(
          `/v13/deployments/${encodeURIComponent(id)}`,
          { accountId: org.id }
        )
      ))
    ) {
      current = { key: previous.key, id: previous.id, url: previous.url };
      currentUrl = await urlOf(current);
      if (stale.length > 0) await replaceAll(stale);
      return currentUrl;
    }
    // Everything this proxy replaces: the last one, and any it was replacing.
    const replaced = previous ? [previous.id, ...stale] : [];

    signal?.throwIfAborted();
    // A project's first deployment becomes its production one, whatever its
    // target: the proxy would get the production domain and environment.
    deployedBefore ||= await hasDeployment(client, org, projectId);
    if (!deployedBefore) {
      throw new TunnelError(
        `Can't deploy the tunnel proxy. ${projectName} has never been deployed, so its first deployment would be production. Deploy it once with \`vercel deploy\`, then run \`vercel dev --tunnel\` again.`
      );
    }
    output.print('  Deploying the tunnel proxy\n');
    const { id, url } = await deployProxy(
      client,
      org,
      projectName,
      await materializeDeployment(files, rootDirectory),
      env,
      {
        signal,
        // Remembered as soon as it exists, so a deploy that Ctrl-C stops is
        // reused by the next run once ready, or replaced and deleted.
        onCreated: created => {
          const replaces = [...new Set(replaced)].filter(
            id => id !== created.id
          );
          return rememberProxy(record, {
            key,
            ...created,
            ...(replaces.length > 0 && { replaces }),
          });
        },
      }
    );
    ours.add(id);
    // Within a session, routes that changed: the URL stays, so say when the
    // new ones are live.
    const replacing = current !== undefined;
    current = { key, id, url };
    // Before the proxies it replaces are deleted, so the alias never points at
    // a deleted one.
    currentUrl = await urlOf(current);
    await replaceAll(replaced);
    if (replacing && currentUrl !== url) {
      output.print('  The tunnel serves the new routes\n');
    }
    return currentUrl;
  };
  return Object.assign(proxyFor, {
    async release() {
      if (leased) await releaseAlias(client, org, projectId, leased);
    },
  });
}

/**
 * Write the proxy deployment into a scratch directory.
 *
 * Nested under the project's Root Directory when it has one: the build resolves
 * that path inside the uploaded files, and fails outright when it is absent.
 */
async function materializeDeployment(
  files: Record<string, string>,
  rootDirectory?: string | null
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'vc-dev-tunnel-'));
  const base = rootDirectory ? join(dir, rootDirectory) : dir;
  for (const [relative, contents] of Object.entries(files)) {
    const file = join(base, relative);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, contents);
  }
  return dir;
}

/**
 * Deploy the proxy as a preview and wait until its URL serves, without the
 * progress `vc deploy` prints: the tunnel shows one line, then its URL.
 */
async function deployProxy(
  client: Client,
  org: Org,
  projectName: string,
  path: string,
  env: Record<string, string>,
  {
    signal,
    onCreated,
  }: {
    signal?: AbortSignal;
    onCreated?: (proxy: { id: string; url: string }) => Promise<void>;
  } = {}
): Promise<{ id: string; url: string }> {
  const token = client.authConfig.token;
  if (!token) {
    throw new Error('Missing authentication token');
  }
  let inspectorUrl: string | undefined;
  const events = createDeployment(
    {
      teamId: org.type === 'team' ? org.id : undefined,
      apiUrl: client.apiUrl,
      token,
      userAgent: ua,
      path,
      projectName,
      skipAutoDetectionConfirmation: true,
      dispatcher: getFetchDispatcher(),
      debug: output.isDebugEnabled(),
    },
    {
      name: projectName,
      // No `target`, so this is a preview: the project has been deployed, so
      // this isn't its first deployment, which becomes production.
      env,
      // So a later run can tell its own proxies by the alias they hold.
      meta: PROXY_META,
      // The proxy is generated, not the project's source, so the project's
      // build settings must not apply. rootDirectory is handled by nesting the
      // files instead, since the build resolves it before these overrides.
      projectSettings: {
        framework: null,
        buildCommand: null,
        installCommand: null,
        outputDirectory: null,
        devCommand: null,
      },
    }
  );
  try {
    for (;;) {
      const next = await untilAborted(events.next(), signal);
      if (next.done) break;
      const event = next.value;
      if (event.type === 'created') {
        inspectorUrl = event.payload.inspectorUrl ?? undefined;
        await onCreated?.({
          id: event.payload.id,
          url: `https://${event.payload.url}`,
        });
      } else if (event.type === 'ready') {
        return { id: event.payload.id, url: `https://${event.payload.url}` };
      } else if (event.type === 'canceled') {
        throw new TunnelError('The tunnel proxy deployment was canceled.', {
          inspectorUrl,
        });
      } else if (event.type === 'error') {
        const message = event.payload?.message;
        throw new TunnelError('Failed to deploy the tunnel proxy.', {
          ...(message && { remote: { source: 'Deployment', message } }),
          inspectorUrl,
        });
      }
    }
  } finally {
    // Stops polling for the deployment's progress.
    void events.return?.(undefined);
  }
  throw new TunnelError('The tunnel proxy deployment never became ready.', {
    inspectorUrl,
  });
}

/** Settles as the promise does, or rejects as soon as the signal aborts. */
function untilAborted<T>(promise: Promise<T>, signal?: AbortSignal) {
  if (!signal) return promise;
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      value => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (err: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      }
    );
  });
}

/** Whether the project has any deployment. */
async function hasDeployment(
  client: Client,
  org: Org,
  projectId: string
): Promise<boolean> {
  const { deployments } = await client.fetch<{ deployments: unknown[] }>(
    `/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=1`,
    { accountId: org.id }
  );
  return deployments.length > 0;
}

/**
 * Delete a proxy a newer one replaced. Best effort: one left behind still goes
 * with the project's preview retention. Never a production deployment: a
 * proxy that became the project's first, before the CLI checked, may be its
 * only one.
 */
async function deleteProxy(
  client: Client,
  org: Org,
  id: string
): Promise<void> {
  const url = `/v13/deployments/${encodeURIComponent(id)}`;
  try {
    const { target } = await client.fetch<ProxyDeployment>(url, {
      accountId: org.id,
    });
    if (target === 'production') {
      output.debug(`Keeping the replaced tunnel proxy ${id}: it's production`);
      return;
    }
    await client.fetch(url, { method: 'DELETE', accountId: org.id });
  } catch (err) {
    output.debug(`Could not delete the replaced tunnel proxy ${id}: ${err}`);
  }
}
