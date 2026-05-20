# Project Infrastructure

Use these commands for infrastructure attached to a Vercel project: cache, cron jobs, deploy hooks, Git connections, Edge Config, redirects, custom environments, and rolling releases.

## Cache

```bash
vercel cache purge --type cdn --yes
vercel cache invalidate --tag mytag --yes
vercel cache dangerously-delete --tag old-data --yes
```

`dangerously-delete` is destructive. Confirm intent before running it.

## Cron Jobs

```bash
vercel crons ls --format json
vercel crons add --path /api/cron --schedule "0 10 * * *"
vercel crons run /api/cron
```

`vercel crons add` writes to `vercel.json`; do not run it when the user only asked for inspection.

## Deploy Hooks

```bash
vercel deploy-hooks ls --format json
vercel deploy-hooks create cms-rebuild --ref main
vercel deploy-hooks rm <hook-id> --yes
```

Deploy hook URLs can trigger deployments. Treat them as secrets when presenting output.

## Git Connection

```bash
vercel git connect
vercel git connect https://github.com/user/repo.git
vercel git disconnect --yes
```

Verify the linked project and scope before changing Git connections.

## Edge Config

```bash
vercel edge-config ls --format json
vercel edge-config add flags --items '{"enabled":true}' --format json
vercel edge-config get flags --format json
vercel edge-config items flags --format json
vercel edge-config update flags --patch '{"items":[{"operation":"upsert","key":"enabled","value":false}]}' --format json
vercel edge-config tokens flags --add read-only --format json
vercel edge-config rm flags --yes
```

Token values and config contents may be sensitive. Avoid broad dumps unless needed.

## Redirects and Routing

Use `references/routing.md` for route-rule syntax. Redirect-specific commands are available under `vercel redirects`:

```bash
vercel redirects ls
vercel redirects add /old /new --status 308
vercel redirects list-versions
vercel redirects promote <version-id> --yes
```

Routing and redirect changes have separate command groups. Route changes are staged before `vercel routes publish`; redirect changes use redirect versions and promotion.

## Custom Environments

```bash
vercel target ls --format json
vercel pull --environment=<target>
vercel --target=<target>
```

`vercel target` lists custom environments. Use `--target` on deploy/build/pull flows when targeting one.

## Rolling Releases

```bash
vercel rr configure --enable --advancement-type=automatic --stage=10,5m --stage=50,10m
vercel rr start --dpl=<deployment-url> --yes
vercel rr fetch
vercel rr approve --currentStageIndex=0 --dpl=<deployment-id>
vercel rr abort --dpl=<deployment-id>
vercel rr complete --dpl=<deployment-id>
```

There is no `vercel rr status` command; use `vercel rr fetch` for current details.
