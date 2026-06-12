---
'@vercel/connect': patch
---

Add a context-aware `createSubject` hook to `connect()` from `@vercel/connect/eve`. The new `createSubject?: (principal, ctx) => ConnectTokenSubject` option receives both the framework-resolved principal and Eve's per-connection authorization context (currently the declared server `url`), unblocking jwt-bearer-style connectors whose subject/assertion needs more than the principal — custom claims, the connection URL, or an audience derived from it. The adapter now threads the `connection` context Eve already passes to `getToken` / `startAuthorization` / `completeAuthorization` (previously dropped) into subject resolution, and the context type is exported as `EveConnectionAuthorizationContext`. Precedence is `createSubject` > `principalToSubject` > default principal mapping; `principalToSubject` keeps working but is now deprecated in favor of `createSubject`.
