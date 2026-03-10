Install an Upstash Redis cache using the Vercel CLI. Upstash offers multiple products — make sure to select Redis specifically. Name the resource "eval-upstash-redis". Link it to the current project. Complete this without any interactive prompts.

Important context:

- You are already authenticated with Vercel CLI via the VERCEL_TOKEN environment variable. Do NOT run `vercel login` - it is not needed.
- The project is already linked to a Vercel project (check `.vercel/project.json`).
- Read `.vercel/project.json` to get the `orgId` (team ID) and use it as `--scope` in CLI commands.

If the CLI asks to do something that you cannot do on your own (eg opening a browser or selecting an option from interactive shell), you can exit with a failure message.
