# Encoded behavior criteria

This document records the compatibility criteria characterized by the `@vercel/node` unit tests. It is intended to guide a future replacement of the current builder and runtime implementation.

The tests are behavioral contracts, not an assertion that every current behavior is ideal. A replacement should either preserve each criterion or make an explicit compatibility decision before changing it.

## Build lifecycle

- A configured install command runs before package build scripts. An empty configured install command skips installation.
- An explicit project `buildCommand` takes precedence over package scripts.
- Package script precedence is `vercel-build`, then `now-build`, then `build` when the caller opts into the ordinary build command.
- A failed build command aborts the build and prevents the generated-entrypoint callback from running.
- The generated-entrypoint callback runs after build scripts and may select a file created by them.
- Per-function `includeFiles` and `excludeFiles` are selected using the generated entrypoint and merged with global rules.
- Builder checks run after static configuration and runtime detection.

## Build output and metadata

- Node.js Lambda metadata includes architecture, runtime, regions, duration, Web API mode, helpers, source-map support, response-streaming support, and tracing flags where configured.
- Custom AWS handlers disable response streaming.
- TypeScript entrypoints and dependencies are emitted using the corresponding JavaScript extension and include source maps.
- ESM-to-CommonJS compilation respects the nearest package boundary and can be disabled for Edge builds with `VERCEL_EDGE_NO_BABEL=1`.
- Include/exclude tracing rules, symlinks, file modes, and repository-relative output paths are preserved.

## TypeScript

- Builder-controlled emit and incremental compiler options override conflicting project settings.
- Semantic type errors are permissive by default: output is still emitted.
- Setting `EXPERIMENTAL_NODE_TYPESCRIPT_ERRORS=1` makes semantic type errors fail with `NODE_TYPESCRIPT_ERROR`.
- Malformed TypeScript configuration fails deterministically.
- Workspace-style path aliases resolve relative to their TypeScript configuration.

## Workspaces and dependency resolution

- Dependencies may be hoisted to the repository root.
- A dependency installed nearer to the workspace application takes precedence over a hoisted copy.
- Workspace packages linked through `node_modules` remain symlinks rather than being flattened.
- Imported file symlinks remain `FileFsRef` entries and their in-repository targets are included.
- Files outside the application `workPath` remain relative to `repoRootPath`.
- The nearest `package.json` controls module type and conditional-export selection.
- Executable modes are preserved on platforms that expose POSIX file modes.

## Development server

- The public `startDevServer()` API can start Node handlers and returns a port, PID, and shutdown callback.
- Middleware requests outside the configured matcher return `null` without starting a server.
- The nearest package boundary controls whether JavaScript is treated as ESM.
- Node development processes preserve existing `NODE_OPTIONS`, add `--no-warnings` once, and inject the `tsx` loader for TypeScript and non-native-ESM JavaScript.
- Native ESM does not receive the `tsx` loader.
- Runtime environment, build environment, config, entrypoint, and public directory are serialized into the child environment.
- Bun readiness output may arrive across multiple stdout chunks.
- Child exit can win the startup message race and is reported as an exit result.

## Serverless runtime

- CommonJS, ESM, Web `Request`/`Response`, fetch-style, and HTTP server handler shapes remain supported.
- Request URL, headers, body, query, cookies, host, and response cookies retain existing normalization behavior.
- Buffered mode returns buffered bodies; streaming mode returns readable bodies.
- `waitUntil` work is awaited during runtime exit and receives a bounded warning path when it exceeds `maxDuration`.
- Unsupported module shapes fail with the existing handler-detection error.
- The runtime temporarily intercepts `http.Server.prototype.listen`; it must restore the original method even when importing user code fails.

## Edge runtime

- Edge tracing prefers a dependency's `browser` entry, then its `module` entry, while preserving the original emitted `package.json` bytes.
- `.wasm?module` imports trace and emit the underlying `.wasm` asset without a query string in the output path.
- Middleware handlers that return no response pass through using `x-middleware-next: 1`.
- Other Edge handlers that return no response fail.
- Default exports and named HTTP method exports are supported; unsupported methods return 405.
- Wrapper failures return status 500 with `x-vercel-failed: edge-wrapper`, including nested error causes in the message.
- `waitUntil` is forwarded through the handler context.
- Edge Node compatibility is limited to the curated `buffer`, `events`, `assert`, `util`, and `async_hooks` bindings.
- Bare and `node:`-prefixed imports canonicalize to the same binding; unsupported bindings fail explicitly.

## Published package surface

- The built CommonJS entrypoint exports `version`, `build`, `prepareCache`, `startDevServer`, `shouldServe`, and `diagnostics`.
- The published declaration file currently exposes request/response handler types but omits the runtime Builder exports. Framework adapters consume those runtime exports with `@ts-expect-error`.

The declaration mismatch is recorded for compatibility visibility, not endorsed as a desirable API. A replacement may correct it in a separately reviewed public API change.

## Surprising findings

- TypeScript semantic errors do not fail builds unless the experimental error flag is enabled.
- Edge dependency tracing temporarily rewrites package metadata to select browser/module entries, but must not emit the rewritten metadata.
- Generated-entrypoint selection also determines which function-level include/exclude rules apply.
- Development mode uses `tsx` for ordinary non-ESM JavaScript as well as TypeScript.
- Workspace links are preserved instead of flattened, and imported file symlinks require both link and target entries.
- The published runtime and declaration surfaces do not match.
- The serverless runtime's global `listen` interception previously leaked when user-module initialization failed; the implementation now restores it on that error path.

## Test reliability constraints

These contracts avoid fixed ports, external network access, Bun downloads, package-registry dependencies, wall-clock assertions, and process-signal races. Asynchronous lifecycle tests use explicit readiness events, controlled promises, fake timers, or mocked child processes. Platform-specific file-mode and symlink checks are skipped where the operating system cannot provide equivalent semantics.
