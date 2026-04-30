# Vercel CLI Native Packages

These packages are opt-in npm distribution packages for Bun-compiled Vercel CLI
binaries. They are intentionally separate from the `vercel` package so
`npm i -g vercel` continues to install the existing JavaScript CLI.

Package versions are staged from `packages/cli/package.json` during the binary
release workflow by `packages/cli/scripts/stage-native-packages.mjs`.

