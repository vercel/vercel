---
'@vercel/frameworks': patch
'@vercel/backends': patch
---

Allow the Node framework preset to work without a `package.json`. The `node`
framework is now detected from a `server.*` entrypoint alone, and the
`@vercel/backends` builder defaults the module format to ESM (`"module"`) when
no `package.json` is present instead of erroring with "Unable to resolve format".
