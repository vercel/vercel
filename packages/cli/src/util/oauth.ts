import ua from './ua';
import { hostname } from 'os';

const VERCEL_ISSUER = new URL('https://vercel.com');
export const VERCEL_CLI_CLIENT_ID = 'cl_HYyOPBNtFMfHhaUn9L4QPfTZz6TP47bp';
export const userAgent = `${hostname()} @ ${ua}`;

interface AuthorizationServerMetadata {
  issuer: URL;
  device_authorization_endpoint: URL;
  token_endpoint: URL;
  revocation_endpoint: URL;
  jwks_uri: URL;
  introspection_endpoint: URL;
}

let _as: AuthorizationServerMetadata;
export async function as(): Promise<AuthorizationServerMetadata> {
  if (!_as) {
    const discoveryResponse = await discoveryEndpointRequest(VERCEL_ISSUER);
    const [discoveryResponseError, as] =
      await processDiscoveryEndpointResponse(discoveryResponse);

    if (discoveryResponseError) {
      throw discoveryResponseError;
    }

    _as = as;
  }

  return _as;
}

/**
 * Perform the Discovery Endpoint Request
 *
 * @see https://openid.net/specs/openid-connect-discovery-1_0.html#ProviderConfigurationRequest
 */
async function discoveryEndpointRequest(issuer: URL): Promise<Response> {
  return await fetch(new URL('.well-known/openid-configuration', issuer), {
    headers: { 'Content-Type': 'application/json', 'user-agent': userAgent },
  });
}

/**
 * Process the Discovery Endpoint request Response
 *
 * @see https://openid.net/specs/openid-connect-discovery-1_0.html#ProviderConfigurationResponse
 */
async function processDiscoveryEndpointResponse(
  response: Response
): Promise<[Error] | [null, AuthorizationServerMetadata]> {
  const json = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    return [new Error('Discovery endpoint request failed')];
  }

  if (
    typeof json !== 'object' ||
    json === null ||
    !canParseURL(json.issuer) ||
    !canParseURL(json.device_authorization_endpoint) ||
    !canParseURL(json.token_endpoint) ||
    !canParseURL(json.revocation_endpoint) ||
    !canParseURL(json.jwks_uri) ||
    !canParseURL(json.introspection_endpoint)
  ) {
    return [new TypeError('Invalid discovery response')];
  }

  const issuer = new URL(json.issuer);

  if (issuer.href !== VERCEL_ISSUER.href) {
    return [new Error('Issuer mismatch')];
  }

  return [
    null,
    {
      issuer: issuer,
      device_authorization_endpoint: new URL(
        json.device_authorization_endpoint
      ),
      token_endpoint: new URL(json.token_endpoint),
      revocation_endpoint: new URL(json.revocation_endpoint),
      jwks_uri: new URL(json.jwks_uri),
      introspection_endpoint: new URL(json.introspection_endpoint),
    },
  ];
}

/**
 * Perform the Device Authorization Request
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8628#section-3.1
 */
export async function deviceAuthorizationRequest(): Promise<Response> {
  return await fetch((await as()).device_authorization_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'user-agent': userAgent,
    },
    body: new URLSearchParams({
      client_id: VERCEL_CLI_CLIENT_ID,
      scope: 'openid offline_access',
    }),
  });
}

/**
 * Process the Device Authorization request Response
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8628#section-3.2
 */
export async function processDeviceAuthorizationResponse(
  response: Response
): Promise<
  | [Error]
  | [
      null,
      {
        /** The device verification code. */
        device_code: string;
        /** The end-user verification code. */
        user_code: string;
        /**
         * The minimum amount of time in seconds that the client
         * SHOULD wait between polling requests to the token endpoint.
         * @default 5
         */
        interval: number;
        /** The end-user verification URI on the authorization server. */
        verification_uri: string;
        /**
         * The end-user verification URI on the authorization server,
         * including the `user_code`, without redirection.
         */
        verification_uri_complete: string;
        /**
         * The absolute lifetime of the `device_code` and `user_code`.
         * Calculated from `expires_in`.
         */
        expiresAt: number;
      },
    ]
> {
  const json = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    return [new OAuthError('Device authorization request failed', json)];
  }

  if (typeof json !== 'object' || json === null)
    return [new TypeError('Expected response to be an object')];
  if (!('device_code' in json) || typeof json.device_code !== 'string')
    return [new TypeError('Expected `device_code` to be a string')];
  if (!('user_code' in json) || typeof json.user_code !== 'string')
    return [new TypeError('Expected `user_code` to be a string')];
  if (
    !('verification_uri' in json) ||
    typeof json.verification_uri !== 'string' ||
    !canParseURL(json.verification_uri)
  ) {
    return [new TypeError('Expected `verification_uri` to be a string')];
  }
  if (
    !('verification_uri_complete' in json) ||
    typeof json.verification_uri_complete !== 'string' ||
    !canParseURL(json.verification_uri_complete)
  ) {
    return [
      new TypeError('Expected `verification_uri_complete` to be a string'),
    ];
  }
  if (!('expires_in' in json) || typeof json.expires_in !== 'number')
    return [new TypeError('Expected `expires_in` to be a number')];
  if (!('interval' in json) || typeof json.interval !== 'number')
    return [new TypeError('Expected `interval` to be a number')];

  return [
    null,
    {
      device_code: json.device_code,
      user_code: json.user_code,
      verification_uri: json.verification_uri,
      verification_uri_complete: json.verification_uri_complete,
      expiresAt: Date.now() + json.expires_in * 1000,
      interval: json.interval,
    },
  ];
}

/**
 * Perform the Device Access Token Request
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8628#section-3.4
 */
export async function deviceAccessTokenRequest(options: {
  device_code: string;
}): Promise<[Error] | [null, Response]> {
  try {
    return [
      null,
      await fetch((await as()).token_endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'user-agent': userAgent,
        },
        body: new URLSearchParams({
          client_id: VERCEL_CLI_CLIENT_ID,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          ...options,
        }),
        signal: AbortSignal.timeout(10 * 1000),
      }),
    ];
  } catch (error) {
    if (error instanceof Error) return [error];
    return [
      new Error('An unknown error occurred. See the logs for details.', {
        cause: error,
      }),
    ];
  }
}

interface TokenSet {
  /** The access token issued by the authorization server. */
  access_token: string & { _: 'at' }; // HACK: To brand the access_token type
  /** The type of the token issued */
  token_type: 'Bearer';
  /** The lifetime in seconds of the access token. */
  expires_in: number;
  /** The refresh token, which can be used to obtain new access tokens. */
  refresh_token?: string;
  /** The scope of the access token. */
  scope?: string;
}

/**
 * Process the Token request Response
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8628#section-3.5
 */
export async function processTokenResponse(
  response: Response
): Promise<[OAuthError | TypeError] | [null, TokenSet]> {
  const json = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    return [new OAuthError('Device access token request failed', json)];
  }

  if (typeof json !== 'object' || json === null)
    return [new TypeError('Expected response to be an object')];
  if (!('access_token' in json) || typeof json.access_token !== 'string')
    return [new TypeError('Expected `access_token` to be a string')];
  if (!('token_type' in json) || json.token_type !== 'Bearer')
    return [new TypeError('Expected `token_type` to be "Bearer"')];
  if (!('expires_in' in json) || typeof json.expires_in !== 'number')
    return [new TypeError('Expected `expires_in` to be a number')];
  if (
    'refresh_token' in json &&
    (typeof json.refresh_token !== 'string' || !json.refresh_token)
  )
    return [new TypeError('Expected `refresh_token` to be a string')];
  if ('scope' in json && typeof json.scope !== 'string')
    return [new TypeError('Expected `scope` to be a string')];

  return [null, json as unknown as TokenSet];
}

/**
 * Perform the Revocation Request.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc7009#section-2.1
 */
export async function revocationRequest(options: {
  token: string;
}): Promise<Response> {
  return await fetch((await as()).revocation_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'user-agent': userAgent,
    },
    body: new URLSearchParams({ ...options, client_id: VERCEL_CLI_CLIENT_ID }),
  });
}

/**
 * Process Revocation request Response.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc7009#section-2.2
 */
export async function processRevocationResponse(
  response: Response
): Promise<[OAuthError | Error] | [null, null]> {
  if (response.ok) return [null, null];
  const json = (await response.json()) as Record<string, unknown>;

  return [new OAuthError('Revocation request failed', json)];
}

/**
 * Perform Refresh Token Request.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc6749#section-6
 */
export async function refreshTokenRequest(options: {
  refresh_token: string;
}): Promise<Response> {
  return await fetch((await as()).token_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'user-agent': userAgent,
    },
    body: new URLSearchParams({
      client_id: VERCEL_CLI_CLIENT_ID,
      grant_type: 'refresh_token',
      ...options,
    }),
  });
}

type OAuthErrorCode =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_grant'
  | 'unauthorized_client'
  | 'unsupported_grant_type'
  | 'invalid_scope'
  | 'server_error'
  // Device Authorization Response Errors
  | 'authorization_pending'
  | 'slow_down'
  | 'access_denied'
  | 'expired_token'
  // Revocation Response Errors
  | 'unsupported_token_type';

interface OAuthErrorResponse {
  error: OAuthErrorCode;
  error_description?: string;
  error_uri?: string;
}

function processOAuthErrorResponse(
  json: unknown
): OAuthErrorResponse | TypeError {
  if (typeof json !== 'object' || json === null)
    return new TypeError('Expected response to be an object');
  if (!('error' in json) || typeof json.error !== 'string')
    return new TypeError('Expected `error` to be a string');
  if ('error_description' in json && typeof json.error_description !== 'string')
    return new TypeError('Expected `error_description` to be a string');
  if ('error_uri' in json && typeof json.error_uri !== 'string')
    return new TypeError('Expected `error_uri` to be a string');

  return json as OAuthErrorResponse;
}

export class OAuthError extends Error {
  code: OAuthErrorCode;
  cause: Error;
  constructor(message: string, response: unknown) {
    const error = processOAuthErrorResponse(response);
    if (error instanceof TypeError) {
      const message = `Unexpected server response: ${JSON.stringify(response)}`;
      super(message);
      this.cause = new Error(message, { cause: error });
      this.code = 'server_error';
      return;
    }
    let cause = error.error;
    if (error.error_description) cause += `: ${error.error_description}`;
    if (error.error_uri) cause += ` (${error.error_uri})`;

    super(message, { cause });
    this.cause = new Error(cause);
    this.code = error.error;
  }
}

export function isOAuthError(error: unknown): error is OAuthError {
  return error instanceof OAuthError;
}

function canParseURL(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  try {
    return !!new URL(url);
  } catch {
    return false;
  }
}

/**
 * Perform Token Introspection Request.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc7662#section-2.1
 */
export async function inspectTokenRequest(token: string): Promise<Response> {
  return fetch((await as()).introspection_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'user-agent': userAgent,
    },
    body: new URLSearchParams({ token }),
  });
}

/**
 * @see https://datatracker.ietf.org/doc/html/rfc7662#section-2.2 */
interface AccessToken {
  /** Whether or not the presented token is active. */
  active: boolean;
  client_id?: string;
  session_id?: string;
}

/**
 * Process Token Introspection Response.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc7662#section-2.2
 */
export async function processInspectTokenResponse(
  response: Response
): Promise<[IntrospectionError] | [null, AccessToken]> {
  try {
    const token = (await response.json()) as Record<string, unknown>;
    if (!token || typeof token !== 'object' || !('active' in token)) {
      throw new IntrospectionError('Invalid token introspection response');
    }
    return [null, token as unknown as AccessToken];
  } catch (cause) {
    return [new IntrospectionError('Could not introspect token.', { cause })];
  }
}

class IntrospectionError extends Error {
  name = 'IntrospectionError';
}
