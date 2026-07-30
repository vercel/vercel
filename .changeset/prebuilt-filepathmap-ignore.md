---
'@vercel/client': patch
---

Fix `vercel deploy --prebuilt` re-adding `.vercelignore`d files through `filePathMap`. Source paths referenced by `.vc-config.json` `filePathMap` entries are now re-checked against the project's `.vercelignore`/`.nowignore` rules and rejected when they resolve outside the deployment root, so a tampered or lower-trust build artifact can no longer reintroduce ignored files (e.g. `.env`) into the deployment upload set.
