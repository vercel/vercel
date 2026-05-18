Go through the flow of **adding** an environment variable with `vercel env add` or `vc env add`, then **updating** it with `vercel env update` or `vc env update`.

1. **Add** an environment variable with a **unique** name so runs don't collide—e.g. `EVAL_UPDATE_` plus a timestamp or random string (e.g. `EVAL_UPDATE_1739123456`). Use non-interactive flags (`--value`, `--yes`, `--non-interactive`).
2. **Update** that same variable's value to a different value. Use non-interactive flags (`--value`, `--yes`, `--non-interactive`).
3. Save the variable name you used in `env-key-used.txt`.
4. After updating it, list the project environment variables as JSON and save that output in `env-update-ls-output.json`.
