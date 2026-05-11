# Projects & Teams

## Projects

```bash
vercel project ls                    # list projects
vercel project add my-project        # create project
vercel project inspect my-app        # inspect project
vercel project rm my-app             # remove project
```

## Deployments

```bash
vercel list                          # list deployments
vercel list --status READY           # filter by status
vercel list -m gitBranch=main        # filter by metadata
vercel inspect <url>                 # deployment details
vercel remove <name|id>              # remove deployments
vercel remove my-app --safe          # skip aliased deployments
```

## Teams

```bash
vercel whoami                        # current user and team
vercel teams ls                      # list teams
vercel teams switch                  # interactive team picker
vercel teams switch my-team          # switch by slug
vercel teams invite user@example.com # invite member
```

## Discovering Scope

Use these commands when the user has not specified a team or project and the task is read-only:

```bash
vercel whoami
vercel teams ls --format json
vercel project ls --scope <team-slug> --format json
vercel list <project-name> --scope <team-slug> --status READY --format json
```

Use explicit scope after selecting or inferring the team:

```bash
vercel project inspect <project-name> --scope <team-slug>
vercel list <project-name> --scope <team-slug> --status READY --format json
```

Do not conclude that no projects or deployments exist after checking only one relevant scope. If several plausible targets remain, ask the user to choose from the candidates found. Avoid broad enumeration across unrelated teams unless the user asked for account-wide investigation.

## Scoping

Use `--scope` or `--team` on any command to target a specific team:

```bash
vercel deploy --scope my-team
```
