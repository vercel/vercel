---
'vercel': patch
---

Fix CLI update notification showing a stale or incorrect version number. The update prompt now performs a fresh registry lookup before displaying the target version, and the upgrade success message reports the actually installed version instead of the prompted version.
