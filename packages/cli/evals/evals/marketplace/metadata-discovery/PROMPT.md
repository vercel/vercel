Using only the Vercel CLI, discover and report the following information:

1. What products does Upstash offer? List each product's slug.
2. What configuration options (metadata) does the Neon integration accept? List each option with its valid values.
3. What billing plans are available for Upstash Redis?

Do NOT use web searches or external documentation — only use what the CLI itself can tell you (e.g., help flags, integration commands).

Print your answers clearly at the end.

Important context:

- You are already authenticated with Vercel CLI via the VERCEL_TOKEN environment variable. Do NOT run `vercel login` - it is not needed.
- The project is already linked to a Vercel project (check `.vercel/project.json`).
- Read `.vercel/project.json` to get the `orgId` (team ID) and use it as `--scope` in CLI commands.
- The `vercel integration add <integration> --help` command shows available products, metadata options, and plans.

If the CLI asks to do something that you cannot do on your own (eg opening a browser or selecting an option from interactive shell), you can exit with a failure message.
