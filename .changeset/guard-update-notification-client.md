---
'vercel': patch
---

Fix a crash after `vercel --help`, `vercel --version`, and config-read errors when an update notification is pending: the update prompt dereferenced the CLI client before it was constructed on those early-return paths, printing "An unexpected error occurred!" and exiting 1. The update notification is now skipped when the client was never constructed.
