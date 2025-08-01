---
'@vercel/next': minor
---

Improve fallback root params handling with hasFallbackRootParams flag

- Add hasFallbackRootParams flag to RoutesManifestRoute type for simplified route regex generation
- Update route handling logic to conditionally apply fallback root params processing
- Enhance prerender manifest structure with fallback root params support