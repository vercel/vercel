---
'vercel': patch
---

`vercel integration add` now finishes in the terminal when the server reports required metadata that is still missing, such as Resend's `domain`: in an interactive terminal it asks for each missing key and provisions, and in non-interactive mode the error names only those keys (`--meta KEY=VALUE`). Missing metadata is no longer reported for fallbacks that come after the server has validated metadata. When a paid plan is needed (no free plan is available, or the integration says so), the CLI says so before opening the browser, and the non-interactive payload carries the integration's message in `data.remoteMessage`. Telemetry records the missing-metadata exit as `marketplace_install_flow_dropped` (`reason: metadata_missing`) instead of `marketplace_install_flow_web_fallback`, and the prompt as `marketplace_install_metadata_prompted`; both include the schema's key names, never values.
