import { readFile } from 'node:fs/promises';
import { exchangeVercelOidcToken } from './exchange-vercel-oidc-token';
import { getContext } from './get-context';
import { getVercelOidcTokenSync } from './get-vercel-oidc-token-sync';
import { VercelOidcTokenError } from './token-error';

interface GetVercelOidcTokenBaseOptions {
  /**
   * Optional team ID (team_*) or slug to use for token refresh.
   * When provided, this team will be used instead of reading from `.vercel/project.json`.
   */
  team?: string;
  /**
   * Optional project ID (prj_*) or slug to use for token refresh.
   * When provided, this project will be used instead of reading from `.vercel/project.json`.
   */
  project?: string;
  /**
   * Optional time buffer in milliseconds before token expiry to consider it expired.
   * When provided, the token will be refreshed if it expires within this buffer time.
   * @default 0
   */
  expirationBufferMs?: number;
}

/**
 * Options for getting the Vercel OIDC token.
 *
 * `jti` and `skipCache` are only accepted when `audience` is provided, because
 * they only take effect while exchanging the token for a custom audience —
 * without an `audience` there is no exchange.
 */
export type GetVercelOidcTokenOptions =
  | (GetVercelOidcTokenBaseOptions & {
      /**
       * Audience to set on the exchanged token.
       */
      audience: string;
      /**
       * Optional JTI to set on the exchanged token.
       * @default undefined
       */
      jti?: string;
      /**
       * When `true`, bypasses the in-memory exchange cache and performs a fresh
       * token exchange.
       * @default false
       */
      skipCache?: boolean;
    })
  | (GetVercelOidcTokenBaseOptions & {
      /**
       * @default undefined
       */
      audience?: undefined;
      jti?: never;
      skipCache?: never;
    });

/**
 * Gets the current OIDC token from the request context, the Vercel OIDC token
 * file, or the environment variable.
 *
 * Do not cache this value, as it is subject to change in production!
 *
 * It checks for the `x-vercel-oidc-token` header in the request context, then
 * reads the file named by `VERCEL_OIDC_TOKEN_FILE` when set, then falls back to
 * the `VERCEL_OIDC_TOKEN` environment variable.
 *
 * Unlike the `getVercelOidcTokenSync` function, this function will refresh the token if it is expired in a development environment.
 *
 * @param {GetVercelOidcTokenOptions} [options] - Optional configuration for token retrieval.
 * @returns {Promise<string>} A promise that resolves to the OIDC token.
 * @throws {Error} If no token source is available or the configured file cannot be read. If the token
 * is expired in a development environment, will also throw an error if the token cannot be refreshed: no CLI credentials are available, CLI credentials are expired, no project configuration is available
 * or the token refresh request fails.
 *
 * @example
 *
 * ```js
 * // Using the OIDC token
 * getVercelOidcToken().then((token) => {
 *   console.log('OIDC Token:', token);
 * }).catch((error) => {
 *   console.error('Error:', error.message);
 * });
 * ```
 *
 * @example
 *
 * ```js
 * // Using the OIDC token with explicit team and project (supports IDs and slugs)
 * getVercelOidcToken({ team: 'my-team', project: 'my-project' }).then((token) => {
 *   console.log('OIDC Token:', token);
 * }).catch((error) => {
 *   console.error('Error:', error.message);
 * });
 * ```
 */
export async function getVercelOidcToken(
  options?: GetVercelOidcTokenOptions
): Promise<string> {
  let token = '';
  let err: any;

  const tokenFromFile = getContext().headers?.['x-vercel-oidc-token']
    ? null
    : await tryOidcTokenFromFile();

  try {
    token = tokenFromFile ?? getVercelOidcTokenSync();
  } catch (error) {
    err = error;
  }

  try {
    const [{ getTokenPayload, isExpired }, { refreshToken }] =
      await Promise.all([
        await import('./token-util.js'),
        await import('./token.js'),
      ]);

    if (
      !token ||
      isExpired(getTokenPayload(token), options?.expirationBufferMs)
    ) {
      await refreshToken(options);
      token = getVercelOidcTokenSync();
    }
  } catch (error) {
    let message = err instanceof Error ? err.message : '';
    if (error instanceof Error) {
      message = `${message}\n${error.message}`;
    }
    if (message) {
      throw new VercelOidcTokenError(message);
    }
    throw error;
  }

  if (options?.audience) {
    token = await exchangeVercelOidcToken({
      token,
      audience: options.audience,
      jti: options.jti,
      skipCache: options.skipCache,
    });
  }
  return token;
}

async function tryOidcTokenFromFile(): Promise<string | null> {
  const tokenFile = process.env.VERCEL_OIDC_TOKEN_FILE;
  if (!tokenFile) {
    return null;
  }

  const token = (await readFile(tokenFile, 'utf8')).trim();
  if (!token) {
    throw new VercelOidcTokenError(
      `The Vercel OIDC token file is empty: ${tokenFile}`
    );
  }
  return token;
}
