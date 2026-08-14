import { createHash } from 'crypto';
import type Client from '../client';
import output from '../../output-manager';
import { OpenApiCache } from './openapi-cache';
import { SSO_API_URL, FETCH_TIMEOUT_MS } from './constants';
import { readSpecResponse } from './read-spec-response';
import { assertAllowedSpecUrl } from './spec-url-allowlist';
import type { OpenApiSpec } from './types';

const MAX_REDIRECTS = 3;

/**
 * Fetch an OpenAPI spec URL. If the URL is protected by Vercel Authentication,
 * complete the same SSO handshake the browser uses with the current CLI token.
 */
export async function fetchSpecUrl(
  client: Client,
  specUrl: string
): Promise<OpenApiSpec | null> {
  const specOrigin = assertAllowedSpecUrl(specUrl).origin;

  const probe = await fetchWithTimeout(specUrl, { readSpec: true });
  if (probe.response.ok) {
    return probe.spec ?? null;
  }

  const nonce = getSetCookieValue(probe.response, '_vercel_sso_nonce');
  if (!nonce) {
    output.debug(
      `OpenAPI spec URL returned ${probe.response.status} without a Vercel SSO nonce`
    );
    throw new Error(formatHttpError(specUrl, probe.response));
  }

  const token = client.authConfig.token;
  if (!token) {
    output.debug('OpenAPI spec URL requires Vercel authentication');
    return null;
  }

  const hashedNonce = createHash('sha256').update(nonce).digest('hex');
  const ssoUrl = `${SSO_API_URL}?url=${encodeURIComponent(
    specUrl
  )}&nonce=${hashedNonce}`;
  const sso = await fetchWithTimeout(ssoUrl, {
    cookie: `authorization=${encodeURIComponent(`Bearer ${token}`)}; isLoggedIn=1`,
  });

  const location = sso.response.headers.get('location');
  if (!location || !location.includes('_vercel_jwt=')) {
    output.debug('OpenAPI spec URL: user has no access');
    throw new Error(formatHttpError(specUrl, sso.response));
  }

  const cookies = new Map([['_vercel_sso_nonce', nonce]]);
  let url = location;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    if (!isSameOriginUrl(url, specOrigin)) {
      output.debug('OpenAPI spec URL: cross-origin redirect rejected');
      return null;
    }

    const { response, spec } = await fetchWithTimeout(url, {
      cookie: Array.from(cookies, ([name, value]) => `${name}=${value}`).join(
        '; '
      ),
      readSpec: true,
    });

    if (response.ok) {
      return spec ?? null;
    }

    const next = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && next) {
      const setJwt = getSetCookieValue(response, '_vercel_jwt');
      if (setJwt) {
        cookies.set('_vercel_jwt', setJwt);
      }
      const nextUrl = new URL(next, url).href;
      if (!isSameOriginUrl(nextUrl, specOrigin)) {
        output.debug('OpenAPI spec URL: cross-origin redirect rejected');
        return null;
      }
      url = nextUrl;
      continue;
    }

    output.debug(`OpenAPI spec URL: unexpected response ${response.status}`);
    throw new Error(formatHttpError(url, response));
  }

  output.debug('OpenAPI spec URL: too many redirects');
  return null;
}

export function createOpenApiCache(
  client: Client,
  specUrl?: string
): OpenApiCache {
  return new OpenApiCache(
    specUrl
      ? {
          specUrl,
          fetchSpecUrl: url => fetchSpecUrl(client, url),
        }
      : undefined
  );
}

async function fetchWithTimeout(
  url: string,
  options?: { cookie?: string; readSpec?: boolean }
): Promise<{ response: Response; spec?: OpenApiSpec }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: controller.signal,
      headers: options?.cookie ? { cookie: options.cookie } : undefined,
    });
    const spec =
      options?.readSpec && response.ok
        ? await readSpecResponse<OpenApiSpec>(
            response,
            formatDiagnosticUrl(url)
          )
        : undefined;
    return { response, spec };
  } finally {
    clearTimeout(timeoutId);
  }
}

function isSameOriginUrl(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

function formatHttpError(url: string, response: Response): string {
  const statusText = response.statusText ? ` ${response.statusText}` : '';
  return `Could not load OpenAPI spec from ${formatDiagnosticUrl(url)}: HTTP ${response.status}${statusText}.`;
}

function formatDiagnosticUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    for (const key of parsed.searchParams.keys()) {
      parsed.searchParams.set(key, '[redacted]');
    }
    return parsed.href;
  } catch {
    return url;
  }
}

function getSetCookieValue(response: Response, name: string): string | null {
  const header = response.headers.get('set-cookie');
  if (!header) {
    return null;
  }
  const match = header.match(new RegExp(`${name}=([^;,\\s]+)`));
  return match ? match[1] : null;
}
