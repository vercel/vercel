---
'@vercel/frameworks': minor
'@vercel/build-utils': patch
---

Move framework-helpers from build-utils to @vercel/frameworks. Add Python framework checks (isPythonFramework, PYTHON_FRAMEWORKS, isRuntimeFramework). build-utils re-exports from @vercel/frameworks for backward compatibility.
