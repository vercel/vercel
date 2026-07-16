# Project Infrastructure

Commands for infrastructure attached to a Vercel project: cache, cron jobs, deploy hooks, Git connections, Edge Config, redirects, custom environments, and rolling releases. Run `vercel <command> --help` for flags and subcommands; this file covers gotchas and sequencing that help output cannot tell you.

## Cache

`vercel cache purge --type cdn --yes` purges the CDN cache; `vercel cache invalidate --tag <tag> --yes` invalidates by cache tag. `vercel cache dangerously-delete` is destructive — confirm intent before running it.

## Cron Jobs

`vercel crons add` writes to `vercel.json`; do not run it when the user only asked for inspection. `vercel crons run <path>` triggers a cron manually.

## Deploy Hooks

Deploy hook URLs can trigger deployments. Treat them as secrets when presenting `vercel deploy-hooks` output.

## Git Connection

Verify the linked project and scope before changing Git connections with `vercel git connect` / `vercel git disconnect`.

## Edge Config

Token values and config contents may be sensitive. Avoid broad dumps unless needed. The JSON payload formats for `--items` (on `add`) and `--patch` (on `update`) are documented in `vercel edge-config <subcommand> --help`.

## Redirects and Routing

Routing and redirect changes have separate command groups with different staging models: route changes are staged before `vercel routes publish`, while redirect changes create versions that go live via `vercel redirects promote <version-id> --yes` (list them with `vercel redirects list-versions`). Use `references/routing.md` for route-rule syntax.

## Custom Environments

`vercel target ls` lists custom environments. `deploy` and `build` accept `--target`; `pull` accepts `--environment` (not `--target`):

```bash
vercel pull --environment=<target>
vercel --target=<target>
```

## Rolling Releases

There is no `vercel rr status` command; use `vercel rr fetch` for current details. Lifecycle sequence:

```bash
vercel rr configure --enable --advancement-type=automatic --stage=10,5m --stage=50,10m
vercel rr start --dpl=<deployment-url> --yes
vercel rr fetch
vercel rr approve --currentStageIndex=0 --dpl=<deployment-id>
vercel rr abort --dpl=<deployment-id>      # or complete: vercel rr complete --dpl=<deployment-id>
```
