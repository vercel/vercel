---
"@vercel/fs-detectors": patch
"@vercel/ruby": patch
---

[services] strip services route prefix in ruby runtime by mounting the app at `SCRIPT_NAME` when service route prefix is auto configured
