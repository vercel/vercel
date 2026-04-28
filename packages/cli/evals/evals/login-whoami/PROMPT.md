Use the Vercel CLI to determine which account is currently authenticated.

Run `vercel whoami --format=json` or `vc whoami --format=json` and save the JSON output to `whoami-output.json`.

If the command reports that no one is signed in, sign in only if the CLI can do so non-interactively in this environment, then run `whoami --format=json` again and save the successful output to `whoami-output.json`.
