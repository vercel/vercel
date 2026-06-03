---
"vercel": patch
---

[cli] Show `claim` in `vercel integration resource --help`

The `claim` subcommand was missing from `resourceSubcommand.subcommands`, so `vercel integration resource --help` only listed `connect`, `disconnect`, `remove`, and `create-threshold`. The legacy `vercel integration-resource --help` and the dispatcher's runtime resolution both already included `claim` — this was purely a help/discoverability gap on the canonical nested path. Adds `claimSubcommand` to the subcommand list and updates the parent description accordingly.
