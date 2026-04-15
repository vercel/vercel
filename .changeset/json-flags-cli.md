---
'vercel': patch
---

Add JSON feature flag support to the CLI so flags can be created, updated, listed, inspected, and set with JSON variant values just like existing boolean, string, and number kinds.

This aligns the CLI with the recent API and dashboard changes for `json` flags, including parsing raw JSON inputs and preserving structured values in output.
