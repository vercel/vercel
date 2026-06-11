---
'vercel': patch
---

Added `vc api --spec-url <url>` for loading endpoints from a custom OpenAPI spec instead of the default public Vercel spec. Custom specs are fetched fresh, can use the current CLI token to pass Vercel deployment protection via the SSO handshake, and replace the public spec entirely for listing, interactive selection, and tag/operation resolution.
