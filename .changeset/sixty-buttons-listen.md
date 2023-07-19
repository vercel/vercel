---
'@vercel/frameworks': minor
'@vercel/static-build': patch
---

Add `ignorePackageJsonScript` configuration for Framework command settings to ignore the `package.json` script.

Enable this mode for Storybook's `buildCommand`, since it should not invoke the "build" script, which is most likely designated for the frontend app build.
