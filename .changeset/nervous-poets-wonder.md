---
'@vercel/static-build': patch
---

Improve the "No Output Directory" build error: when the build produced Build Output API output (`.vercel/output`) or a directory matching the expected Output Directory name somewhere other than the validated location — for example a framework build that ran in a subdirectory — the error now reports where the output was found and suggests setting the project's Root Directory, instead of pointing at the Output Directory setting.
