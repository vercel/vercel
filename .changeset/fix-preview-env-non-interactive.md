---
'@vercel/cli': patch
---

Fixed vercel env add preview command: always prompts for git branch even with --yes --force flags in non-interactive mode.

The command now correctly treats --yes and --force flags as non-interactive mode indicators, preventing interactive prompts in CI/CD environments like GitHub Actions.

Also updated tsconfig.json to properly handle TypeScript compilation:
- Added `ignoreDeprecations: "6.0"` for TypeScript 6.0 compatibility
- Added `noEmit: true` to prevent output file conflicts
- Added `rootDir: "./src"` to specify source directory
- Updated `include` to exclude test files that were causing compilation issues

Example fix - this now works without hanging on prompts:
```bash
vercel env add MY_VAR preview --value "hello" --yes --force --token=$TOKEN
```
