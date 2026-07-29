---
'vercel': minor
---

Add `vercel vcr permissions` subcommands for managing which teams can pull images from a VCR repository: `vcr permissions <repository> ls` lists teams with access (by team slug), `add` and `rm` grant or revoke access for one or more teams (comma-separated team ids or slugs), and `clear` removes access for every team.
