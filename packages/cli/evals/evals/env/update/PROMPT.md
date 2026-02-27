Go through the flow of **adding** an environment variable and then **updating** it using the Vercel CLI.

1. **Add** an environment variable with a **unique** name so runs don't collide—e.g. `EVAL_UPDATE_` plus a timestamp or random string (e.g. `EVAL_UPDATE_1739123456`). Use non-interactive flags (`--value`, `--yes`, `--non-interactive`).
2. **Update** that same variable's value (e.g. change it to a new value). Use non-interactive flags (`--value`, `--yes`, `--non-interactive`).
