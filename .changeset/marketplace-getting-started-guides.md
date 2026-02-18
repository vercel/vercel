---
'vercel': minor
---

feat(cli): add `vercel integration guide` command

Adds a new `vercel integration guide` subcommand that displays getting started guides,
code snippets, and resource links for marketplace integrations directly in the terminal.

Supports single-product and multi-product integrations with interactive product and
framework selection. Includes `--framework` flag for non-interactive framework
selection (useful for CI/agents). Output is raw markdown written to stdout for easy
piping to files or other tools.
