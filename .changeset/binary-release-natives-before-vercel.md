---
---

Release binaries before publishing `vercel`: the native `@vercel/vc-native-*`
packages are now built and published to npm as a gating job before the
changesets publish, and `vercel`'s native `optionalDependencies` are injected at
pack time (hard failing if any native package is missing from npm). Removes the
unused GitHub Release asset upload and the cross-workflow dispatch trigger.
