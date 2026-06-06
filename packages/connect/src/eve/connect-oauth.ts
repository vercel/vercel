import {
  extractBearerToken,
  type AuthFn,
  type VerifyOidcConfig,
  verifyOidc,
} from 'eve/channels/auth';

declare const process:
  | { readonly env?: Readonly<Record<string, string | undefined>> }
  | undefined;

export const CONNECT_OAUTH_ISSUER = 'https://connect.vercel.com';

export type ConnectOAuthEnvironment = 'production' | 'preview' | 'development';

export type ConnectOAuthAudienceEnvironment = ConnectOAuthEnvironment | '*';

export interface ConnectOAuthOptions {
  /**
   * Exact `aud` claim values to accept. When omitted, the helper
   * accepts Connect OAuth audiences shaped
   * `teamId:projectId:environment` whose project id and environment
   * match the current Vercel deployment.
   */
  readonly audiences?: readonly string[];

  /**
   * Vercel project id used when `audiences` is omitted. Defaults to
   * `VERCEL_PROJECT_ID`.
   */
  readonly projectId?: string;

  /**
   * Vercel deployment environment used when `audiences` is omitted.
   * Defaults to `VERCEL_TARGET_ENV`, then `VERCEL_ENV`. Use `"*"` to
   * accept production, preview, and development audiences for the
   * selected project.
   */
  readonly environment?: ConnectOAuthAudienceEnvironment;

  /**
   * Optional gateway session id (`sub`) matchers. Patterns use Eve's
   * IAM-style `*` wildcard matching.
   */
  readonly subjects?: readonly string[];

  /**
   * Optional Connect connector ids / UIDs to accept. Each value is
   * matched against both the `clientId` and `clientUid` claims.
   */
  readonly connectors?: readonly string[];

  /** Optional upstream tenant ids (`tenantId` claim) to accept. */
  readonly tenantIds?: readonly string[];

  /**
   * Optional connector installation ids (`installationId` claim) to
   * accept.
   */
  readonly installationIds?: readonly string[];

  /**
   * Additional exact-match string claims to require. `typ` is always
   * constrained to `"at"` for Connect OAuth gateway access tokens.
   */
  readonly claims?: VerifyOidcConfig['claims'];

  /**
   * Override the OIDC discovery URL. Defaults to
   * `https://connect.vercel.com/.well-known/openid-configuration`.
   */
  readonly discoveryUrl?: string;

  /** Clock skew in seconds. Defaults to Eve's OIDC verifier default. */
  readonly clockSkewSeconds?: number;
}

/**
 * Returns an Eve route auth callback for Vercel Connect OAuth gateway
 * access tokens.
 *
 * The accepted token must be a bearer JWT issued by
 * `https://connect.vercel.com`, have the gateway access-token marker
 * `typ: "at"`, and target one of the configured audiences. By default
 * the audience is a Connect OAuth audience for the current Vercel
 * project:
 *
 * `teamId:VERCEL_PROJECT_ID:VERCEL_ENV`
 */
export function connectOAuth(opts: ConnectOAuthOptions = {}): AuthFn<Request> {
  const audiencePolicy = resolveAudiencePolicy(opts);
  const connectorPolicy = resolveConnectorPolicy(opts);
  const claims = buildClaimMatchers(opts);

  return async request => {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (token === null) {
      return null;
    }

    const payload = decodeJwtPayload(token);
    if (payload === null) {
      return null;
    }

    const audiences = resolveRequestAudiences(payload, audiencePolicy);
    if (audiences === null || !isConnectorAccepted(payload, connectorPolicy)) {
      return null;
    }

    const result = await verifyOidc(token, {
      audiences,
      claims,
      clockSkewSeconds: opts.clockSkewSeconds,
      discoveryUrl: opts.discoveryUrl,
      issuer: CONNECT_OAUTH_ISSUER,
      subjects: opts.subjects,
    });
    return result.ok ? result.sessionAuth : null;
  };
}

type AudiencePolicy =
  | { readonly kind: 'exact'; readonly audiences: readonly string[] }
  | {
      readonly kind: 'project';
      readonly projectId: string;
      readonly environments: readonly ConnectOAuthEnvironment[];
    };

type ConnectorPolicy =
  | { readonly kind: 'any' }
  | {
      readonly kind: 'connectors';
      readonly connectors: readonly string[];
    };

function resolveAudiencePolicy(opts: ConnectOAuthOptions): AudiencePolicy {
  if (opts.audiences !== undefined) {
    if (opts.audiences.length === 0) {
      throw new Error('connectOAuth: audiences must not be empty.');
    }
    return { kind: 'exact', audiences: opts.audiences };
  }

  const projectId = opts.projectId ?? readNonEmptyEnv('VERCEL_PROJECT_ID');
  const environment = opts.environment ?? inferVercelEnvironment();

  if (projectId === undefined) {
    throw new Error(
      'connectOAuth: could not infer projectId from VERCEL_PROJECT_ID; pass audiences or projectId explicitly.'
    );
  }
  if (environment === undefined) {
    throw new Error(
      'connectOAuth: could not infer environment from VERCEL_TARGET_ENV or VERCEL_ENV; pass audiences or environment explicitly.'
    );
  }

  const environments =
    environment === '*'
      ? (['production', 'preview', 'development'] as const)
      : [environment];

  return { kind: 'project', environments, projectId };
}

function resolveRequestAudiences(
  payload: Record<string, unknown>,
  policy: AudiencePolicy
): readonly string[] | null {
  if (policy.kind === 'exact') {
    return policy.audiences;
  }

  const audiences = extractAudiences(payload);
  const accepted = audiences.filter(audience => {
    const parsed = parseConnectOAuthAudience(audience);
    return (
      parsed !== null &&
      parsed.projectId === policy.projectId &&
      policy.environments.includes(parsed.environment)
    );
  });

  return accepted.length === 0 ? null : accepted;
}

function resolveConnectorPolicy(opts: ConnectOAuthOptions): ConnectorPolicy {
  if (opts.connectors === undefined) {
    return { kind: 'any' };
  }
  if (opts.connectors.length === 0) {
    throw new Error('connectOAuth: connectors must not be empty.');
  }

  return { kind: 'connectors', connectors: opts.connectors };
}

function isConnectorAccepted(
  payload: Record<string, unknown>,
  policy: ConnectorPolicy
): boolean {
  if (policy.kind === 'any') {
    return true;
  }

  const clientId = stringClaim(payload, 'clientId');
  if (clientId !== undefined && policy.connectors.includes(clientId)) {
    return true;
  }

  const clientUid = stringClaim(payload, 'clientUid');
  return clientUid !== undefined && policy.connectors.includes(clientUid);
}

function inferVercelEnvironment(): ConnectOAuthAudienceEnvironment | undefined {
  const value =
    readNonEmptyEnv('VERCEL_TARGET_ENV') ?? readNonEmptyEnv('VERCEL_ENV');
  if (value === undefined) return undefined;
  assertEnvironment(value);
  return value;
}

function buildClaimMatchers(
  opts: ConnectOAuthOptions
): VerifyOidcConfig['claims'] {
  return {
    ...opts.claims,
    ...(opts.tenantIds === undefined ? {} : { tenantId: opts.tenantIds }),
    ...(opts.installationIds === undefined
      ? {}
      : { installationId: opts.installationIds }),
    typ: ['at'],
  };
}

function readNonEmptyEnv(name: string): string | undefined {
  const value =
    typeof process === 'undefined' ? undefined : process.env?.[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

function extractAudiences(payload: Record<string, unknown>): readonly string[] {
  const aud = payload.aud;
  if (typeof aud === 'string') {
    return [aud];
  }
  if (Array.isArray(aud)) {
    return aud.filter((value): value is string => typeof value === 'string');
  }
  return [];
}

function stringClaim(
  payload: Record<string, unknown>,
  claim: string
): string | undefined {
  const value = payload[claim];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1];
    if (payload === undefined) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const decoded = JSON.parse(atob(padded));
    return typeof decoded === 'object' && decoded !== null ? decoded : null;
  } catch {
    return null;
  }
}

function parseConnectOAuthAudience(audience: string): {
  readonly projectId: string;
  readonly environment: ConnectOAuthEnvironment;
} | null {
  const [teamId, projectId, environment, extra] = audience.split(':');
  if (!teamId || !projectId || !environment || extra !== undefined) {
    return null;
  }
  if (
    environment !== 'production' &&
    environment !== 'preview' &&
    environment !== 'development'
  ) {
    return null;
  }
  return { projectId, environment };
}

function assertEnvironment(
  value: string
): asserts value is ConnectOAuthAudienceEnvironment {
  if (
    value !== 'production' &&
    value !== 'preview' &&
    value !== 'development' &&
    value !== '*'
  ) {
    throw new Error(
      `connectOAuth: invalid environment ${JSON.stringify(
        value
      )}; expected "production", "preview", "development", or "*".`
    );
  }
}
