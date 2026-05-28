---
"@vercel/connect": minor
---

Add `connect` helper for [Ash](https://github.com/vercel/ash) connections via the new `@vercel/connect/ash` subpath. The helper drives the full token / start / complete authorization lifecycle against Vercel Connect from an Ash `defineMcpClientConnection`, removing the per-connection boilerplate that previously had to live in user code. Pass a string connector id for the common case (`connect("linear")`) or use `connect({ connector: "linear" })` when extra options are needed. `principalType` defaults to `"user"` and only needs to be set for app-scoped connections.

```ts
import { defineMcpClientConnection } from "experimental-ash/connections";
import { connect } from "@vercel/connect/ash";

export default defineMcpClientConnection({
  description: "Linear workspace — issues, projects, comments.",
  auth: connect("linear"),
});
```

`experimental-ash` is declared as an optional peer dependency, so importing `@vercel/connect` from non-Ash projects continues to work without installing it.
