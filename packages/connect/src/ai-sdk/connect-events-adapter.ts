import {
  getSubscription,
  listSubscriptions,
  subscribe,
  unsubscribe,
  type McpSubscribeInput,
  type McpSubscription,
} from '../mcp/events.js';
import type { JsonObject } from '../internal/json.js';
import type { EventRequestOptions } from '../internal/event-request.js';
import { snapshotEventTokenParams } from '../internal/event-token-params.js';
import type { ConnectTokenParams } from '../token.js';

/** Trusted server-side scope. Create a separate adapter for each account. */
export interface Experimental_ConnectEventsAdapterOptions {
  connector: string;
  /** Use the same resolved parameters as connectAuthProvider. */
  tokenParams: ConnectTokenParams;
  destination: { path: string };
  /** Overrides the client transport URL. Connect must authorize the endpoint. */
  mcpUrl?: string;
}

export type Experimental_ConnectEventsSubscribeInput = Pick<
  McpSubscribeInput,
  'name' | 'idempotencyKey' | 'ttlMs'
> & {
  arguments: JsonObject;
  context?: JsonObject;
  options?: Experimental_ConnectEventsRequestOptions;
};

/** A Connect watch, not an upstream MCP subscription grant. */
export type Experimental_ConnectEventsSubscription = Pick<
  McpSubscription,
  'id' | 'name' | 'status' | 'expiresAt' | 'cleanupStatus'
> & { arguments: JsonObject };

export interface Experimental_ConnectEventsListInput {
  cursor?: string;
  limit?: number;
  status?: McpSubscription['status'];
  options?: Experimental_ConnectEventsRequestOptions;
}

export type Experimental_ConnectEventsRequestOptions = EventRequestOptions;

/**
 * Structurally compatible with AI SDK's experimental managed events adapter.
 * Requires the transport-context contract from vercel/ai#22325. No AI SDK
 * dependency is required to bind operations directly with createAdapter().
 * Listing is scoped to the bound account and workload project/environment,
 * not to an individual conversation or context.
 */
export interface Experimental_ConnectEventsAdapter {
  createAdapter(context: {
    transport: { type: 'http' | 'sse'; url: string } | { type: 'custom' };
  }): Experimental_ConnectEventOperations;
}

/** Subscription operations bound to a single account, destination and endpoint. */
export interface Experimental_ConnectEventOperations {
  subscribe(
    input: Experimental_ConnectEventsSubscribeInput
  ): Promise<Experimental_ConnectEventsSubscription>;
  getSubscription(input: {
    id: string;
    options?: Experimental_ConnectEventsRequestOptions;
  }): Promise<Experimental_ConnectEventsSubscription>;
  listSubscriptions(input?: Experimental_ConnectEventsListInput): Promise<{
    subscriptions: Experimental_ConnectEventsSubscription[];
    nextCursor?: string;
  }>;
  unsubscribe(input: {
    id: string;
    options?: Experimental_ConnectEventsRequestOptions;
  }): Promise<Experimental_ConnectEventsSubscription>;
}

/**
 * Configure Connect-managed subscriptions without allocating a webhook or
 * retaining a workload token. Connect owns upstream verification and subscription management;
 * the application owns its receiver, authorization bindings and durable inbox.
 * Connect manages provider renewal separately from the application's deadline.
 */
export function experimental_connectEventsAdapter({
  connector,
  tokenParams: configuredTokenParams,
  destination: { path },
  mcpUrl: configuredMcpUrl,
}: Experimental_ConnectEventsAdapterOptions): Experimental_ConnectEventsAdapter {
  if (
    typeof connector !== 'string' ||
    !connector ||
    typeof path !== 'string' ||
    !path
  ) {
    throw new TypeError('A connector and destination path are required.');
  }
  const tokenParams = snapshotEventTokenParams(configuredTokenParams);

  return {
    createAdapter({ transport }) {
      const mcpUrl =
        configuredMcpUrl ??
        (transport.type === 'custom' ? undefined : transport.url);
      return {
        async subscribe(input) {
          if ((input as { expiresAt?: unknown }).expiresAt !== undefined) {
            throw new TypeError(
              'Use ttlMs instead of expiresAt when creating a subscription.'
            );
          }
          // Select fields explicitly so extra runtime properties cannot override
          // the bound scope or turn provider arguments into delivery configuration.
          return toSubscription(
            await subscribe(
              connector,
              {
                tokenParams,
                mcpUrl,
                name: input.name,
                arguments: input.arguments,
                destination: { path },
                context: input.context,
                idempotencyKey: input.idempotencyKey,
                ttlMs: input.ttlMs,
              },
              requestOptions(input.options)
            )
          );
        },
        async getSubscription({ id, options }) {
          return toSubscription(
            await getSubscription(
              connector,
              { id, expectedSubject: tokenParams.subject },
              requestOptions(options)
            )
          );
        },
        async listSubscriptions({ cursor, limit, status, options } = {}) {
          const page = await listSubscriptions(
            connector,
            { tokenParams, cursor, limit, status },
            requestOptions(options)
          );
          return {
            subscriptions: page.subscriptions.map(toSubscription),
            ...(page.pagination.next === null
              ? {}
              : { nextCursor: page.pagination.next }),
          };
        },
        async unsubscribe({ id, options }) {
          return toSubscription(
            await unsubscribe(
              connector,
              { id, expectedSubject: tokenParams.subject },
              requestOptions(options)
            )
          );
        },
      };
    },
  };
}

function requestOptions(options?: Experimental_ConnectEventsRequestOptions) {
  // AI SDK inputs cannot override the workload identity or API region.
  return options === undefined
    ? undefined
    : {
        signal: options.signal,
        timeout: options.timeout,
        maxTotalTimeout: options.maxTotalTimeout,
      };
}

function toSubscription(
  subscription: McpSubscription
): Experimental_ConnectEventsSubscription {
  return {
    id: subscription.id,
    name: subscription.name,
    // The HTTP response is parsed JSON. Keep the narrower JSON type in this
    // adapter without changing the base API's Record<string, unknown> contract.
    arguments: subscription.arguments as JsonObject,
    status: subscription.status,
    expiresAt: subscription.expiresAt,
    ...(subscription.cleanupStatus === undefined
      ? {}
      : { cleanupStatus: subscription.cleanupStatus }),
  };
}
