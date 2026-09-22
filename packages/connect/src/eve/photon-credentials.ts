import {
  getTokenResponse,
  type ConnectOptions,
  type ConnectTokenParams,
} from '../index.js';

/** Photon project credentials resolved by {@link connectPhotonCredentials}. */
export interface PhotonCredentials {
  projectId: string;
  projectSecret: string;
}

/** Lazy Photon credential provider returned by {@link connectPhotonCredentials}. */
export type ConnectPhotonCredentialProvider = () => Promise<PhotonCredentials>;

/**
 * Token parameters accepted by {@link connectPhotonCredentials}.
 *
 * Mirrors {@link ConnectTokenParams} from `@vercel/connect`, minus
 * `subject` — Photon project credentials are app-scoped, so `subject`
 * is pinned to `{ type: "app" }` by this helper and cannot be overridden.
 */
export type ConnectPhotonCredentialsParams = Omit<
  ConnectTokenParams,
  'subject'
>;

/**
 * Build a lazy Photon credential provider backed by a Vercel Connect
 * connector.
 *
 * Photon connectors issue the project secret as an app-scoped token and the
 * project ID as public token metadata. The returned provider resolves both
 * fields when the Photon client or adapter first needs them.
 *
 * ```ts
 * import { connectPhotonCredentials } from '@vercel/connect/eve';
 * import { createiMessageAdapter } from '@photon-ai/chat-adapter-imessage';
 *
 * const imessage = createiMessageAdapter({
 *   credentials: connectPhotonCredentials('photon/my-project'),
 * });
 * ```
 */
export function connectPhotonCredentials(
  connector: string,
  params: ConnectPhotonCredentialsParams = {},
  options?: ConnectOptions
): ConnectPhotonCredentialProvider {
  return async () => {
    const response = await getTokenResponse(
      connector,
      { ...params, subject: { type: 'app' } },
      options
    );
    const projectId = response.metadata?.projectId;
    if (typeof projectId !== 'string' || projectId.length === 0) {
      throw new Error('Photon connector returned invalid credentials.');
    }
    return {
      projectId,
      projectSecret: response.token,
    };
  };
}
