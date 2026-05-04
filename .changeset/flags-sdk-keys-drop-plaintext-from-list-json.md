---
'vercel': patch
---

Tighten the `SdkKey` type so plaintext `keyValue`, `tokenValue`, and `connectionString` can no longer appear on list responses. `flags sdk-keys ls --json` already omitted these via an explicit allowlist; the type split makes the guarantee static. Create-time output from `flags sdk-keys add` is unaffected.
