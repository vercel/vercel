---
'vercel': minor
---

`vercel deploy` without credentials can create a temporary anonymous project and deploy prebuilt output to it, running `vercel build` locally first when needed. Interactive users confirm before the first deployment, while `--yes` skips the prompt and non-interactive use requires it until `.vercel/anonymous.json` records the temporary project. The anonymous credential is reused until it expires, and each deploy prints a claim URL to keep the deployment by signing in. When anonymous deployments are unavailable, the previous login behavior applies.
