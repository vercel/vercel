---
'vercel': minor
---

Add `vercel ai-gateway leaderboard` with `models`, `labs`, `apps`, and `providers` subcommands, exposing the AI Gateway usage leaderboards from the CLI. Supports `--modality`, `--metric`, and `--date` for the model/lab time series, a pretty table in interactive terminals with JSON by default when piped, `--format table|json|csv`, and `--out` to write the payload to a file.
