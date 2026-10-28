import type { Org } from '@vercel-internals/types';
import type { Route } from '@vercel/routing-utils';
import type Client from '../../client';
import getUser from '../../get-user';
import output from '../../../output-manager';
import {
  PORT_ENV,
  RELAY_URL_ENV,
  SERVER_TOKEN_ENV,
} from '../../../runtime-assets/dev-tunnel/lib/env';
import {
  connectTunnel,
  targetPort,
  type Tunnel,
  TunnelReplacedError,
} from './client';
import { tunnelAliasLabel } from './alias';
import { proxyDeployer } from './proxy';

export interface StartTunnelOptions {
  client: Client;
  org: Org;
  projectId: string;
  projectName: string;
  /** The project's Root Directory, if it has one. */
  rootDirectory?: string | null;
  /** Origin of the framework dev server, e.g. `http://127.0.0.1:3000`. */
  target: string;
  /** The project's own routes, which the proxy applies before the tunnel. */
  routes?: Route[];
  /** Shutdown: stops waiting on the proxy's deploys. */
  signal?: AbortSignal;
  /** The URL's first label from `--tunnel=<label>`, over the default one. */
  aliasLabel?: string;
  /**
   * The tunnel came up earlier this session, so a chosen alias someone took
   * since then falls back rather than stopping it.
   */
  resumed?: boolean;
}

export interface RunningTunnel extends Tunnel {
  /** Public URL that forwards to the local dev server. */
  url: string;
  /**
   * Deploy the proxy again with the project's new routes, unless it was built
   * with them already. Resolves with the URL that serves them. Calls run one
   * after another.
   */
  setRoutes(routes: Route[]): Promise<string>;
  /** Give up the lease on a `--tunnel=<label>` alias, e.g. on shutdown. */
  release(): Promise<void>;
}

/** api-dev-tunnel's create-session response. */
interface TunnelReservation {
  relayUrl: string;
  /** For this process's stream; replaced by every reservation. */
  clientToken: string;
  /** For the deployment's Dials; the same while the tunnel is renewed. */
  serverToken: string;
}

/** Reserve the developer's tunnel for the project. */
function reserveTunnel(client: Client, org: Org, projectId: string) {
  return client.fetch<TunnelReservation>('/v1/dev-tunnel', {
    method: 'POST',
    accountId: org.id,
    body: { projectId },
  });
}

/**
 * Connect to the developer's tunnel, then deploy the proxy that dials through
 * it with the project's routes, or reuse the one an earlier run deployed from
 * the same files and env in the last PROXY_MAX_AGE_MS. A new proxy takes over
 * the developer's alias for the project, so the tunnel's URL stays the same,
 * then deletes the one it replaces.
 *
 * Connecting first surfaces a refused or unreachable tunnel before a deploy
 * is spent on it. Always a preview deployment, never the project's production.
 */
export async function startTunnel(
  options: StartTunnelOptions
): Promise<RunningTunnel> {
  const { client, org, projectId, projectName, rootDirectory, target } =
    options;

  // Lines, not a spinner: the Development Command is already writing to the
  // terminal, and a spinner redraws over its output.
  output.debug('Connecting tunnel');
  const reservation = await reserveTunnel(client, org, projectId);
  const tunnel = connectTunnel({
    relayUrl: reservation.relayUrl,
    clientToken: reservation.clientToken,
    renewToken: async () => {
      const renewed = await reserveTunnel(client, org, projectId);
      // The proxy dials with the server token and relay it was deployed with.
      if (
        renewed.serverToken !== reservation.serverToken ||
        renewed.relayUrl !== reservation.relayUrl
      ) {
        throw new TunnelReplacedError();
      }
      return renewed.clientToken;
    },
    target,
  });

  try {
    await tunnel.ready;

    const user = await getUser(client);
    const proxyFor = proxyDeployer({
      client,
      org,
      projectId,
      projectName,
      rootDirectory,
      signal: options.signal,
      alias: {
        label:
          options.aliasLabel ??
          tunnelAliasLabel(projectName, user.username, org),
        chosen: options.aliasLabel !== undefined,
        resumed: options.resumed,
        userId: user.id,
      },
      env: {
        [RELAY_URL_ENV]: reservation.relayUrl,
        [SERVER_TOKEN_ENV]: reservation.serverToken,
        [PORT_ENV]: String(targetPort(target)),
      },
    });

    const url = await proxyFor(options.routes ?? []);
    let deploys: Promise<unknown> = Promise.resolve();
    return {
      ...tunnel,
      url,
      setRoutes: routes => {
        const deployed = deploys.then(() => proxyFor(routes));
        deploys = deployed.catch(() => {});
        return deployed;
      },
      release: () => proxyFor.release(),
    };
  } catch (err) {
    // Otherwise it keeps reconnecting and holds the process open.
    tunnel.close();
    throw err;
  }
}
