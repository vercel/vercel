import {
  getToken,
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
 * Photon connectors issue app-scoped credentials encoded as
 * `projectId:projectSecret`. This helper requests that credential and returns
 * the fields expected by Photon clients and adapters.
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
  const credential = await getToken(
    connector,
    { ...params, subject: { type: 'app' } },
    options
  );
  const separator = credential.indexOf(':');
  if (separator < 1 || separator === credential.length - 1) {
    throw new Error('Photon connector returned invalid credentials.');
  }
  return {
    projectId: credential.slice(0, separator),
    projectSecret: credential.slice(separator + 1),
  };
}
