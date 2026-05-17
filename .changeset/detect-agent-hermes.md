---
'@vercel/detect-agent': minor
---

Add detection for two additional agent harnesses:

- **Hermes** (NousResearch/hermes-agent) via `HERMES_SESSION_PLATFORM`, which Hermes sets on each session to identify the calling messaging platform (telegram, discord, etc.). Note: Hermes sanitizes its subprocess environment by default, so detection only works when users explicitly allow `HERMES_SESSION_PLATFORM` via their Hermes `env_passthrough` config — a Hermes-side configuration concern, not a detector concern.

- **OpenClaw** (openclaw/openclaw) via `OPENCLAW_SHELL`, which OpenClaw sets when it spawns bash subprocesses (`"exec"`), TUI local shells (`"tui-local"`), or ACP client shells (`"acp-client"`). See `src/agents/bash-tools.exec-runtime.ts` in the OpenClaw repo for the canonical spawn site.
