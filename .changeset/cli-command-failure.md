---
'vercel': patch
---

Include bounded error codes and their source in failed command telemetry. This applies to all users with telemetry enabled, not only agent runs; codes that do not look like constants are sent as `UNCLASSIFIED_ERROR`.
