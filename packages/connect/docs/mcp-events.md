# Experimental MCP event subscriptions

Connect registers upstream webhook subscriptions and forwards their deliveries. The
`@vercel/connect/mcp` functions work without AI SDK, eve or a local event store.
They target the connector-scoped management API. Deploy the managed-list
`pagination.next` response from vercel/api#98199 before releasing this SDK.
All new event exports are experimental.

```ts
import {
  experimental_subscribe,
  experimental_getSubscription,
  experimental_listSubscriptions,
  experimental_unsubscribe,
  type ConnectTokenParams,
} from '@vercel/connect/mcp';

const connector = 'oauth/issues';
const tokenParams: ConnectTokenParams = {
  subject: { type: 'user', id: authenticatedUser.id },
  scopes: ['read'],
};
const subscription = await experimental_subscribe(connector, {
  tokenParams,
  name: 'issue.created',
  arguments: { project_id: 'ABC' },
  destination: { path: '/hooks' },
  context: { bindingId: savedIntent.id },
  ttlMs: null, // until stopped; use milliseconds for a finite lifetime
  idempotencyKey: savedIntent.idempotencyKey,
});
const state = await experimental_getSubscription(connector, {
  expectedSubject: tokenParams.subject,
  id: subscription.id,
});
const page = await experimental_listSubscriptions(connector, {
  tokenParams,
  status: 'active',
  limit: 20,
});
if (page.pagination.next !== null) {
  const nextPage = await experimental_listSubscriptions(connector, {
    tokenParams,
    status: 'active',
    limit: 20,
    cursor: page.pagination.next,
  });
}
await experimental_unsubscribe(connector, {
  expectedSubject: tokenParams.subject,
  id: subscription.id,
});
```

Derive `tokenParams` from authenticated application state, never a model argument
or event body. Use the same parameters as `connectAuthProvider` for direct MCP
requests. Scopes, installation, audience, resources and authorization details
select the upstream credential; they must be preserved through subscription
creation and renewal. Unsupported credential variants must fail explicitly.
Missing consent must not trigger a request with broader scopes or another account.

Every operation authenticates with fresh workload OIDC credentials. Connect must
check the connector, subject, project, environment and preview branch against
stored authorization. A subscription ID locates a record; it is not an
authorization grant.
Get/stop accept `{ id, expectedSubject? }`, without token selection parameters.
Workload OIDC and the stored connector/project/environment/preview identity must
always authorize access. `expectedSubject` is an additional assertion against the
stored creation subject; account-bound callers should always supply it. Without
that assertion, the low-level call has workload scope and the application must
check its own subscription ownership before calling it. A mismatch must fail
before returning data or stopping anything, without obtaining an upstream token.
Listing and bulk cancellation are scoped to that authorized account and workload,
not to an eve session or workflow.

Save application intent before creating a subscription and bind the returned ID
to the authorized execution principal. An event arriving before that binding
exists must not execute or guess its recipient. Durably retain it for binding
resolution, or return a retryable failure. Context is application metadata received
from Connect over the authenticated HTTPS delivery, not an authorization grant.
The delivery token does not sign individual body fields. eve's session/auth binding is
an integration concern; the base SDK does not interpret it.

Creation returns durable subscription state, potentially `pending`, rather than
proof that upstream verification completed. Creation requires `ttlMs`: an integer
from 120,000 (2 minutes) to 31,536,000,000 (365 days), or `null` to watch until
stopped. `expiresAt` is not accepted as a creation input. Connect computes the
returned `expiresAt` deadline once at creation and preserves it across retries
and renewals. Provider leases are managed separately. Get can report
`stopped` with `cleanupStatus: 'pending'` after a
failed stop attempt; retry unsubscribe to finish remote cleanup.

Subscription listing returns `{ subscriptions, pagination: { next } }`. Follow
`pagination.next` even for empty filtered pages; `null` means there are no more
pages. The AI SDK/eve adapter translates this to its existing optional
`nextCursor` field. Catalog discovery separately retains MCP's `nextCursor`.
Use a new idempotency key for
new intent; reuse the original key and request when recovering an uncertain
creation within the backend's retention window. The SDK never automatically
retries mutations. An aborted HTTP request does not cancel an accepted watch.

## Backend availability

The backend supports the four operations used by the AI SDK/eve adapter:
subscribe, get, list, and unsubscribe, plus authenticated delivery. It supports
production and stable custom environments; preview and development are rejected.

Connect schedules provider renewal and application expiry. `ttlMs: null`
removes the application's deadline; it is not a provider lease duration. An
interrupted registration may remain pending. The same request key recovers the
original registration rather than starting another provider subscription.

## Optional catalog discovery and bulk cancellation

`experimental_discoverEvents` and `experimental_unsubscribeAll` require the later
backend lifecycle API and are unavailable in the minimal pilot.
`experimental_listEventTypes(connector, { tokenParams, cursor })` lists that
account's event descriptors and schemas. This is catalog discovery, not polling
for event occurrences. An authenticated MCP client can discover the catalog
itself; no Connect discovery call is required before subscribing. Catalogs must
not be shared across accounts.

`experimental_unsubscribeAll(connector, { tokenParams, idempotencyKey })`
requests cancellation of the whole authorized connector/account/workload scope.
Applications must not expose it as a session-only stop action.

## Request options

Each function accepts a third argument with `signal`, `timeout`,
`maxTotalTimeout`, and the existing server-side `vercelToken`/`region` overrides.
The earlier supplied deadline covers credential lookup, fetch and response
parsing. Timeouts are positive integer milliseconds up to 2,147,483,647; when
omitted there is no SDK deadline. Errors preserve `ConnectError` subclasses,
`code` and `status`, including consent errors.

## Delivery and backend contract

Connect provisions `https://connect.vercel.com/hooks/:subscriptionId` at the MCP
server. The application provides its own destination path, such as `/hooks`.
Upstream callback verification and Connect-to-application authentication are
separate hops; the upstream signing secret stays in Connect.

Phase one forwards inline. It does not provide a Connect delivery outbox,
scheduled redelivery, delivery history, manual redrive, or a guaranteed replay
window. The provider's retry/replay window bounds recovery from an unavailable
receiver. Applications should durably accept verified receipts and deduplicate
work before responding successfully. Subscription lifecycle persistence remains
Connect's responsibility.

The management requests use authenticated POSTs under
`/v1/connect/connectors/:connector`: `subscriptions`,
`subscriptions/actions/list`, `subscriptions/actions/get`,
`subscriptions/actions/unsubscribe`, and `subscriptions/actions/unsubscribe-all`.
Catalog discovery uses `GET /v1/connect/mcp-events/event-types` with `connector`,
JSON `tokenRequest`, optional `cursor`, and optional `sourceUrl`. The SDK supplies
`source: { type: 'mcp' }`. Credential selection is nested under `tokenParams` on
create/discovery/list/bulk-stop requests, so credential and operation fields
cannot collide. Get/stop send `id` and optional `expectedSubject` instead.

The backend must persist both the authorized owner and a protected binding to
the creation subject. `expectedSubject` must be checked against that binding
without refreshing or exchanging provider tokens. This includes token-exchange
subjects: a raw token is a credential, not a public owner ID; keep it out of
responses and logs, and use a protected comparison with the original binding.
Do not silently ignore an unsupported assertion. Subscription responses expose
only normalized app/user owner metadata. These authorization rules and the
nested request shape are backend release requirements, not compatibility with
the earlier flattened API draft.
New subscription creation remains behind the API's `connex-mcp-events` flag.

Use the [experimental receiver verifier](./mcp-event-deliveries.md) to authenticate forwarded envelopes before durable acceptance.

For AI SDK integration, see the [experimental managed adapter](./ai-sdk-mcp-events.md).

## Selecting the MCP endpoint

`experimental_discoverEvents`, `experimental_listEventTypes`, and
`experimental_subscribe` accept an optional `mcpUrl` beside `tokenParams`.
Creation sends it as `source.url`; catalog discovery sends it as `sourceUrl`.
Omitting it uses the connector's configured endpoint.
The backend must support and authorize this URL before sending provider credentials.
A URL is a resource selector, not permission to send credentials to that resource.
Get, list, and stop operations use the stored subscription identity and do not
need the caller to repeat the endpoint.
