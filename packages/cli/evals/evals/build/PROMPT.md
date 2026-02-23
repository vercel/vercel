# Build this project with the Vercel CLI

This directory is a minimal static site (an `index.html` at the root).

1. **Link** the project to Vercel using the team ID and project ID in `evals-setup.json` (e.g. `vercel link --yes --team <teamId> --project <projectId>`). You do not have interactive input; use non-interactive flags.

2. **Build** the project by running `vc build` (or `vercel build`). Use a non-interactive flag (e.g. `--yes`) so the command completes without prompting.

3. When done, write the **exact single CLI command** you used to run the build (one line, no newlines) to a file named `command-used.txt` in the current directory.
