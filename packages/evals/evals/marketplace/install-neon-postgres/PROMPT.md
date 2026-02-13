Install the Neon Postgres integration and create a database resource named "my-test-db" on the free plan in the US East (iad1) region. Link it to the current project. Complete this without any interactive prompts.

Important context:

- You are already authenticated with Vercel CLI via the VERCEL_TOKEN environment variable. Do NOT run `vercel login` - it is not needed.
- The project is already linked to a Vercel project (check `.vercel/project.json`).
- Read `.vercel/project.json` to get the `orgId` (team ID) and use it as `--scope` in CLI commands.

To install the integration non-interactively:

```
vercel integration add neon --name my-test-db --plan free_v3 -m region=iad1 --scope <TEAM_ID>
```

If the CLI asks to do something that you cannot do on your own (eg opening a browser or selecting an option from interactive shell), you can exit with a failure message.
