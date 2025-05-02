# Dependency Audit Report

## Summary

- Total packages: 149
- Direct dependencies: 13
- Dev dependencies: 128
- Deprecated packages: 0
- Packages with multiple versions: 0

## Largest Packages

- `@types`: 124K
- `@inquirer`: 24K
- `@vitest`: 8.0K
- `@vercel`: 8.0K
- `@tootallnate`: 8.0K
- `@swc`: 8.0K
- `@sindresorhus`: 8.0K
- `@sentry`: 8.0K
- `@next`: 8.0K
- `@edge-runtime`: 8.0K

## Deprecated Packages

- None found

## Packages with Multiple Versions

- None found

## Small Packages (Candidates for Inlining)

- `@types`: 124K
- `@inquirer`: 24K
- `@vitest`: 8.0K
- `@vercel`: 8.0K
- `@tootallnate`: 8.0K
- `@swc`: 8.0K
- `@sindresorhus`: 8.0K
- `@sentry`: 8.0K
- `@next`: 8.0K
- `@edge-runtime`: 8.0K
- `@alex_neo`: 8.0K
- `yauzl-promise`: 4.0K
- `xdg-app-paths`: 4.0K
- `write-json-file`: 4.0K
- `vitest`: 4.0K
- `vite`: 4.0K
- `utility-types`: 4.0K
- `ts-node`: 4.0K
- `tree-kill`: 4.0K
- `tmp-promise`: 4.0K
- `tar-fs`: 4.0K
- `supports-hyperlinks`: 4.0K
- `strip-ansi`: 4.0K
- `split2`: 4.0K
- `serve-handler`: 4.0K
- `semver`: 4.0K
- `rimraf`: 4.0K
- `raw-body`: 4.0K
- `qr-image`: 4.0K
- `proxy-agent`: 4.0K
- `promisepipe`: 4.0K
- `pluralize`: 4.0K
- `pcre-to-regexp`: 4.0K
- `npm-package-arg`: 4.0K
- `node-fetch`: 4.0K
- `minimatch`: 4.0K
- `mime-types`: 4.0K
- `load-json-file`: 4.0K
- `line-async-iterator`: 4.0K
- `jsonlines`: 4.0K
- `json-parse-better-errors`: 4.0K
- `jest-matcher-utils`: 4.0K
- `jest-junit`: 4.0K
- `jaro-winkler`: 4.0K
- `is-url`: 4.0K
- `is-port-reachable`: 4.0K
- `is-docker`: 4.0K
- `http-proxy`: 4.0K
- `git-last-commit`: 4.0K
- `get-port`: 4.0K
- `fs-extra`: 4.0K
- `find-up`: 4.0K
- `fast-deep-equal`: 4.0K
- `express`: 4.0K
- `expect`: 4.0K
- `escape-html`: 4.0K
- `epipebomb`: 4.0K
- `email-validator`: 4.0K
- `dotenv`: 4.0K
- `date-fns`: 4.0K
- `codecov`: 4.0K
- `cli-table3`: 4.0K
- `ci-info`: 4.0K
- `chokidar`: 4.0K
- `chance`: 4.0K
- `async-sema`: 4.0K
- `async-retry`: 4.0K
- `async-listen`: 4.0K
- `ansi-regex`: 4.0K
- `ansi-escapes`: 4.0K
- `alpha-sort`: 4.0K
- `@vercel-internals`: 4.0K

## Recommendations

1. Replace heavy libraries with lighter alternatives

   - `chalk` → `picocolors` (80% smaller)
   - `node-fetch` → native `fetch` (available in Node.js 18+)

2. Inline small utility packages

- `@types`: 124K
- `@inquirer`: 24K
- `@vitest`: 8.0K
- `@vercel`: 8.0K
- `@tootallnate`: 8.0K

3. Consolidate duplicate versions

- None found

4. Remove deprecated packages

- None found
