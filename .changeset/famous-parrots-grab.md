---
'vercel': patch
---

Add support to create a project with Vercel Auth disabled.

The default for Vercel Auth is Standard Protection. Add a prompt so that Vercel Auth can be disabled when creating a new project.

Additionally, if the `--public` option is specified, and there is not already an existing project, the project will be created with Vercel Auth disabled.
