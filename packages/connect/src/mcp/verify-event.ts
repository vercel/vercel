import { verifyVercelOidcToken } from '@vercel/oidc';
import { readNonEmptyEnv } from '../internal/env.js';

interface McpDeliveryEnvelope {
  version: 1;
  deliveryId: string;
  subscriptionId: string;
  source: { type: 'mcp'; connectorId: string };
  context: Record<string, unknown>;
}

export type McpEventDelivery = McpDeliveryEnvelope &
  (
    | {
        event: {
          eventId: string;
          name: string;
          timestamp: string;
          data: Record<string, unknown>;
          cursor: string | null;
          _meta?: Record<string, unknown>;
        };
      }
    | { control: { type: 'gap'; cursor: string | null; truncated?: true } }
    | {
        control: {
          type: 'terminated';
          error: { code: number; message: string; data?: unknown };
        };
      }
  );

export interface VerifyMcpEventOptions {
  /** Registered destination path from trusted server configuration. */
  path: string;
  /** Optional additional owner restriction. Defaults to VERCEL_ORG_ID when set. */
  ownerId?: string;
  /** Existing Vercel OIDC audience, normally https://vercel.com/<team-slug>. */
  audience?: string;
  /** Match the project's issuer mode: global or https://oidc.vercel.com/<team-slug>. */
  issuer?: string;
  /** Defaults to VERCEL_PROJECT_ID. Wildcards are not supported. */
  projectId?: string;
  /** Defaults to VERCEL_TARGET_ENV, then VERCEL_ENV. */
  environment?: string;
  /** Required for a custom environment; use its stable env_ ID. */
  customEnvironmentId?: string;
  /** Required for preview; defaults to VERCEL_GIT_COMMIT_REF. */
  branch?: string;
}

export class McpEventVerificationError extends Error {
  readonly code:
    | 'invalid_delivery'
    | 'configuration_error'
    | 'verification_unavailable';

  constructor(code: McpEventVerificationError['code']) {
    super(
      code === 'configuration_error'
        ? 'Trusted MCP event receiver configuration is missing or invalid.'
        : code === 'verification_unavailable'
          ? 'MCP event verification is temporarily unavailable.'
          : 'Invalid MCP event delivery.'
    );
    this.name = 'McpEventVerificationError';
    this.code = code;
  }
}

/**
 * Authenticate Connect's delivery token and validate the event envelope.
 * Consumes the body. Does not acknowledge, deduplicate, or start application work.
 * Persist acceptance by deliveryId before returning success to Connect.
 *
 * Generic Request URLs and forwarded headers cannot establish a trusted public
 * route. Supply the registered path; project and environment default to env vars.
 */
export async function verifyMcpEvent(
  request: Request,
  options: VerifyMcpEventOptions
): Promise<McpEventDelivery> {
  const config = receiverConfig(options);
  const token = request.headers
    .get('authorization')
    ?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (
    !token ||
    request.method !== 'POST' ||
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
      request.headers.get('content-type') ?? ''
    ) ||
    (request.headers.has('content-encoding') &&
      request.headers.get('content-encoding') !== 'identity')
  )
    throw invalid();

  let verified: Awaited<ReturnType<typeof verifyVercelOidcToken>>;
  try {
    verified = await verifyVercelOidcToken(token, {
      issuer: config.issuer,
      audience: config.audience,
      ownerId: config.ownerId,
      projectId: config.projectId,
      environment: config.environment,
      algorithms: ['RS256'],
      typ: 'JWT',
      requiredClaims: [
        'iss',
        'aud',
        'iat',
        'exp',
        'owner_id',
        'project_id',
        'environment',
      ],
      maxTokenAge: 300,
      clockTolerance: 60,
    });
  } catch (error) {
    const code = isObject(error) ? error.code : undefined;
    if (
      typeof code === 'string' &&
      (/^(ERR_JWT_|ERR_JWS_)/.test(code) ||
        [
          'ERR_JWKS_NO_MATCHING_KEY',
          'ERR_JOSE_ALG_NOT_ALLOWED',
          'ERR_JOSE_NOT_SUPPORTED',
          'ERR_VERCEL_OIDC_TOKEN_VALIDATION',
        ].includes(code))
    )
      throw invalid();
    throw new McpEventVerificationError('verification_unavailable');
  }
  // The reserved purpose distinguishes Connect deliveries from ordinary project
  // tokens. Trust the envelope received over HTTPS; no body signature is used.
  verifyDeliveryIdentity(verified, config);

  const bytes = await readBody(request);
  let delivery: unknown;
  try {
    delivery = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    );
  } catch {
    throw invalid();
  }
  if (!isDelivery(delivery)) throw invalid();
  return delivery;
}

// Signature, algorithm, issuer, audience, identity, and token age are checked
// by the OIDC verifier above. These checks restrict the delivery's purpose and
// destination; they do not bind the token to an individual envelope.
function verifyDeliveryIdentity(
  verified: Awaited<ReturnType<typeof verifyVercelOidcToken>>,
  config: ReturnType<typeof receiverConfig>
) {
  const { payload, protectedHeader } = verified;
  const claims = payload.connect;
  if (
    !isString(protectedHeader.kid) ||
    protectedHeader.jku !== undefined ||
    protectedHeader.x5u !== undefined ||
    !Number.isInteger(payload.iat) ||
    !Number.isInteger(payload.exp) ||
    payload.exp! <= payload.iat! ||
    payload.exp! - payload.iat! > 300 ||
    payload.custom_environment_id !== config.customEnvironmentId ||
    !isObject(claims) ||
    claims.purpose !== 'mcp_event_delivery' ||
    claims.version !== 1 ||
    claims.destinationPath !== config.path ||
    claims.previewBranch !== config.previewBranch
  )
    throw invalid();
}

function receiverConfig(options?: VerifyMcpEventOptions) {
  const projectId = options?.projectId ?? readNonEmptyEnv('VERCEL_PROJECT_ID');
  const environment =
    options?.environment ??
    readNonEmptyEnv('VERCEL_TARGET_ENV') ??
    readNonEmptyEnv('VERCEL_ENV');
  const previewBranch =
    environment === 'preview'
      ? (options?.branch ?? readNonEmptyEnv('VERCEL_GIT_COMMIT_REF'))
      : undefined;
  const ownerId = options?.ownerId ?? readNonEmptyEnv('VERCEL_ORG_ID');
  if (
    !options ||
    !isString(projectId) ||
    projectId === '*' ||
    !isString(environment) ||
    environment === '*' ||
    environment === 'development' ||
    (ownerId !== undefined && (!isString(ownerId) || ownerId === '*')) ||
    (options.audience !== undefined &&
      (!isString(options.audience) || options.audience === '*')) ||
    (options.issuer !== undefined &&
      !/^https:\/\/oidc\.vercel\.com(?:\/[A-Za-z0-9_-]+)?$/.test(
        options.issuer
      )) ||
    (environment === 'preview' &&
      (!isString(previewBranch) || previewBranch === '*')) ||
    (environment !== 'preview' && options.branch !== undefined) ||
    (!['production', 'preview'].includes(environment) &&
      !/^env_[A-Za-z0-9]+$/.test(options.customEnvironmentId ?? '')) ||
    (['production', 'preview'].includes(environment) &&
      options.customEnvironmentId !== undefined)
  )
    throw new McpEventVerificationError('configuration_error');
  try {
    const url = new URL(options.path, 'https://receiver.invalid');
    if (
      !options.path.startsWith('/') ||
      options.path.startsWith('//') ||
      url.origin !== 'https://receiver.invalid' ||
      url.pathname !== options.path ||
      url.search ||
      url.hash
    )
      throw new Error();
  } catch {
    throw new McpEventVerificationError('configuration_error');
  }
  return { ...options, ownerId, projectId, environment, previewBranch };
}

async function readBody(request: Request): Promise<Uint8Array<ArrayBuffer>> {
  const reader = request.body?.getReader();
  if (!reader) throw invalid();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 300 * 1024) {
        await reader.cancel();
        throw invalid();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
function hasOnly(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).every(key => keys.includes(key));
}
function isDelivery(value: unknown): value is McpEventDelivery {
  if (
    !isObject(value) ||
    value.version !== 1 ||
    !hasOnly(value, [
      'version',
      'deliveryId',
      'subscriptionId',
      'source',
      'event',
      'control',
      'context',
    ]) ||
    !isString(value.deliveryId) ||
    !isString(value.subscriptionId) ||
    !isObject(value.context)
  )
    return false;
  const { source, event, control } = value;
  if (
    !(
      isObject(source) &&
      hasOnly(source, ['type', 'connectorId']) &&
      source.type === 'mcp' &&
      isString(source.connectorId)
    )
  )
    return false;
  if ('control' in value) {
    if ('event' in value || !isObject(control)) return false;
    if (control.type === 'gap')
      return (
        hasOnly(control, ['type', 'cursor', 'truncated']) &&
        isCursor(control.cursor) &&
        (control.truncated === undefined || control.truncated === true)
      );
    if (control.type === 'terminated')
      return (
        hasOnly(control, ['type', 'error']) &&
        isObject(control.error) &&
        hasOnly(control.error, ['code', 'message', 'data']) &&
        Number.isSafeInteger(control.error.code) &&
        typeof control.error.message === 'string'
      );
    return false;
  }

  return (
    isObject(event) &&
    hasOnly(event, [
      'eventId',
      'name',
      'timestamp',
      'data',
      'cursor',
      '_meta',
    ]) &&
    isString(event.eventId) &&
    isString(event.name) &&
    isString(event.timestamp) &&
    Number.isFinite(Date.parse(event.timestamp)) &&
    isObject(event.data) &&
    isCursor(event.cursor) &&
    (event._meta === undefined || isObject(event._meta))
  );
}
function isCursor(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}
function invalid() {
  return new McpEventVerificationError('invalid_delivery');
}
