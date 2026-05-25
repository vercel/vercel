Find PostgreSQL database integrations available in the Vercel marketplace using the CLI. List the names of any PostgreSQL-compatible integrations you find.

Write your findings to a file called `postgres-integrations.txt` with one integration name per line (e.g., "neon", "supabase").

Important context:

- You are already authenticated with Vercel CLI via the VERCEL_TOKEN environment variable. Do NOT run `vercel login` - it is not needed.
- The project is already linked to a Vercel project (check `.vercel/project.json`).
- Read `.vercel/project.json` to get the `orgId` (team ID) and use it as `--scope` in CLI commands.

If the CLI asks to do something that you cannot do on your own (eg opening a browser or selecting an option from interactive shell), you can exit with a failure message.
