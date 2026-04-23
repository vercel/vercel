---
'vercel': patch
---

Add non-interactive passcode login flow for `vc login`. Agents and CI environments can now use `vc login --passcode <passcode>` to authenticate without interactive device flow. When running in non-interactive mode without a passcode, the CLI outputs structured JSON with `action_required` status and a link to generate a passcode at `https://vercel.com/login/generate`.
