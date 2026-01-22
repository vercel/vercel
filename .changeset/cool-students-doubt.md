---
'vercel': patch
---

Add warning when adding/updating env vars

1. When keys have prefixes that expose values to the client
2. The value has whitespace
3. The values are exposed and the key matches a pattern for a sensitive value like a password
