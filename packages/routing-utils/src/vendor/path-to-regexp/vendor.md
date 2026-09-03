Vendored from [path-to-regexp@6.1.0](https://github.com/pillarjs/path-to-regexp/tree/v6.1.0).

This does not patch GHSA-9wv6-86v2-598j. That advisory is a ReDoS in
regexes generated from patterns like `/:a-:b` when they are later
matched against a crafted path. Here the library only compiles
developer-controlled routes at build time, so the report is treated as
non-threatening.

Upgrading to 6.3.0 would change compiled route regular expressions for
existing customer configs, which is not safe to ship.

This is the shared copy used by `@vercel/routing-utils`, `@vercel/node`,
and `@vercel/remix-builder`. It is vendored so published packages no
longer depend on the flagged npm version, while route compilation
behavior stays the same.
