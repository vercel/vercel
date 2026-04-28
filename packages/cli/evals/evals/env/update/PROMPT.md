Go through the flow of **adding** an environment variable and then **updating** it using the Vercel CLI.

1. **Add** an environment variable with a **unique** name so runs don't collide—e.g. `EVAL_UPDATE_` plus a timestamp or random string (e.g. `EVAL_UPDATE_1739123456`). Use non-interactive flags (`--value`, `--yes`, `--non-interactive`).
2. **Update** that same variable's value (e.g. change it to a new value). Use non-interactive flags (`--value`, `--yes`, `--non-interactive`).
3. Write the exact variable name you updated to `env-key-used.txt`, then run `vercel env ls --format=json` or `vc env ls --format=json` and save the JSON output to `env-update-ls-output.json`.
