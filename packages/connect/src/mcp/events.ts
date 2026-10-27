import { getVercelOidcToken } from '@vercel/oidc';
import {
  eventRequest,
  type EventRequestOptions,
} from '../internal/event-request.js';
import { resolveBaseUrl } from '../internal/base-url.js';
import {
  createConnectErrorFromResponse,
  type ConnectOptions,
  type ConnectTokenParams,
} from '../token.js';

export type McpEventSubject = Extract<
  ConnectTokenParams['subject'],
  { type: 'app' | 'user' }
>;

export interface McpEventDescriptor {
  name: string;
  description?: string;
  delivery: ('webhook' | 'poll' | 'push')[];
  inputSchema: Record<string, unknown>;
  payloadSchema: Record<string, unknown>;
}

export type McpSubscriptionStatus =
  | 'pending'
  | 'active'
  | 'needs_auth'
  | 'stopped'
  | 'expired'
  | 'failed';

export interface McpSubscription {
  id: string;
  connectorId: string;
  projectId: string;
  environment: string;
  subject: McpEventSubject;
  name: string;
  arguments: Record<string, unknown>;
  destination: { path: string };
  context: Record<string, unknown>;
  status: McpSubscriptionStatus;
  /** ISO deadline, or null for an explicitly indefinite watch. */
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  cleanupStatus?: 'pending' | 'complete' | 'exhausted';
  stopReason?: string;
  lastError?: string;
}

export type McpSubscribeInput = McpEventSourceInput & {
  name: string;
  arguments: Record<string, unknown>;
  destination: { path: string };
  context?: Record<string, unknown>;
  idempotencyKey: string;
  /** Application lifetime in milliseconds (2 minutes to 365 days), or null until stopped. */
  ttlMs: number | null;
};

/** Upstream credential selection, separate from event and pagination fields. */
export interface McpEventScope {
  /** Derive from authenticated application state, never model output. */
  tokenParams: ConnectTokenParams;
}

/** MCP endpoint selection for operations that contact the upstream server. */
export interface McpEventSourceInput extends McpEventScope {
  /** Defaults to the connector endpoint. Connect must authorize this URL. */
  mcpUrl?: string;
}

/** Lookup uses the globally unique ID; ownership is checked independently. */
export interface McpSubscriptionLookupInput {
  id: string;
  /**
   * Optional assertion against the stored creation subject, not a request for
   * upstream credentials. Account-bound callers should always supply it.
   */
  expectedSubject?: ConnectTokenParams['subject'];
}
export type McpEventOptions = Pick<ConnectOptions, 'vercelToken' | 'region'> &
  EventRequestOptions;

export function discoverEvents(
  connector: string,
  params: McpEventSourceInput,
  options?: McpEventOptions
) {
  return request<{
    status: 'supported' | 'unsupported' | 'unavailable' | 'needs_auth';
  }>(connector, 'events/discover', params, options);
}

/** Optional account-scoped catalog discovery; does not poll event occurrences. */
export function listEventTypes(
  connector: string,
  params: McpEventSourceInput & { cursor?: string },
  options?: McpEventOptions
) {
  const url = new URL(
    '/v1/connect/mcp-events/event-types',
    resolveBaseUrl(options)
  );
  url.searchParams.set('connector', connector);
  url.searchParams.set('tokenRequest', JSON.stringify(params.tokenParams));
  if (params.cursor !== undefined)
    url.searchParams.set('cursor', params.cursor);
  if (params.mcpUrl !== undefined)
    url.searchParams.set('sourceUrl', params.mcpUrl);
  return send<{ events: McpEventDescriptor[]; nextCursor?: string }>(
    url,
    { method: 'GET' },
    options
  );
}

export async function subscribe(
  connector: string,
  params: McpSubscribeInput,
  options?: McpEventOptions
) {
  if ((params as { expiresAt?: unknown }).expiresAt !== undefined) {
    throw new TypeError(
      'Use ttlMs instead of expiresAt when creating a subscription.'
    );
  }
  const { ttlMs } = params;
  if (
    ttlMs !== null &&
    (!Number.isInteger(ttlMs) || ttlMs < 120_000 || ttlMs > 31_536_000_000)
  ) {
    throw new TypeError(
      'ttlMs must be an integer from 120000 to 31536000000, or null to watch until stopped.'
    );
  }
  return request<McpSubscription>(connector, 'subscriptions', params, options);
}

export function listSubscriptions(
  connector: string,
  params: McpEventScope & {
    cursor?: string;
    status?: McpSubscriptionStatus;
    limit?: number;
  },
  options?: McpEventOptions
) {
  return request<{
    subscriptions: McpSubscription[];
    pagination: { next: string | null };
  }>(connector, 'subscriptions/actions/list', params, options);
}

export function getSubscription(
  connector: string,
  params: McpSubscriptionLookupInput,
  options?: McpEventOptions
) {
  return request<McpSubscription>(
    connector,
    'subscriptions/actions/get',
    params,
    options
  );
}

export function unsubscribe(
  connector: string,
  params: McpSubscriptionLookupInput,
  options?: McpEventOptions
) {
  return request<McpSubscription>(
    connector,
    'subscriptions/actions/unsubscribe',
    params,
    options
  );
}

/** Stops only this connector/subject/project/environment scope. */
export function unsubscribeAll(
  connector: string,
  params: McpEventScope & { idempotencyKey: string },
  options?: McpEventOptions
) {
  return request<{ accepted: true }>(
    connector,
    'subscriptions/actions/unsubscribe-all',
    params,
    options
  );
}

async function request<T>(
  connector: string,
  operation: string,
  params: object,
  options?: McpEventOptions
): Promise<T> {
  // Serialize before awaiting auth so caller mutation cannot change the subject.
  const { mcpUrl, ...fields } = params as { mcpUrl?: string };
  const body = JSON.stringify({
    ...fields,
    source: { type: 'mcp', url: mcpUrl },
  });
  const url = new URL(
    `/v1/connect/connectors/${encodeURIComponent(connector)}/${operation}`,
    resolveBaseUrl(options)
  );
  return send<T>(
    url,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
    options
  );
}

function send<T>(
  url: URL,
  init: RequestInit,
  options?: McpEventOptions
): Promise<T> {
  const { vercelToken } = options ?? {};
  return eventRequest(options, async signal => {
    signal?.throwIfAborted();
    const token = vercelToken ?? (await getVercelOidcToken());
    signal?.throwIfAborted();
    const response = await fetch(url.toString(), {
      ...init,
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        ...init.headers,
        Authorization: `Bearer ${token}`,
      },
      ...(signal === undefined ? {} : { signal }),
    });
    if (!response.ok)
      throw await createConnectErrorFromResponse(
        response,
        'Failed to manage event subscriptions'
      );
    return (await response.json()) as T;
  });
}
