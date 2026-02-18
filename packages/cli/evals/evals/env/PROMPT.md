# List environment variables with the Vercel CLI

This directory should be linked to a Vercel project, then you will list its environment variables using the `vc env` (or `vercel env`) command.

1. **Link** the project using the team ID and project ID in `evals-setup.json` (e.g. `vercel link --yes --team <teamId> --project <projectId>`). Use non-interactive flags; you do not have interactive input.

2. **List** environment variables by running the appropriate `vc env` subcommand (e.g. `vc env ls` or `vercel env ls`). Use non-interactive flags if the subcommand supports them.

3. When done, write the **exact single CLI command** you used to list the environment variables (one line, no newlines) to a file named `command-used.txt` in the current directory.
