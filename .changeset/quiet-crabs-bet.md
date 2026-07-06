---
"@vercel/build-utils": patch
"@vercel/client": patch
"vercel": patch
"@vercel/config": patch
---

Add `maxDuration` as a top-level `vercel.json` key that sets the default for all Serverless Functions; a matching `functions` entry or in-code function config overrides it
