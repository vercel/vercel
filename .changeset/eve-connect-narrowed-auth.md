---
'@vercel/connect': minor
---

Narrow the `@vercel/connect/eve` interactive-authorization contract to match Eve's narrowed `InteractiveAuthorizationDefinition`. `startAuthorization` now returns only `{ challenge }` (the journaled `state` is gone), so a Connect-backed session no longer carries OAuth secrets across a workflow step boundary. Runtime behavior is unchanged — Connect still re-polls `getTokenResponse(connector, principal)` in `completeAuthorization`.

Breaking public-type change: the `ConnectAuthorizationState` type is removed and `connect()` no longer parameterizes `InteractiveAuthorizationDefinition`.
