Go through the flow of **adding** an environment variable and then **removing** it using the Vercel CLI.

1. **Add** an environment variable with a **unique** name so runs don't collide—e.g. `EVAL_REMOVE_` plus a timestamp or random string (e.g. `EVAL_REMOVE_1739123456`). Use non-interactive flags (`--value`, `--yes`, `--non-interactive`).
2. **Remove** that same variable. Use non-interactive flags (`--yes`, `--non-interactive`) so the command completes without confirmation prompts.

When done:

1. Write the exact single CLI command you used to **remove** the variable (one line) to `command-used.txt`.
2. Write the exact variable name (key) you used to `env-key-used.txt`.
