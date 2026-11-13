---
'@vercel/connect': patch
---

`getConnectorMetadata()` now only returns the fields declared on `ConnectorMetadata` instead of spreading the entire wire response, which previously leaked undeclared/internal fields (e.g. `redirectUri`, owner/tenant ids, secret placeholders) to callers.
