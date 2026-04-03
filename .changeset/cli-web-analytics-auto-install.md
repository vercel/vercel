---
'vercel': minor
---

Add `--auto-install` to `vercel project web-analytics` to install `@vercel/analytics` with the detected package manager (npm, yarn, pnpm, or bun), open the dashboard Web Analytics page (or print its URL when non-interactive) so you can run **Implement**—the same Vercel Agent flow that creates a GitHub PR with the SDK and integration code—and include structured `agentInstallation` plus `integrate` hints in `--format json` for agents and CI.
