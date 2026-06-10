You are helping a user choose a monitoring integration for their Next.js application. Use the Vercel CLI to discover what monitoring integrations are available on the Vercel Marketplace.

Write your findings to a file called `discovery-result.txt` with one integration name per line (e.g., "sentry", "rollbar").

Important context:

- You are already authenticated with Vercel CLI via the VERCEL_TOKEN environment variable. Do NOT run `vercel login` - it is not needed.
- The project is already linked to a Vercel project (check `.vercel/project.json`).
- Read `.vercel/project.json` to get the `orgId` (team ID) and use it as `--scope` in CLI commands.
- This is a discovery task only — do not install anything, just discover and list what's available.

If the CLI asks to do something that you cannot do on your own (eg opening a browser or selecting an option from interactive shell), you can exit with a failure message.
