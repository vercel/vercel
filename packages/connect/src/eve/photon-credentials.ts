import {
  getTokenResponse,
  type ConnectOptions,
  type ConnectTokenParams,
} from '../index.js';

/** Photon project credentials returned by {@link connectPhotonCredentials}. */
export interface PhotonCredentials {
  projectId: string;
  projectSecret: string;
}

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
 * Resolve Photon project credentials from a Vercel Connect connector.
 *
 * Photon connectors issue the project secret as an app-scoped token and the
 * project ID as public token metadata. This helper returns both fields in the
 * shape expected by Photon clients and adapters.
 *
 * ```ts
 * import { connectPhotonCredentials } from '@vercel/connect/eve';
 *
 * const { projectId, projectSecret } =
 *   await connectPhotonCredentials('photon/my-project');
 * ```
 */
export async function connectPhotonCredentials(
  connector: string,
  params: ConnectPhotonCredentialsParams = {},
  options?: ConnectOptions
): Promise<PhotonCredentials> {
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
}
