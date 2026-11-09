# Experimental Connect event receiver

This verifies the **Connect → application** hop. Connect verifies the MCP
server's Standard Webhooks signature itself; do not pass a forwarded Connect
envelope to AI SDK's direct MCP webhook verifier.

This is a draft receiver contract. The backend sender must implement the signed
claims below before release. It intentionally does not accept the older draft's
full-URL / deployment-ID proof as a fallback. The new sender and receiver use
`connect` as the delivery-claim namespace and omit the old internal `sourceId`
(source revision) from the envelope. These changes must ship together.

```ts
import {
  experimental_verifyMcpEvent,
  Experimental_McpEventVerificationError,
} from '@vercel/connect/mcp';

export async function POST(request: Request) {
  let envelope;
  try {
    envelope = await experimental_verifyMcpEvent(request, { path: '/hooks' });
  } catch (error) {
    if (error instanceof Experimental_McpEventVerificationError) {
      return new Response(null, {
        status: error.code === 'invalid_delivery' ? 401 : 503,
      });
    }
    throw error;
  }

  // Application-defined: resolve the saved, authorized subscription binding.
  // envelope.context.bindingId is application metadata, not an authorization grant.
  // Persist the receipt and queued work atomically; deduplicate by deliveryId.
  await acceptEnvelope(envelope);
  return new Response(null, { status: 204 });
}
```

`path` is the registered public route from server configuration. It is never
inferred from `Request.url`, `Host` or `X-Forwarded-*`. Verification binds it to
signed project/environment identity, so a hostname is not necessary. If the route
has a public prefix or rewrite, use the registered public path.

Project defaults to `VERCEL_PROJECT_ID`; environment defaults to
`VERCEL_TARGET_ENV`, then `VERCEL_ENV`. Preview binds the signed `previewBranch`
to `VERCEL_GIT_COMMIT_REF`, allowing deployments on that authorized branch to
change while rejecting a different branch. Explicit `projectId`, `environment`
and `branch` overrides must come from trusted server configuration. Custom
environments additionally require their stable `customEnvironmentId`. Missing
identity and wildcards fail closed; development forwarding is unsupported.

The existing Vercel OIDC verifier validates the signature against its cached
Vercel JWKS, a Vercel issuer, and exact project/environment claims. `ownerId`
defaults to `VERCEL_ORG_ID` when present. Applications can additionally pin
`ownerId`, `issuer` and `audience`; these are optional restrictions, not values
copied from the incoming JWT.

## Authenticated envelope

The returned envelope has `version: 1`, `deliveryId`, `subscriptionId`,
`source: { type: 'mcp', connectorId }`, and saved application `context`.
The connector identifies the configured source; `subscriptionId` identifies the
Connect watch. Internal source revisions and upstream lease IDs are not part of
the public envelope. It carries exactly one of:

- `event: { eventId, name, timestamp, data, cursor, _meta? }`
- `control: { type: 'gap', cursor, truncated?: true }`
- `control: { type: 'terminated', error: { code, message, data? } }`

Payload data is JSON, not an authorization grant or schema-validated provider
object. The receiver does not invoke callbacks. Applications can dispatch events,
gaps and termination separately; eve's future integration owns saved session/auth
bindings and authored `onEvent`, `onGap` and `onTerminated` callbacks. Persist
lifecycle changes before dispatching those callbacks. Retired bindings must not
start new work.

## Sender authentication

Connect sends its existing OIDC JWT in `Authorization: Bearer …`. It uses RS256,
`typ: JWT`, a registered `kid`, and `iat`/`exp` no more than five minutes apart.
Verification allows 60 seconds of clock skew. Only Connect's delivery service
may issue the reserved `connect` claims:

```ts
connect: {
  purpose: 'mcp_event_delivery',
  version: 1,
  destinationPath: '/hooks',
  previewBranch: 'feature/issues', // only for preview
}
```

The standard claims bind project/environment/owner; `custom_environment_id`
binds a custom environment. The receiver checks the purpose, registered path,
branch/custom environment and token lifetime before returning a validated envelope.
It accepts only JSON POST bodies, rejects compression and limits bodies to 300 KiB.
Event metadata is preserved as an optional JSON object. Event and gap cursors are
opaque strings (or `null`), bounded by the total body limit.

This uses bearer authentication over HTTPS: the JWT authenticates Connect's
delivery service for this destination, and the receiver trusts Connect to supply
the envelope. Ordinary project workload tokens have no reserved delivery purpose
and are rejected. The sender must derive the purpose and destination claims from
trusted configuration; callers and upstream MCP servers cannot supply them.

There is no body hash or signature over the envelope. `connectorId`,
`subscriptionId`, `deliveryId` and `context` are validated JSON fields, not
duplicated JWT claims. A valid delivery token can authenticate another valid
envelope for the same destination until it expires; protect it as a bearer
credential. The receiver does not promise cryptographic binding between that
token and one specific body.

Signature and standard JWT validation stay in the existing OIDC verifier. Its
identity failures are distinguishable from temporary JWKS/network failures.

Successful verification is not replay prevention or permission to execute.
Connect must assign a stable logical `deliveryId` across upstream retries;
the application owns durable deduplication and subscription-to-principal
mapping. Phase one forwards inline and relies on the provider's retry window;
Connect does not retain a payload outbox or promise later redelivery. A signing-key
outage returns `verification_unavailable`, not a permanent invalid-token error.
