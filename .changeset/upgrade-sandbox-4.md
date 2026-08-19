---
'vercel': minor
---

Upgrade the bundled Sandbox CLI from 3.4.0 to 4.0.0, catching up 10 stable releases. Behavior changes that reach `vercel sandbox` users:

- **`fork` now copies the source sandbox's environment variables.** 3.4.0 documented the opposite ("env vars are NOT copied and must be re-supplied via `--env`"); `Sandbox.fork()` now calls `POST /v2/sandboxes/:name/fork`, which copies env and image server-side (SDK 2.9.0, sandbox#259). Anything secret in a source sandbox propagates into forks by default. Flags passed to `fork` override the copied values.
- **The default base image changes.** Sandboxes created without `--image` or `--runtime` previously used the `node24` runtime on Amazon Linux 2023; they now use `vercel/sandbox/universal`, based on Ubuntu with Node.js 24, Bun, Python 3.14, coding agents, and common development and debugging tools. `--runtime` is deprecated in favor of `--image` and existing `--runtime` calls keep working through the legacy v2 API. Pass `--image vercel/sandbox/node:24` for an Ubuntu-based equivalent of the old default.
- **`sandbox list` renames the `RUNTIME` column to `RUNTIME/IMAGE`**, falling back to the image reference for image-based sandboxes (3.5.0, sandbox#253). This breaks anything parsing that output.
- **`sandbox sh` is no longer deprecated** (3.4.1, sandbox#241).
- **Default API call retries are reduced** (SDK 2.7.1, sandbox#254).
- Transient authorization failures are retried after refreshing a stored access token (3.4.3, sandbox#247).
- Help examples use the invoked app name, so `vercel sandbox --help` shows `vercel sandbox ...` rather than the standalone `sandbox ...` form that is not on PATH for Vercel CLI users (sandbox#269).

The pin had been frozen at 3.4.0 since 2026-07-03 because the `update-sandbox` workflow that bumps it has never run, so `vercel sandbox` and a current standalone `sandbox` install booted different operating systems from an identical command.
