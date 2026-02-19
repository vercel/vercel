---
"@vercel/build-utils": patch
"vercel": patch
"@vercel/fs-detectors": patch
---

[services] 
* consolidate `workspace` and `entrypoint` from `experimentalServices` `vercel.json` schema
* make `framework` config in service optional -- infer framework from service workspace when not explicitly provided
