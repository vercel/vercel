---
"vercel": patch
---

fix(build-utils): skip --unsafe-perm for pnpm 12+ (#17560)

pnpm 12 removed the --unsafe-perm flag from its CLI. This fix detects
the pnpm major version from package.json#packageManager and omits
--unsafe-perm when pnpm >= 12 is in use.
