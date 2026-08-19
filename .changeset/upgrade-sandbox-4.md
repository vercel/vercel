---
'vercel': minor
---

Upgrade the bundled Sandbox CLI from 3.4.0 to 4.0.0.

This changes the default base image for sandboxes created without an explicit `--image` or `--runtime`. The previous default was the `node24` runtime on Amazon Linux 2023; the new default is `vercel/sandbox/universal`, which is based on Ubuntu and includes Node.js 24, Bun, Python 3.14, coding agents, and common development and debugging tools. `--runtime` is deprecated in favor of `--image`, and existing `--runtime` calls continue to work through the legacy v2 API.

The pin had been frozen at 3.4.0 since 2026-07-03 because the `update-sandbox` workflow that bumps it has never run, so `vercel sandbox` and a standalone `sandbox` install of the same vintage booted different operating systems from an identical command.
