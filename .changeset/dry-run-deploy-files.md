---
'@vercel/client': patch
'vercel': patch
---

Add `vercel deploy --dry` to inspect the detected framework preset and local deployment file set without uploading or creating a deployment, with complete JSON output for non-TTY consumers.
