---
'vercel': patch
---

Prototype: publish the CLI bin as a `#!/bin/sh` dispatcher that can exec managed-store payloads (native binaries with zero node startup) before node boots. Inert unless `VERCEL_CLI_STORE=1` is set.
