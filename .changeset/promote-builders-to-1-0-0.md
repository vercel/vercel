---
'@vercel/backends': major
'@vercel/container': major
'@vercel/elysia': major
'@vercel/express': major
'@vercel/fastify': major
'@vercel/h3': major
'@vercel/hono': major
'@vercel/koa': major
'@vercel/nestjs': major
---

Promote these framework builders to a `1.0.0` baseline. They are listed in the
`vercel` CLI's `peerDependencies`, and changesets escalates a dependent to a
major bump whenever a peer dependency's new version falls outside the declared
range. While these packages were on `0.x`, semver caret ranges (`^0.x.y`) do not
include the next minor, so every routine builder minor silently forced a
`vercel` CLI major. Establishing a `1.0.0` baseline (combined with `workspace:^`
peer ranges and the `onlyUpdatePeerDependentsWhenOutOfRange` changesets option)
lets these builders ship normal minor releases without bumping the CLI major.
