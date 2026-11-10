# Experimental managed MCP Events adapter

`experimental_connectEventsAdapter` from `@vercel/connect/ai-sdk` binds a
connector, resolved `ConnectTokenParams` and application receiver to Connect's
managed subscription operations. Construction makes no requests. The adapter
does not receive webhook bodies or register a callback function.

This is the Connect implementation of the transport-context contract merged in
[AI SDK #22325](https://github.com/vercel/ai/pull/22325). It has no AI SDK runtime
or type dependency and needs no event store. Its exports remain experimental.
Requires the release containing #22325. `@ai-sdk/mcp@2.0.72` has managed events,
but expects bound operations instead of this factory; do not pass the integration
object directly to that release.

The [management endpoints](./mcp-events.md) support subscribe/get/list/unsubscribe,
delivery, provider renewal, and application expiry. See
[backend availability](./mcp-events.md#backend-availability) for environment and
rollout requirements. The backend must authorize the full credential selection
below and persist supported constraints.
Do not remove constraints or retry with a broader account to work around a
backend that does not support them.

## Use the same account for discovery and subscriptions

The following wiring requires the companion AI SDK adapter implementation:

```ts
import { createMCPClient } from '@ai-sdk/mcp';
import {
  connectAuthProvider,
  experimental_connectEventsAdapter,
  type ConnectTokenParams,
} from '@vercel/connect/ai-sdk';

const connector = 'oauth/issues';
const tokenParams: ConnectTokenParams = {
  subject: { type: 'user', id: authenticatedUser.id },
  scopes: ['read'],
};

const authProvider = connectAuthProvider(connector, tokenParams);
const adapter = experimental_connectEventsAdapter({
  connector,
  tokenParams,
  destination: { path: '/hooks' },
});

const client = await createMCPClient({
  transport: {
    type: 'http',
    url: 'https://issues.example.com/mcp',
    authProvider,
  },
  experimental_events: { adapter },
});

const catalog = await client.experimental_events.list();
const subscription = await client.experimental_events.subscribe({
  name: 'issue.created', // selected from catalog.events
  arguments: { project_id: 'ABC' },
  context: { bindingId: savedIntent.id },
  ttlMs: null,
  idempotencyKey: savedIntent.idempotencyKey,
});
```

`connectAuthProvider` obtains credentials for direct MCP requests, including
catalog discovery. `experimental_connectEventsAdapter` delegates subscription
management to Connect. Connect resolves the upstream credentials itself for app
and user subjects; the AI SDK does not hand its access token to the adapter.

Use the same resolved `ConnectTokenParams` object for both helpers. Subject is
required; scopes, installation, audience, resources, authorization details and
validity buffer remain optional. The adapter copies the credential fields and
nested values at construction, so subsequent caller mutations do not change
its account. There is no top-level `subject` shorthand or async resolver.
`connectAuthProvider` also currently accepts an object. A resolver would require
separate SDK support; resolve application state before constructing either helper.

The adapter preserves every existing subject variant, including `experimental_idp`
on user subjects and token-exchange inputs. Backend support determines which
variants can create renewable subscriptions; it must reject unsupported variants
without coercing them to app/user subjects. Token-exchange inputs are credentials:
keep the adapter server-side and do not serialize or log its configuration.

`authenticatedUser` and `savedIntent` represent trusted application state. Persist
the intent before subscribing and associate the returned subscription ID with it.
Context belongs to each watch; it does not authorize execution or override the
adapter's account or route. Use `{ type: 'app' }` for an authorized app account.
Connect must enforce project/environment authorization, destination validation
and connector permissions. The application must authorize its own event work.

## Endpoint selection

AI SDK calls `adapter.createAdapter({ transport })` once per client before
starting its transport. The integration uses an explicit `mcpUrl` override first,
otherwise the HTTP/SSE transport URL. Custom transports provide no URL; omit the
override to use the connector endpoint. The URL is snapshotted for that client's
operations. Headers, auth providers, live transport methods, and access tokens
are not passed to Connect. The backend must authorize `source.url` before using
provider credentials. Forwarding an SSE URL does not add SSE support to the
Connect backend; it must reject unsupported endpoints.

## Use the adapter directly

Without AI SDK or eve, bind operations explicitly (or use the direct
`@vercel/connect/mcp` functions):

```ts
const operations = adapter.createAdapter({
  transport: { type: 'http', url: 'https://issues.example.com/mcp' },
});
const subscription = await operations.subscribe({
  name: 'issue.created',
  arguments: { project_id: 'ABC' },
  context: { bindingId: savedIntent.id },
  ttlMs: 60 * 60 * 1000,
  idempotencyKey: savedIntent.idempotencyKey,
});
const page = await operations.listSubscriptions({ status: 'active' });
const state = await operations.getSubscription({ id: subscription.id });
await operations.unsubscribe({ id: subscription.id });
```

## Subscription lifetime

Connect's creation API requires `ttlMs`: an integer from 120,000 (2 minutes) to
31,536,000,000 (365 days), or `null` for an explicitly indefinite watch. Direct SDK
calls, AI SDK managed subscriptions, and the eve bridge use the same input.
Use matching AI SDK and eve releases that accept nullable `ttlMs`; older releases
that create indefinite watches with `expiresAt: null` must be updated together.

Absolute `expiresAt` timestamps are rejected. Use a fixed duration instead.
Converting a timestamp to remaining milliseconds on every retry would change the
creation payload and conflict with the original idempotency key. Reuse the same
TTL and key when recovering an uncertain result; Connect preserves the original
deadline rather than extending it.

Methods return a managed watch containing `id`, `name`, JSON `arguments`, `status`,
`expiresAt` and optional `cleanupStatus`. Creation can return `pending`; it is not
confirmation that upstream verification has finished. `expiresAt` is the
monitoring deadline, not an upstream `refreshBefore` grant. Connect owns renewal.
Cancellation can return `stopped` while remote cleanup remains pending.

Listing is account/project/environment scoped, not conversation scoped. Follow
`nextCursor` even when a filtered page is empty. Applications such as eve must
authorize get/stop operations and restrict listings using their saved bindings.
The adapter does not expose a conversation-wide `unsubscribeAll`.

Connect's subscription HTTP API and direct `experimental_listSubscriptions`
helper return `pagination: { next: string | null }`. The adapter maps that to
`nextCursor`, omitting it on the last page, so AI SDK and eve keep their existing
pagination contract. Deploy the managed-list pagination change (vercel/api#98199)
before releasing this adapter.

## Cancellation and errors

Request options go inside each method's input, matching AI SDK:

```ts
await operations.getSubscription({
  id: subscription.id,
  options: {
    signal: abortController.signal,
    timeout: 10_000,
    maxTotalTimeout: 15_000,
  },
});
```

Both timeout fields are milliseconds; the earlier supplied deadline wins for
this single HTTP request, including credential lookup and response-body reading.
There are no progress-based extensions or automatic retries. Values must be
positive integers no greater than 2,147,483,647. No deadline is installed when
both are omitted. Call cancellation preserves the caller's reason; an elapsed
deadline rejects with `TimeoutError`.

The adapter nests the bound `tokenParams` on create/list requests. Get/stop use
`id` plus `expectedSubject` from its saved credential selection; callers cannot
override or omit that assertion. The backend must reject a different stored
creation subject before returning data or stopping the subscription, without
fetching an upstream access token. It must reject unsupported assertions rather
than silently widening the request to workload scope.

Workload OIDC credentials are resolved afresh on each call. Adapter call options
cannot replace workload credentials or the bound credential selection. The
lower-level management functions retain their explicit `vercelToken` and `region`
options for server-side callers.

An abort or network failure may occur after Connect accepted a watch; it does not
unsubscribe. Recover using the saved intent and identical idempotency key within
Connect's retention window. Connect errors retain their class, `code` and
`status`, including consent errors. Missing authorization must be resolved by the
application; the adapter does not downgrade scopes or select another account.

## Receiving events and using eve

Connect provisions `https://connect.vercel.com/hooks/:callbackId` upstream and
forwards verified MCP events to the configured application route. Use the
[Connect delivery verifier](./mcp-event-deliveries.md) there, not the
AI SDK verifier for direct MCP server webhooks. Persist the receipt and resolve
the authorized subscription binding before invoking application work. A live
adapter/MCP client is not required for delivery, and closing the client does not
stop watches.

The eve bridge explicitly calls `createAdapter` using its connection's HTTP URL
and returns bound operations with eve authorization error translation. This works
with the released `@ai-sdk/mcp@2.0.72` bound-operations API; eve can wrap those
operations in the new factory when #22325 releases. The user provides the URL only
in their eve connection definition.

The eve integration mounts
`/eve/v1/hooks/:connectionName`, and persists bindings and receipts internally.
Authored `onEvent`, `onGap` and `onTerminated` callbacks remain in the deployed eve
application; they are never sent to Connect. That integration is separate work.
