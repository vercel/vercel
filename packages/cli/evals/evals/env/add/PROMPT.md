Add one environment variable to this project using the Vercel CLI.

Use a **unique** variable name so that multiple eval runs do not collide—for example `EVAL_ADD_` followed by a timestamp or random string (e.g. `EVAL_ADD_1739123456` or `EVAL_ADD_a1b2c3d4`). Use non-interactive flags so the command completes without prompts (e.g. `--value`, `--yes`, `--non-interactive`).

Write the exact variable name you added to `env-key-used.txt`, then run `vercel env ls --format=json` or `vc env ls --format=json` and save the JSON output to `env-add-ls-output.json`.
