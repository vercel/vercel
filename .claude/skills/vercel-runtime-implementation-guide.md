# Vercel Runtime Implementation Guide

Guide for building Vercel runtimes that implement the Fluid IPC protocol.

**Reference implementations:**

- Node.js: `packages/node/` (interpreted, primary reference)
- Python: `packages/python/` (interpreted, WSGI/ASGI)
- Rust: `packages/rust/` + `crates/vercel_runtime/` (compiled)

**Documentation:** `DEVELOPING_A_RUNTIME.md`

## Fluid Compute Overview

Fluid compute enables HTTP streaming, request multiplexing, and efficient resource utilization via a secure TCP-based IPC protocol between Vercel's infrastructure and function instances.

The **Rust core** wraps language processes, communicating via HTTP locally and IPC to the Function Router for response streaming and health metrics.

## IPC Protocol

Connect to Unix socket at `VERCEL_IPC_PATH`. Messages are JSON terminated with `\0`.

### Message Types

**`server-started`** (required, once at startup):

```json
{
  "type": "server-started",
  "payload": { "initDuration": 150, "httpPort": 3000 }
}
```

**`handler-started`** (required, per request):

```json
{
  "type": "handler-started",
  "payload": {
    "handlerStartedAt": 1704067200000,
    "context": { "invocationId": "abc123", "requestId": 42 }
  }
}
```

**`end`** (required, per request):

```json
{
  "type": "end",
  "payload": {
    "context": { "invocationId": "abc123", "requestId": 42 },
    "error": null
  }
}
```

**`log`** (optional, base64-encoded message):

```json
{
  "type": "log",
  "payload": {
    "context": { "invocationId": "abc123", "requestId": 42 },
    "message": "SGVsbG8=",
    "level": "info"
  }
}
```

Use `"stream": "stdout"` or `"stderr"` instead of `level` for raw output.

**`metric`** (optional, for fetch instrumentation):

```json
{"type": "metric", "payload": {"context": {...}, "type": "fetch-metric", "payload": {"pathname": "/api", "duration": 45, "host": "example.com", "statusCode": 200, "method": "GET", "id": 1}}}
```

### Request Context Headers

Extract and remove before passing to user code:

- `x-vercel-internal-invocation-id` → `invocationId` (string)
- `x-vercel-internal-request-id` → `requestId` (integer)
- `x-vercel-internal-span-id`, `x-vercel-internal-trace-id` → remove

### Health Check

Return HTTP 200 for `/_vercel/ping`. Do NOT send IPC messages.

## Implementation Checklist

### Runtime (Language-side)

- [ ] Connect to `VERCEL_IPC_PATH` Unix socket
- [ ] Send `server-started` after HTTP server binds
- [ ] Extract/remove `x-vercel-internal-*` headers per request
- [ ] Send `handler-started` at request start
- [ ] Set up request context storage (thread-local/context vars)
- [ ] Intercept stdout/stderr/logging → IPC with context
- [ ] Send `end` after each request (even on errors)
- [ ] Handle `/_vercel/ping` health checks
- [ ] Buffer logs before `server-started`, flush after or to stderr on exit
- [ ] Support concurrent requests
- [ ] Implement `waitUntil` API (wait for promises before exit with 30s timeout)

### Builder (TypeScript)

- [ ] Export `version = 3`
- [ ] Export `build()` → `{ output: Lambda }`
- [ ] Export `startDevServer()` for `vercel dev` (optional)
- [ ] Export `prepareCache()` for build caching (optional)

## Builder Implementation

See `DEVELOPING_A_RUNTIME.md` for full API documentation.

### Interpreted Languages

Reference: `packages/node/src/build.ts`, `packages/python/src/index.ts`

Use standard Lambda runtimes (`nodejs22.x`, `python3.12`, etc.).

### Compiled Languages

Reference: `packages/rust/src/index.ts`

Use `runtime: 'executable'` with `runtimeLanguage: 'rust' | 'go'` for IPC orchestration. The handler must be named `executable`.

### Key Lambda Options

| Property                    | Description                                                       |
| --------------------------- | ----------------------------------------------------------------- |
| `handler`                   | Entry point (`index.handler` for node, `executable` for compiled) |
| `runtime`                   | `nodejs22.x`, `python3.12`, or `executable` for compiled          |
| `runtimeLanguage`           | `'go'` or `'rust'` for executable runtime                         |
| `architecture`              | `'x86_64'` or `'arm64'`                                           |
| `supportsResponseStreaming` | Enable streaming responses                                        |

## Common Pitfalls

1. Missing `\0` terminator on IPC messages
2. Forgetting base64 encoding for log messages
3. Not removing `x-vercel-internal-*` headers
4. Blocking on IPC during init (buffer logs first)
5. Missing `/_vercel/ping` handler
6. Not sending `end` on errors
7. Blocking concurrent requests (limits Fluid compute benefits)
8. Buffering entire responses (stream chunks instead)

## Publishing

- Use `peerDependencies` for `@vercel/build-utils`
- Reference via `"use": "@vercel/your-runtime"` in vercel.json
- Create changeset: `pnpm changeset`
