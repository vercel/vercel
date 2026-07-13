---
'vercel': minor
---

Automatically install a marketplace product's declared agent skills after `vercel integration add` provisions it, replacing the interactive confirmation prompt. The transcript ends with an install summary linking to the product's marketplace page, and failed installs fall back to printing the manual `npx skills add` command.
