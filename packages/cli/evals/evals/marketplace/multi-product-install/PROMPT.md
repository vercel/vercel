Install an Upstash Redis cache using the Vercel CLI. Use the slash syntax to specify the Redis product from the Upstash integration. Name the resource "eval-upstash-redis" and use the free plan. Complete this without any interactive prompts.

Important context:

- You are already authenticated with Vercel CLI via the VERCEL_TOKEN environment variable. Do NOT run `vercel login` - it is not needed.
- The project is already linked to a Vercel project (check `.vercel/project.json`).
- Read `.vercel/project.json` to get the `orgId` (team ID) and use it as `--scope` in CLI commands.
- Upstash offers multiple products (Redis, QStash, Vector, etc.). Use the slash syntax `upstash/redis` to select Redis specifically.

To install non-interactively:

```
vercel integration add upstash/redis --name eval-upstash-redis --scope <TEAM_ID>
```

If the CLI asks to do something that you cannot do on your own (eg opening a browser or selecting an option from interactive shell), you can exit with a failure message.
