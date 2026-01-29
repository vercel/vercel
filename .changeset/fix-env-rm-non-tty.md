---
"vercel": patch
---

fix(cli): Move DELETE confirmation prompt to `vercel api` command only

The DELETE confirmation prompt introduced in #14769 was incorrectly applied to all `client.fetch()` calls, which broke commands like `vercel env rm` in non-TTY environments (CI/CD). This fix moves the confirmation logic to only apply to the `vercel api` command as originally intended, allowing other commands with their own confirmation flows (like `--yes` flag) to work properly in non-interactive mode.
